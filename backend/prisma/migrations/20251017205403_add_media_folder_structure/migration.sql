-- CreateTable
CREATE TABLE "media_folders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "media_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "media_folders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_media" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "folderId" TEXT,
    "duration" REAL,
    "width" INTEGER,
    "height" INTEGER,
    "codec" TEXT,
    "bitrate" INTEGER,
    "fps" REAL,
    "audioCodec" TEXT,
    "fileSize" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "media_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "media_folders" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_media" ("audioCodec", "bitrate", "codec", "createdAt", "duration", "filePath", "fileSize", "fps", "height", "id", "name", "updatedAt", "width") SELECT "audioCodec", "bitrate", "codec", "createdAt", "duration", "filePath", "fileSize", "fps", "height", "id", "name", "updatedAt", "width" FROM "media";
DROP TABLE "media";
ALTER TABLE "new_media" RENAME TO "media";
CREATE UNIQUE INDEX "media_filePath_key" ON "media"("filePath");
CREATE INDEX "media_name_idx" ON "media"("name");
CREATE INDEX "media_folderId_idx" ON "media"("folderId");
CREATE INDEX "media_createdAt_idx" ON "media"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "media_folders_path_key" ON "media_folders"("path");

-- CreateIndex
CREATE INDEX "media_folders_parentId_idx" ON "media_folders"("parentId");

-- CreateIndex
CREATE INDEX "media_folders_path_idx" ON "media_folders"("path");
