-- AlterTable
ALTER TABLE "cards" ADD COLUMN "startSha" TEXT;

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
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_projects" ("baseBranch", "createdAt", "extraInstructions", "id", "lastSyncedAt", "name", "repoPath", "setupCommand", "trelloBoardId", "trelloBoardName", "trelloBoardUrl", "trelloSourceListId", "trelloSourceListName", "updatedAt") SELECT "baseBranch", "createdAt", "extraInstructions", "id", "lastSyncedAt", "name", "repoPath", "setupCommand", "trelloBoardId", "trelloBoardName", "trelloBoardUrl", "trelloSourceListId", "trelloSourceListName", "updatedAt" FROM "projects";
DROP TABLE "projects";
ALTER TABLE "new_projects" RENAME TO "projects";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
