-- AlterTable
ALTER TABLE "cards" ADD COLUMN "checksJson" TEXT;
ALTER TABLE "cards" ADD COLUMN "checksStatus" TEXT;

-- AlterTable
ALTER TABLE "runs" ADD COLUMN "cacheReadTokens" INTEGER;
ALTER TABLE "runs" ADD COLUMN "cacheWriteTokens" INTEGER;
ALTER TABLE "runs" ADD COLUMN "checksMs" INTEGER;
ALTER TABLE "runs" ADD COLUMN "checksStatus" TEXT;
ALTER TABLE "runs" ADD COLUMN "fixRound" INTEGER;
ALTER TABLE "runs" ADD COLUMN "inputTokens" INTEGER;
ALTER TABLE "runs" ADD COLUMN "model" TEXT;
ALTER TABLE "runs" ADD COLUMN "outputTokens" INTEGER;
ALTER TABLE "runs" ADD COLUMN "sessionUsageJson" TEXT;

-- CreateTable
CREATE TABLE "run_checks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "exitCode" INTEGER,
    "durationMs" INTEGER,
    "output" TEXT,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    CONSTRAINT "run_checks_runId_fkey" FOREIGN KEY ("runId") REFERENCES "runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "extraInstructions" TEXT,
    "workMode" TEXT NOT NULL DEFAULT 'BRANCH_PER_CARD',
    "sharedBranch" TEXT,
    "sharedInRepo" BOOLEAN NOT NULL DEFAULT true,
    "trelloInProgressListId" TEXT,
    "trelloReviewListId" TEXT,
    "trelloDoneListId" TEXT,
    "trelloNeedsInfoListId" TEXT,
    "scopeCheck" BOOLEAN NOT NULL DEFAULT false,
    "scopeRules" TEXT,
    "trelloOutOfScopeListId" TEXT,
    "riskPaths" TEXT,
    "previewEnabled" BOOLEAN NOT NULL DEFAULT false,
    "previewCommand" TEXT,
    "previewUrl" TEXT,
    "checksEnabled" BOOLEAN NOT NULL DEFAULT false,
    "checksJson" TEXT,
    "checksAutoFix" BOOLEAN NOT NULL DEFAULT true,
    "checksMaxFixRounds" INTEGER NOT NULL DEFAULT 2,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_projects" ("baseBranch", "createdAt", "extraInstructions", "id", "lastSyncedAt", "name", "previewCommand", "previewEnabled", "previewUrl", "repoPath", "riskPaths", "scopeCheck", "scopeRules", "setupCommand", "sharedBranch", "sharedInRepo", "trelloBoardId", "trelloBoardName", "trelloBoardUrl", "trelloDoneListId", "trelloInProgressListId", "trelloNeedsInfoListId", "trelloOutOfScopeListId", "trelloReviewListId", "trelloSourceListId", "trelloSourceListName", "updatedAt", "workMode") SELECT "baseBranch", "createdAt", "extraInstructions", "id", "lastSyncedAt", "name", "previewCommand", "previewEnabled", "previewUrl", "repoPath", "riskPaths", "scopeCheck", "scopeRules", "setupCommand", "sharedBranch", "sharedInRepo", "trelloBoardId", "trelloBoardName", "trelloBoardUrl", "trelloDoneListId", "trelloInProgressListId", "trelloNeedsInfoListId", "trelloOutOfScopeListId", "trelloReviewListId", "trelloSourceListId", "trelloSourceListName", "updatedAt", "workMode" FROM "projects";
DROP TABLE "projects";
ALTER TABLE "new_projects" RENAME TO "projects";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "run_checks_runId_position_idx" ON "run_checks"("runId", "position");
