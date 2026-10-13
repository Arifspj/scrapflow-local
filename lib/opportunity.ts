import type { StockView } from './stock-detail'
import { assessGrowth, type GrowthReading } from './growth-quality'

/**
 * "Early Opportunity" model — a forward-looking sibling of the classic
 * :mod:`score` model.
 *
 * The classic score answers "is this a good, sound business right now?".
 * The opportunity model answers a narrower, harder question: "is something
 * improving here *before* the market re-rates it?". It leans on the same
 * validated sub-metrics but blends them with a momentum tilt.
 *
 * Two components cannot be evaluated from our current data and are declared as
 * such rather than scored as zero:
 *   - Business triggers (order wins / capex / guidance) need a corporate
 *     announcements source, which is not connected.
 *   - Price/volume confirmation needs stored OHLC history; we only keep the
 *     latest LTP and 52-week band.
 * As a result the maximum *evaluated* weight is 80 points. The public score is
 * therefore reported as a percentage of the evaluated weight, alongside an
 * explicit coverage figure, so a half-evaluated stock is never shown as if it
 * were a fully comparable 100-point score.
 */

export const OPPORTUNITY_VERSION = 1

export const OPPORTUNITY_WEIGHTS = {
  earningsAcceleration: 25,
  businessQuality: 20,
  valuation: 20,
  cashAndBalanceSheet: 15,
  triggers: 10,
  priceVolume: 10,
} as const

export type OpportunityComponentKey = keyof typeof OPPORTUNITY_WEIGHTS

export type OpportunityInput = {
  /** Banks/NBFCs/insurers run structurally high leverage; debt rules are relaxed. */
  isFinancial: boolean
  roce: number | null
  roe: number | null
  opm: number | null
  /** Growth readings carry period + comparability; non-comparable growth earns no points. */
  salesGrowth: GrowthReading | null
  profitGrowth: GrowthReading | null
  qoqSalesGrowth: GrowthReading | null
  qoqProfitGrowth: GrowthReading | null
  cfoPat: number | null
  cfoPat3y: number | null
  debtToEquity: number | null
  debtToAssets: number | null
  pe: number | null
  upside: number | null
}

export type OpportunitySubMetric = {
  label: string
  value: number | null
  score: number
}

export type OpportunityPart = {
  key: OpportunityComponentKey
  label: string
  weight: number
  earned: number
  max: number
  evaluated: boolean
  sub: OpportunitySubMetric[]
  note: string | null
}

