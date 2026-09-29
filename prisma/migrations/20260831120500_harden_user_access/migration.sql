-- Prevent duplicate company and location grants, including nullable company-wide location IDs.
CREATE UNIQUE INDEX "UserAccess_userId_companyId_company_grant_key"
ON "UserAccess"("userId", "companyId")
WHERE "locationId" IS NULL;

CREATE UNIQUE INDEX "UserAccess_userId_locationId_location_grant_key"
ON "UserAccess"("userId", "locationId")
WHERE "locationId" IS NOT NULL;

ALTER TABLE "UserAccess"
ADD CONSTRAINT "UserAccess_scope_location_consistency"
CHECK (
  ("scope" = 'COMPANY' AND "locationId" IS NULL)
  OR ("scope" = 'LOCATION' AND "locationId" IS NOT NULL)
);