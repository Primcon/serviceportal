"use server";

import { revalidatePath } from "next/cache";
import { UserRole, WarrantyDecision } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { AccessDeniedError, UserFacingError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";
import { managerRoles } from "@/features/navigation/workspace-items";
import { canApproveWarranty, customerWarrantySetting, previousShippedRepair, standardWarrantyFor, warrantyApprovers } from "@/features/warranty/queries";
import { maxWarrantyMonths, shopToday, warrantyEndDate, warrantyLengthLabel } from "@/features/warranty/warranty";
import { optionalDate } from "@/features/work-orders/details-schema";
import { recordAudit } from "@/services/audit";
import { getActiveInternalUser, getActiveInternalUserForRoles, getAuthorizedWorkOrder } from "@/services/authorization";
import { queueAccessEmail } from "@/services/notifications";

function value(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

const id = z.string().uuid();
/** A warranty length typed into a form: whole months, or empty for "not set". */
const optionalMonths = z.string().trim().refine((text) => !text || (/^\d{1,3}$/.test(text) && Number(text) >= 1 && Number(text) <= maxWarrantyMonths), `Enter whole months from 1 to ${maxWarrantyMonths}, or leave it empty.`).transform((text) => (text ? Number(text) : null));

function revalidateWorkOrder(workOrderId: string) {
  revalidatePath(`/workspace/work-orders/${workOrderId}`);
  revalidatePath(`/portal/work-orders/${workOrderId}`);
  revalidatePath("/workspace", "layout");
  revalidatePath("/portal", "layout");
}

function isManager(role: UserRole) {
  return role === UserRole.PORTAL_ADMINISTRATOR || role === UserRole.VACTECH_MANAGER;
}

function iso(date: Date | null) {
  return date ? date.toISOString() : null;
}

/**
 * Saves a repair's ship date and warranty length. Anyone on staff can record the ship date.
 * The length defaults to the customer's contract or the model's standard; setting a different
 * one takes a manager or a warranty approver.
 */
export async function saveShipping(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({
      workOrderId: id,
      shippedAt: optionalDate,
      warrantyMonths: z.string().trim().refine((text) => !text || (/^\d{1,3}$/.test(text) && Number(text) <= maxWarrantyMonths), `Enter the warranty in whole months, up to ${maxWarrantyMonths}. Use 0 for no warranty.`).transform((text) => (text ? Number(text) : null)),
    }).parse({ workOrderId: value(formData, "workOrderId"), shippedAt: value(formData, "shippedAt"), warrantyMonths: value(formData, "warrantyMonths") });
    const user = await getActiveInternalUser();
    await getAuthorizedWorkOrder(input.workOrderId);
    if (input.shippedAt && input.shippedAt > shopToday()) throw new UserFacingError("The ship date can't be in the future.");

    const changed = await prisma.$transaction(async (transaction) => {
      const current = await transaction.workOrder.findUniqueOrThrow({ where: { id: input.workOrderId }, select: { shippedAt: true, warrantyMonths: true, warrantyEndsAt: true } });
      const standard = (await standardWarrantyFor(transaction, input.workOrderId)).months;
      const expected = current.warrantyMonths ?? standard;
      const warrantyMonths = input.warrantyMonths ?? expected;
      if (warrantyMonths !== expected && !isManager(user.internalRole) && !(await canApproveWarranty(user.id, transaction))) {
        throw new AccessDeniedError("Only a manager or a warranty approver can change the warranty length.");
      }
      const data = { shippedAt: input.shippedAt, warrantyMonths, warrantyEndsAt: warrantyEndDate(input.shippedAt, warrantyMonths) };
      const changes = Object.fromEntries((["shippedAt", "warrantyMonths", "warrantyEndsAt"] as const)
        .map((field) => [field, { from: current[field] instanceof Date ? iso(current[field] as Date) : current[field], to: data[field] instanceof Date ? iso(data[field] as Date) : data[field] }] as const)
        .filter(([, change]) => change.from !== change.to));
      if (!Object.keys(changes).length) return false;
      await transaction.workOrder.update({ where: { id: input.workOrderId }, data });
      await recordAudit(transaction, { workOrderId: input.workOrderId, actorUserId: user.id, eventType: "work-order.shipping-updated", entityType: "WorkOrder", entityId: input.workOrderId, metadata: changes });
      return true;
    });
    revalidateWorkOrder(input.workOrderId);
    return changed ? "Shipping and warranty saved." : "No changes to save.";
  });
}

