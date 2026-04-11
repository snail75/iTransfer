-- Add per-user storage quotas, per-share local storage roots, and file scan metadata.
ALTER TABLE "User" ADD COLUMN "storageQuotaBytes" TEXT;
ALTER TABLE "Share" ADD COLUMN "localStoragePath" TEXT;
ALTER TABLE "File" ADD COLUMN "scanStatus" TEXT NOT NULL DEFAULT 'UNSCANNED';
ALTER TABLE "File" ADD COLUMN "scanCheckedAt" DATETIME;
ALTER TABLE "File" ADD COLUMN "scanMessage" TEXT;
