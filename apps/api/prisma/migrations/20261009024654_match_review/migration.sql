-- CreateTable
CREATE TABLE "MatchReview" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "score" REAL NOT NULL,
    "reasons" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "MatchReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchReview_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MatchReview_status_idx" ON "MatchReview"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MatchReview_productId_candidateId_key" ON "MatchReview"("productId", "candidateId");
