/**
 * Piotroski F-Score (0–9) computed from screener.in standalone financials.
 *
 * The classic nine binary tests are used. Two of them need data that a
 * screener.in standalone balance sheet does not expose (current assets /
 * current liabilities for the current-ratio test), so we return `null` and
 * report the missing signal instead of inventing a partial score.
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
  if (missing.length) return { score: null, criteria, missing }

  const score = criteria.reduce((total, criterion) => total + (criterion.passed ? 1 : 0), 0)
  return { score, criteria, missing }
}
