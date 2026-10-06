-- AlterTable
ALTER TABLE "ServiceCenter" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT;

-- AlterTable
ALTER TABLE "ServiceStage" ADD COLUMN     "customerLabel" TEXT;

-- The step customers see for each of the standard stages. Stages added by hand keep their own name until a label is set.
UPDATE "ServiceStage" SET "customerLabel" = CASE "code"
  WHEN 'RECEIVED' THEN 'Received'
  WHEN 'INTAKE_DOCUMENTATION' THEN 'Received'
  WHEN 'INITIAL_INSPECTION' THEN 'Inspection'
  WHEN 'EVALUATION' THEN 'Inspection'
  WHEN 'QUOTE_PREPARATION' THEN 'Quote'
  WHEN 'AWAITING_CUSTOMER_APPROVAL' THEN 'Quote'
  WHEN 'REPAIR_AUTHORIZED' THEN 'Repair'
  WHEN 'REPAIR_IN_PROGRESS' THEN 'Repair'
  WHEN 'TESTING' THEN 'Testing'
  WHEN 'FINAL_INSPECTION' THEN 'Testing'
  WHEN 'READY_TO_SHIP' THEN 'Shipping'
  WHEN 'SHIPPED' THEN 'Shipping'
  WHEN 'COMPLETED' THEN 'Complete'
  ELSE NULL
END;
