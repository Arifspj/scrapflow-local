import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { cleanSymbol } from '@/lib/scrapers/screener'
import { isScreenerDetail } from '@/lib/stock-detail'
import { rateLimited, scrapeScreenerCompany, scrapeScreenerSymbol, type ScrapedCompany } from '@/lib/scrapers/resolve'

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

export type RefreshResult = {
  ok: boolean
  /** New snapshot time, only set when the fresh scrape was persisted. */
  updatedAt: Date | null
  /** Existing snapshot time kept after a failed refresh, when available. */
  staleAt: Date | null
  message: string
}

/**
 * On-demand refresh for the header button: re-fetch the source, validate the
 * symbol, persist the new snapshot, then revalidate the affected routes.
 *
 * Reliability guards requested for the public endpoint:
 *  - only symbols already saved in the database can be refreshed,
 *  - concurrent clicks for one symbol share a single upstream fetch (job lock),
 *  - a per-symbol rate limit prevents unlimited scraping,
 *  - a failed fetch never deletes the previously saved valid snapshot and it is
 *    reported as a stale result rather than a success.
 */
const refreshLocks = new Map<string, Promise<RefreshResult>>()

function staleFrom(stock: StockWithDetail): Date | null {
  return stock.fundamentals[0]?.capturedAt ?? null
}

async function runRefresh(clean: string, existing: StockWithDetail): Promise<RefreshResult> {
  try {
    const company: ScrapedCompany | null = await scrapeScreenerSymbol(clean)
    if (!company) {
      return { ok: false, updatedAt: null, staleAt: staleFrom(existing), message: 'Symbol was not found on the source; the existing saved data was kept.' }
    }
    await upsertStockFromScrape(company)
    const reloaded = await loadStockWithDetail(company.symbol)
    const updatedAt = reloaded?.fundamentals[0]?.capturedAt ?? new Date()
    revalidatePath(`/stocks/${encodeURIComponent(company.symbol)}`, 'page')
    revalidatePath('/', 'page')
    return { ok: true, updatedAt, staleAt: null, message: 'Fresh data fetched, validated and saved.' }
  } catch (error) {
    console.error(`[stocks] refresh failed for ${clean}`, error)
    return {
      ok: false,
      updatedAt: null,
      staleAt: staleFrom(existing),
      message: error instanceof Error ? `Refresh failed (${error.message}); existing data was kept.` : 'Refresh failed; existing data was kept.',
    }
  }
}

export function refreshStockData(rawSymbol: string): Promise<RefreshResult> {
  const clean = cleanSymbol(rawSymbol)
  if (!clean) return Promise.resolve({ ok: false, updatedAt: null, staleAt: null, message: 'Invalid symbol.' })

  const pending = refreshLocks.get(clean)
  if (pending) return pending

  const task = (async (): Promise<RefreshResult> => {
    const existing = await loadStockWithDetail(clean)
    if (!existing) {
      return { ok: false, updatedAt: null, staleAt: null, message: 'No saved record for this symbol yet; open the stock page once to import it.' }
    }
    if (rateLimited(`refresh:${clean}`, 3, 60_000)) {
      return { ok: false, updatedAt: null, staleAt: staleFrom(existing), message: 'Too many refresh requests for this symbol in the last minute; please wait and try again.' }
    }
    return runRefresh(clean, existing)
  })().finally(() => refreshLocks.delete(clean))

  refreshLocks.set(clean, task)
  return task
}
