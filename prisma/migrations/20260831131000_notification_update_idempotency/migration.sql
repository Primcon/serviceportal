-- One customer receives one notification per explicitly notified service update.
CREATE UNIQUE INDEX "Notification_serviceUpdateId_recipientEmail_key"
ON "Notification"("serviceUpdateId", "recipientEmail")
WHERE "serviceUpdateId" IS NOT NULL;