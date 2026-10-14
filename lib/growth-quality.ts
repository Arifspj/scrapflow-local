import { rowLabelMatches, type DetailTable } from './scrapers/screener-detail'

/**
 * Growth-quality assessment.
 *
 * A raw percentage change is only meaningful when the comparison base is a real,
 * same-sign, non-trivial number. Both the annual and quarterly growth helpers in
 * this codebase use the "absolute base" convention (`(current - previous) / |previous|`),
 * which is correct for sign handling but explodes when `previous` is a tiny value
 * or a loss — e.g. a swing from −0.5 Cr to +34 Cr reads as +6,900%. Ranking that
 * as "strong acceleration" is misleading, so every growth figure shown on the
 * dashboard is paired with this assessment: the absolute values, the periods
 * compared and whether the percentage is actually comparable.
 */

export const EXTREME_GROWTH_PCT = 1000

export type GrowthStatus =
  | 'ok'
  | 'missing'
  | 'zero-base'
  | 'loss-to-profit'
  | 'loss-to-loss'
  | 'extreme'

export type GrowthReading = {
  metric: string
  current: number | null
  previous: number | null
  currentPeriod: string | null
  previousPeriod: string | null
  pct: number | null
  status: GrowthStatus
  comparable: boolean
  note: string | null
}

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value)
}

function toNumber(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const numeric = Number(match[0])
  return Number.isFinite(numeric) ? numeric : null
}

export function assessGrowth(input: {
  metric?: string
  current: number | null
  previous: number | null
  currentPeriod?: string | null
  previousPeriod?: string | null
}): GrowthReading {
  const { metric = '', current, previous, currentPeriod = null, previousPeriod = null } = input

  if (!finite(current) || !finite(previous)) {
    return { metric, current, previous, currentPeriod, previousPeriod, pct: null, status: 'missing', comparable: false, note: 'Comparison period not available.' }
  }
  if (previous === 0) {
    return { metric, current, previous, currentPeriod, previousPeriod, pct: null, status: 'zero-base', comparable: false, note: 'Prior period was zero, so a percentage change cannot be computed.' }
  }
  if (previous < 0) {
    const status: GrowthStatus = current >= 0 ? 'loss-to-profit' : 'loss-to-loss'
    return {
      metric,
      current,
      previous,
      currentPeriod,
      previousPeriod,
      pct: null,
      status,
      comparable: false,
      note: current >= 0 ? 'Prior period was a loss, so percentage growth is not meaningful.' : 'Both periods were losses; percentage growth is not meaningful.',
    }
  }

  const pct = ((current - previous) / Math.abs(previous)) * 100
  if (Math.abs(pct) > EXTREME_GROWTH_PCT) {
    return { metric, current, previous, currentPeriod, previousPeriod, pct, status: 'extreme', comparable: false, note: 'Very low base period, so the percentage is not directly comparable.' }
  }
  return { metric, current, previous, currentPeriod, previousPeriod, pct, status: 'ok', comparable: true, note: null }
}

/** Chronological annual values for a row with their column labels, TTM dropped. */
export function annualSeriesWithLabels(table: DetailTable | null | undefined, label: string): { value: number; label: string }[] {
  if (!table) return []
  const row = table.rows.find((entry) => rowLabelMatches(entry.label, label))
  if (!row) return []
  const out: { value: number; label: string }[] = []
  table.columns.forEach((column, index) => {
    if (/ttm/i.test(column)) return
    const value = toNumber(row.values[index])
    if (value != null) out.push({ value, label: column })
  })
  return out
}

/**
 * YoY reading for the latest annual period of a statement row, including the two
 * periods compared so the UI can show why a figure is (or is not) comparable.
 */
export function annualGrowthReading(table: DetailTable | null | undefined, label: string, metric?: string): GrowthReading | null {
  const series = annualSeriesWithLabels(table, label)
  if (!series.length) return null
  const latest = series[series.length - 1]
  const prior = series.length >= 2 ? series[series.length - 2] : null
  return assessGrowth({
    metric: metric ?? label,
    current: latest.value,
    previous: prior ? prior.value : null,
    currentPeriod: latest.label,
    previousPeriod: prior ? prior.label : null,
  })
}
