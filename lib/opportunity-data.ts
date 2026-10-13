import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { buildStockView } from '@/lib/stock-detail'
import { computeOpportunity, isFinancialIndustry, opportunityInputFromView } from '@/lib/opportunity'

type StockForRow = Prisma.StockGetPayload<{
  include: { fundamentals: { orderBy: { capturedAt: 'desc' }; take: 1 } }
}>

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
  sector: string | null
  industry: string | null
  isFinancial: boolean
  opportunity: number | null
  coveragePct: number
  provisional: boolean
  score: number | null
  price: number | null
  roce: number | null
  roe: number | null
  pe: number | null
  salesYoy: number | null
  profitYoy: number | null
  qoqProfitPct: number | null
  mos: number | null
  cfoPat: number | null
  debtToEquity: number | null
  netProfit: number | null
  flags: string[]
  components: OpportunityComponentView[]
  updatedAt: string | null
  movement: { delta: number; days: number } | null
}

export type CoverageSummary = {
  stocks: number
  withFundamentals: number
  evaluable: number
  scanners: number
  lastImportAt: string | null
  lastImportSource: string | null
  latestSnapshotAt: string | null
  generatedAt: string
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

function redFlags(view: ReturnType<typeof buildStockView>, isFinancial: boolean): string[] {
  const flags: string[] = []
  if (view.cfoPat != null && view.cfoPat < 1) flags.push('Operating cash below profit')
  if (!isFinancial && view.debtToEquity != null && view.debtToEquity > 2) flags.push('High leverage')
  if (view.profitYoy != null && view.profitYoy < 0) flags.push('Profit declining')
  if (view.salesYoy != null && view.salesYoy < 0) flags.push('Sales declining')
  if (view.roce != null && view.roce < 10) flags.push('Weak ROCE')
  if (view.netProfit != null && view.netProfit < 0) flags.push('Loss-making')
  return flags
}

function toRow(stock: StockForRow): OpportunityRow | null {
  const snapshot = stock.fundamentals[0]
  if (!snapshot) return null
  const view = buildStockView(stock, snapshot)
  const opportunity = computeOpportunity(opportunityInputFromView(view))
  const isFinancial = isFinancialIndustry(view.industry)
  const { sector, industry } = sectorOf(view)
  return {
    symbol: stock.symbol,
    company: stock.companyName || stock.symbol,
    href: `/stocks/${encodeURIComponent(stock.symbol)}`,
    sector,
    industry,
    isFinancial,
    opportunity: opportunity.normalized,
    coveragePct: opportunity.coveragePct,
    provisional: opportunity.provisional,
    score: view.score,
    price: view.price,
    roce: view.roce,
    roe: view.roe,
    pe: view.pe,
    salesYoy: view.salesYoy,
    profitYoy: view.profitYoy,
    qoqProfitPct: view.growth?.qoq.netProfit.pct ?? null,
    mos: view.valuation.marginOfSafety,
    cfoPat: view.cfoPat,
    debtToEquity: view.debtToEquity,
    netProfit: view.netProfit,
    flags: redFlags(view, isFinancial),
    components: opportunity.parts.map((part) => ({
      key: part.key,
      label: part.label,
      earned: part.earned,
      max: part.max,
      ratio: part.max > 0 ? Math.round((part.earned / part.max) * 100) : null,
      evaluated: part.evaluated,
      note: part.note,
    })),
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
    .filter((row) => (row.profitYoy ?? -Infinity) > 0 || (row.qoqProfitPct ?? -Infinity) > 0)
    .sort((a, b) => {
      const qoq = (b.qoqProfitPct ?? -Infinity) - (a.qoqProfitPct ?? -Infinity)
      if (Number.isFinite(qoq) && qoq !== 0) return qoq
      return (b.profitYoy ?? -Infinity) - (a.profitYoy ?? -Infinity)
    })
    .slice(0, 10)

  const undervalued = rows
    .filter((row) => (row.roce ?? -Infinity) >= 15 && (row.mos ?? -Infinity) > 0 && row.pe != null)
    .sort((a, b) => (b.mos ?? -Infinity) - (a.mos ?? -Infinity))
    .slice(0, 10)

  const redFlags = rows
    .filter((row) => row.flags.length > 0)
    .sort((a, b) => b.flags.length - a.flags.length || (a.profitYoy ?? 0) - (b.profitYoy ?? 0))
    .slice(0, 10)

  return {
    coverage: {
      stocks: await prisma.stock.count(),
      withFundamentals: rows.length,
      evaluable: evaluable.length,
      scanners,
      lastImportAt: lastRun?.endedAt ? lastRun.endedAt.toISOString() : null,
      lastImportSource: lastRun?.sourceUrl ?? null,
      latestSnapshotAt: latestSnapshot?.capturedAt ? latestSnapshot.capturedAt.toISOString() : null,
      generatedAt: new Date().toISOString(),
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
