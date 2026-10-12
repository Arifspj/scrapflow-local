-- CreateEnum
CREATE TYPE "ScannerSourceType" AS ENUM ('CHARTINK_SCAN', 'SCREENER_SCREEN', 'SCREENER_COMPANY');

-- CreateEnum
CREATE TYPE "PipelineMode" AS ENUM ('LIST_ONLY', 'LIST_AND_FUNDAMENTALS');

-- CreateEnum
CREATE TYPE "FetchRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "Scanner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scanner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScannerSource" (
    "id" TEXT NOT NULL,
    "scannerId" TEXT NOT NULL,
    "type" "ScannerSourceType" NOT NULL,
    "url" TEXT NOT NULL,
    "pipelineMode" "PipelineMode" NOT NULL DEFAULT 'LIST_ONLY',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "fetchInterval" INTEGER NOT NULL DEFAULT 3600,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScannerSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stock" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "companyName" TEXT,
    "isin" TEXT,
    "exchange" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScannerStock" (
    "id" TEXT NOT NULL,
    "scannerId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "sourceId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScannerStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FetchRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" "FetchRunStatus" NOT NULL DEFAULT 'PENDING',
    "itemsFound" INTEGER NOT NULL DEFAULT 0,
    "itemsCreated" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "diagnostics" JSONB,
    "parserVersion" TEXT,
    "sourceUrl" TEXT NOT NULL,

    CONSTRAINT "FetchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockFundamentalSnapshot" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketCap" DECIMAL(20,2),
    "peRatio" DECIMAL(12,4),
    "bookValue" DECIMAL(20,4),
    "dividendYield" DECIMAL(12,4),
    "roce" DECIMAL(12,4),
    "roe" DECIMAL(12,4),
    "debtToEquity" DECIMAL(12,4),
    "revenue" DECIMAL(20,2),
    "netProfit" DECIMAL(20,2),
    "rawData" JSONB,
    "sourceUrl" TEXT,
    "parserVersion" TEXT,

    CONSTRAINT "StockFundamentalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Scanner_enabled_idx" ON "Scanner"("enabled");

-- CreateIndex
CREATE INDEX "Scanner_category_idx" ON "Scanner"("category");

-- CreateIndex
CREATE INDEX "ScannerSource_enabled_fetchInterval_idx" ON "ScannerSource"("enabled", "fetchInterval");

-- CreateIndex
CREATE INDEX "ScannerSource_scannerId_idx" ON "ScannerSource"("scannerId");

-- CreateIndex
CREATE UNIQUE INDEX "ScannerSource_scannerId_type_url_key" ON "ScannerSource"("scannerId", "type", "url");

-- CreateIndex
CREATE UNIQUE INDEX "Stock_symbol_key" ON "Stock"("symbol");

-- CreateIndex
CREATE INDEX "Stock_companyName_idx" ON "Stock"("companyName");

-- CreateIndex
CREATE INDEX "ScannerStock_sourceId_idx" ON "ScannerStock"("sourceId");

-- CreateIndex
CREATE INDEX "ScannerStock_scannerId_lastSeenAt_idx" ON "ScannerStock"("scannerId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScannerStock_scannerId_stockId_key" ON "ScannerStock"("scannerId", "stockId");

-- CreateIndex
CREATE INDEX "FetchRun_sourceId_startedAt_idx" ON "FetchRun"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "FetchRun_status_startedAt_idx" ON "FetchRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "StockFundamentalSnapshot_stockId_capturedAt_idx" ON "StockFundamentalSnapshot"("stockId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockFundamentalSnapshot_stockId_capturedAt_key" ON "StockFundamentalSnapshot"("stockId", "capturedAt");

-- AddForeignKey
ALTER TABLE "ScannerSource" ADD CONSTRAINT "ScannerSource_scannerId_fkey" FOREIGN KEY ("scannerId") REFERENCES "Scanner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScannerStock" ADD CONSTRAINT "ScannerStock_scannerId_fkey" FOREIGN KEY ("scannerId") REFERENCES "Scanner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScannerStock" ADD CONSTRAINT "ScannerStock_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScannerStock" ADD CONSTRAINT "ScannerStock_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ScannerSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FetchRun" ADD CONSTRAINT "FetchRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ScannerSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockFundamentalSnapshot" ADD CONSTRAINT "StockFundamentalSnapshot_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
