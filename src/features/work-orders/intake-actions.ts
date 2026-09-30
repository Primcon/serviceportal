"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";
import { detailFields, detailsSchema } from "@/features/work-orders/details-schema";
import { assignWorkOrderNumber, findOrCreateProductModel, modelDisplayName } from "@/features/work-orders/intake";
import { ensureInitialStages } from "@/features/work-orders/initial-stages";
import { recordAudit } from "@/services/audit";
import { getActiveInternalUser } from "@/services/authorization";

function value(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

const newPumpSchema = z.object({
  companyId: z.string().uuid("Choose the customer."),
  locationId: z.string().trim().uuid().or(z.literal("")).transform((id) => id || null),
  // "__new" is the form's "model not listed" choice; the new model's name comes from the fields below.
  productModelId: z.string().trim().uuid().or(z.literal("")).or(z.literal("__new")).transform((id) => (id && id !== "__new" ? id : null)),
  newManufacturer: z.string().trim().max(80),
  newModelName: z.string().trim().max(120),
  serialNumber: z.string().trim().min(1).max(120),
});

/**
 * Opens a work order when a pump arrives. The pump is either one already in the register or a
 * new one entered on the same form (with a new catalog model if needed). The portal assigns the
 * next WIP number, with its service center suffix, and staff land on the new work order.
 */
export async function openWorkOrder(formData: FormData): Promise<ActionResult> {
  let createdId = "";
  const result = await runAction(async () => {
    const pumpMode = value(formData, "pumpMode") === "new" ? "new" : "existing";
    const details = detailsSchema.parse(Object.fromEntries(detailFields.map((field) => [field, value(formData, field) || (field === "copperClassification" ? "UNKNOWN" : "")])));
    const existingEquipmentId = pumpMode === "existing" ? z.object({ equipmentId: z.string().uuid("Search for the pump and choose it, or add a new pump.") }).parse({ equipmentId: value(formData, "equipmentId") }).equipmentId : null;
    const newPump = pumpMode === "new" ? newPumpSchema.parse({
      companyId: value(formData, "companyId"),
      locationId: value(formData, "locationId"),
      productModelId: value(formData, "productModelId"),
      newManufacturer: value(formData, "newManufacturer"),
      newModelName: value(formData, "newModelName"),
      serialNumber: value(formData, "serialNumber"),
    }) : null;
    if (newPump && !newPump.productModelId && !newPump.newModelName) throw new UserFacingError("Choose the pump's model, or enter a new one.");

    const user = await getActiveInternalUser();
    const receivedStage = await prisma.serviceStage.findUnique({ where: { code: "RECEIVED" } }) ?? await ensureInitialStages(prisma);

    createdId = await prisma.$transaction(async (transaction) => {
      const center = details.serviceCenterId ? await transaction.serviceCenter.findUnique({ where: { id: details.serviceCenterId } }) : null;
      if (details.serviceCenterId && !center) throw new UserFacingError("Service center not found.");
      // The center's code is part of the WIP number, so it's required once any center is set up.
      if (!center && await transaction.serviceCenter.count({ where: { isActive: true } }) > 0) throw new UserFacingError("Choose the service center doing the work.");

      let equipment: { id: string; companyId: string; locationId: string | null };
      if (newPump) {
        const company = await transaction.company.findFirst({ where: { id: newPump.companyId, archivedAt: null }, select: { id: true } });
        if (!company) throw new UserFacingError("Customer not found.");
        if (newPump.locationId) {
          const location = await transaction.location.findFirst({ where: { id: newPump.locationId, companyId: company.id }, select: { id: true } });
          if (!location) throw new UserFacingError("That location belongs to a different customer.");
        }
        const duplicateSerial = await transaction.equipment.findFirst({ where: { companyId: company.id, serialNumber: { equals: newPump.serialNumber, mode: "insensitive" } }, select: { id: true } });
        if (duplicateSerial) throw new UserFacingError("This customer already has a pump with that serial number. Search for it instead of adding it again.");
        const model = newPump.productModelId
          ? await transaction.productModel.findUnique({ where: { id: newPump.productModelId } })
          : await findOrCreateProductModel(transaction, newPump.newManufacturer || null, newPump.newModelName);
        if (!model) throw new UserFacingError("Model not found.");
        const created = await transaction.equipment.create({
          data: { companyId: company.id, locationId: newPump.locationId, productModelId: model.id, productModel: modelDisplayName(model.manufacturer, model.name), serialNumber: newPump.serialNumber },
        });
        await recordAudit(transaction, { actorUserId: user.id, eventType: "equipment.created", entityType: "Equipment", entityId: created.id, metadata: { from: "work-order-intake" } });
        equipment = created;
      } else {
        const found = await transaction.equipment.findUnique({ where: { id: existingEquipmentId! }, select: { id: true, companyId: true, locationId: true } });
        if (!found) throw new UserFacingError("Pump not found.");
        equipment = found;
      }

      // Taken last, so the counter row is locked only briefly.
      const workOrderNumber = await assignWorkOrderNumber(transaction, center?.code ?? null);
      const workOrder = await transaction.workOrder.create({
        data: {
          ...details,
          workOrderNumber,
          companyId: equipment.companyId,
          locationId: equipment.locationId,
          equipmentId: equipment.id,
          serviceStageId: receivedStage.id,
          customerFacingStatus: receivedStage.customerFacingStatus,
          createdById: user.id,
          receivedAt: new Date(),
        },
      });
      await transaction.workOrderStatusHistory.create({ data: { workOrderId: workOrder.id, serviceStageId: receivedStage.id, condition: workOrder.condition, changedById: user.id } });
      await recordAudit(transaction, { workOrderId: workOrder.id, actorUserId: user.id, eventType: "work-order.created", entityType: "WorkOrder", entityId: workOrder.id, customerVisible: true });
      return workOrder.id;
    });
    revalidatePath("/workspace");
    revalidatePath("/workspace/work-orders");
    revalidatePath("/portal");
  });
  // Redirect outside runAction, only once the work order exists.
  if (result.status === "success" && createdId) redirect(`/workspace/work-orders/${createdId}`);
  return result;
}
