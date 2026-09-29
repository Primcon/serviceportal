ALTER TABLE "Notification"
ADD COLUMN "eventKey" TEXT,
ADD COLUMN "subject" TEXT NOT NULL DEFAULT '',
ADD COLUMN "body" TEXT NOT NULL DEFAULT '',
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastError" TEXT,
ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "providerMessageId" TEXT;

UPDATE "Notification"
SET "eventKey" = 'legacy:' || "id"::text,
    "subject" = 'Service notification',
    "body" = 'A service record has been updated.'
WHERE "eventKey" IS NULL;

ALTER TABLE "Notification"
ALTER COLUMN "eventKey" SET NOT NULL;

CREATE UNIQUE INDEX "Notification_eventKey_recipientEmail_key"
ON "Notification"("eventKey", "recipientEmail");

CREATE INDEX "Notification_status_nextAttemptAt_idx"
ON "Notification"("status", "nextAttemptAt");