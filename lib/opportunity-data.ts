import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { buildStockView } from '@/lib/stock-detail'
import { computeOpportunity, isFinancialIndustry, opportunityInputFromView } from '@/lib/opportunity'
import { symbolIdentity } from '@/lib/identity'
import type { GrowthReading } from '@/lib/growth-quality'
import { buildFlags, type StockFlag } from '@/lib/stock-flags'

/**
 * Server data layer for the "Early Opportunity" dashboard.
 *
 * Computing the model for every saved stock decodes a large `rawData` JSON blob
 * per row, which is too heavy to repeat on every request. The result is
 * therefore memoised per server instance for a few minutes; the underlying
 * source data only changes a few times a day anyway.
 */

export const OPPORTUNITY_CACHE_TTL_MS = 5 * 60 * 1000
export const MOVEMENT_WINDOW_DAYS = 120
export const RADAR_MIN_COVERAGE = 60
/** Minimum evidence before an opportunity score is shown as a comparable number. */
export const MIN_DISPLAY_COVERAGE = 40

export type OpportunityComponentView = {
  key: string
  label: string
  earned: number
  max: number
  ratio: number | null
  evaluated: boolean
  note: string | null
}

export type OpportunityRow = {
  symbol: string
  company: string
  href: string
  identity: ReturnType<typeof symbolIdentity>
  sector: string | null
  industry: string | null
  isFinancial: boolean
  /** Normalised score over the available evidence (0–100), null when unusable. */
  opportunity: number | null
  /** Raw points earned across the evaluated components. */
  opportunityPoints: number
  /** Maximum points that could be scored from available data (0–100). */
  opportunityMax: number
  coveragePct: number
  provisional: boolean
  score: number | null
  price: number | null
  intrinsic: number | null
  /** True only when both a positive LTP and a valid intrinsic value exist. */
  valuationValid: boolean
  roce: number | null
  roe: number | null
  pe: number | null
  mos: number | null
  cfoPat: number | null
  debtToEquity: number | null
  netProfit: number | null
  salesGrowth: GrowthReading | null
  profitGrowth: GrowthReading | null
  qoqProfitGrowth: GrowthReading | null
  flags: StockFlag[]
  components: OpportunityComponentView[]
  dataPeriod: string | null
  updatedAt: string | null
  movement: { delta: number; days: number } | null
}

export type CoverageSummary = {
  stocks: number
  withFundamentals: number
  evaluable: number
  scanners: number
  /** End of the last successful import run. */
  lastImportAt: string | null
  lastImportSource: string | null
  /** Newest actual financial snapshot among all stocks. */
  dataAsOf: string | null
  /** When this dashboard snapshot was computed. */
  builtAt: string
}

export type OpportunityDashboard = {
  coverage: CoverageSummary
  rows: OpportunityRow[]
  radar: OpportunityRow[]
  earnings: OpportunityRow[]
  undervalued: OpportunityRow[]
  redFlags: OpportunityRow[]
}

function sectorOf(view: ReturnType<typeof buildStockView>): { sector: string | null; industry: string | null } {
  const links = view.industry ?? []
  const broad = links[0] ?? null
  const deep = links.length ? links[links.length - 1] : null
  return { sector: broad?.name ?? null, industry: deep?.name ?? null }
}

function toRow(stock: StockForRow): OpportunityRow | null {
  const snapshot = stock.fundamentals[0]
  if (!snapshot) return null
  const view = buildStockView(stock, snapshot)
  const input = opportunityInputFromView(view)
  const opportunity = computeOpportunity(input)
  const isFinancial = isFinancialIndustry(view.industry)
  const { sector, industry } = sectorOf(view)
  const valuationValid = view.price != null && view.price > 0 && view.valuation.intrinsic != null && view.valuation.intrinsic >= 1

  return {
    symbol: stock.symbol,
    company: stock.companyName || stock.symbol,
    href: `/stocks/${encodeURIComponent(stock.symbol)}`,
    identity: symbolIdentity(stock.symbol),
    sector,
    industry,
    isFinancial,
    opportunity: opportunity.normalized,
    opportunityPoints: opportunity.earned,
    opportunityMax: opportunity.evaluatedMax,
    coveragePct: opportunity.coveragePct,
    provisional: opportunity.provisional,
    score: view.score,
    price: view.price,
    intrinsic: view.valuation.intrinsic,
    valuationValid,
    roce: view.roce,
    roe: view.roe,
    pe: view.pe,
    mos: valuationValid ? view.valuation.marginOfSafety : null,
    cfoPat: view.cfoPat,
    debtToEquity: view.debtToEquity,
    netProfit: view.netProfit,
    salesGrowth: view.salesGrowth,
    profitGrowth: view.profitGrowth,
    qoqProfitGrowth: input.qoqProfitGrowth,
    flags: buildFlags(view, isFinancial),
    components: opportunity.parts.map((part) => ({
      key: part.key,
      label: part.label,
      earned: part.earned,
      max: part.max,
      ratio: part.max > 0 ? Math.round((part.earned / part.max) * 100) : null,
      evaluated: part.evaluated,
      note: part.note,
    })),
    dataPeriod: view.profitGrowth?.currentPeriod ?? view.growth?.latest ?? null,
    updatedAt: snapshot.capturedAt ? snapshot.capturedAt.toISOString() : null,
    movement: null,
  }
}

