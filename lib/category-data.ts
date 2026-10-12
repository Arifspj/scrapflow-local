import { prisma } from '@/lib/prisma'
import { buildStockView, isScreenerDetail } from '@/lib/stock-detail'
import {
  industryTrail,
  isInCategory,
  type CategoryCrumb,
  type CategoryData,
  type CategoryStockRow,
} from '@/lib/category'

/**
 * Derive a market/category page from the companies already persisted in the
 * database. We never invent taxonomy: a company belongs to a category only when
 * its saved screener.in `industry` hierarchy links to exactly that path.
 */
export async function getCategoryData(segments: readonly string[]): Promise<CategoryData> {
  const stocks = await prisma.stock.findMany({
    include: { fundamentals: { orderBy: { capturedAt: 'desc' }, take: 1 } },
    orderBy: { symbol: 'asc' },
    take: 2000,
  })

  const rows: CategoryStockRow[] = []
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
    rows.push({
      symbol: view.symbol,
      companyName: view.companyName,
      price: view.price,
      marketCap: view.marketCap,
      pe: view.pe,
      roce: view.roce,
      roe: view.roe,
      debtToEquity: view.debtToEquity,
      salesYoy: view.salesYoy,
      profitYoy: view.profitYoy,
      score: view.score,
      scoreCoverage: view.scoreBreakdown?.coveragePct ?? 0,
      badge: view.quality.primary.label,
      badgeTone: view.quality.primary.tone,
      risks: view.quality.risks.map((risk) => risk.label),
    })
  }

  return { rows, trail }
}
