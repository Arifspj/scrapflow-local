/**
 * Q-Scan forensic fair-value engine (model v3.12).
 *
 * A faithful port of the Chrome-extension valuation used by Q-Scan. The old
 * screener.in "Graham number" formula multiplied a 5-year median sales growth
 * by 1.5 and produced inflated targets; this model is capped and cash-flow aware:
 *
 *   1. Growth is the latest YoY net-profit change, sanitised:
 *        - 0% when the latest operating profit (EBIT) is negative
 *        - forced into 0–5% when other income > 40% of PBT
 *        - hard-capped at 15%
 *      Fair P/E = min(max(8.5 + 2 × growth, 11), 38.5), where 11 is Graham's
 *      no-growth base multiple (growth ≤ 0 keeps the 11 floor).
 *      Growth value = EPS × Fair P/E.
 *   2. Graham asset value = √(22.5 × EPS × Book Value).
 *   3. Blended fair value:
 *        - growth > 0  → (Graham + growth value) / 2
 *        - growth ≤ 0  → min(Graham, growth value)
 *
 * Cash-flow gatekeeper: when 3-year CFO/PAT < 0.3 or the latest CFO is
 * negative the company is treated as a cash trap — Graham and the growth-P/E
 * are disabled and a debt-adjusted value ((EBIT × 6 − net debt) ÷ shares) is
 * used. Missing inputs never produce a number.
 */

export const GRAHAM_FACTOR = 22.5
export const FAIR_PE_INTERCEPT = 8.5
export const FAIR_PE_GROWTH_MULTIPLIER = 2
/** Graham's no-growth base multiple — the effective floor for Fair P/E. */
export const FAIR_PE_FLOOR = 11
export const FAIR_PE_CEILING = 38.5
export const GROWTH_HARD_CAP = 15
export const OTHER_INCOME_PBT_LIMIT = 0.4
export const OTHER_INCOME_GROWTH_CAP = 5
export const CFO_PAT_TRAP_THRESHOLD = 0.3
export const DEBT_ADJUSTED_MULTIPLE = 6
/** Below this fair value the equity is effectively wiped out by debt. */
export const NO_EQUITY_FLOOR = 1
export const VALUATION_DISPLAY_CAP = 999

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function median(values: number[]): number | null {
  const clean = values.filter((value) => Number.isFinite(value))
  if (!clean.length) return null
  const sorted = [...clean].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Year-on-year growth rates for a chronological series (skips zero bases). */
export function annualGrowthRates(series: number[]): number[] {
  const rates: number[] = []
  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1]
    const current = series[index]
    if (previous !== 0 && Number.isFinite(current)) {
      rates.push(((current - previous) / Math.abs(previous)) * 100)
    }
  }
  return rates
}

export type ValuationMethod = 'blended' | 'no-growth' | 'debt-adjusted' | 'none'

/**
 * Sanitised valuation growth (%): latest YoY net-profit change, floored at 0
 * when EBIT is negative, capped at 5% when earnings are other-income heavy and
 * hard-capped at 15%. Falls back to the average YoY trend when only a single
 * value is available. Returns null when growth cannot be derived.
 */
export function computeGrowthRate(input: {
  series: number[]
  ebit: number | null
  otherIncome: number | null
  profitBeforeTax: number | null
}): number | null {
  const clean = input.series.filter((value) => Number.isFinite(value))

  let growth: number | null = null
  if (clean.length >= 2) {
    const previous = clean[clean.length - 2]
    const latest = clean[clean.length - 1]
    if (previous !== 0) growth = ((latest - previous) / Math.abs(previous)) * 100
  }
  if (growth === null) {
    const rates = annualGrowthRates(clean)
    growth = rates.length ? rates.reduce((sum, value) => sum + value, 0) / rates.length : null
  }

  // (1) Negative latest operating profit (EBIT) → no growth (base case 0%).
  if (input.ebit != null && input.ebit < 0) return 0

  // (2) Other income > 40% of PBT → disregard the profit jump, cap growth 0–5%.
  if (
    growth !== null &&
    input.otherIncome != null &&
    input.profitBeforeTax != null &&
    input.profitBeforeTax > 0 &&
    input.otherIncome / input.profitBeforeTax > OTHER_INCOME_PBT_LIMIT
  ) {
    growth = clamp(growth, 0, OTHER_INCOME_GROWTH_CAP)
  }

  // (3) Hard cap at 15% (Graham's max sustainable growth → Fair P/E ≤ 38.5).
  if (growth !== null && growth > GROWTH_HARD_CAP) growth = GROWTH_HARD_CAP
  return growth
}

export type ForensicValuation = {
  price: number | null
  /** EPS used in the model — derived from price ÷ P/E, else the reported EPS. */
  eps: number | null
  bookValue: number | null
  growthRate: number | null
  fairPe: number | null
  /** EPS × Fair P/E. */
  growthValue: number | null
  graham: number | null
  /** Debt-adjusted EV/EBIT value, only present for cash-trap stocks. */
  debtAdjusted: number | null
  intrinsic: number | null
  method: ValuationMethod
  trapped: boolean
  /** True when the fair value is below ₹1 (equity wiped out by debt). */
  noEquity: boolean
  /** Premium % above fair value; null when the price is at/below fair value. */
  overvaluation: number | null
  overvaluationCapped: boolean
  upside: number | null
  /** Discount % to fair value; 0 when the price is above fair value. */
  marginOfSafety: number | null
  netDebt: number | null
  ebitda: number | null
  multiple: number | null
}

