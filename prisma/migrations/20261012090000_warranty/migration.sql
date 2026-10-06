-- CreateEnum
CREATE TYPE "WarrantyDecision" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "contractWarrantyMonths" INTEGER;

-- AlterTable
ALTER TABLE "ProductModel" ADD COLUMN     "warrantyMonths" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canApproveWarranty" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "shippedAt" TIMESTAMP(3),
ADD COLUMN     "warrantyClaimOnId" UUID,
ADD COLUMN     "warrantyDecidedAt" TIMESTAMP(3),
ADD COLUMN     "warrantyDecidedById" UUID,
ADD COLUMN     "warrantyDecision" "WarrantyDecision",
ADD COLUMN     "warrantyDecisionNote" TEXT,
ADD COLUMN     "warrantyEndsAt" TIMESTAMP(3),
ADD COLUMN     "warrantyMonths" INTEGER;

-- CreateTable
CREATE TABLE "PortalSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "WorkOrder_warrantyClaimOnId_idx" ON "WorkOrder"("warrantyClaimOnId");

-- CreateIndex
CREATE INDEX "WorkOrder_warrantyDecision_idx" ON "WorkOrder"("warrantyDecision");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_warrantyClaimOnId_fkey" FOREIGN KEY ("warrantyClaimOnId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_warrantyDecidedById_fkey" FOREIGN KEY ("warrantyDecidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

