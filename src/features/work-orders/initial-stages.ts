import { CustomerFacingStatus, PrismaClient } from "@prisma/client";

const initialStages = [
  ["RECEIVED", "Received", CustomerFacingStatus.OPEN],
  ["INTAKE_DOCUMENTATION", "Intake Documentation", CustomerFacingStatus.OPEN],
  ["INITIAL_INSPECTION", "Initial Inspection", CustomerFacingStatus.IN_PROGRESS],
  ["EVALUATION", "Evaluation", CustomerFacingStatus.IN_PROGRESS],
  ["QUOTE_PREPARATION", "Quote Preparation", CustomerFacingStatus.IN_PROGRESS],
  ["AWAITING_CUSTOMER_APPROVAL", "Awaiting Customer Approval", CustomerFacingStatus.WAITING],
  ["REPAIR_AUTHORIZED", "Repair Authorized", CustomerFacingStatus.IN_PROGRESS],
  ["REPAIR_IN_PROGRESS", "Repair In Progress", CustomerFacingStatus.IN_PROGRESS],
  ["TESTING", "Testing", CustomerFacingStatus.IN_PROGRESS],
  ["FINAL_INSPECTION", "Final Inspection", CustomerFacingStatus.IN_PROGRESS],
  ["READY_TO_SHIP", "Ready to Ship", CustomerFacingStatus.IN_PROGRESS],
  ["SHIPPED", "Shipped", CustomerFacingStatus.IN_PROGRESS],
  ["COMPLETED", "Completed", CustomerFacingStatus.COMPLETED],
] as const;

export async function ensureInitialStages(prisma: PrismaClient) {
  await Promise.all(
    initialStages.map(([code, displayName, customerFacingStatus], index) =>
      prisma.serviceStage.upsert({
        where: { code },
        update: {},
        create: {
          code,
          displayName,
          customerFacingStatus,
          sequence: index + 1,
        },
      }),
    ),
  );

  return prisma.serviceStage.findUniqueOrThrow({ where: { code: "RECEIVED" } });
}