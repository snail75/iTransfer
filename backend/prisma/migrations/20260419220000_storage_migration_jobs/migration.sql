CREATE TABLE "StorageMigrationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sourcePath" TEXT,
    "targetPath" TEXT NOT NULL,
    "totalShares" INTEGER NOT NULL DEFAULT 0,
    "movedShares" INTEGER NOT NULL DEFAULT 0,
    "skippedShares" INTEGER NOT NULL DEFAULT 0,
    "failedShares" INTEGER NOT NULL DEFAULT 0,
    "totalBytes" TEXT NOT NULL DEFAULT '0',
    "movedBytes" TEXT NOT NULL DEFAULT '0',
    "currentShareId" TEXT,
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME
);

CREATE TABLE "StorageMigrationJobItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sourcePath" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL,
    "files" INTEGER NOT NULL DEFAULT 0,
    "bytes" TEXT NOT NULL DEFAULT '0',
    "errorMessage" TEXT,
    "jobId" TEXT NOT NULL,
    "shareId" TEXT,
    CONSTRAINT "StorageMigrationJobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "StorageMigrationJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StorageMigrationJobItem_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "StorageMigrationJobItem_jobId_idx" ON "StorageMigrationJobItem"("jobId");
CREATE INDEX "StorageMigrationJobItem_shareId_idx" ON "StorageMigrationJobItem"("shareId");
CREATE INDEX "StorageMigrationJobItem_status_idx" ON "StorageMigrationJobItem"("status");