/**
 * Opens a warranty claim: this job is asked to be covered by the warranty on the pump's
 * previous repair. The job goes to "Warranty review" and the approvers are emailed.
 */
export async function openWarrantyClaim(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ workOrderId: id, reason: z.string().trim().max(1000).transform((text) => text || null) }).parse({ workOrderId: value(formData, "workOrderId"), reason: value(formData, "reason") });
    const user = await getActiveInternalUser();
    await getAuthorizedWorkOrder(input.workOrderId);

    await prisma.$transaction(async (transaction) => {
      const workOrder = await transaction.workOrder.findUniqueOrThrow({
        where: { id: input.workOrderId },
        select: { id: true, workOrderNumber: true, equipmentId: true, createdAt: true, condition: true, completedAt: true, serviceStageId: true, warrantyClaimOnId: true, company: { select: { name: true } }, equipment: { select: { productModel: true, serialNumber: true } } },
      });
      if (workOrder.warrantyClaimOnId) throw new UserFacingError("This job already has a warranty claim.");
      if (workOrder.completedAt || workOrder.condition === "CANCELLED") throw new UserFacingError("This job is closed, so a warranty claim can't be opened on it.");
      const previous = await previousShippedRepair(transaction, workOrder);
      if (!previous) throw new UserFacingError("This pump has no earlier repair with a ship date, so there's no warranty to claim against.");

      const toReview = workOrder.condition === "NORMAL";
      await transaction.workOrder.update({
        where: { id: workOrder.id },
        data: { warrantyClaimOnId: previous.id, warrantyDecision: WarrantyDecision.PENDING, warrantyDecidedById: null, warrantyDecidedAt: null, warrantyDecisionNote: null, ...(toReview ? { condition: "WARRANTY_REVIEW" as const } : {}) },
      });
      if (toReview) {
        await transaction.workOrderStatusHistory.create({
          data: { workOrderId: workOrder.id, serviceStageId: workOrder.serviceStageId, condition: "WARRANTY_REVIEW", changedById: user.id, note: `Warranty claim opened against WIP ${previous.workOrderNumber}.${input.reason ? ` ${input.reason}` : ""}` },
        });
      }
      const audit = await recordAudit(transaction, {
        workOrderId: workOrder.id,
        actorUserId: user.id,
        eventType: "warranty.claim-opened",
        entityType: "WorkOrder",
        entityId: workOrder.id,
        metadata: { claimedAgainst: previous.workOrderNumber, shippedAt: iso(previous.shippedAt), warrantyEndsAt: iso(previous.warrantyEndsAt), reason: input.reason },
      });
      for (const approver of await warrantyApprovers(transaction)) {
        if (approver.id === user.id) continue;
        await queueAccessEmail(transaction, {
          recipientEmail: approver.email,
          userId: approver.id,
          eventKey: `warranty-claim:${audit.id}`,
          subject: `Warranty claim to review: WIP ${workOrder.workOrderNumber}`,
          body: `${user.displayName} opened a warranty claim on WIP ${workOrder.workOrderNumber} (${workOrder.equipment.productModel}, serial ${workOrder.equipment.serialNumber}, ${workOrder.company.name}).\n\nIt's claimed against WIP ${previous.workOrderNumber}.${input.reason ? `\n\nReason: ${input.reason}` : ""}\n\nOpen the work order to approve or deny it.`,
          linkPath: `/workspace/work-orders/${workOrder.id}`,
        });
      }
    });
    revalidateWorkOrder(input.workOrderId);
    return "Warranty claim opened. The approvers have been told.";
  });
}

