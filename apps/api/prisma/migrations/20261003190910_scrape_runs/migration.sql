-- DropIndex
DROP INDEX "Offer_shopId_idx";

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shopId" INTEGER NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'running',
    "productsFound" INTEGER NOT NULL DEFAULT 0,
    "productsSaved" INTEGER NOT NULL DEFAULT 0,
    "productsSkipped" INTEGER NOT NULL DEFAULT 0,
    "errorsCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    CONSTRAINT "ScrapeRun_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScrapeError" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "url" TEXT,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScrapeError_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScrapeRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScrapeRun_shopId_startedAt_idx" ON "ScrapeRun"("shopId", "startedAt");

-- CreateIndex
CREATE INDEX "ScrapeError_runId_idx" ON "ScrapeError"("runId");

-- CreateIndex
CREATE INDEX "Offer_shopId_externalId_idx" ON "Offer"("shopId", "externalId");