type HistoryWindow = Map<string, { baseline: number; days: number }>

async function loadMovement(stockIds: string[]): Promise<HistoryWindow> {
  const result: HistoryWindow = new Map()
  if (!stockIds.length) return result
  const cutoff = new Date(Date.now() - MOVEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const rows = await prisma.stockMetricHistory.findMany({
    where: { stockId: { in: stockIds }, capturedAt: { gte: cutoff }, opportunityScore: { not: null } },
    orderBy: { capturedAt: 'asc' },
    select: { stockId: true, opportunityScore: true, capturedAt: true },
  })
  const firstPerStock = new Map<string, { score: number; at: Date }>()
  for (const row of rows) {
    if (row.opportunityScore == null || firstPerStock.has(row.stockId)) continue
    firstPerStock.set(row.stockId, { score: row.opportunityScore, at: row.capturedAt })
  }
  for (const [stockId, first] of firstPerStock) {
    const days = Math.max(1, Math.round((Date.now() - first.at.getTime()) / (24 * 60 * 60 * 1000)))
    result.set(stockId, { baseline: first.score, days })
  }
  return result
}

function byOpportunity(a: OpportunityRow, b: OpportunityRow): number {
  return (b.opportunity ?? -1) - (a.opportunity ?? -1)
}

function growthSortValue(reading: GrowthReading | null): number {
  return reading && reading.comparable && reading.pct != null ? reading.pct : -Infinity
}

async function buildDashboard(): Promise<OpportunityDashboard> {
  const [stocks, scanners, lastRun, latestSnapshot] = await Promise.all([
    prisma.stock.findMany({
      where: { fundamentals: { some: {} } },
      include: { fundamentals: { orderBy: { capturedAt: 'desc' as const }, take: 1 } },
    }),
    prisma.scanner.count({ where: { enabled: true } }),
    prisma.fetchRun.findFirst({ where: { status: 'SUCCEEDED' }, orderBy: { endedAt: 'desc' }, select: { endedAt: true, sourceUrl: true } }),
    prisma.stockFundamentalSnapshot.findFirst({ orderBy: { capturedAt: 'desc' }, select: { capturedAt: true } }),
  ])

  const rowsWithId = stocks
    .map((stock) => ({ id: stock.id, row: toRow(stock) }))
    .filter((entry): entry is { id: string; row: OpportunityRow } => entry.row != null)

  const evaluable = rowsWithId.filter((entry) => entry.row.coveragePct >= RADAR_MIN_COVERAGE)
  const movement = await loadMovement(evaluable.map((entry) => entry.id))
  for (const { id, row } of rowsWithId) {
    const window = movement.get(id)
    row.movement =
      window && row.opportunity != null ? { delta: row.opportunity - window.baseline, days: window.days } : null
  }

  const rows = rowsWithId.map((entry) => entry.row)

  const radar = [...evaluable.map((entry) => entry.row)].sort(byOpportunity).slice(0, 12)

  const earnings = rows
    .filter((row) => growthSortValue(row.qoqProfitGrowth) > 0 || growthSortValue(row.profitGrowth) > 0)
    .sort((a, b) => growthSortValue(b.qoqProfitGrowth) - growthSortValue(a.qoqProfitGrowth) || growthSortValue(b.profitGrowth) - growthSortValue(a.profitGrowth))
    .slice(0, 10)

  const undervalued = rows
    .filter((row) => row.valuationValid && (row.roce ?? -Infinity) >= 15 && (row.mos ?? -Infinity) > 0 && row.pe != null && row.pe > 0)
    .sort((a, b) => (b.mos ?? -Infinity) - (a.mos ?? -Infinity))
    .slice(0, 10)

  const redFlags = rows
    .filter((row) => row.flags.length > 0)
    .sort((a, b) => {
      const severity = (row: OpportunityRow) => row.flags.reduce((sum, flag) => sum + (flag.severity === 'bad' ? 2 : 1), 0)
      return severity(b) - severity(a) || b.flags.length - a.flags.length
    })
    .slice(0, 10)

  return {
    coverage: {
      stocks: await prisma.stock.count(),
      withFundamentals: rows.length,
      evaluable: evaluable.length,
      scanners,
      lastImportAt: lastRun?.endedAt ? lastRun.endedAt.toISOString() : null,
      lastImportSource: lastRun?.sourceUrl ?? null,
      dataAsOf: latestSnapshot?.capturedAt ? latestSnapshot.capturedAt.toISOString() : null,
      builtAt: new Date().toISOString(),
    },
    rows,
    radar,
    earnings,
    undervalued,
    redFlags,
  }
}

let cache: { at: number; data: OpportunityDashboard } | null = null
let inflight: Promise<OpportunityDashboard> | null = null

export async function getOpportunityDashboard(): Promise<OpportunityDashboard> {
  if (cache && Date.now() - cache.at < OPPORTUNITY_CACHE_TTL_MS) return cache.data
  if (inflight) return inflight
  inflight = buildDashboard()
    .then((data) => {
      cache = { at: Date.now(), data }
      return data
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function clearOpportunityCache(): void {
  cache = null
}

type StockForRow = Prisma.StockGetPayload<{
  include: { fundamentals: { orderBy: { capturedAt: 'desc' }; take: 1 } }
}>