/** Approves or denies a warranty claim. Only the named warranty approvers can; a denial needs a reason. */
export async function decideWarrantyClaim(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({
      workOrderId: id,
      decision: z.enum(["APPROVED", "DENIED"]),
      note: z.string().trim().max(1000).transform((text) => text || null),
    }).parse({ workOrderId: value(formData, "workOrderId"), decision: value(formData, "decision"), note: value(formData, "note") });
    const user = await getActiveInternalUser();
    await getAuthorizedWorkOrder(input.workOrderId);
    if (!(await canApproveWarranty(user.id))) throw new AccessDeniedError("Only a warranty approver can decide a warranty claim.");
    if (input.decision === "DENIED" && !input.note) throw new UserFacingError("Give the reason the claim is denied. It's kept with the job.");

    await prisma.$transaction(async (transaction) => {
      const workOrder = await transaction.workOrder.findUniqueOrThrow({ where: { id: input.workOrderId }, select: { id: true, condition: true, serviceStageId: true, warrantyClaimOnId: true, warrantyDecision: true } });
      if (!workOrder.warrantyClaimOnId) throw new UserFacingError("This job has no warranty claim to decide.");
      if (workOrder.warrantyDecision === input.decision) throw new UserFacingError(`This claim is already ${input.decision === "APPROVED" ? "approved" : "denied"}.`);
      const leavesReview = workOrder.condition === "WARRANTY_REVIEW";
      await transaction.workOrder.update({
        where: { id: workOrder.id },
        data: { warrantyDecision: input.decision, warrantyDecidedById: user.id, warrantyDecidedAt: new Date(), warrantyDecisionNote: input.note, ...(leavesReview ? { condition: "NORMAL" as const } : {}) },
      });
      if (leavesReview) {
        await transaction.workOrderStatusHistory.create({
          data: { workOrderId: workOrder.id, serviceStageId: workOrder.serviceStageId, condition: "NORMAL", changedById: user.id, note: `Warranty claim ${input.decision === "APPROVED" ? "approved" : "denied"}.${input.note ? ` ${input.note}` : ""}` },
        });
      }
      await recordAudit(transaction, {
        workOrderId: workOrder.id,
        actorUserId: user.id,
        eventType: input.decision === "APPROVED" ? "warranty.claim-approved" : "warranty.claim-denied",
        entityType: "WorkOrder",
        entityId: workOrder.id,
        metadata: { reason: input.note, previousDecision: workOrder.warrantyDecision },
      });
    });
    revalidateWorkOrder(input.workOrderId);
    return input.decision === "APPROVED" ? "Claim approved. This repair is covered by warranty." : "Claim denied.";
  });
}

/** Removes a warranty claim that was opened by mistake and hasn't been decided. */
export async function withdrawWarrantyClaim(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const workOrderId = id.parse(value(formData, "workOrderId"));
    const user = await getActiveInternalUser();
    await getAuthorizedWorkOrder(workOrderId);

    await prisma.$transaction(async (transaction) => {
      const workOrder = await transaction.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, select: { id: true, condition: true, serviceStageId: true, warrantyClaimOnId: true, warrantyDecision: true } });
      if (!workOrder.warrantyClaimOnId) throw new UserFacingError("This job has no warranty claim.");
      if (workOrder.warrantyDecision !== WarrantyDecision.PENDING) throw new UserFacingError("This claim has been decided, so it can't be withdrawn. An approver can change the decision.");
      const leavesReview = workOrder.condition === "WARRANTY_REVIEW";
      await transaction.workOrder.update({ where: { id: workOrder.id }, data: { warrantyClaimOnId: null, warrantyDecision: null, ...(leavesReview ? { condition: "NORMAL" as const } : {}) } });
      if (leavesReview) {
        await transaction.workOrderStatusHistory.create({ data: { workOrderId: workOrder.id, serviceStageId: workOrder.serviceStageId, condition: "NORMAL", changedById: user.id, note: "Warranty claim withdrawn." } });
      }
      await recordAudit(transaction, { workOrderId: workOrder.id, actorUserId: user.id, eventType: "warranty.claim-withdrawn", entityType: "WorkOrder", entityId: workOrder.id });
    });
    revalidateWorkOrder(workOrderId);
    return "Warranty claim withdrawn.";
  });
}

