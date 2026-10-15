import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { buildStockView, type StockView } from '@/lib/stock-detail'
import { computeOpportunity, isFinancialIndustry, opportunityInputFromView } from '@/lib/opportunity'
import {
  computeMultibaggerV2,
  multibaggerInputFromView,
  shortlistEligible,
  MULTIBAGGER_CURRENT_VERSION,
  MULTIBAGGER_MIN_COVERAGE,
  type MultiMember,
  type MetricHistoryDelta,
  type MultibaggerContext,
  type MultibaggerResult,
} from '@/lib/multibagger'
import { symbolIdentity } from '@/lib/identity'
import type { GrowthReading } from '@/lib/growth-quality'
import { buildFlags, hasRiskInputs, type StockFlag } from '@/lib/stock-flags'
import { assessTurnaround, type TurnaroundAssessment } from '@/lib/turnaround'
import { ownershipTrend, type OwnershipTrend } from '@/lib/ownership'
import { summarizeSectors, type SectorInput, type SectorSummary } from '@/lib/sector-map'
import {
  ageOfOpportunityCache,
  getInflightOpportunity,
  invalidateOpportunityCache,
  readLatestOpportunityCache,
  readOpportunityCache,
  setInflightOpportunity,
  writeOpportunityCache,
} from '@/lib/opportunity-cache'

/**
 * Server data layer for the "Early Opportunity" dashboard.
 *
 * Every section is derived from the database on demand — nothing is hardcoded
 * and opening the homepage never triggers an import. Computing the model for
 * every saved stock decodes a large `rawData` JSON blob per row, which is too
 * heavy to repeat on every request, so the result is memoised.
 *
 * The memo is keyed on `dashboardSignature()` — a cheap query for row counts and
 * the newest timestamps. When the underlying rows change (a stock or snapshot is
 * inserted/updated) the signature changes and the dashboard rebuilds on the next
 * read, in every serverless instance, without a manual import. `OPPORTUNITY_CACHE_TTL_MS`
 * is only a safety net for the rare case where the signature query itself fails.
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
  /** Link to the sector's existing industry page (`/market/...`), when known. */
  sectorHref: string | null
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
  /** True when at least one input buildFlags reasons about is present. */
  riskInputsAvailable: boolean
  turnaround: TurnaroundAssessment | null
  ownership: OwnershipTrend | null
  components: OpportunityComponentView[]
  dataPeriod: string | null
  updatedAt: string | null
  movement: { delta: number; days: number } | null
  /** Experimental Multibagger Radar score (see lib/multibagger.ts). */
  multibagger: MultibaggerResult
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

export type MultibaggerMeta = {
  version: number
  minCoverage: number
  /** Stocks with enough evidence for a comparable score. */
  evaluable: number
  /** Stocks on the shortlist after the candidate gate. */
  candidates: number
  /** Candidate rows held back because their symbol is an unresolved numeric id. */
  excludedNumeric: number
}

export type OpportunityDashboard = {
  coverage: CoverageSummary
  rows: OpportunityRow[]
  radar: OpportunityRow[]
  earnings: OpportunityRow[]
  undervalued: OpportunityRow[]
  redFlags: OpportunityRow[]
  turnarounds: OpportunityRow[]
  ownershipMovers: OpportunityRow[]
  sectors: SectorSummary[]
  /** Experimental multibagger shortlist, ranked by the versioned score. */
  multibagger: OpportunityRow[]
  multibaggerMeta: MultibaggerMeta
}

function sectorOf(view: ReturnType<typeof buildStockView>): { sector: string | null; industry: string | null } {
  const links = view.industry ?? []
  const broad = links[0] ?? null
  const deep = links.length ? links[links.length - 1] : null
  return { sector: broad?.name ?? null, industry: deep?.name ?? null }
}

function toRow(stock: StockForRow, view: StockView): OpportunityRow {
  const input = opportunityInputFromView(view)
  const opportunity = computeOpportunity(input)
  const isFinancial = isFinancialIndustry(view.industry)
  const { sector, industry } = sectorOf(view)
  const broadHref = view.industry[0]?.url ? view.industry[0].url!.replace(/\/$/, '') : null
  const valuationValid = view.price != null && view.price > 0 && view.valuation.intrinsic != null && view.valuation.intrinsic >= 1
  const ownership = ownershipTrend(view.detail?.shareholding)

  return {
    symbol: stock.symbol,
    company: stock.companyName || stock.symbol,
    href: `/stocks/${encodeURIComponent(stock.symbol)}`,
    identity: symbolIdentity(stock.symbol),
    sector,
    sectorHref: broadHref,
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
    riskInputsAvailable: hasRiskInputs(view, isFinancial),
    turnaround: assessTurnaround(view.detail),
    ownership,
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
    updatedAt: view.capturedAt ? view.capturedAt.toISOString() : null,
    movement: null,
    // Provisional: recomputed in buildDashboard once this stock's scanner
    // memberships and cross-run metric history have been loaded.
    multibagger: computeMultibaggerV2(
      multibaggerInputFromView(view, { isFinancial, memberships: [], ownership, history: null }),
    ),
  }
}

