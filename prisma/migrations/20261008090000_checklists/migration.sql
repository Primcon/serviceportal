-- CreateEnum
CREATE TYPE "ChecklistStepType" AS ENUM ('SIGN_OFF', 'READING', 'CHECKLIST');

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "checklistTemplateId" UUID;

-- AlterTable
ALTER TABLE "WorkOrderStatusHistory" ADD COLUMN     "overrideReason" TEXT;

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" UUID NOT NULL,
    "formNumber" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplateStep" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "serviceStageId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "type" "ChecklistStepType" NOT NULL DEFAULT 'SIGN_OFF',
    "unit" TEXT,
    "items" TEXT[],
    "requiresQa" BOOLEAN NOT NULL DEFAULT false,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChecklistTemplateStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderStepRecord" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "templateStepId" UUID NOT NULL,
    "performedById" UUID NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notApplicable" BOOLEAN NOT NULL DEFAULT false,
    "reading" TEXT,
    "checkedItems" TEXT[],
    "notApplicableItems" TEXT[],
    "note" TEXT,

    CONSTRAINT "WorkOrderStepRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplate_formNumber_revision_key" ON "ChecklistTemplate"("formNumber", "revision");

-- CreateIndex
CREATE INDEX "ChecklistTemplateStep_templateId_sequence_idx" ON "ChecklistTemplateStep"("templateId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderStepRecord_workOrderId_templateStepId_key" ON "WorkOrderStepRecord"("workOrderId", "templateStepId");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_checklistTemplateId_fkey" FOREIGN KEY ("checklistTemplateId") REFERENCES "ChecklistTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplateStep" ADD CONSTRAINT "ChecklistTemplateStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplateStep" ADD CONSTRAINT "ChecklistTemplateStep_serviceStageId_fkey" FOREIGN KEY ("serviceStageId") REFERENCES "ServiceStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderStepRecord" ADD CONSTRAINT "WorkOrderStepRecord_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderStepRecord" ADD CONSTRAINT "WorkOrderStepRecord_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "ChecklistTemplateStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderStepRecord" ADD CONSTRAINT "WorkOrderStepRecord_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

