-- AlterTable
ALTER TABLE "projects" ADD COLUMN "extraInstructions" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "trelloApiKey" TEXT,
    "trelloToken" TEXT,
    "trelloUsername" TEXT,
    "githubToken" TEXT,
    "pollIntervalSec" INTEGER NOT NULL DEFAULT 120,
    "maxParallelRuns" INTEGER NOT NULL DEFAULT 1,
    "claudeModel" TEXT,
    "maxTurns" INTEGER NOT NULL DEFAULT 60,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_settings" ("githubToken", "id", "maxParallelRuns", "pollIntervalSec", "trelloApiKey", "trelloToken", "trelloUsername", "updatedAt") SELECT "githubToken", "id", "maxParallelRuns", "pollIntervalSec", "trelloApiKey", "trelloToken", "trelloUsername", "updatedAt" FROM "settings";
DROP TABLE "settings";
ALTER TABLE "new_settings" RENAME TO "settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
