-- CreateEnum
CREATE TYPE "PartsKit" AS ENUM ('NONE', 'MINOR', 'MAJOR');

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "extraLaborHours" DECIMAL(6,2),
ADD COLUMN     "partsKit" "PartsKit",
ADD COLUMN     "partsOrderedAt" TIMESTAMP(3),
ADD COLUMN     "partsReceivedAt" TIMESTAMP(3),
ADD COLUMN     "partsReceivedById" UUID,
ADD COLUMN     "partsRequired" TEXT,
ADD COLUMN     "quotedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_partsReceivedById_fkey" FOREIGN KEY ("partsReceivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

