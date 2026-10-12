/**
 * Explainable weighted stock-scoring model.
 *
 * One 100-point weighted model is used by the sidebar, the detail page and the
 * search-results table. Components map to explicit weights; each component is a
 * documented, deterministic piecewise-linear sub-score. Missing data never
 * earns points and lowers the reported data coverage instead.
 */

export const SCORE_VERSION = 1

export const SCORE_WEIGHTS = {
  profitability: 25,
  growth: 20,
  cashflow: 20,
  balanceSheet: 20,
  valuation: 15,
} as const

export type ScoreComponentKey = keyof typeof SCORE_WEIGHTS

export type ScoreInput = {
  roce: number | null
  roe: number | null
  opm: number | null
  salesYoy: number | null
  profitYoy: number | null
  cfoPat: number | null
  debtToEquity: number | null
  debtToAssets: number | null
  pe: number | null
  upside: number | null
}

export type ScoreSubMetric = {
  label: string
  value: number | null
  score: number
}

export type ScorePart = {
  key: ScoreComponentKey
  label: string
  weight: number
  earned: number
  max: number
  sub: ScoreSubMetric[]
  note: string | null
}

export type ScoreBreakdown = {
  version: number
  score: number | null
  coveragePct: number
  provisional: boolean
  parts: ScorePart[]
  calculatedAt: string
}

/** Piecewise-linear score mapping: sorted breakpoints of [value, 0..100]. */
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
const CFO_PAT_POINTS: [number, number][] = [[-1, 0], [0, 50], [1, 100]]
const DEBT_EQUITY_POINTS: [number, number][] = [[0, 100], [0.5, 85], [1, 60], [3, 20], [6, 0]]
const DEBT_ASSETS_POINTS: [number, number][] = [[0, 100], [0.2, 85], [0.4, 60], [0.7, 30], [1, 10]]
const PE_POINTS: [number, number][] = [[0, 80], [10, 85], [20, 65], [35, 45], [60, 25], [100, 10]]
const UPSIDE_POINTS: [number, number][] = [[-50, 0], [-20, 35], [0, 55], [15, 75], [40, 100]]

function componentScores(input: ScoreInput): ScorePart[] {
  const { roce, roe, opm, salesYoy, profitYoy, cfoPat, debtToEquity, debtToAssets, pe, upside } = input

  const profitabilitySub: ScoreSubMetric[] = [
    { label: 'ROCE', value: roce, score: linear(roce, ROCE_POINTS) },
    { label: 'ROE', value: roe, score: linear(roe, ROE_POINTS) },
    { label: 'Operating margin', value: opm, score: linear(opm, OPM_POINTS) },
  ]
  const profitabilityPresent = profitabilitySub.some((sub) => sub.value != null)
  const profitability = {
    key: 'profitability' as const,
    label: 'Profitability',
    weight: SCORE_WEIGHTS.profitability,
    earned: 0,
    max: 0,
    sub: profitabilitySub,
    note: profitabilityPresent ? null : 'No profitability metrics available.',
  }

  const growthSub: ScoreSubMetric[] = [
    { label: 'Sales YoY', value: salesYoy, score: linear(salesYoy, SALES_YOY_POINTS) },
    { label: 'Profit YoY', value: profitYoy, score: linear(profitYoy, PROFIT_YOY_POINTS) },
  ]
  const growthPresent = growthSub.some((sub) => sub.value != null)
  const growth = {
    key: 'growth' as const,
    label: 'Growth',
    weight: SCORE_WEIGHTS.growth,
    earned: 0,
    max: 0,
    sub: growthSub,
    note: growthPresent ? null : 'No growth data available.',
  }

  const cashflowSub: ScoreSubMetric[] = [
    { label: 'CFO / PAT', value: cfoPat, score: linear(cfoPat, CFO_PAT_POINTS) },
  ]
  const cashflow = {
    key: 'cashflow' as const,
    label: 'Cash-flow quality',
    weight: SCORE_WEIGHTS.cashflow,
    earned: 0,
    max: 0,
    sub: cashflowSub,
    note: cfoPat != null ? null : 'Operating cash flow not available (needs cash-flow statement and PAT).',
  }

  const balanceSheetSub: ScoreSubMetric[] = [
    { label: 'Debt / Equity', value: debtToEquity, score: linear(debtToEquity, DEBT_EQUITY_POINTS) },
    { label: 'Debt / Assets', value: debtToAssets, score: linear(debtToAssets, DEBT_ASSETS_POINTS) },
  ]
  const balancePresent = balanceSheetSub.some((sub) => sub.value != null)
  const balanceSheet = {
    key: 'balanceSheet' as const,
    label: 'Balance-sheet quality',
    weight: SCORE_WEIGHTS.balanceSheet,
    earned: 0,
    max: 0,
    sub: balanceSheetSub,
    note: balancePresent ? null : 'No borrowings/assets data available.',
  }

  const valuationSub: ScoreSubMetric[] = [
    { label: 'P/E', value: pe, score: linear(pe, PE_POINTS) },
    { label: 'Upside vs intrinsic', value: upside, score: linear(upside, UPSIDE_POINTS) },
  ]
  const valuationPresent = valuationSub.some((sub) => sub.value != null)
  const valuation = {
    key: 'valuation' as const,
    label: 'Valuation',
    weight: SCORE_WEIGHTS.valuation,
    earned: 0,
    max: 0,
    sub: valuationSub,
    note: valuationPresent ? null : 'No P/E or fair-value comparison available.',
  }

  const parts: ScorePart[] = []
  for (const part of [profitability, growth, cashflow, balanceSheet, valuation]) {
    const present = part.sub.some((sub) => sub.value != null)
    const mean = present ? part.sub.filter((sub) => sub.value != null).reduce((sum, sub) => sum + sub.score, 0) / part.sub.filter((sub) => sub.value != null).length : 0
    parts.push({ ...part, earned: present ? round1(mean * (part.weight / 100)) : 0, max: present ? part.weight : 0 })
  }
  return parts
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function computeScore(input: ScoreInput, now: Date = new Date()): ScoreBreakdown {
  const parts = componentScores(input)
  const coverageWeight = parts.reduce((sum, part) => sum + part.max, 0)
  const total = parts.reduce((sum, part) => sum + part.earned, 0)
  const coveragePct = Math.round((coverageWeight / 100) * 100)
  return {
    version: SCORE_VERSION,
    score: coverageWeight > 0 ? Math.round(total) : null,
    coveragePct,
    provisional: coveragePct < 60,
    parts,
    calculatedAt: now.toISOString(),
  }
}

/** Display bands for the score (separate from the quality-badge rule sets). */
export function scoreBand(score: number | null): 'good' | 'warn' | 'bad' | 'neutral' {
  if (score == null) return 'neutral'
  if (score >= 75) return 'good'
  if (score >= 50) return 'warn'
  return 'bad'
}

export function scoreColor(band: ReturnType<typeof scoreBand>): string {
  switch (band) {
    case 'good':
      return 'text-emerald-400'
    case 'warn':
      return 'text-amber-400'
    case 'bad':
      return 'text-red-400'
    default:
      return 'text-slate-400'
  }
}