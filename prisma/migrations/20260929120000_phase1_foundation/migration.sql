-- CreateEnum
CREATE TYPE "CopperClassification" AS ENUM ('UNKNOWN', 'COPPER', 'NON_COPPER');

-- CreateEnum
CREATE TYPE "ListKind" AS ENUM ('PRIORITY', 'SERVICE_TYPE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'INVOICE';
ALTER TYPE "DocumentType" ADD VALUE 'MANUAL';
ALTER TYPE "DocumentType" ADD VALUE 'WARRANTY_CERTIFICATE';
ALTER TYPE "DocumentType" ADD VALUE 'SIGNED_TRAVELER';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "caption" TEXT,
ADD COLUMN     "legacyId" TEXT,
ADD COLUMN     "legacySource" TEXT;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "legacyId" TEXT,
ADD COLUMN     "legacySource" TEXT;

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "legacyId" TEXT,
ADD COLUMN     "legacySource" TEXT,
ADD COLUMN     "productModelId" UUID;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "legacyId" TEXT,
ADD COLUMN     "legacySource" TEXT;

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "subject" DROP DEFAULT,
ALTER COLUMN "body" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "legacyId" TEXT,
ADD COLUMN     "legacySource" TEXT;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "accessoriesReceived" TEXT,
ADD COLUMN     "contaminants" TEXT,
ADD COLUMN     "copperClassification" "CopperClassification" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "customerContactEmail" TEXT,
ADD COLUMN     "customerContactName" TEXT,
ADD COLUMN     "customerContactPhone" TEXT,
ADD COLUMN     "legacyId" TEXT,
ADD COLUMN     "legacySource" TEXT,
ADD COLUMN     "oilType" TEXT,
ADD COLUMN     "oilWeight" TEXT,
ADD COLUMN     "promisedAt" TIMESTAMP(3),
ADD COLUMN     "reasonForService" TEXT,
ADD COLUMN     "serviceCenterId" UUID,
ADD COLUMN     "toolId" TEXT;

-- CreateTable
CREATE TABLE "ProductModel" (
    "id" UUID NOT NULL,
    "manufacturer" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCenter" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListOption" (
    "id" UUID NOT NULL,
    "kind" "ListKind" NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductModel_name_idx" ON "ProductModel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCenter_code_key" ON "ServiceCenter"("code");

-- CreateIndex
CREATE INDEX "ListOption_kind_isActive_sortOrder_idx" ON "ListOption"("kind", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ListOption_kind_label_key" ON "ListOption"("kind", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_legacySource_legacyId_key" ON "Attachment"("legacySource", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_legacySource_legacyId_key" ON "Company"("legacySource", "legacyId");

-- CreateIndex
CREATE INDEX "Equipment_productModelId_idx" ON "Equipment"("productModelId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_legacySource_legacyId_key" ON "Equipment"("legacySource", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_legacySource_legacyId_key" ON "Location"("legacySource", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_legacySource_legacyId_key" ON "User"("legacySource", "legacyId");

-- CreateIndex
CREATE INDEX "WorkOrder_serviceCenterId_idx" ON "WorkOrder"("serviceCenterId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_legacySource_legacyId_key" ON "WorkOrder"("legacySource", "legacyId");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_serviceCenterId_fkey" FOREIGN KEY ("serviceCenterId") REFERENCES "ServiceCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Model names are unique per manufacturer, ignoring capitalization.
CREATE UNIQUE INDEX "ProductModel_manufacturer_name_lower_key" ON "ProductModel"(lower(coalesce("manufacturer", '')), lower("name"));

-- Backfill the model catalog from the models typed on existing equipment. When the first
-- word is a known pump manufacturer, it becomes the manufacturer ("Edwards iXH610").
WITH "source" AS (
  SELECT DISTINCT ON (lower(trim("productModel"))) trim("productModel") AS "label"
  FROM "Equipment"
  WHERE trim("productModel") <> ''
  ORDER BY lower(trim("productModel")), "createdAt"
), "split" AS (
  SELECT
    "label",
    lower(split_part("label", ' ', 1)) IN ('adixen', 'agilent', 'alcatel', 'busch', 'ebara', 'edwards', 'kashiyama', 'leybold', 'oerlikon', 'osaka', 'pfeiffer', 'shimadzu', 'varian')
      AND position(' ' IN "label") > 0 AS "hasManufacturer"
  FROM "source"
)
INSERT INTO "ProductModel" ("id", "manufacturer", "name", "updatedAt")
SELECT
  gen_random_uuid(),
  CASE WHEN "hasManufacturer" THEN split_part("label", ' ', 1) END,
  CASE WHEN "hasManufacturer" THEN trim(substr("label", position(' ' IN "label") + 1)) ELSE "label" END,
  CURRENT_TIMESTAMP
FROM "split";

UPDATE "Equipment" AS e
SET "productModelId" = pm."id"
FROM "ProductModel" AS pm
WHERE lower(trim(e."productModel")) = lower(concat_ws(' ', pm."manufacturer", pm."name"));

-- Create service centers from the suffixes already used on work order numbers ("48366 AZ").
-- They start with a placeholder name that an administrator can change in Settings.
INSERT INTO "ServiceCenter" ("id", "code", "name", "updatedAt")
SELECT gen_random_uuid(), "code", "code" || ' service center', CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT upper(substring("workOrderNumber" FROM '\s([A-Za-z]{2,4})$')) AS "code"
  FROM "WorkOrder"
) AS "codes"
WHERE "code" IS NOT NULL;

UPDATE "WorkOrder" AS w
SET "serviceCenterId" = s."id"
FROM "ServiceCenter" AS s
WHERE upper(substring(w."workOrderNumber" FROM '\s([A-Za-z]{2,4})$')) = s."code";

-- Default picklists, plus every value already in use so existing work orders stay valid.
INSERT INTO "ListOption" ("id", "kind", "label", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid(), 'PRIORITY', 'Standard', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PRIORITY', 'Expedite', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PRIORITY', 'Rush', 3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SERVICE_TYPE', 'Rebuild', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SERVICE_TYPE', 'Repair', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SERVICE_TYPE', 'Evaluation', 3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SERVICE_TYPE', 'Preventive maintenance', 4, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SERVICE_TYPE', 'Warranty', 5, CURRENT_TIMESTAMP)
ON CONFLICT ("kind", "label") DO NOTHING;

INSERT INTO "ListOption" ("id", "kind", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), 'PRIORITY'::"ListKind", "value", 100, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT trim("priority") AS "value" FROM "WorkOrder" WHERE trim(coalesce("priority", '')) <> '') AS "used"
ON CONFLICT ("kind", "label") DO NOTHING;

INSERT INTO "ListOption" ("id", "kind", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), 'SERVICE_TYPE'::"ListKind", "value", 100, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT trim("serviceType") AS "value" FROM "WorkOrder" WHERE trim(coalesce("serviceType", '')) <> '') AS "used"
ON CONFLICT ("kind", "label") DO NOTHING;
