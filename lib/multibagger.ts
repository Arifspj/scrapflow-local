import type { StockView } from './stock-detail'
import { annualSeriesWithLabels, assessGrowth, type GrowthReading } from './growth-quality'
import { rowLabelMatches, type DetailTable } from './scrapers/screener-detail'
import type { OwnershipTrend } from './ownership'

/**
 * Multibagger Radar — an *experimental*, separate composite score that tries to
 * surface companies where the fundamentals are *improving* before (or while) the
 * market re-rates them.
 *
 * Design rules (mirrors the opportunity model so it never fabricates evidence):
 *   - A metric that is missing or not comparable is excluded from BOTH the points
 *     earned and the maximum that could be earned. It never counts as positive.
 *   - The score is reported only once enough of the model is covered, alongside an
 *     explicit coverage figure, so a half-evaluated stock is never shown as a
 *     comparable 100-point score.
 *   - Small size is treated as *room to grow*, not a multibagger signal by itself;
 *     it carries a deliberately modest weight and only helps a stock that already
 *     scores on improvement.
 *   - This is a research shortlist, not a prediction. It does not claim a price
 *     pre-rally confirmation: there is no OHLC/volume history in the database.
 *
 * Weights are research starting points, not a validated predictive formula.
 */

export const MULTIBAGGER_VERSION = 1

/** Minimum share of the model that must have data before a score is shown. */
export const MULTIBAGGER_MIN_COVERAGE = 50

export const MULTIBAGGER_WEIGHTS = {
  earningsAcceleration: 25,
  businessQuality: 20,
  cashAndBalanceSheet: 15,
  valuation: 15,
  scannerConfluence: 10,
  smallBase: 10,
  ownership: 5,
} as const

export type MultibaggerComponentKey = keyof typeof MULTIBAGGER_WEIGHTS

export type MultiMember = { scannerId: string; category: string; firstSeenAt: Date; lastSeenAt: Date }

export type MetricHistoryDelta = {
  roceChange: number | null
  profitYoyChange: number | null
  cfoPatChange: number | null
}

export type MultibaggerContext = {
  isFinancial: boolean
  memberships: MultiMember[]
  ownership: OwnershipTrend | null
  history: MetricHistoryDelta | null
}

export type MultibaggerInput = {
  isFinancial: boolean
  // Earnings acceleration
  profitYoy: GrowthReading | null
  salesYoy: GrowthReading | null
  qoqProfitGrowth: GrowthReading | null
  /** pp change in YoY profit growth (latest quarter vs prior quarter, or annual fallback). */
  profitAccelerationPp: number | null
  salesAccelerationPp: number | null
  // Business quality + trend
  roce: number | null
  roe: number | null
  roceTrendPp: number | null
  opmTrendPp: number | null
  // Cash flow + balance sheet
  cfoPat: number | null
  debtToEquity: number | null
  /** % change in latest annual borrowings vs prior year (negative = reducing). */
  debtChangePct: number | null
  // Valuation + margin of safety
  marginOfSafety: number | null
  pe: number | null
  // Scanner confluence + recency
  scannerCategoryCount: number
  scannerMembershipCount: number
  daysSinceFirstSeen: number | null
  // Small base
  marketCap: number | null
  // Ownership
  promoterChangePp: number | null
  fiiChangePp: number | null
  diiChangePp: number | null
  // Cross-run fundamental improvement (StockMetricHistory)
  history: MetricHistoryDelta | null
}

export type MultibaggerSubMetric = { label: string; value: number | null; score: number }

export type MultibaggerPart = {
  key: MultibaggerComponentKey
  label: string
  weight: number
  earned: number
  max: number
  evaluated: boolean
  sub: MultibaggerSubMetric[]
  note: string | null
}

export type MultibaggerResult = {
  version: number
  earned: number
  evaluatedMax: number
  /** Earned as a share of the *available* points (0–100), or null when too little is evaluable. */
  normalized: number | null
  coveragePct: number
  /** True when this row belongs on the Multibagger Radar shortlist. */
  candidate: boolean
  parts: MultibaggerPart[]
  /** Human "why it appears" reasons, best validated evidence first. */
  reasons: string[]
  calculatedAt: string
}

function linear(value: number | null, points: [number, number][]): number {
  if (value == null || !Number.isFinite(value)) return 0
  if (value <= points[0][0]) return points[0][1]
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x0, y0] = points[index]
    const [x1, y1] = points[index + 1]
    if (value <= x1) {
      const ratio = x1 === x0 ? 0 : (value - x0) / (x1 - x0)
      return y0 + (y1 - y0) * ratio
    }
  }
  return points[points.length - 1][1]
}

