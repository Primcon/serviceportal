import type { Prisma } from "@prisma/client";
import { UserFacingError } from "@/lib/errors";
import { recordAudit } from "@/services/audit";

type Transaction = Prisma.TransactionClient;

/** Work orders that are still being worked on: not completed and not cancelled. */
export const openWorkOrderWhere = { completedAt: null, condition: { not: "CANCELLED" } } satisfies Prisma.WorkOrderWhereInput;

/**
 * Folds a duplicate pump into the one being kept. The duplicate's work orders and files move
 * to the kept pump, and the duplicate stays behind as an archived record pointing at it, so
 * an import that knows the duplicate's old ID can still find where it went.
 */
export async function mergeEquipmentRecords(transaction: Transaction, input: { duplicateId: string; keepId: string; actorUserId: string; allowDifferentCustomers?: boolean }) {
  if (input.duplicateId === input.keepId) throw new UserFacingError("Choose a different pump to merge into.");
  const [duplicate, keep] = await Promise.all([
    transaction.equipment.findUnique({ where: { id: input.duplicateId } }),
    transaction.equipment.findUnique({ where: { id: input.keepId } }),
  ]);
  if (!duplicate || !keep) throw new UserFacingError("Pump not found.");
  if (duplicate.mergedIntoId) throw new UserFacingError("This pump has already been merged into another.");
  if (keep.mergedIntoId) throw new UserFacingError("The pump you chose was itself merged into another. Choose that one instead.");
  if (duplicate.companyId !== keep.companyId && !input.allowDifferentCustomers) {
    throw new UserFacingError("These pumps belong to different customers. Merge the customers first if they're the same company.");
  }

  const [workOrders, attachments] = await Promise.all([
    transaction.workOrder.updateMany({ where: { equipmentId: duplicate.id }, data: { equipmentId: keep.id } }),
    transaction.attachment.updateMany({ where: { equipmentId: duplicate.id }, data: { equipmentId: keep.id } }),
  ]);
  // Pumps merged into the duplicate earlier now point at the kept pump.
  await transaction.equipment.updateMany({ where: { mergedIntoId: duplicate.id }, data: { mergedIntoId: keep.id } });
  await transaction.equipment.update({ where: { id: duplicate.id }, data: { mergedIntoId: keep.id, archivedAt: duplicate.archivedAt ?? new Date() } });
  // Details the kept pump is missing are filled in from the duplicate.
  const filled = {
    ...(!keep.productModelId && duplicate.productModelId ? { productModelId: duplicate.productModelId, productModel: duplicate.productModel } : {}),
    ...(!keep.description && duplicate.description ? { description: duplicate.description } : {}),
    ...(!keep.locationId && duplicate.locationId && duplicate.companyId === keep.companyId ? { locationId: duplicate.locationId } : {}),
  };
  if (Object.keys(filled).length) await transaction.equipment.update({ where: { id: keep.id }, data: filled });

  await recordAudit(transaction, {
    actorUserId: input.actorUserId,
    eventType: "equipment.merged",
    entityType: "Equipment",
    entityId: keep.id,
    metadata: { duplicateId: duplicate.id, duplicateSerialNumber: duplicate.serialNumber, workOrdersMoved: workOrders.count, filesMoved: attachments.count },
  });
  return { workOrdersMoved: workOrders.count };
}

/**
 * Folds a duplicate customer into the one being kept: its locations, pumps, work orders,
 * customer logins and access requests all move across. Locations with the same name are
 * combined, and so are pumps with the same serial number. The duplicate stays behind as an
 * archived record pointing at the kept customer.
 */
