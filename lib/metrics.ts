/**
 * Metric-specific benchmark rules used for red / amber / green status colours.
 *
 * Thresholds are deliberately metric-aware: higher ROCE/ROE is favourable, but
 * higher P/E or debt-to-equity is a risk signal. Missing values are always
 * neutral (never red). Numbers are percentages unless noted.
 */
export type MetricTone = 'good' | 'warn' | 'bad' | 'info' | 'neutral'

export type MetricKey =
  | 'roce'
  | 'roe'
  | 'opm'
  | 'pe'
  | 'dividendYield'
  | 'debtToEquity'
  | 'debtToAssets'
  | 'marginOfSafety'
  | 'upside'
  | 'cfoPat'
  | 'salesGrowth'
  | 'profitGrowth'
  | 'score'

type Benchmark = {
  higherIsBetter: boolean
  /** At/above (or at/below for "lower is better") this value -> good. */
  good: number
  /** Secondary threshold -> warn; anything past it -> bad. */
  warn: number
}

export const METRIC_BENCHMARKS: Record<MetricKey, Benchmark> = {
  roce: { higherIsBetter: true, good: 20, warn: 12 },
  roe: { higherIsBetter: true, good: 15, warn: 10 },
  opm: { higherIsBetter: true, good: 15, warn: 8 },
  pe: { higherIsBetter: false, good: 20, warn: 35 },
  dividendYield: { higherIsBetter: true, good: 1.5, warn: 0 },
  debtToEquity: { higherIsBetter: false, good: 0.5, warn: 1.5 },
  debtToAssets: { higherIsBetter: false, good: 0.3, warn: 0.6 },
  marginOfSafety: { higherIsBetter: true, good: 15, warn: -10 },
  upside: { higherIsBetter: true, good: 15, warn: 0 },
  cfoPat: { higherIsBetter: true, good: 1, warn: 0.6 },
  salesGrowth: { higherIsBetter: true, good: 15, warn: 0 },
  profitGrowth: { higherIsBetter: true, good: 15, warn: 0 },
  score: { higherIsBetter: true, good: 70, warn: 50 },
}

export function getMetricStatus(key: MetricKey, value: number | null | undefined): MetricTone {
  if (value == null || !Number.isFinite(value)) return 'neutral'
  const { higherIsBetter, good, warn } = METRIC_BENCHMARKS[key]
  if (higherIsBetter) {
    if (value >= good) return 'good'
    if (value >= warn) return 'warn'
    return 'bad'
  }
  if (value <= good) return 'good'
  if (value <= warn) return 'warn'
  return 'bad'
}

const COLOR_CLASS: Record<MetricTone, string> = {
  good: 'text-emerald-400',
  warn: 'text-amber-400',
  bad: 'text-red-400',
  info: 'text-cyan-400',
  neutral: 'text-slate-400',
}

/** Tailwind text colour for a tone. */
export function getMetricColorClass(tone: MetricTone): string {
  return COLOR_CLASS[tone]
}

const STATUS_TEXT: Record<MetricTone, string> = {
  good: 'Good',
  warn: 'Watch',
  bad: 'Poor',
  info: 'Info',
  neutral: '—',
}

/** Accessible text label shown next to the colour (never colour alone). */
export function getMetricStatusText(tone: MetricTone): string {
  return STATUS_TEXT[tone]
}

/** A screener peer symbol is only linkable to our stock route when it is a ticker. */
export function isTickerSymbol(symbol: string | null | undefined): symbol is string {
  return Boolean(symbol && /[A-Z]/.test(symbol) && /^[A-Z0-9&.-]{1,20}$/.test(symbol))
}
