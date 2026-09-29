CREATE TYPE "ReportType" AS ENUM ('WORK_ORDERS', 'EQUIPMENT', 'AUDIT_EVENTS');

CREATE TYPE "ReportFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

CREATE TYPE "ReportRunStatus" AS ENUM ('SUCCESS', 'FAILED');

CREATE TABLE "ReportSchedule" (
    "id" UUID NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "filters" JSONB,
    "recipientEmails" TEXT[] NOT NULL,
    "frequency" "ReportFrequency" NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "timeZone" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" "ReportRunStatus",
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportSchedule_isActive_nextRunAt_idx" ON "ReportSchedule"("isActive", "nextRunAt");

CREATE INDEX "ReportSchedule_createdById_idx" ON "ReportSchedule"("createdById");

ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;