-- CreateTable
CREATE TABLE "StockMetricHistory" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" INTEGER,
    "coveragePct" INTEGER,
    "opportunityScore" INTEGER,
    "opportunityCoverage" INTEGER,
    "roce" DECIMAL(12,4),
    "roe" DECIMAL(12,4),
    "pe" DECIMAL(12,4),
    "salesYoy" DECIMAL(12,4),
    "profitYoy" DECIMAL(12,4),
    "cfoPat" DECIMAL(12,4),
    "debtToEquity" DECIMAL(12,4),
    "intrinsic" DECIMAL(20,2),
    "marginOfSafety" DECIMAL(12,4),

    CONSTRAINT "StockMetricHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockMetricHistory_stockId_capturedAt_idx" ON "StockMetricHistory"("stockId", "capturedAt");

-- CreateIndex
CREATE INDEX "StockMetricHistory_capturedAt_idx" ON "StockMetricHistory"("capturedAt");

-- AddForeignKey
ALTER TABLE "StockMetricHistory" ADD CONSTRAINT "StockMetricHistory_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
