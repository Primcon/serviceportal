-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'VACTECH_QA';

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "assignedToId" UUID,
ADD COLUMN     "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "WorkOrderAssignment" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "assignedToId" UUID,
    "assignedById" UUID NOT NULL,
    "serviceStageId" UUID NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrderAssignment_workOrderId_createdAt_idx" ON "WorkOrderAssignment"("workOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkOrder_assignedToId_idx" ON "WorkOrder"("assignedToId");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderAssignment" ADD CONSTRAINT "WorkOrderAssignment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderAssignment" ADD CONSTRAINT "WorkOrderAssignment_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderAssignment" ADD CONSTRAINT "WorkOrderAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderAssignment" ADD CONSTRAINT "WorkOrderAssignment_serviceStageId_fkey" FOREIGN KEY ("serviceStageId") REFERENCES "ServiceStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing work orders entered their current stage at their latest stage change.
UPDATE "WorkOrder" AS w
SET "stageEnteredAt" = COALESCE((
  SELECT MIN(h."createdAt") FROM "WorkOrderStatusHistory" h
  WHERE h."workOrderId" = w."id" AND h."serviceStageId" = w."serviceStageId"
    AND h."createdAt" > COALESCE((
      SELECT MAX(o."createdAt") FROM "WorkOrderStatusHistory" o
      WHERE o."workOrderId" = w."id" AND o."serviceStageId" <> w."serviceStageId"
    ), '-infinity'::timestamp)
), w."createdAt");
