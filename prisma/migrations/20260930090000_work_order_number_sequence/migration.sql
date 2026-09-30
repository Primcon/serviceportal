-- CreateTable
CREATE TABLE "NumberSequence" (
    "name" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NumberSequence_pkey" PRIMARY KEY ("name")
);

-- WIP numbers are now assigned by the portal. Continue from the highest number already used
-- (the leading digits of "48366 AZ"), or start at 1 on an empty database.
INSERT INTO "NumberSequence" ("name", "nextValue", "updatedAt")
SELECT 'work-order', COALESCE(MAX(substring("workOrderNumber" FROM '^[0-9]{1,9}')::integer), 0) + 1, CURRENT_TIMESTAMP
FROM "WorkOrder";
