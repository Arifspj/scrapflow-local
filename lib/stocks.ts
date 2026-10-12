import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { cleanSymbol } from '@/lib/scrapers/screener'
import { isScreenerDetail } from '@/lib/stock-detail'
import { scrapeScreenerCompany, scrapeScreenerSymbol, type ScrapedCompany } from '@/lib/scrapers/resolve'

export type StockSearchHit = {
  symbol: string
  companyName: string | null
}

function toDecimal(value: number | undefined): Prisma.Decimal | null {
  return value == null || !Number.isFinite(value) ? null : new Prisma.Decimal(value)
}

/** Look up saved stocks by exact symbol or company-name substring. */
export async function findStocksByQuery(query: string, limit = 10): Promise<StockSearchHit[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  return prisma.stock.findMany({
    where: {
      OR: [
        { symbol: trimmed.toUpperCase() },
        { companyName: { contains: trimmed, mode: 'insensitive' } },
      ],
    },
    select: { symbol: true, companyName: true },
    orderBy: { symbol: 'asc' },
    take: limit,
  })
}

/**
 * Persist a scraped screener company: upsert the Stock and replace its latest
 * fundamental snapshot with the freshly scraped values.
 */
export async function upsertStockFromScrape(company: ScrapedCompany): Promise<StockSearchHit> {
  const stock = await prisma.stock.upsert({
    where: { symbol: company.symbol },
    create: { symbol: company.symbol, companyName: company.companyName },
    update: company.companyName ? { companyName: company.companyName } : {},
    select: { id: true, symbol: true, companyName: true },
  })

  const f = company.fundamentals ?? {}
  await prisma.stockFundamentalSnapshot.deleteMany({ where: { stockId: stock.id } })
  await prisma.stockFundamentalSnapshot.create({
    data: {
      stockId: stock.id,
      marketCap: toDecimal(f.marketCap),
      peRatio: toDecimal(f.peRatio),
      bookValue: toDecimal(f.bookValue),
      dividendYield: toDecimal(f.dividendYield),
      roce: toDecimal(f.roce),
      roe: toDecimal(f.roe),
      debtToEquity: toDecimal(f.debtToEquity),
      revenue: toDecimal(f.revenue),
      netProfit: toDecimal(f.netProfit),
      rawData: company.detail
        ? (company.detail as unknown as Prisma.InputJsonValue)
        : Object.keys(f).length
          ? (f as Prisma.InputJsonValue)
          : undefined,
      sourceUrl: company.sourceUrl,
      parserVersion: company.parserVersion,
    },
  })

  return { symbol: stock.symbol, companyName: stock.companyName }
}

const stockDetailInclude = {
  fundamentals: { orderBy: { capturedAt: 'desc' as const }, take: 1 },
  scanners: { include: { scanner: true } },
} satisfies Prisma.StockInclude

export type StockWithDetail = Prisma.StockGetPayload<{ include: typeof stockDetailInclude }>

function loadStockWithDetail(symbol: string): Promise<StockWithDetail | null> {
  return prisma.stock.findUnique({ where: { symbol }, include: stockDetailInclude })
}

/**
 * Load a saved stock and its latest snapshot. When the symbol is not saved yet
 * (e.g. a peer-comparison link to a company we have never scraped), scrape it
 * on demand, persist it, and return it. When a saved snapshot predates full
 * detail parsing (rawData is not a ScreenerDetail), re-scrape the company and
 * return the refreshed row so the dashboard can render.
 *
 * Returns null only when the symbol is malformed or does not exist on the
 * source — those are the cases that should surface as a 404. Concurrent
 * requests for the same symbol share one in-flight scrape (per-instance job
 * lock) so a page render never fans out into duplicate upstream calls.
 */
const inflightImports = new Map<string, Promise<StockWithDetail | null>>()

async function refreshStock(symbol: string, stock: StockWithDetail): Promise<StockWithDetail> {
  try {
    const company = await scrapeScreenerCompany(symbol)
    if (!company) return stock
    await upsertStockFromScrape(company)
    return (await loadStockWithDetail(symbol)) ?? stock
  } catch (error) {
    console.error(`[stocks] failed to refresh detail for ${symbol}`, error)
    return stock
  }
}

function importStock(symbol: string): Promise<StockWithDetail | null> {
  const pending = inflightImports.get(symbol)
  if (pending) return pending

  const task = (async () => {
    try {
      const company = await scrapeScreenerSymbol(symbol)
      if (!company) return null
      await upsertStockFromScrape(company)
      return (await loadStockWithDetail(company.symbol)) ?? (await loadStockWithDetail(symbol))
    } catch (error) {
      console.error(`[stocks] failed to import ${symbol}`, error)
      return null
    } finally {
      inflightImports.delete(symbol)
    }
  })()

  inflightImports.set(symbol, task)
  return task
}

export async function ensureStockDetail(rawSymbol: string): Promise<StockWithDetail | null> {
  const symbol = cleanSymbol(rawSymbol)
  if (!symbol) return null

  const stock = await loadStockWithDetail(symbol)
  if (!stock) return importStock(symbol)

  const rawData = stock.fundamentals[0]?.rawData
  // Also refresh once for screenshots that predate the industry parser (their
  // rawData has no `industry` array yet) so saved companies genuinely gain the
  // hierarchy instead of rendering "Not available" forever.
  if (isScreenerDetail(rawData) && Array.isArray(rawData.industry) && rawData.peers != null) return stock
  return refreshStock(symbol, stock)
}
