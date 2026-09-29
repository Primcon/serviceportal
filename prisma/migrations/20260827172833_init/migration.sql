-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PORTAL_ADMINISTRATOR', 'VACTECH_MANAGER', 'VACTECH_SERVICE_USER', 'CUSTOMER_USER');

-- CreateEnum
CREATE TYPE "AccessScope" AS ENUM ('COMPANY', 'LOCATION');

-- CreateEnum
CREATE TYPE "CustomerFacingStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WorkOrderCondition" AS ENUM ('NORMAL', 'WAITING_ON_PARTS', 'AWAITING_CUSTOMER', 'CUSTOMER_HOLD', 'WARRANTY_REVIEW', 'QUOTE_DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecordVisibility" AS ENUM ('INTERNAL_ONLY', 'CUSTOMER_VISIBLE');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('PHOTO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "PhotoCategory" AS ENUM ('ARRIVAL', 'IDENTIFICATION', 'INITIAL_CONDITION', 'INSPECTION', 'DISASSEMBLY', 'FINDINGS', 'REPAIR', 'REPLACEMENT_PARTS', 'TESTING', 'FINAL_CONDITION', 'SHIPPING');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CUSTOMER_PO', 'REPAIR_QUOTE', 'INSPECTION_REPORT', 'TEST_REPORT', 'FINAL_SERVICE_REPORT', 'SHIPPING_DOCUMENTATION', 'OTHER');

-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'LOGGED');

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "identitySubject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAccess" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "locationId" UUID,
    "role" "UserRole" NOT NULL,
    "scope" "AccessScope" NOT NULL DEFAULT 'COMPANY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "locationId" UUID,
    "productModel" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceStage" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "customerFacingStatus" "CustomerFacingStatus" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" UUID NOT NULL,
    "workOrderNumber" TEXT NOT NULL,
    "companyId" UUID NOT NULL,
    "locationId" UUID,
    "equipmentId" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "serviceType" TEXT,
    "priority" TEXT,
    "customerPurchaseOrder" TEXT,
    "rmaReference" TEXT,
    "receivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "serviceStageId" UUID NOT NULL,
    "condition" "WorkOrderCondition" NOT NULL DEFAULT 'NORMAL',
    "customerFacingStatus" "CustomerFacingStatus" NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderStatusHistory" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "serviceStageId" UUID NOT NULL,
    "condition" "WorkOrderCondition" NOT NULL,
    "changedById" UUID NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceUpdate" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "RecordVisibility" NOT NULL DEFAULT 'INTERNAL_ONLY',
    "notifyCustomer" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "RecordVisibility" NOT NULL DEFAULT 'INTERNAL_ONLY',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "equipmentId" UUID,
    "serviceStageId" UUID,
    "kind" "AttachmentKind" NOT NULL,
    "visibility" "RecordVisibility" NOT NULL DEFAULT 'INTERNAL_ONLY',
    "photoCategory" "PhotoCategory",
    "documentType" "DocumentType",
    "originalStorageKey" TEXT NOT NULL,
    "optimizedStorageKey" TEXT,
    "thumbnailStorageKey" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "uploadedById" UUID NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessRequest" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "requestedCompany" TEXT NOT NULL,
    "message" TEXT,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "assignedCompanyId" UUID,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "serviceUpdateId" UUID,
    "recipientEmail" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "workOrderId" UUID,
    "actorUserId" UUID,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "customerVisible" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");

-- CreateIndex
CREATE INDEX "Location_companyId_idx" ON "Location"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_companyId_name_key" ON "Location"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "User_identitySubject_key" ON "User"("identitySubject");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserAccess_companyId_idx" ON "UserAccess"("companyId");

-- CreateIndex
CREATE INDEX "UserAccess_locationId_idx" ON "UserAccess"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccess_userId_companyId_locationId_key" ON "UserAccess"("userId", "companyId", "locationId");

-- CreateIndex
CREATE INDEX "Equipment_companyId_serialNumber_idx" ON "Equipment"("companyId", "serialNumber");

-- CreateIndex
CREATE INDEX "Equipment_locationId_idx" ON "Equipment"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceStage_code_key" ON "ServiceStage"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceStage_sequence_key" ON "ServiceStage"("sequence");

-- CreateIndex
CREATE INDEX "WorkOrder_companyId_customerFacingStatus_idx" ON "WorkOrder"("companyId", "customerFacingStatus");

-- CreateIndex
CREATE INDEX "WorkOrder_equipmentId_updatedAt_idx" ON "WorkOrder"("equipmentId", "updatedAt");

-- CreateIndex
CREATE INDEX "WorkOrder_serviceStageId_idx" ON "WorkOrder"("serviceStageId");

-- CreateIndex
CREATE INDEX "WorkOrder_locationId_idx" ON "WorkOrder"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_companyId_workOrderNumber_key" ON "WorkOrder"("companyId", "workOrderNumber");

-- CreateIndex
CREATE INDEX "WorkOrderStatusHistory_workOrderId_createdAt_idx" ON "WorkOrderStatusHistory"("workOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceUpdate_workOrderId_visibility_createdAt_idx" ON "ServiceUpdate"("workOrderId", "visibility", "createdAt");

-- CreateIndex
CREATE INDEX "Finding_workOrderId_visibility_createdAt_idx" ON "Finding"("workOrderId", "visibility", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_workOrderId_kind_visibility_photoCategory_idx" ON "Attachment"("workOrderId", "kind", "visibility", "photoCategory");

-- CreateIndex
CREATE INDEX "Attachment_equipmentId_idx" ON "Attachment"("equipmentId");

-- CreateIndex
CREATE INDEX "AccessRequest_status_createdAt_idx" ON "AccessRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AccessRequest_email_idx" ON "AccessRequest"("email");

-- CreateIndex
CREATE INDEX "Notification_workOrderId_createdAt_idx" ON "Notification"("workOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_workOrderId_createdAt_idx" ON "AuditEvent"("workOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccess" ADD CONSTRAINT "UserAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccess" ADD CONSTRAINT "UserAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccess" ADD CONSTRAINT "UserAccess_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_serviceStageId_fkey" FOREIGN KEY ("serviceStageId") REFERENCES "ServiceStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderStatusHistory" ADD CONSTRAINT "WorkOrderStatusHistory_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderStatusHistory" ADD CONSTRAINT "WorkOrderStatusHistory_serviceStageId_fkey" FOREIGN KEY ("serviceStageId") REFERENCES "ServiceStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderStatusHistory" ADD CONSTRAINT "WorkOrderStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceUpdate" ADD CONSTRAINT "ServiceUpdate_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceUpdate" ADD CONSTRAINT "ServiceUpdate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_serviceStageId_fkey" FOREIGN KEY ("serviceStageId") REFERENCES "ServiceStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_assignedCompanyId_fkey" FOREIGN KEY ("assignedCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_serviceUpdateId_fkey" FOREIGN KEY ("serviceUpdateId") REFERENCES "ServiceUpdate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