const ACCEL_POINTS: [number, number][] = [[-25, 0], [-5, 35], [0, 50], [10, 75], [25, 100]]
const PROFIT_YOY_POINTS: [number, number][] = [[-30, 0], [0, 20], [15, 60], [40, 100]]
const QOQ_POINTS: [number, number][] = [[-15, 0], [0, 45], [10, 80], [25, 100]]
const ROCE_POINTS: [number, number][] = [[0, 0], [12, 40], [20, 80], [30, 100]]
const ROCE_TREND_POINTS: [number, number][] = [[-8, 0], [-2, 35], [0, 50], [5, 80], [12, 100]]
const ROE_POINTS: [number, number][] = [[0, 0], [10, 40], [18, 80], [28, 100]]
const OPM_TREND_POINTS: [number, number][] = [[-4, 0], [0, 50], [3, 80], [8, 100]]
const CFO_PAT_POINTS: [number, number][] = [[-1, 0], [0, 50], [1, 100]]
const CFO_CHANGE_POINTS: [number, number][] = [[-0.5, 0], [0, 45], [0.3, 75], [0.8, 100]]
const DEBT_EQUITY_POINTS: [number, number][] = [[0, 100], [0.5, 85], [1, 60], [3, 20], [6, 0]]
const DEBT_TREND_POINTS: [number, number][] = [[-30, 100], [-15, 90], [0, 60], [20, 0]]
const MOS_POINTS: [number, number][] = [[-50, 0], [-20, 35], [0, 55], [15, 75], [40, 100]]
const PE_POINTS: [number, number][] = [[0, 80], [10, 85], [20, 65], [35, 45], [60, 25], [100, 10]]
const CONFLUENCE_POINTS: [number, number][] = [[0, 0], [1, 45], [2, 75], [3, 100]]
/** Days since first seen in any scanner — fresher entry scores higher. */
const RECENCY_POINTS: [number, number][] = [[3, 100], [14, 95], [45, 80], [120, 55], [365, 25]]
/** Market cap (₹ Cr) — smaller = more room, but only a modest, capped contribution. */
const SMALL_BASE_POINTS: [number, number][] = [[50, 100], [250, 90], [1000, 70], [5000, 40], [20000, 18], [100000, 5]]
const OWNERSHIP_POINTS: [number, number][] = [[-2, 0], [0, 50], [2, 100]]

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function growthPct(reading: GrowthReading | null): number | null {
  return reading && reading.comparable && reading.pct != null ? reading.pct : null
}

function partFrom(
  key: MultibaggerComponentKey,
  label: string,
  sub: MultibaggerSubMetric[],
  note: string | null,
): MultibaggerPart {
  const weight = MULTIBAGGER_WEIGHTS[key]
  const present = sub.filter((item) => item.value != null)
  if (!present.length) {
    return { key, label, weight, earned: 0, max: 0, evaluated: false, sub, note: note ?? 'No data available.' }
  }
  const mean = present.reduce((sum, item) => sum + item.score, 0) / present.length
  return { key, label, weight, earned: round1(mean * (weight / 100)), max: weight, evaluated: true, sub, note }
}

