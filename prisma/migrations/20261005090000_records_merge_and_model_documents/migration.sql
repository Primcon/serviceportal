-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "mergedIntoId" UUID;

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "mergedIntoId" UUID;

-- CreateTable
CREATE TABLE "ModelDocument" (
    "id" UUID NOT NULL,
    "productModelId" UUID NOT NULL,
    "documentType" "DocumentType" NOT NULL DEFAULT 'MANUAL',
    "visibility" "RecordVisibility" NOT NULL DEFAULT 'INTERNAL_ONLY',
    "title" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" UUID NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModelDocument_productModelId_idx" ON "ModelDocument"("productModelId");

-- CreateIndex
CREATE INDEX "Company_mergedIntoId_idx" ON "Company"("mergedIntoId");

-- CreateIndex
CREATE INDEX "Equipment_mergedIntoId_idx" ON "Equipment"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelDocument" ADD CONSTRAINT "ModelDocument_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelDocument" ADD CONSTRAINT "ModelDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

