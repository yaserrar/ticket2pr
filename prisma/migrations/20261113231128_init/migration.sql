-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "trelloApiKey" TEXT,
    "trelloToken" TEXT,
    "trelloUsername" TEXT,
    "pollIntervalSec" INTEGER NOT NULL DEFAULT 120,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "trelloBoardId" TEXT NOT NULL,
    "trelloBoardName" TEXT NOT NULL,
    "trelloBoardUrl" TEXT,
    "trelloSourceListId" TEXT NOT NULL,
    "trelloSourceListName" TEXT NOT NULL,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "cards" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "cards_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "added" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "removed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    CONSTRAINT "sync_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "cards_projectId_status_idx" ON "cards"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cards_projectId_trelloCardId_key" ON "cards"("projectId", "trelloCardId");

-- CreateIndex
CREATE INDEX "sync_logs_projectId_startedAt_idx" ON "sync_logs"("projectId", "startedAt");
