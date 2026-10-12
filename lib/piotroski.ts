/**
 * Piotroski F-Score (0–9) computed from screener.in standalone financials.
 *
 * The classic nine binary tests are used. Screener.in standalone statements do
 * not expose current assets / current liabilities (the current-ratio test), so
 * when that is the only missing signal we report a documented partial score of
 * 8 criteria. Any other gap returns `null` (N/A) instead of guessing.
 */

export type PiotroskiCriterion = {
  key: string
  label: string
  passed: boolean | null
}

export type PiotroskiResult = {
  score: number | null
  criteria: PiotroskiCriterion[]
  missing: string[]
  /** Number of criteria the score is measured against (9 full, 8 partial). */
  totalCriteria: number
  /** True when only the current-ratio signal was unavailable and we scored the rest. */
  partial: boolean
}

export type PiotroskiInput = {
  netProfit: number[]
  cashFromOps: number[]
  totalAssets: number[]
  borrowings: number[]
  equityCapital: number[]
  sales: number[]
  operatingProfit: number[]
  /** Not exposed by screener standalone statements; supplied only when known. */
  currentRatio?: number[]
}

function latest(series: number[] | undefined): number | null {
  if (!series || !series.length) return null
  const value = series[series.length - 1]
  return Number.isFinite(value) ? value : null
}

function previous(series: number[] | undefined): number | null {
  if (!series || series.length < 2) return null
  const value = series[series.length - 2]
  return Number.isFinite(value) ? value : null
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null
  return numerator / denominator
}

function passed(value: boolean | null): boolean | null {
  return value
}

export function computePiotroskiScore(input: PiotroskiInput): PiotroskiResult {
  const {
    netProfit,
    cashFromOps,
    totalAssets,
    borrowings,
    equityCapital,
    sales,
    operatingProfit,
    currentRatio,
  } = input

  const netProfitLatest = latest(netProfit)
  const netProfitPrev = previous(netProfit)
  const cfoLatest = latest(cashFromOps)
  const assetsLatest = latest(totalAssets)
  const assetsPrev = previous(totalAssets)
  const borrowLatest = latest(borrowings)
  const borrowPrev = previous(borrowings)

  const roaLatest = ratio(netProfitLatest, assetsLatest)
  const roaPrev = ratio(netProfitPrev, assetsPrev)
  const leverageLatest = ratio(borrowLatest, assetsLatest)
  const leveragePrev = ratio(borrowPrev, assetsPrev)

  const marginLatest = ratio(latest(operatingProfit), latest(sales))
  const marginPrev = ratio(previous(operatingProfit), previous(sales))
  const turnoverLatest = ratio(latest(sales), assetsLatest)
  const turnoverPrev = ratio(previous(sales), assetsPrev)

  const currentRatioLatest = latest(currentRatio)
  const currentRatioPrev = previous(currentRatio)

  const comparable = (a: number | null, b: number | null, better: 'up' | 'down'): boolean | null => {
    if (a == null || b == null) return null
    return better === 'up' ? a > b : a < b
  }

  const criteria: PiotroskiCriterion[] = [
    { key: 'profitability', label: 'Positive net profit', passed: netProfitLatest == null ? null : netProfitLatest > 0 },
    { key: 'cash-flow', label: 'Positive operating cash flow', passed: cfoLatest == null ? null : cfoLatest > 0 },
    { key: 'roa', label: 'Return on assets improved', passed: passed(comparable(roaLatest, roaPrev, 'up')) },
    { key: 'accruals', label: 'Operating cash flow exceeds net profit', passed: cfoLatest == null || netProfitLatest == null ? null : cfoLatest > netProfitLatest },
    { key: 'leverage', label: 'Long-term leverage reduced', passed: passed(comparable(leverageLatest, leveragePrev, 'down')) },
    { key: 'current-ratio', label: 'Current ratio improved', passed: passed(comparable(currentRatioLatest, currentRatioPrev, 'up')) },
    {
      key: 'shares',
      label: 'No new shares issued',
      passed:
        latest(equityCapital) == null || previous(equityCapital) == null
          ? null
          : (latest(equityCapital) as number) <= (previous(equityCapital) as number),
    },
    { key: 'margin', label: 'Operating margin improved', passed: passed(comparable(marginLatest, marginPrev, 'up')) },
    { key: 'turnover', label: 'Asset turnover improved', passed: passed(comparable(turnoverLatest, turnoverPrev, 'up')) },
  ]

  const missing = criteria.filter((criterion) => criterion.passed === null).map((criterion) => criterion.key)

  // Full score: all nine signals were measurable from the source statements.
  if (missing.length === 0) {
    const score = criteria.reduce((total, criterion) => total + (criterion.passed ? 1 : 0), 0)
    return { score, criteria, missing, totalCriteria: 9, partial: false }
  }

  // Partial score: screener standalone statements do not expose current assets /
  // current liabilities, so the current-ratio test is the only unavailable signal.
  // This is an explicit, documented exception — never an invented value.
  if (missing.length === 1 && missing[0] === 'current-ratio') {
    const evaluable = criteria.filter((criterion) => criterion.passed !== null)
    const score = evaluable.reduce((total, criterion) => total + (criterion.passed ? 1 : 0), 0)
    return { score, criteria, missing, totalCriteria: evaluable.length, partial: true }
  }

  // Anything else (one or more tables missing, too little history) stays N/A.
  return { score: null, criteria, missing, totalCriteria: 9, partial: false }
}
