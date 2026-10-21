-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'STAFF';

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "emailHandoffs" BOOLEAN NOT NULL DEFAULT false;

