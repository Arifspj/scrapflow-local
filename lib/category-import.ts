import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { collectMarketCategory, type MarketImportReport } from '@/lib/market-collect'
import { marketCategoryUrl, type MarketCompanyRow } from '@/lib/scrapers/screener-market'
import { screenerFetchText } from '@/lib/scrapers/screener-auth'
import { buildViewSummary } from '@/lib/view-summary'

/**
 * Persist a screener.in industry listing to the database.
 *
 * Categories are modelled with the existing tables (no migration needed):
 *  - one disabled `Scanner` row (category "Industry", name = canonical source
 *    URL) represents the category and stores the import report in `description`;
 *  - one `ScannerStock` row per company persists the category membership;
 *  - the `Stock` row is upserted and, when the company has no snapshot yet, a
 *    lightweight listing snapshot is created. A company that was already opened
 *    in detail keeps its full snapshot (classification is never overwritten).
 */

export type PersistResult = {
  inserted: number
  updated: number
  memberships: number
  snapshotSkipped: number
}

export type CategoryImportResult = {
  report: MarketImportReport
  persisted: PersistResult
}

function decimal(value: number | null): Prisma.Decimal | null {
  return value == null || !Number.isFinite(value) ? null : new Prisma.Decimal(value)
}

async function upsertCategoryScanner(sourceUrl: string, title: string | null, report: MarketImportReport) {
  const description = JSON.stringify({
    kind: 'screener-market',
    title,
    sourceUrl,
    status: report.status,
    breadcrumb: report.breadcrumb,
    pagesDiscovered: report.pagesDiscovered,
    pagesFetched: report.pagesFetched,
    pagesFailed: report.pagesFailed,
    totalResults: report.totalResults,
    uniqueCompanies: report.uniqueCompanies,
    finishedAt: report.finishedAt,
  })
  const existing = await prisma.scanner.findFirst({ where: { category: 'Industry', name: sourceUrl }, select: { id: true } })
  if (existing) {
    return prisma.scanner.update({ where: { id: existing.id }, data: { description, enabled: false }, select: { id: true } })
  }
  return prisma.scanner.create({
    data: { name: sourceUrl, category: 'Industry', description, enabled: false },
    select: { id: true },
  })
}

async function persistRows(scannerId: string, rows: MarketCompanyRow[]): Promise<PersistResult> {
  const result: PersistResult = { inserted: 0, updated: 0, memberships: 0, snapshotSkipped: 0 }
  for (const row of rows) {
    const existing = await prisma.stock.findUnique({ where: { symbol: row.symbol }, select: { id: true } })
    const stock = await prisma.stock.upsert({
      where: { symbol: row.symbol },
      create: { symbol: row.symbol, companyName: row.companyName },
      update: row.companyName ? { companyName: row.companyName } : {},
      select: { id: true },
    })
    if (existing) result.updated += 1
    else result.inserted += 1

    const snapshot = await prisma.stockFundamentalSnapshot.findFirst({ where: { stockId: stock.id }, select: { id: true } })
    if (snapshot) {
      result.snapshotSkipped += 1
    } else {
      const capturedAt = new Date()
      const data = {
        stockId: stock.id,
        capturedAt,
        marketCap: decimal(row.metrics.marketCap),
        peRatio: decimal(row.metrics.pe),
        dividendYield: decimal(row.metrics.dividendYield),
        roce: decimal(row.metrics.roce),
        sourceUrl: row.sourceUrl,
        parserVersion: 'screener-market@1.0.0',
        rawData: {
          source: 'screener-market',
          sourceUrl: row.sourceUrl,
          metrics: { ...row.metrics },
        } as Prisma.InputJsonValue,
      }
      await prisma.stockFundamentalSnapshot.create({
        data: { ...data, viewSummary: buildViewSummary(row, data) },
      })
    }

    await prisma.scannerStock.upsert({
      where: { scannerId_stockId: { scannerId, stockId: stock.id } },
      create: { scannerId, stockId: stock.id },
      update: { lastSeenAt: new Date() },
    })
    result.memberships += 1
  }
  return result
}

/**
 * Import (or re-import) a category. On a partial/failed run the previously
 * saved memberships and snapshots are left untouched — nothing is deleted — so a
 * retry can fill the missing pages.
 */
export async function importMarketCategory(
  segments: readonly string[],
  options?: { maxPages?: number },
): Promise<CategoryImportResult> {
  const { report, rows } = await collectMarketCategory(segments, (url) => screenerFetchText(url), {
    maxPages: options?.maxPages,
    delayMs: 300,
  })
  const sourceUrl = marketCategoryUrl(segments)
  const scanner = await upsertCategoryScanner(sourceUrl, report.title, report)
  const persisted = await persistRows(scanner.id, rows)
  return { report, persisted }
}
