-- Add a precomputed, JSON-safe list view so list readers can skip the large rawData blob.
ALTER TABLE "StockFundamentalSnapshot" ADD COLUMN "viewSummary" JSONB;
