-- AlterTable
ALTER TABLE "cards" ADD COLUMN "previewPagesJson" TEXT;
ALTER TABLE "cards" ADD COLUMN "riskJson" TEXT;
ALTER TABLE "cards" ADD COLUMN "riskLevel" TEXT;
ALTER TABLE "cards" ADD COLUMN "riskReviewedAt" DATETIME;
ALTER TABLE "cards" ADD COLUMN "screenshotError" TEXT;
ALTER TABLE "cards" ADD COLUMN "screenshotsJson" TEXT;

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
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_projects" ("baseBranch", "createdAt", "extraInstructions", "id", "lastSyncedAt", "name", "repoPath", "scopeCheck", "scopeRules", "setupCommand", "sharedBranch", "sharedInRepo", "trelloBoardId", "trelloBoardName", "trelloBoardUrl", "trelloDoneListId", "trelloInProgressListId", "trelloNeedsInfoListId", "trelloOutOfScopeListId", "trelloReviewListId", "trelloSourceListId", "trelloSourceListName", "updatedAt", "workMode") SELECT "baseBranch", "createdAt", "extraInstructions", "id", "lastSyncedAt", "name", "repoPath", "scopeCheck", "scopeRules", "setupCommand", "sharedBranch", "sharedInRepo", "trelloBoardId", "trelloBoardName", "trelloBoardUrl", "trelloDoneListId", "trelloInProgressListId", "trelloNeedsInfoListId", "trelloOutOfScopeListId", "trelloReviewListId", "trelloSourceListId", "trelloSourceListName", "updatedAt", "workMode" FROM "projects";
DROP TABLE "projects";
ALTER TABLE "new_projects" RENAME TO "projects";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
