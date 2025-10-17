-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "duration" REAL,
    "width" INTEGER,
    "height" INTEGER,
    "codec" TEXT,
    "bitrate" INTEGER,
    "fps" REAL,
    "audioCodec" TEXT,
    "fileSize" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "media_filePath_key" ON "media"("filePath");

-- CreateIndex
CREATE INDEX "media_name_idx" ON "media"("name");

-- CreateIndex
CREATE INDEX "media_createdAt_idx" ON "media"("createdAt");
