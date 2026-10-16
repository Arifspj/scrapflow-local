import { prisma } from '@/lib/prisma'
import type { StockView } from '@/lib/stock-detail'
import { resolveListViews } from '@/lib/list-views'
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
      select: {
        id: true,
        symbol: true,
        companyName: true,
        fundamentals: {
          orderBy: { capturedAt: 'desc' as const },
          take: 1,
          select: { viewSummary: true },
        },
      },
      orderBy: { symbol: 'asc' },
      take: 2000,
    }),
    prisma.scanner.findFirst({ where: { category: 'Industry', name: sourceUrl }, select: { id: true, description: true } }),
  ])

  const lists = await resolveListViews(
    stocks.map((stock) => ({
      id: stock.id,
      symbol: stock.symbol,
      companyName: stock.companyName,
      summary: stock.fundamentals[0]?.viewSummary,
    })),
  )

  const rows: CategoryStockRow[] = []
  const seen = new Set<string>()
  let trail: CategoryCrumb[] = []

  for (const stock of stocks) {
    const list = lists.get(stock.id)
    if (!list) continue
    const { view } = list
    if (!view.industry.length) continue
    if (!isInCategory(view.industry, segments)) continue

    if (trail.length === 0) {
      trail = industryTrail(view.industry, segments).map((link) => ({ level: link.level, name: link.name, url: link.url }))
    }

    rows.push(toRowFromView(view))
    seen.add(view.symbol)
  }

  let imported: CategoryImportMeta | null = null

  if (scanner) {
    imported = parseImportMeta(scanner.description)
    const members = await prisma.scannerStock.findMany({
      where: { scannerId: scanner.id },
      select: {
        stock: {
          select: {
            id: true,
            symbol: true,
            companyName: true,
            fundamentals: {
              orderBy: { capturedAt: 'desc' as const },
              take: 1,
              select: { viewSummary: true },
            },
          },
        },
      },
      orderBy: { lastSeenAt: 'desc' },
      take: 2000,
    })
    const memberLists = await resolveListViews(
      members.map((member) => ({
        id: member.stock.id,
        symbol: member.stock.symbol,
        companyName: member.stock.companyName,
        summary: member.stock.fundamentals[0]?.viewSummary,
      })),
    )
    for (const member of members) {
      if (seen.has(member.stock.symbol)) continue
      const list = memberLists.get(member.stock.id)
      if (!list) continue
      rows.push(toRowFromView(list.view))
      seen.add(list.view.symbol)
    }
    if (trail.length === 0) trail = parseStoredBreadcrumb(scanner.description)
  }

  rows.sort((a, b) => a.symbol.localeCompare(b.symbol))
  return { rows, trail, imported }
}
