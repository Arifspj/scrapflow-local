import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { computeOpportunity, opportunityInputFromView } from '@/lib/opportunity'
import type { StockView } from '@/lib/stock-detail'

/**
 * Append a lightweight metric-history row for a stock.
 *
 * The big `StockFundamentalSnapshot` row (with its full `rawData` blob) is
 * replaced on every refresh, so it cannot answer "what changed since last
 * time?". This small row survives those replacements and is what makes genuine
 * change-over-time possible on the dashboard. Rows older than the retention
 * window are pruned on write so the table stays bounded.
 */
export const METRIC_HISTORY_RETENTION_DAYS = 365

function toDecimal(value: number | null | undefined): Prisma.Decimal | null {
  return value == null || !Number.isFinite(value) ? null : new Prisma.Decimal(value)
}

function asInt(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.round(value)
}

export async function recordMetricHistory(stockId: string, view: StockView): Promise<void> {
  const opportunity = computeOpportunity(opportunityInputFromView(view))
  await prisma.stockMetricHistory.create({
    data: {
      stockId,
      score: asInt(view.score),
      coveragePct: asInt(view.scoreBreakdown?.coveragePct),
      opportunityScore: asInt(opportunity.normalized),
      opportunityCoverage: asInt(opportunity.coveragePct),
      roce: toDecimal(view.roce),
      roe: toDecimal(view.roe),
      pe: toDecimal(view.pe),
      salesYoy: toDecimal(view.salesYoy),
      profitYoy: toDecimal(view.profitYoy),
      cfoPat: toDecimal(view.cfoPat),
      debtToEquity: toDecimal(view.debtToEquity),
      intrinsic: toDecimal(view.valuation.intrinsic),
      marginOfSafety: toDecimal(view.valuation.marginOfSafety),
    },
  })

  const cutoff = new Date(Date.now() - METRIC_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  await prisma.stockMetricHistory.deleteMany({ where: { stockId, capturedAt: { lt: cutoff } } })
}