export type OpportunityResult = {
  version: number
  /** Points earned across the evaluated components. */
  earned: number
  /** Weight that could be scored (0–100). 80 when every evaluable part is present. */
  evaluatedMax: number
  /** Earned as a percentage of `evaluatedMax` (0–100), or null when nothing is evaluable. */
  normalized: number | null
  /** Percentage of the full 100-point model covered by available data. */
  coveragePct: number
  provisional: boolean
  parts: OpportunityPart[]
  notes: string[]
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

const ROCE_POINTS: [number, number][] = [[0, 0], [12, 40], [20, 80], [30, 100]]
const ROE_POINTS: [number, number][] = [[0, 0], [10, 40], [18, 80], [28, 100]]
const OPM_POINTS: [number, number][] = [[0, 0], [8, 40], [15, 75], [25, 100]]
const SALES_YOY_POINTS: [number, number][] = [[-20, 0], [0, 25], [15, 70], [35, 100]]
const PROFIT_YOY_POINTS: [number, number][] = [[-30, 0], [0, 20], [15, 60], [40, 100]]
/** Sequential (QoQ) profit growth: only sustained positives earn points. */
const QOQ_PROFIT_POINTS: [number, number][] = [[-15, 0], [0, 45], [10, 80], [25, 100]]
const CFO_PAT_POINTS: [number, number][] = [[-1, 0], [0, 50], [1, 100]]
const DEBT_EQUITY_POINTS: [number, number][] = [[0, 100], [0.5, 85], [1, 60], [3, 20], [6, 0]]
const DEBT_ASSETS_POINTS: [number, number][] = [[0, 100], [0.2, 85], [0.4, 60], [0.7, 30], [1, 10]]
const PE_POINTS: [number, number][] = [[0, 80], [10, 85], [20, 65], [35, 45], [60, 25], [100, 10]]
const UPSIDE_POINTS: [number, number][] = [[-50, 0], [-20, 35], [0, 55], [15, 75], [40, 100]]

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** Average the sub-metrics that actually have a value. */
function partFrom(
  key: OpportunityComponentKey,
  label: string,
  sub: OpportunitySubMetric[],
  note: string | null,
): OpportunityPart {
  const present = sub.filter((item) => item.value != null)
  const weight = OPPORTUNITY_WEIGHTS[key]
  if (!present.length) {
    return { key, label, weight, earned: 0, max: 0, evaluated: false, sub, note: note ?? 'No data available.' }
  }
  const mean = present.reduce((sum, item) => sum + item.score, 0) / present.length
  return { key, label, weight, earned: round1(mean * (weight / 100)), max: weight, evaluated: true, sub, note }
}

/** Financial-sector detector based on the saved industry hierarchy. */
export function isFinancialIndustry(industry: readonly { name: string | null }[] | null | undefined): boolean {
  const names = (industry ?? []).map((link) => link.name ?? '').join(' ').toLowerCase()
  return /bank|financ|nbfc|insur|housing finance|capital market|asset management|broking|exchange|microfinanc/.test(names)
}

export function opportunityInputFromView(view: StockView): OpportunityInput {
  const qoqProfitGrowth = view.growth
    ? assessGrowth({
        metric: 'QoQ net profit',
        current: view.growth.qoq.netProfit.current,
        previous: view.growth.qoq.netProfit.previous,
        currentPeriod: view.growth.latest,
        previousPeriod: view.growth.qoqPrevious,
      })
    : null
  const qoqSalesGrowth = view.growth
    ? assessGrowth({
        metric: 'QoQ sales',
        current: view.growth.qoq.sales.current,
        previous: view.growth.qoq.sales.previous,
        currentPeriod: view.growth.latest,
        previousPeriod: view.growth.qoqPrevious,
      })
    : null
  return {
    isFinancial: isFinancialIndustry(view.industry),
    roce: view.roce,
    roe: view.roe,
    opm: view.opm,
    salesGrowth: view.salesGrowth,
    profitGrowth: view.profitGrowth,
    qoqSalesGrowth,
    qoqProfitGrowth,
    cfoPat: view.cfoPat,
    cfoPat3y: null,
    debtToEquity: view.debtToEquity,
    debtToAssets: view.debtToAssets,
    pe: view.pe,
    upside: view.valuation.marginOfSafety,
  }
}

/** A growth reading only contributes momentum points when it is comparable. */
function growthValue(reading: GrowthReading | null): number | null {
  return reading && reading.comparable && reading.pct != null ? reading.pct : null
}

function nonComparableNotes(readings: (GrowthReading | null)[]): string[] {
  return readings
    .filter((reading): reading is GrowthReading => reading != null && !reading.comparable && reading.status !== 'missing')
    .map((reading) => `${reading.metric}: ${reading.note ?? 'not comparable.'}`)
}

function componentParts(input: OpportunityInput): OpportunityPart[] {
  const {
    isFinancial,
    roce,
    roe,
    opm,
    salesGrowth,
    profitGrowth,
    qoqSalesGrowth,
    qoqProfitGrowth,
    cfoPat,
    cfoPat3y,
    debtToEquity,
    debtToAssets,
    pe,
    upside,
  } = input

  const earnings = partFrom(
    'earningsAcceleration',
    'Earnings acceleration',
    [
      { label: 'Profit YoY', value: growthValue(profitGrowth), score: linear(growthValue(profitGrowth), PROFIT_YOY_POINTS) },
      { label: 'QoQ profit growth', value: growthValue(qoqProfitGrowth), score: linear(growthValue(qoqProfitGrowth), QOQ_PROFIT_POINTS) },
      { label: 'Sales YoY', value: growthValue(salesGrowth), score: linear(growthValue(salesGrowth), SALES_YOY_POINTS) },
      { label: 'QoQ sales growth', value: growthValue(qoqSalesGrowth), score: linear(growthValue(qoqSalesGrowth), QOQ_PROFIT_POINTS) },
    ],
    'Needs quarterly results.',
  )
  const ignored = nonComparableNotes([profitGrowth, qoqProfitGrowth, salesGrowth, qoqSalesGrowth])
  if (ignored.length) earnings.note = ignored.slice(0, 2).join(' ')

  const quality = partFrom(
    'businessQuality',
    'Business quality',
    [
      { label: 'ROCE', value: roce, score: linear(roce, ROCE_POINTS) },
      { label: 'ROE', value: roe, score: linear(roe, ROE_POINTS) },
      { label: 'Operating margin', value: opm, score: linear(opm, OPM_POINTS) },
    ],
    'No profitability metrics available.',
  )

  const valuation = partFrom(
    'valuation',
    'Valuation & margin of safety',
    [
      { label: 'Upside vs intrinsic', value: upside, score: linear(upside, UPSIDE_POINTS) },
      { label: 'P/E', value: pe, score: linear(pe, PE_POINTS) },
    ],
    'No P/E or fair-value comparison available.',
  )

  const cashSub: OpportunitySubMetric[] = [
    { label: 'CFO / PAT', value: cfoPat, score: linear(cfoPat, CFO_PAT_POINTS) },
    { label: 'CFO / PAT (3y)', value: cfoPat3y, score: linear(cfoPat3y, CFO_PAT_POINTS) },
  ]
  if (!isFinancial) {
    cashSub.push({ label: 'Debt / Equity', value: debtToEquity, score: linear(debtToEquity, DEBT_EQUITY_POINTS) })
  }
  cashSub.push({ label: 'Debt / Assets', value: debtToAssets, score: linear(debtToAssets, DEBT_ASSETS_POINTS) })
  const cashAndBalanceSheet = partFrom(
    'cashAndBalanceSheet',
    'Cash flow & balance sheet',
    cashSub,
    'No cash-flow or borrowings data available.',
  )
  if (isFinancial) cashAndBalanceSheet.note = 'Leverage rule relaxed for financials.'

  const triggers: OpportunityPart = {
    key: 'triggers',
    label: 'Business triggers',
    weight: OPPORTUNITY_WEIGHTS.triggers,
    earned: 0,
    max: 0,
    evaluated: false,
    sub: [],
    note: 'Not evaluated — no corporate-announcements source connected.',
  }
  const priceVolume: OpportunityPart = {
    key: 'priceVolume',
    label: 'Price / volume confirmation',
    weight: OPPORTUNITY_WEIGHTS.priceVolume,
    earned: 0,
    max: 0,
    evaluated: false,
    sub: [],
    note: 'Not evaluated — no stored OHLC history.',
  }

  return [earnings, quality, valuation, cashAndBalanceSheet, triggers, priceVolume]
}

export function computeOpportunity(input: OpportunityInput, now: Date = new Date()): OpportunityResult {
  const parts = componentParts(input)
  const evaluatedMax = parts.reduce((sum, part) => sum + part.max, 0)
  const earned = round1(parts.reduce((sum, part) => sum + part.earned, 0))
  const coveragePct = Math.round(evaluatedMax)
  return {
    version: OPPORTUNITY_VERSION,
    earned,
    evaluatedMax,
    normalized: evaluatedMax > 0 ? Math.round((earned / evaluatedMax) * 100) : null,
    coveragePct,
    provisional: evaluatedMax < 60,
    parts,
    notes: parts.filter((part) => !part.evaluated && part.note).map((part) => part.note as string),
    calculatedAt: now.toISOString(),
  }
}

/** Highest evaluated sub-score, used for the "best signal" caption. */
export function strongestSignal(result: OpportunityResult): string | null {
  let best: { label: string; score: number } | null = null
  for (const part of result.parts) {
    for (const sub of part.sub) {
      if (sub.value == null) continue
      if (!best || sub.score > best.score) best = { label: sub.label, score: sub.score }
    }
  }
  return best ? best.label : null
}
