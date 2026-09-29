CREATE UNIQUE INDEX "Equipment_companyId_serialNumber_lower_key"
ON "Equipment"("companyId", lower("serialNumber"));