import { CustomerFacingStatus, PrismaClient } from "@prisma/client";

// Code, internal name, customer status, and the step customers see on their progress tracker.
const initialStages = [
  ["RECEIVED", "Received", CustomerFacingStatus.OPEN, "Received"],
  ["INTAKE_DOCUMENTATION", "Intake Documentation", CustomerFacingStatus.OPEN, "Received"],
  ["INITIAL_INSPECTION", "Initial Inspection", CustomerFacingStatus.IN_PROGRESS, "Inspection"],
  ["EVALUATION", "Evaluation", CustomerFacingStatus.IN_PROGRESS, "Inspection"],
  ["QUOTE_PREPARATION", "Quote Preparation", CustomerFacingStatus.IN_PROGRESS, "Quote"],
  ["AWAITING_CUSTOMER_APPROVAL", "Awaiting Customer Approval", CustomerFacingStatus.WAITING, "Quote"],
  ["REPAIR_AUTHORIZED", "Repair Authorized", CustomerFacingStatus.IN_PROGRESS, "Repair"],
  ["REPAIR_IN_PROGRESS", "Repair In Progress", CustomerFacingStatus.IN_PROGRESS, "Repair"],
  ["TESTING", "Testing", CustomerFacingStatus.IN_PROGRESS, "Testing"],
  ["FINAL_INSPECTION", "Final Inspection", CustomerFacingStatus.IN_PROGRESS, "Testing"],
  ["READY_TO_SHIP", "Ready to Ship", CustomerFacingStatus.IN_PROGRESS, "Shipping"],
  ["SHIPPED", "Shipped", CustomerFacingStatus.IN_PROGRESS, "Shipping"],
  ["COMPLETED", "Completed", CustomerFacingStatus.COMPLETED, "Complete"],
] as const;

export async function ensureInitialStages(prisma: PrismaClient) {
  await Promise.all(
    initialStages.map(([code, displayName, customerFacingStatus, customerLabel], index) =>
      prisma.serviceStage.upsert({
        where: { code },
        update: {},
        create: {
          code,
          displayName,
          customerLabel,
          customerFacingStatus,
          sequence: index + 1,
        },
      }),
    ),
  );

  return prisma.serviceStage.findUniqueOrThrow({ where: { code: "RECEIVED" } });
}