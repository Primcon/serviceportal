-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('SERVICE_UPDATE', 'STATUS_CHANGE', 'DOCUMENT_SHARED', 'ACCESS');

-- AlterEnum
ALTER TYPE "NotificationStatus" ADD VALUE 'OPTED_OUT';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "kind" "NotificationKind" NOT NULL DEFAULT 'SERVICE_UPDATE',
ADD COLUMN     "linkPath" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "userId" UUID,
ALTER COLUMN "workOrderId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "emailDocuments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailStatusChanges" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing notifications: record who each was for and what kind it was, and treat them as
-- already read so nobody's feed starts with a pile of old unread items.
UPDATE "Notification" AS n SET "userId" = u."id" FROM "User" AS u WHERE lower(u."email") = lower(n."recipientEmail");
UPDATE "Notification" SET "kind" = 'STATUS_CHANGE' WHERE "eventKey" LIKE 'status-change:%';
UPDATE "Notification" SET "readAt" = "createdAt", "linkPath" = '/portal/work-orders/' || "workOrderId";