function componentParts(input: MultibaggerInput): MultibaggerPart[] {
  const history = input.history

  const earnings = partFrom(
    'earningsAcceleration',
    'Earnings acceleration',
    [
      { label: 'Profit acceleration', value: input.profitAccelerationPp, score: linear(input.profitAccelerationPp, ACCEL_POINTS) },
      { label: 'Sales acceleration', value: input.salesAccelerationPp, score: linear(input.salesAccelerationPp, ACCEL_POINTS) },
      { label: 'Profit YoY', value: growthPct(input.profitYoy), score: linear(growthPct(input.profitYoy), PROFIT_YOY_POINTS) },
      { label: 'QoQ profit', value: growthPct(input.qoqProfitGrowth), score: linear(growthPct(input.qoqProfitGrowth), QOQ_POINTS) },
    ],
    'Needs comparable quarterly / annual results.',
  )

  const quality = partFrom(
    'businessQuality',
    'Business quality & trend',
    [
      { label: 'ROCE', value: input.roce, score: linear(input.roce, ROCE_POINTS) },
      { label: 'ROCE trend', value: input.roceTrendPp ?? history?.roceChange ?? null, score: linear(input.roceTrendPp ?? history?.roceChange ?? null, ROCE_TREND_POINTS) },
      { label: 'ROE', value: input.roe, score: linear(input.roe, ROE_POINTS) },
      { label: 'Margin trend', value: input.opmTrendPp, score: linear(input.opmTrendPp, OPM_TREND_POINTS) },
    ],
    'No profitability metrics available.',
  )

  const cashSub: MultibaggerSubMetric[] = [
    { label: 'CFO / PAT', value: input.cfoPat, score: linear(input.cfoPat, CFO_PAT_POINTS) },
    { label: 'CFO / PAT trend', value: history?.cfoPatChange ?? null, score: linear(history?.cfoPatChange ?? null, CFO_CHANGE_POINTS) },
  ]
  if (!input.isFinancial) {
    cashSub.push({ label: 'Debt / Equity', value: input.debtToEquity, score: linear(input.debtToEquity, DEBT_EQUITY_POINTS) })
  }
  cashSub.push({ label: 'Borrowings trend', value: input.debtChangePct, score: linear(input.debtChangePct, DEBT_TREND_POINTS) })
  const cashAndBalanceSheet = partFrom('cashAndBalanceSheet', 'Cash flow & balance sheet', cashSub, 'No cash-flow or borrowings data available.')
  if (input.isFinancial) cashAndBalanceSheet.note = 'Leverage rule relaxed for financials.'

  const valuation = partFrom(
    'valuation',
    'Valuation & margin of safety',
    [
      { label: 'Margin of safety', value: input.marginOfSafety, score: linear(input.marginOfSafety, MOS_POINTS) },
      { label: 'P/E', value: input.pe, score: linear(input.pe, PE_POINTS) },
    ],
    'No P/E or fair-value comparison available.',
  )

  const confluence = partFrom(
    'scannerConfluence',
    'Scanner confluence',
    [
      {
        label: 'Independent scanners',
        value: input.scannerCategoryCount || (input.scannerMembershipCount ? 0 : null),
        score: linear(input.scannerCategoryCount, CONFLUENCE_POINTS),
      },
      { label: 'Fresh entry', value: input.daysSinceFirstSeen, score: linear(input.daysSinceFirstSeen, RECENCY_POINTS) },
    ],
    'Not present in any enabled scanner.',
  )

  const smallBase = partFrom(
    'smallBase',
    'Small-base potential',
    [{ label: 'Market cap', value: input.marketCap, score: linear(input.marketCap, SMALL_BASE_POINTS) }],
    'Market cap not available.',
  )

  const ownership = partFrom(
    'ownership',
    'Ownership trend',
    [
      { label: 'Promoter Δ', value: input.promoterChangePp, score: linear(input.promoterChangePp, OWNERSHIP_POINTS) },
      { label: 'FII Δ', value: input.fiiChangePp, score: linear(input.fiiChangePp, OWNERSHIP_POINTS) },
      { label: 'DII Δ', value: input.diiChangePp, score: linear(input.diiChangePp, OWNERSHIP_POINTS) },
    ],
    'No comparable shareholding periods.',
  )

  return [earnings, quality, cashAndBalanceSheet, valuation, confluence, smallBase, ownership]
}