/** Makes a staff member one of the people who decide warranty claims, or takes that away. */
export async function setWarrantyApprover(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ userId: id, canApprove: z.enum(["true", "false"]).transform((text) => text === "true") }).parse({ userId: value(formData, "userId"), canApprove: value(formData, "canApprove") });
    const actor = await getActiveInternalUserForRoles(managerRoles);
    await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({ where: { id: input.userId }, select: { id: true, internalRole: true, canApproveWarranty: true } });
      if (!user?.internalRole) throw new UserFacingError("Only staff can approve warranty claims.");
      if (user.canApproveWarranty === input.canApprove) return;
      await transaction.user.update({ where: { id: user.id }, data: { canApproveWarranty: input.canApprove } });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: input.canApprove ? "user.warranty-approver-added" : "user.warranty-approver-removed", entityType: "User", entityId: user.id });
    });
    revalidatePath("/workspace/users");
    return input.canApprove ? "This person can now decide warranty claims." : "This person can no longer decide warranty claims.";
  });
}

/** Turns on or off showing customers the warranty dates on their repairs and pumps. */
export async function saveCustomerWarrantyVisibility(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const visible = formData.get("visible") === "on";
    const actor = await getActiveInternalUserForRoles(managerRoles);
    await prisma.$transaction(async (transaction) => {
      const current = await transaction.portalSetting.findUnique({ where: { key: customerWarrantySetting } });
      if ((current?.value === "true") === visible) return;
      await transaction.portalSetting.upsert({ where: { key: customerWarrantySetting }, create: { key: customerWarrantySetting, value: String(visible) }, update: { value: String(visible) } });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: "portal-setting.updated", entityType: "PortalSetting", entityId: customerWarrantySetting, metadata: { customersSeeWarranty: visible } });
    });
    revalidatePath("/workspace/settings");
    revalidatePath("/portal", "layout");
    return visible ? "Customers can now see warranty dates." : "Warranty dates are hidden from customers.";
  });
}

/** Sets the standard repair warranty for every pump of a model. Empty means none is set. */
export async function saveModelWarranty(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ id, months: optionalMonths }).parse({ id: value(formData, "modelId"), months: value(formData, "months") });
    const actor = await getActiveInternalUserForRoles(managerRoles);
    await prisma.$transaction(async (transaction) => {
      const model = await transaction.productModel.findUnique({ where: { id: input.id }, select: { id: true, warrantyMonths: true } });
      if (!model) throw new UserFacingError("Model not found.");
      if (model.warrantyMonths === input.months) return;
      await transaction.productModel.update({ where: { id: model.id }, data: { warrantyMonths: input.months } });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: "product-model.warranty-set", entityType: "ProductModel", entityId: model.id, metadata: { warrantyMonths: { from: model.warrantyMonths, to: input.months } } });
    });
    revalidatePath("/workspace", "layout");
    return input.months === null ? "Standard warranty cleared." : `Standard warranty set to ${warrantyLengthLabel(input.months)}. Repairs that have already shipped keep theirs.`;
  });
}

/** Sets the repair warranty a customer's service contract gives. Empty means they have no contract terms. */
export async function saveContractWarranty(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ id, months: optionalMonths }).parse({ id: value(formData, "companyId"), months: value(formData, "months") });
    const actor = await getActiveInternalUserForRoles(managerRoles);
    await prisma.$transaction(async (transaction) => {
      const company = await transaction.company.findUnique({ where: { id: input.id }, select: { id: true, contractWarrantyMonths: true } });
      if (!company) throw new UserFacingError("Customer not found.");
      if (company.contractWarrantyMonths === input.months) return;
      await transaction.company.update({ where: { id: company.id }, data: { contractWarrantyMonths: input.months } });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: "company.contract-warranty-set", entityType: "Company", entityId: company.id, metadata: { contractWarrantyMonths: { from: company.contractWarrantyMonths, to: input.months } } });
    });
    revalidatePath("/workspace", "layout");
    return input.months === null ? "Contract warranty cleared. This customer's repairs use each model's standard warranty." : `Contract warranty set to ${warrantyLengthLabel(input.months)}. Repairs that have already shipped keep theirs.`;
  });
}
