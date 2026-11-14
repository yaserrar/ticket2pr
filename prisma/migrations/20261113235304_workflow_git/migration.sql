-- AlterTable
ALTER TABLE "cards" ADD COLUMN "branchName" TEXT;
ALTER TABLE "cards" ADD COLUMN "lastSessionId" TEXT;
ALTER TABLE "cards" ADD COLUMN "prUrl" TEXT;
ALTER TABLE "cards" ADD COLUMN "worktreePath" TEXT;

-- CreateTable
CREATE TABLE "runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'INITIAL',
    "runner" TEXT NOT NULL DEFAULT 'fake',
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "sessionId" TEXT,
    "summary" TEXT,
    "error" TEXT,
    "costUsd" REAL,
    "numTurns" INTEGER,
    "durationMs" INTEGER,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "runs_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "run_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "run_events_runId_fkey" FOREIGN KEY ("runId") REFERENCES "runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "trelloBoardId" TEXT NOT NULL,
    "trelloBoardName" TEXT NOT NULL,
    "trelloBoardUrl" TEXT,
    "trelloSourceListId" TEXT NOT NULL,
    "trelloSourceListName" TEXT NOT NULL,
    "repoPath" TEXT,
    "baseBranch" TEXT NOT NULL DEFAULT 'main',
    "setupCommand" TEXT,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_projects" ("createdAt", "id", "lastSyncedAt", "name", "trelloBoardId", "trelloBoardName", "trelloBoardUrl", "trelloSourceListId", "trelloSourceListName", "updatedAt") SELECT "createdAt", "id", "lastSyncedAt", "name", "trelloBoardId", "trelloBoardName", "trelloBoardUrl", "trelloSourceListId", "trelloSourceListName", "updatedAt" FROM "projects";
DROP TABLE "projects";
ALTER TABLE "new_projects" RENAME TO "projects";
CREATE TABLE "new_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "trelloApiKey" TEXT,
    "trelloToken" TEXT,
    "trelloUsername" TEXT,
    "githubToken" TEXT,
    "pollIntervalSec" INTEGER NOT NULL DEFAULT 120,
    "maxParallelRuns" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_settings" ("id", "pollIntervalSec", "trelloApiKey", "trelloToken", "trelloUsername", "updatedAt") SELECT "id", "pollIntervalSec", "trelloApiKey", "trelloToken", "trelloUsername", "updatedAt" FROM "settings";
DROP TABLE "settings";
ALTER TABLE "new_settings" RENAME TO "settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "runs_status_createdAt_idx" ON "runs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "runs_cardId_createdAt_idx" ON "runs"("cardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "run_events_runId_seq_key" ON "run_events"("runId", "seq");