type HistoryWindow = Map<string, { baseline: number; days: number; history: MetricHistoryDelta }>

function toNum(value: unknown): number | null {
  if (value == null) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function metricDelta(a: unknown, b: unknown): number | null {
  const latest = toNum(a)
  const first = toNum(b)
  return latest != null && first != null ? Number((latest - first).toFixed(4)) : null
}

async function loadMovement(stockIds: string[]): Promise<HistoryWindow> {
  const result: HistoryWindow = new Map()
  if (!stockIds.length) return result
  const cutoff = new Date(Date.now() - MOVEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const rows = await prisma.stockMetricHistory.findMany({
    where: { stockId: { in: stockIds }, capturedAt: { gte: cutoff }, opportunityScore: { not: null } },
    orderBy: { capturedAt: 'asc' },
    select: { stockId: true, opportunityScore: true, roce: true, profitYoy: true, cfoPat: true, capturedAt: true },
  })
  const perStock = new Map<string, typeof rows>()
  for (const row of rows) {
    const list = perStock.get(row.stockId)
    if (list) list.push(row)
    else perStock.set(row.stockId, [row])
  }
  for (const [stockId, list] of perStock) {
    const first = list[0]
    const last = list[list.length - 1]
    if (first.opportunityScore == null) continue
    const days = Math.max(1, Math.round((Date.now() - first.capturedAt.getTime()) / (24 * 60 * 60 * 1000)))
    result.set(stockId, {
      baseline: first.opportunityScore,
      days,
      history: {
        roceChange: metricDelta(last.roce, first.roce),
        profitYoyChange: metricDelta(last.profitYoy, first.profitYoy),
        cfoPatChange: metricDelta(last.cfoPat, first.cfoPat),
      },
    })
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
  const [stocks, membershipRows, scanners, lastRun, latestSnapshot] = await Promise.all([
    prisma.stock.findMany({
      where: { fundamentals: { some: {} } },
      include: { fundamentals: { orderBy: { capturedAt: 'desc' as const }, take: 1 } },
    }),
    prisma.scannerStock.findMany({
      where: { scanner: { enabled: true } },
      select: {
        stockId: true,
        scannerId: true,
        firstSeenAt: true,
        lastSeenAt: true,
        scanner: { select: { category: true } },
      },
    }),
    prisma.scanner.count({ where: { enabled: true } }),
    prisma.fetchRun.findFirst({ where: { status: 'SUCCEEDED' }, orderBy: { endedAt: 'desc' }, select: { endedAt: true, sourceUrl: true } }),
    prisma.stockFundamentalSnapshot.findFirst({ orderBy: { capturedAt: 'desc' }, select: { capturedAt: true } }),
  ])

  const membershipsByStock = new Map<string, MultiMember[]>()
  for (const row of membershipRows) {
    const member: MultiMember = {
      scannerId: row.scannerId,
      category: row.scanner.category,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
    }
    const list = membershipsByStock.get(row.stockId)
    if (list) list.push(member)
    else membershipsByStock.set(row.stockId, [member])
  }

  const rowsWithId = stocks
    .map((stock) => {
      const snapshot = stock.fundamentals[0]
      if (!snapshot) return null
      const view = buildStockView(stock, snapshot)
      return { id: stock.id, view, row: toRow(stock, view) }
    })
    .filter((entry): entry is { id: string; view: StockView; row: OpportunityRow } => entry != null)

  const evaluable = rowsWithId.filter((entry) => entry.row.coveragePct >= RADAR_MIN_COVERAGE)
  const movement = await loadMovement(evaluable.map((entry) => entry.id))
  for (const { id, view, row } of rowsWithId) {
    const window = movement.get(id)
    row.movement =
      window && row.opportunity != null ? { delta: row.opportunity - window.baseline, days: window.days } : null

    // Finalize the Multibagger score with this stock's scanner confluence and
    // cross-run history, which are only available after the DB reads above.
    const context: MultibaggerContext = {
      isFinancial: row.isFinancial,
      memberships: membershipsByStock.get(id) ?? [],
      ownership: row.ownership,
      history: window?.history ?? null,
    }
    row.multibagger = computeMultibaggerV2(multibaggerInputFromView(view, context))
  }

  const rows = rowsWithId.map((entry) => entry.row)

  // Every row is rankable. Numeric BSE/SME codes are included in the opportunity
  // lists; they render with an unresolved-identity note (see lib/identity.ts) so
  // the code is never mistaken for a verified exchange ticker.
  const rankable = rows

  const radar = rankable
    .filter((row) => row.coveragePct >= RADAR_MIN_COVERAGE)
    .sort(byOpportunity)
    .slice(0, 12)

  const earnings = rankable
    .filter((row) => growthSortValue(row.qoqProfitGrowth) > 0 || growthSortValue(row.profitGrowth) > 0)
    .sort((a, b) => growthSortValue(b.qoqProfitGrowth) - growthSortValue(a.qoqProfitGrowth) || growthSortValue(b.profitGrowth) - growthSortValue(a.profitGrowth))
    .slice(0, 10)

  const undervalued = rankable
    .filter((row) => row.valuationValid && (row.roce ?? -Infinity) >= 15 && (row.mos ?? -Infinity) > 0 && row.pe != null && row.pe > 0)
    .sort((a, b) => (b.mos ?? -Infinity) - (a.mos ?? -Infinity))
    .slice(0, 10)

  const redFlags = rankable
    .filter((row) => row.flags.length > 0)
    .sort((a, b) => {
      const severity = (row: OpportunityRow) => row.flags.reduce((sum, flag) => sum + (flag.severity === 'bad' ? 2 : 1), 0)
      return severity(b) - severity(a) || b.flags.length - a.flags.length
    })
    .slice(0, 10)

  const turnarounds = rankable
    .filter((row) => row.turnaround?.genuine)
    .sort((a, b) => (b.turnaround?.score ?? 0) - (a.turnaround?.score ?? 0) || (b.coveragePct ?? 0) - (a.coveragePct ?? 0))
    .slice(0, 12)

  const ownershipStrength = (row: OpportunityRow): number => {
    if (!row.ownership) return 0
    return row.ownership.holdings.reduce((max, holding) => Math.max(max, Math.abs(holding.changePp ?? 0)), 0)
  }
  const ownershipMovers = rankable
    .filter((row) => row.ownership != null && row.ownership.signals.length > 0)
    .sort((a, b) => ownershipStrength(b) - ownershipStrength(a))
    .slice(0, 10)

  const sectorInputs: SectorInput[] = rows.map((row) => ({
    sector: row.sector,
    sectorHref: row.sectorHref,
    coveragePct: row.coveragePct,
    opportunity: row.opportunity,
    roce: row.roce,
    pe: row.pe,
    profitGrowth: row.profitGrowth,
    salesGrowth: row.salesGrowth,
  }))
  const sectors = summarizeSectors(sectorInputs)

  // Experimental Multibagger Radar shortlist: only rows whose evidence coverage
  // clears the gate AND that show earnings/quality improvement, ranked by score.
  const multibagger = rows
    .filter((row) => shortlistEligible(row.multibagger, row.identity))
    .sort(
      (a, b) =>
        (b.multibagger.normalized ?? -1) - (a.multibagger.normalized ?? -1) ||
        b.multibagger.coveragePct - a.multibagger.coveragePct,
    )
    .slice(0, 15)

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
    turnarounds,
    ownershipMovers,
    sectors,
    multibagger,
    multibaggerMeta: {
      version: MULTIBAGGER_CURRENT_VERSION,
      minCoverage: MULTIBAGGER_MIN_COVERAGE,
      evaluable: rows.filter((row) => row.multibagger.normalized != null).length,
      candidates: rows.filter((row) => row.multibagger.candidate).length,
      excludedNumeric: rows.filter((row) => row.multibagger.candidate && row.identity.numeric).length,
    },
  }
}

/**
 * Cheap fingerprint of the rows the dashboard is built from. Row counts plus the
 * newest timestamps are enough to notice an inserted/updated stock, snapshot or
 * scanner membership (the multibagger confluence depends on memberships), so it
 * is a handful of aggregates instead of the full per-row decode.
 */
async function dashboardSignature(): Promise<string> {
  const [stocks, snapshots, scanners, memberships] = await Promise.all([
    prisma.stock.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.stockFundamentalSnapshot.aggregate({ _count: { _all: true }, _max: { capturedAt: true } }),
    prisma.scanner.count({ where: { enabled: true } }),
    prisma.scannerStock.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
  ])
  return [
    stocks._count._all,
    stocks._max.updatedAt?.getTime() ?? 0,
    snapshots._count._all,
    snapshots._max.capturedAt?.getTime() ?? 0,
    scanners,
    memberships._count._all,
    memberships._max.updatedAt?.getTime() ?? 0,
  ].join('|')
}

export async function getOpportunityDashboard(): Promise<OpportunityDashboard> {
  let signature: string | null = null
  try {
    signature = await dashboardSignature()
  } catch (error) {
    console.error('[opportunity] signature query failed; falling back to the TTL cache', error)
  }

  if (signature) {
    const cached = readOpportunityCache(signature) as OpportunityDashboard | null
    if (cached) return cached
  } else {
    const age = ageOfOpportunityCache()
    if (age != null && age < OPPORTUNITY_CACHE_TTL_MS) {
      const cached = readLatestOpportunityCache() as OpportunityDashboard | null
      if (cached) return cached
    }
  }

  const pending = getInflightOpportunity()
  if (pending) return pending as Promise<OpportunityDashboard>

  const task = buildDashboard()
    .then((data) => {
      writeOpportunityCache(signature ?? 'unsignatured', data)
      return data
    })
    .finally(() => setInflightOpportunity(null))
  setInflightOpportunity(task as Promise<unknown>)
  return task
}

/** Drop the memo on this instance; other instances notice through the signature. */
export function clearOpportunityCache(): void {
  invalidateOpportunityCache()
}

type StockForRow = Prisma.StockGetPayload<{
  include: { fundamentals: { orderBy: { capturedAt: 'desc' }; take: 1 } }
}>
