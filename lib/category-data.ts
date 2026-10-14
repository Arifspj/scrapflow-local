import { prisma } from '@/lib/prisma'
import { buildStockView, isScreenerDetail, type StockView } from '@/lib/stock-detail'
import { marketCategoryUrl } from '@/lib/scrapers/screener-market'
import {
  industryTrail,
  isInCategory,
  type CategoryCrumb,
  type CategoryData,
  type CategoryImportMeta,
  type CategoryStockRow,
  type MarketLevel,
} from '@/lib/category'

/**
 * Derive a market/category page from the companies persisted in the database.
 *
 * Two sources are combined:
 *  1. Companies whose saved screener.in `industry` hierarchy links to exactly
 *     this path (works after any full detail import).
 *  2. Companies recorded as members of this category's import (ScannerStock),
 *     which covers listing-only imports where the full hierarchy is unknown.
 *
 * We never invent taxonomy: a company is only listed when one of those two
 * sources explicitly places it here.
 */

function toRowFromView(view: StockView): CategoryStockRow {
  return {
    symbol: view.symbol,
    companyName: view.companyName,
    price: view.price,
    marketCap: view.marketCap,
    pe: view.pe,
    roce: view.roce,
    roe: view.roe,
    debtToEquity: view.debtToEquity,
    salesYoy: view.salesYoy,
    operatingProfitYoy: view.operatingProfitYoy,
    profitYoy: view.profitYoy,
    score: view.score,
    scoreCoverage: view.scoreBreakdown?.coveragePct ?? 0,
    badge: view.quality.primary.label,
    badgeTone: view.quality.primary.tone,
    risks: view.quality.risks.map((risk) => risk.label),
  }
}

function parseImportMeta(description: string | null): CategoryImportMeta | null {
  if (!description) return null
  try {
    const parsed = JSON.parse(description) as Record<string, unknown>
    if (parsed.kind !== 'screener-market') return null
    return {
      status: typeof parsed.status === 'string' ? parsed.status : 'unknown',
      totalResults: typeof parsed.totalResults === 'number' ? parsed.totalResults : null,
      uniqueCompanies: typeof parsed.uniqueCompanies === 'number' ? parsed.uniqueCompanies : 0,
      pagesFetched: typeof parsed.pagesFetched === 'number' ? parsed.pagesFetched : 0,
      pagesFailed: Array.isArray(parsed.pagesFailed) ? parsed.pagesFailed.length : 0,
      finishedAt: typeof parsed.finishedAt === 'string' ? parsed.finishedAt : null,
    }
  } catch {
    return null
  }
}

type StoredCrumb = { level: MarketLevel; name: string | null; url: string | null }

function parseStoredBreadcrumb(description: string | null): CategoryCrumb[] {
  if (!description) return []
  try {
    const parsed = JSON.parse(description) as { breadcrumb?: unknown }
    if (!Array.isArray(parsed.breadcrumb)) return []
    return parsed.breadcrumb
      .filter((item): item is StoredCrumb => Boolean(item && typeof item === 'object' && 'level' in item))
      .filter((item) => item.level !== ('root' as MarketLevel))
      .map((item) => ({ level: item.level, name: item.name ?? null, url: item.url ?? null }))
  } catch {
    return []
  }
}

export async function getCategoryData(segments: readonly string[]): Promise<CategoryData> {
  const sourceUrl = marketCategoryUrl(segments)

  const [stocks, scanner] = await Promise.all([
    prisma.stock.findMany({
      include: { fundamentals: { orderBy: { capturedAt: 'desc' }, take: 1 } },
      orderBy: { symbol: 'asc' },
      take: 2000,
    }),
    prisma.scanner.findFirst({ where: { category: 'Industry', name: sourceUrl }, select: { id: true, description: true } }),
  ])

  const rows: CategoryStockRow[] = []
  const seen = new Set<string>()
  let trail: CategoryCrumb[] = []

  for (const stock of stocks) {
    const latest = stock.fundamentals[0]
    if (!latest) continue
    const rawData = latest.rawData
    if (!isScreenerDetail(rawData) || !Array.isArray(rawData.industry)) continue
    if (!isInCategory(rawData.industry, segments)) continue

    if (trail.length === 0) {
      trail = industryTrail(rawData.industry, segments).map((link) => ({ level: link.level, name: link.name, url: link.url }))
    }

    const view = buildStockView(stock, latest)
    rows.push(toRowFromView(view))
    seen.add(view.symbol)
  }

  let imported: CategoryImportMeta | null = null

  if (scanner) {
    imported = parseImportMeta(scanner.description)
    const members = await prisma.scannerStock.findMany({
      where: { scannerId: scanner.id },
      include: { stock: { include: { fundamentals: { orderBy: { capturedAt: 'desc' }, take: 1 } } } },
      orderBy: { lastSeenAt: 'desc' },
      take: 2000,
    })
    for (const member of members) {
      if (seen.has(member.stock.symbol)) continue
      const view = buildStockView(member.stock, member.stock.fundamentals[0] ?? null)
      rows.push(toRowFromView(view))
      seen.add(view.symbol)
    }
    if (trail.length === 0) trail = parseStoredBreadcrumb(scanner.description)
  }

  rows.sort((a, b) => a.symbol.localeCompare(b.symbol))
  return { rows, trail, imported }
}