export async function mergeCompanyRecords(transaction: Transaction, input: { duplicateId: string; keepId: string; actorUserId: string }) {
  if (input.duplicateId === input.keepId) throw new UserFacingError("Choose a different customer to merge into.");
  const [duplicate, keep] = await Promise.all([
    transaction.company.findUnique({ where: { id: input.duplicateId } }),
    transaction.company.findUnique({ where: { id: input.keepId } }),
  ]);
  if (!duplicate || !keep) throw new UserFacingError("Customer not found.");
  if (duplicate.mergedIntoId) throw new UserFacingError("This customer has already been merged into another.");
  if (keep.mergedIntoId) throw new UserFacingError("The customer you chose was itself merged into another. Choose that one instead.");
  if (keep.archivedAt) throw new UserFacingError("The customer you chose is archived. Restore it first, or merge the other way round.");

  const clash = await transaction.workOrder.findFirst({
    where: { companyId: duplicate.id, workOrderNumber: { in: (await transaction.workOrder.findMany({ where: { companyId: keep.id }, select: { workOrderNumber: true } })).map((workOrder) => workOrder.workOrderNumber) } },
    select: { workOrderNumber: true },
  });
  if (clash) throw new UserFacingError(`Both customers have a work order numbered ${clash.workOrderNumber}. Renumber one of them before merging.`);

  // Locations: one with a name the kept customer already has is combined with it; the rest move across.
  const [duplicateLocations, keepLocations] = await Promise.all([
    transaction.location.findMany({ where: { companyId: duplicate.id } }),
    transaction.location.findMany({ where: { companyId: keep.id } }),
  ]);
  const keepLocationByName = new Map(keepLocations.map((location) => [location.name.trim().toLowerCase(), location]));
  const locationMap = new Map<string, string>();
  let locationsMoved = 0;
  for (const location of duplicateLocations) {
    const match = keepLocationByName.get(location.name.trim().toLowerCase());
    if (!match) {
      await transaction.location.update({ where: { id: location.id }, data: { companyId: keep.id } });
      locationMap.set(location.id, location.id);
      locationsMoved += 1;
      continue;
    }
    locationMap.set(location.id, match.id);
    await transaction.equipment.updateMany({ where: { locationId: location.id }, data: { locationId: match.id } });
    await transaction.workOrder.updateMany({ where: { locationId: location.id }, data: { locationId: match.id } });
    if (!location.archivedAt) await transaction.location.update({ where: { id: location.id }, data: { archivedAt: new Date() } });
  }

  // Pumps: one with a serial number the kept customer already has is merged into it; the rest move across.
  const [duplicateEquipment, keepEquipment] = await Promise.all([
    transaction.equipment.findMany({ where: { companyId: duplicate.id, mergedIntoId: null }, select: { id: true, serialNumber: true } }),
    transaction.equipment.findMany({ where: { companyId: keep.id }, select: { id: true, serialNumber: true, mergedIntoId: true } }),
  ]);
  // A serial number is unique within a customer even on a pump that was merged away earlier, so
  // those count too, and resolve to the pump they were merged into.
  const keepEquipmentBySerial = new Map(keepEquipment.map((equipment) => [equipment.serialNumber.toLowerCase(), equipment.mergedIntoId ?? equipment.id]));
  let pumpsMoved = 0;
  let pumpsCombined = 0;
  for (const equipment of duplicateEquipment) {
    const matchId = keepEquipmentBySerial.get(equipment.serialNumber.toLowerCase());
    if (matchId) {
      await mergeEquipmentRecords(transaction, { duplicateId: equipment.id, keepId: matchId, actorUserId: input.actorUserId, allowDifferentCustomers: true });
      pumpsCombined += 1;
    } else {
      await transaction.equipment.update({ where: { id: equipment.id }, data: { companyId: keep.id } });
      pumpsMoved += 1;
    }
  }

  const workOrders = await transaction.workOrder.updateMany({ where: { companyId: duplicate.id }, data: { companyId: keep.id } });
  await transaction.accessRequest.updateMany({ where: { assignedCompanyId: duplicate.id }, data: { assignedCompanyId: keep.id } });

  // Customer logins: each grant moves across unless the person already has the same access there.
  const grants = await transaction.userAccess.findMany({ where: { companyId: duplicate.id } });
  let loginsMoved = 0;
  for (const grant of grants) {
    const locationId = grant.locationId ? locationMap.get(grant.locationId) ?? grant.locationId : null;
    const existing = await transaction.userAccess.findFirst({ where: { userId: grant.userId, companyId: keep.id, locationId, role: grant.role, scope: grant.scope }, select: { id: true } });
    if (existing) {
      await transaction.userAccess.delete({ where: { id: grant.id } });
    } else {
      await transaction.userAccess.update({ where: { id: grant.id }, data: { companyId: keep.id, locationId } });
      loginsMoved += 1;
    }
  }

  await transaction.company.updateMany({ where: { mergedIntoId: duplicate.id }, data: { mergedIntoId: keep.id } });
  await transaction.company.update({ where: { id: duplicate.id }, data: { mergedIntoId: keep.id, archivedAt: duplicate.archivedAt ?? new Date() } });
  await recordAudit(transaction, {
    actorUserId: input.actorUserId,
    eventType: "company.merged",
    entityType: "Company",
    entityId: keep.id,
    metadata: { duplicateId: duplicate.id, duplicateName: duplicate.name, workOrdersMoved: workOrders.count, locationsMoved, pumpsMoved, pumpsCombined, loginsMoved },
  });
  return { workOrdersMoved: workOrders.count, pumpsMoved: pumpsMoved + pumpsCombined };
}