/**
 * Fair value for a single stock. All inputs are optional; every derived number
 * is null when the underlying data is missing or unusable.
 */
export function computeForensicValuation(input: {
  price: number | null
  pe: number | null
  bookValue: number | null
  /** Reported EPS, used only when a usable price/P/E pair is unavailable. */
  eps: number | null
  /** Net-profit series in order, trailing period last (may include TTM). */
  profitSeries: number[]
  ebit: number | null
  otherIncome: number | null
  profitBeforeTax: number | null
  cfo: number | null
  /** Cumulative CFO/PAT over the last ~3 periods; null when not computable. */
  cfoPat3y: number | null
  debt: number | null
  /** Crore shares, used to turn a fair market cap into a per-share value. */
  shares: number | null
}): ForensicValuation {
  const { price, pe, bookValue, ebit, cfo, cfoPat3y, debt, shares } = input

  const growthRate = computeGrowthRate({
    series: input.profitSeries,
    ebit,
    otherIncome: input.otherIncome,
    profitBeforeTax: input.profitBeforeTax,
  })

  const derivedEps = pe != null && Number.isFinite(pe) && pe > 0 && price != null && price > 0 ? price / pe : null
  const eps = derivedEps ?? (input.eps != null && input.eps > 0 ? input.eps : null)
  const bvps = bookValue != null && Number.isFinite(bookValue) && bookValue > 0 ? bookValue : null

  const graham = eps != null && bvps != null ? Math.sqrt(GRAHAM_FACTOR * eps * bvps) : null

  let fairPe: number | null = null
  if (eps != null && growthRate !== null) {
    fairPe =
      growthRate <= 0
        ? FAIR_PE_FLOOR
        : Math.min(Math.max(FAIR_PE_INTERCEPT + FAIR_PE_GROWTH_MULTIPLIER * Math.min(growthRate, GROWTH_HARD_CAP), FAIR_PE_FLOOR), FAIR_PE_CEILING)
  }
  const growthValue = eps != null && fairPe != null ? eps * fairPe : null

  let core: number | null = null
  if (graham !== null && growthValue !== null) {
    core = growthRate !== null && growthRate <= 0 ? Math.min(graham, growthValue) : (graham + growthValue) / 2
  } else if (graham !== null) {
    core = graham
  } else if (growthValue !== null) {
    core = growthValue
  }

  const trapped = (cfo != null && cfo < 0) || (cfoPat3y != null && cfoPat3y < CFO_PAT_TRAP_THRESHOLD)

  let method: ValuationMethod = 'none'
  let intrinsic: number | null = null
  let debtAdjusted: number | null = null
  let netDebt: number | null = null
  let ebitda: number | null = null
  let multiple: number | null = null

  if (trapped) {
    const ebitdaOk = ebit != null && ebit > 0
    const fairEv = ebitdaOk ? ebit * DEBT_ADJUSTED_MULTIPLE : null
    const resolvedDebt = debt ?? 0
    const fairMarketCap = fairEv != null ? Math.max(0, fairEv - resolvedDebt) : null
    const fairValue = fairMarketCap != null && shares != null && shares > 0 ? fairMarketCap / shares : null
    if (fairValue != null && Number.isFinite(fairValue) && fairValue > 0) {
      intrinsic = fairValue
      debtAdjusted = fairValue
      netDebt = resolvedDebt
      ebitda = ebitdaOk ? ebit : null
      multiple = DEBT_ADJUSTED_MULTIPLE
      method = 'debt-adjusted'
    }
  }

  if (intrinsic == null && core !== null) {
    intrinsic = core
    method = growthValue != null && growthRate != null && growthRate > 0 ? 'blended' : 'no-growth'
  }

  const noEquity = intrinsic === null || !Number.isFinite(intrinsic) || intrinsic < NO_EQUITY_FLOOR

  let overvaluation: number | null = null
  let overvaluationCapped = false
  let marginOfSafety: number | null = null
  let upside: number | null = null

  if (intrinsic !== null && Number.isFinite(intrinsic) && intrinsic >= NO_EQUITY_FLOOR && price != null && price > 0) {
    const premium = ((price - intrinsic) / intrinsic) * 100
    if (premium > 0) {
      overvaluation = Math.min(premium, VALUATION_DISPLAY_CAP)
      overvaluationCapped = premium > VALUATION_DISPLAY_CAP
      marginOfSafety = 0
    } else {
      marginOfSafety = -premium
    }
    upside = ((intrinsic - price) / price) * 100
  } else if (intrinsic != null) {
    // Fair value is below ₹1: equity is wiped out — overvalued by definition.
    marginOfSafety = 0
  }

  return {
    price,
    eps,
    bookValue: bvps,
    growthRate,
    fairPe,
    growthValue,
    graham,
    debtAdjusted,
    intrinsic,
    method,
    trapped,
    noEquity,
    overvaluation,
    overvaluationCapped,
    upside,
    marginOfSafety,
    netDebt,
    ebitda,
    multiple,
  }
}

/**
 * Standardised margin of safety vs fair value: 0% when the price is above fair
 * value, otherwise the discount %. Null when the inputs are unusable.
 */
export function marginOfSafety(price: number | null, fairValue: number | null): number | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null
  if (fairValue == null || !Number.isFinite(fairValue) || fairValue < NO_EQUITY_FLOOR) return null
  const premium = ((price - fairValue) / fairValue) * 100
  return premium > 0 ? 0 : -premium
}
