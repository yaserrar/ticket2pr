-- AlterTable
ALTER TABLE "projects" ADD COLUMN "trelloDoneListId" TEXT;
ALTER TABLE "projects" ADD COLUMN "trelloInProgressListId" TEXT;
ALTER TABLE "projects" ADD COLUMN "trelloNeedsInfoListId" TEXT;
ALTER TABLE "projects" ADD COLUMN "trelloReviewListId" TEXT;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN "claudePausedUntil" DATETIME;
ALTER TABLE "settings" ADD COLUMN "claudeUsageJson" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_cards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "trelloCardId" TEXT NOT NULL,
    "trelloShortLink" TEXT NOT NULL,
    "trelloUrl" TEXT NOT NULL,
    "trelloListId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "labelsJson" TEXT NOT NULL DEFAULT '[]',
    "checklistsJson" TEXT NOT NULL DEFAULT '[]',
    "trelloLastActivity" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "position" REAL NOT NULL DEFAULT 0,
    "changedOnTrello" BOOLEAN NOT NULL DEFAULT false,
    "removedFromTrello" BOOLEAN NOT NULL DEFAULT false,
    "branchName" TEXT,
    "worktreePath" TEXT,
    "lastSessionId" TEXT,
    "prUrl" TEXT,
    "startSha" TEXT,
    "trelloError" TEXT,
    "postedCommentIds" TEXT NOT NULL DEFAULT '[]',
    "sentContentJson" TEXT,
    "sentContextAt" DATETIME,
    "clientQuestions" TEXT,
    "clientUpdate" TEXT,
    "clientUpdatePostedAt" DATETIME,
    "waitingSince" DATETIME,
    "clientRepliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "cards_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_cards" ("branchName", "changedOnTrello", "checklistsJson", "createdAt", "description", "id", "labelsJson", "lastSessionId", "position", "prUrl", "projectId", "removedFromTrello", "startSha", "status", "title", "trelloCardId", "trelloLastActivity", "trelloListId", "trelloShortLink", "trelloUrl", "updatedAt", "worktreePath") SELECT "branchName", "changedOnTrello", "checklistsJson", "createdAt", "description", "id", "labelsJson", "lastSessionId", "position", "prUrl", "projectId", "removedFromTrello", "startSha", "status", "title", "trelloCardId", "trelloLastActivity", "trelloListId", "trelloShortLink", "trelloUrl", "updatedAt", "worktreePath" FROM "cards";
DROP TABLE "cards";
ALTER TABLE "new_cards" RENAME TO "cards";
CREATE INDEX "cards_projectId_status_idx" ON "cards"("projectId", "status");
CREATE UNIQUE INDEX "cards_projectId_trelloCardId_key" ON "cards"("projectId", "trelloCardId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
