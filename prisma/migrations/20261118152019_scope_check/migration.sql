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
    "scopeStatus" TEXT,
    "scopeKind" TEXT,
    "scopeSize" TEXT,
    "scopeReason" TEXT,
    "scopeClientNote" TEXT,
    "scopeError" TEXT,
    "scopeContentKey" TEXT,
    "scopeCheckedAt" DATETIME,
    "scopeApproved" BOOLEAN NOT NULL DEFAULT false,
    "startWhenInScope" BOOLEAN NOT NULL DEFAULT false,
    "scopeNotePostedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "cards_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_cards" ("branchName", "changedOnTrello", "checklistsJson", "clientQuestions", "clientRepliedAt", "clientUpdate", "clientUpdatePostedAt", "createdAt", "description", "id", "labelsJson", "lastSessionId", "position", "postedCommentIds", "prUrl", "projectId", "removedFromTrello", "sentContentJson", "sentContextAt", "startSha", "status", "title", "trelloCardId", "trelloError", "trelloLastActivity", "trelloListId", "trelloShortLink", "trelloUrl", "updatedAt", "waitingSince", "worktreePath") SELECT "branchName", "changedOnTrello", "checklistsJson", "clientQuestions", "clientRepliedAt", "clientUpdate", "clientUpdatePostedAt", "createdAt", "description", "id", "labelsJson", "lastSessionId", "position", "postedCommentIds", "prUrl", "projectId", "removedFromTrello", "sentContentJson", "sentContextAt", "startSha", "status", "title", "trelloCardId", "trelloError", "trelloLastActivity", "trelloListId", "trelloShortLink", "trelloUrl", "updatedAt", "waitingSince", "worktreePath" FROM "cards";
DROP TABLE "cards";
ALTER TABLE "new_cards" RENAME TO "cards";
CREATE INDEX "cards_projectId_status_idx" ON "cards"("projectId", "status");
CREATE UNIQUE INDEX "cards_projectId_trelloCardId_key" ON "cards"("projectId", "trelloCardId");
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
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_projects" ("baseBranch", "createdAt", "extraInstructions", "id", "lastSyncedAt", "name", "repoPath", "setupCommand", "sharedBranch", "sharedInRepo", "trelloBoardId", "trelloBoardName", "trelloBoardUrl", "trelloDoneListId", "trelloInProgressListId", "trelloNeedsInfoListId", "trelloReviewListId", "trelloSourceListId", "trelloSourceListName", "updatedAt", "workMode") SELECT "baseBranch", "createdAt", "extraInstructions", "id", "lastSyncedAt", "name", "repoPath", "setupCommand", "sharedBranch", "sharedInRepo", "trelloBoardId", "trelloBoardName", "trelloBoardUrl", "trelloDoneListId", "trelloInProgressListId", "trelloNeedsInfoListId", "trelloReviewListId", "trelloSourceListId", "trelloSourceListName", "updatedAt", "workMode" FROM "projects";
DROP TABLE "projects";
ALTER TABLE "new_projects" RENAME TO "projects";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
