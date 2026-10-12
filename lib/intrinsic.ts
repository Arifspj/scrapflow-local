/**
 * Screener.in "Graham number" intrinsic value.
 * Source: https://support.screener.in/article/23-how-do-we-calculate-intrinsic-value
 *
 *   Intrinsic value = sqrt(EPS × Book Value × max PE × max PBV)
 *   max PE  = median sales growth of 5 years × 1.5   (clamped to 8–100)
 *   max PBV = ROCE of 5 years / 8                     (clamped to 1–10)
 *
 * Screener calls the result "a very subjective ratio"; we only reproduce their
 * published method and never invent a number when EPS/Book Value are unusable.
 */

export const MAX_PE_BOUNDS = { min: 8, max: 100 } as const
export const MAX_PBV_BOUNDS = { min: 1, max: 10 } as const
export const MEDIAN_YEARS = 5

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

/** Year-on-year growth rates for a chronological annual series. */
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

export type IntrinsicBreakdown = {
  eps: number | null
  bookValue: number | null
  medianSalesGrowth: number | null
  maxPe: number
  medianRoce: number | null
  maxPbv: number
  intrinsicValue: number | null
}

export function computeIntrinsicValue(input: {
  eps: number | null
  bookValue: number | null
  sales: number[]
  roce: number[]
}): IntrinsicBreakdown {
  const { eps, bookValue, sales, roce } = input

  const medianSalesGrowth = median(annualGrowthRates(sales).slice(-MEDIAN_YEARS))
  const maxPe = clamp((medianSalesGrowth ?? 0) * 1.5, MAX_PE_BOUNDS.min, MAX_PE_BOUNDS.max)

  const medianRoce = median(roce.slice(-MEDIAN_YEARS))
  const maxPbv = clamp((medianRoce ?? 0) / 8, MAX_PBV_BOUNDS.min, MAX_PBV_BOUNDS.max)

  const usable = eps != null && eps > 0 && bookValue != null && bookValue > 0
  const intrinsicValue = usable ? Math.sqrt(eps * bookValue * maxPe * maxPbv) : null

  return { eps, bookValue, medianSalesGrowth, maxPe, medianRoce, maxPbv, intrinsicValue }
}

/** Margin of safety against the intrinsic value: (IV − price) / IV. */
export function marginOfSafety(price: number | null, intrinsicValue: number | null): number | null {
  if (price == null || price <= 0 || intrinsicValue == null || intrinsicValue <= 0) return null
  return ((intrinsicValue - price) / intrinsicValue) * 100
}
