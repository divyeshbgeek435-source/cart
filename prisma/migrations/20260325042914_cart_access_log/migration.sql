-- CreateTable
CREATE TABLE "CartAccessLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "itemCount" INTEGER,
    "subtotalCents" INTEGER,
    "currency" TEXT,
    "pathname" TEXT,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CartAccessLog_shop_createdAt_idx" ON "CartAccessLog"("shop", "createdAt");