function reasonsFrom(parts: MultibaggerPart[]): string[] {
  return parts
    .flatMap((part) => part.sub)
    .filter((sub) => sub.value != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((sub) => sub.label)
}

export function computeMultibagger(input: MultibaggerInput, now: Date = new Date()): MultibaggerResult {
  const parts = componentParts(input)
  const evaluatedMax = parts.reduce((sum, part) => sum + part.max, 0)
  const earned = round1(parts.reduce((sum, part) => sum + part.earned, 0))
  const coveragePct = Math.round(evaluatedMax)
  const normalized = evaluatedMax >= MULTIBAGGER_MIN_COVERAGE ? Math.round((earned / evaluatedMax) * 100) : null
  const earningsEvaluated = parts.find((part) => part.key === 'earningsAcceleration')?.evaluated ?? false
  const qualityEvaluated = parts.find((part) => part.key === 'businessQuality')?.evaluated ?? false
  const candidate = normalized != null && (earningsEvaluated || qualityEvaluated)
  return {
    version: MULTIBAGGER_VERSION,
    earned,
    evaluatedMax,
    normalized,
    coveragePct,
    candidate,
    parts,
    reasons: reasonsFrom(parts),
    calculatedAt: now.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Adapter: turn a saved StockView (+ membership / history context) into input.
// ---------------------------------------------------------------------------

function toNumber(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const numeric = Number(match[0])
  return Number.isFinite(numeric) ? numeric : null
}

/** Latest vs prior YoY growth in the same series, or null when either leg is not comparable. */
function acceleration(table: DetailTable | null | undefined, label: string): number | null {
  const series = annualSeriesWithLabels(table, label)
  if (series.length < 6) return null
  const n = series.length
  const latest = assessGrowth({
    metric: label,
    current: series[n - 1].value,
    previous: series[n - 5].value,
    currentPeriod: series[n - 1].label,
    previousPeriod: series[n - 5].label,
  })
  const prior = assessGrowth({
    metric: label,
    current: series[n - 2].value,
    previous: series[n - 6].value,
    currentPeriod: series[n - 2].label,
    previousPeriod: series[n - 6].label,
  })
  if (!latest.comparable || !prior.comparable || latest.pct == null || prior.pct == null) return null
  return Number((latest.pct - prior.pct).toFixed(2))
}

/** Latest minus prior value of an annual series (e.g. ROCE pp change). */
function trendDelta(table: DetailTable | null | undefined, label: string): number | null {
  const series = annualSeriesWithLabels(table, label)
  if (series.length < 2) return null
  return Number((series[series.length - 1].value - series[series.length - 2].value).toFixed(2))
}

/** Annual operating-margin series (%), aligned by column, TTM dropped. */
function opmSeries(table: DetailTable | null | undefined): number[] {
  if (!table) return []
  const salesRow = table.rows.find((row) => rowLabelMatches(row.label, 'sales'))
  const opRow = table.rows.find((row) => rowLabelMatches(row.label, 'operating profit'))
  if (!salesRow || !opRow) return []
  const out: number[] = []
  table.columns.forEach((column, index) => {
    if (/ttm/i.test(column)) return
    const sales = toNumber(salesRow.values[index])
    const op = toNumber(opRow.values[index])
    if (sales != null && sales > 0 && op != null) out.push((op / sales) * 100)
  })
  return out
}

function pctChange(series: { value: number }[]): number | null {
  if (series.length < 2) return null
  const latest = series[series.length - 1].value
  const prior = series[series.length - 2].value
  if (prior === 0) return null
  return Number((((latest - prior) / Math.abs(prior)) * 100).toFixed(2))
}

export function multibaggerInputFromView(view: StockView, ctx: MultibaggerContext): MultibaggerInput {
  const detail = view.detail
  const qoqProfitGrowth =
    view.growth && detail
      ? assessGrowth({
          metric: 'QoQ net profit',
          current: view.growth.qoq.netProfit.current,
          previous: view.growth.qoq.netProfit.previous,
          currentPeriod: view.growth.latest,
          previousPeriod: view.growth.qoqPrevious,
        })
      : null

  const opm = opmSeries(detail?.profitLoss)
  const opmTrendPp = opm.length >= 2 ? Number((opm[opm.length - 1] - opm[opm.length - 2]).toFixed(2)) : null
  const borrowings = annualSeriesWithLabels(detail?.balanceSheet, 'borrowings')

  const categories = new Set(ctx.memberships.map((member) => member.category))
  const firstSeen = ctx.memberships.length
    ? Math.min(...ctx.memberships.map((member) => member.firstSeenAt.getTime()))
    : null
  const daysSinceFirstSeen = firstSeen != null ? Math.max(1, Math.round((Date.now() - firstSeen) / 86_400_000)) : null
  const holding = (key: 'promoter' | 'fii' | 'dii'): number | null =>
    ctx.ownership?.holdings.find((entry) => entry.key === key)?.changePp ?? null

  return {
    isFinancial: ctx.isFinancial,
    profitYoy: view.profitGrowth,
    salesYoy: view.salesGrowth,
    qoqProfitGrowth,
    profitAccelerationPp:
      acceleration(detail?.quarters, 'net profit') ?? acceleration(detail?.profitLoss, 'net profit'),
    salesAccelerationPp: acceleration(detail?.quarters, 'sales') ?? acceleration(detail?.profitLoss, 'sales'),
    roce: view.roce,
    roe: view.roe,
    roceTrendPp: trendDelta(detail?.ratios, 'roce'),
    opmTrendPp,
    cfoPat: view.cfoPat,
    debtToEquity: view.debtToEquity,
    debtChangePct: pctChange(borrowings),
    marginOfSafety: view.valuation.marginOfSafety,
    pe: view.pe,
    scannerCategoryCount: categories.size,
    scannerMembershipCount: ctx.memberships.length,
    daysSinceFirstSeen,
    marketCap: view.marketCap,
    promoterChangePp: holding('promoter'),
    fiiChangePp: holding('fii'),
    diiChangePp: holding('dii'),
    history: ctx.history,
  }
}
