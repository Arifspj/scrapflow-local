import { toNumber } from './stock-detail'
import { findRow, type DetailTable } from './scrapers/screener-detail'

/**
 * Quarter-over-quarter and year-over-year growth for quarterly statements.
 *
 * Mirrors the reference implementation (QoQ = latest reported quarter vs the
 * immediately previous quarter; YoY = latest vs the SAME quarter one year
 * earlier, i.e. 4 columns back in a quarterly table). Percentages use the
 * absolute value of the base so a switch from a loss to a profit reads
 * positively; a zero/non-numeric base never yields a fabricated figure.
 */

export type GrowthKey = 'sales' | 'operatingProfit' | 'netProfit'

const GROWTH_ROWS: Record<GrowthKey, string> = {
  sales: 'sales',
  operatingProfit: 'operating profit',
  netProfit: 'net profit',
}

export type GrowthPeriod = {
  /** Percentage change vs the comparison quarter, or null when uncomputable. */
  pct: number | null
  /** Latest reported value (₹ Cr). */
  current: number | null
  /** Comparison value (₹ Cr). */
  previous: number | null
}

export type GrowthSummary = {
  latest: string | null
  qoqPrevious: string | null
  yoySame: string | null
  qoq: Record<GrowthKey, GrowthPeriod>
  yoy: Record<GrowthKey, GrowthPeriod>
}

/** `((current - previous) / |previous|) × 100`. Null for a missing or zero base. */
export function growthPercent(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

function valueAt(values: (number | null)[], label: string | null, index: number): { value: number | null; label: string | null } {
  if (index == null || index < 0 || index >= values.length) return { value: null, label }
  return { value: values[index], label }
}

/**
 * Latest vs previous quarterly values, using the nearest available non-null
 * quarters so a single missing cell does not blank out the whole comparison.
 */
function changesFor(values: (number | null)[], columns: string[]): { qoq: GrowthPeriod; yoy: GrowthPeriod } {
  const indexes = values
    .map((value, index) => (value == null ? -1 : index))
    .filter((index) => index >= 0)
  const lastIndex = indexes[indexes.length - 1]
  const previousIndex = indexes[indexes.length - 2]
  const yoyIndex = lastIndex != null ? lastIndex - 4 : -1

  const latest = lastIndex != null ? valueAt(values, columns[lastIndex] ?? null, lastIndex) : { value: null, label: null }
  const previous = previousIndex != null ? valueAt(values, columns[previousIndex] ?? null, previousIndex) : { value: null, label: null }
  const sameYear = yoyIndex >= 0 ? valueAt(values, columns[yoyIndex] ?? null, yoyIndex) : { value: null, label: null }

  return {
    qoq: {
      pct: growthPercent(latest.value, previous.value),
      current: latest.value,
      previous: previous.value,
    },
    yoy: {
      pct: growthPercent(latest.value, sameYear.value),
      current: latest.value,
      previous: sameYear.value,
    },
  }
}

/** Derive QoQ/YoY for Sales, Operating Profit and Net Profit from a quarters table. */
export function computeQuarterGrowth(table: DetailTable | null | undefined): GrowthSummary | null {
  if (!table || !table.rows.length) return null
  const columns = table.columns.filter((column) => !/ttm/i.test(column))
  if (!columns.length) return null

  const qoq = {} as Record<GrowthKey, GrowthPeriod>
  const yoy = {} as Record<GrowthKey, GrowthPeriod>
  for (const key of Object.keys(GROWTH_ROWS) as GrowthKey[]) {
    const row = findRow(table, GROWTH_ROWS[key])
    const values = columns.map((_column, index) => (row ? toNumber(row.values[index]) : null))
    const changes = changesFor(values, columns)
    qoq[key] = changes.qoq
    yoy[key] = changes.yoy
  }

  const latestIndex = columns.length - 1
  return {
    latest: columns[latestIndex] ?? null,
    qoqPrevious: columns[latestIndex - 1] ?? null,
    yoySame: latestIndex - 4 >= 0 ? (columns[latestIndex - 4] ?? null) : null,
    qoq,
    yoy,
  }
}