import { toNumber } from './stock-detail'
import { findRow, type DetailRow, type DetailTable } from './scrapers/screener-detail'

/**
 * Metric-aware trend colours for the Quarterly Results and Annual Profit &
 * Loss tables.
 *
 * The rules are deliberately asymmetric: rising sales/profits/margins are
 * favourable, but rising expenses and interest can be risk signals. A value is
 * only coloured when both the current and the previous comparable period are
 * present and the direction is unambiguous – missing or zero-base data never
 * gets coloured as if it were a trend.
 */

export type TrendTone = 'good' | 'warn' | 'bad' | 'neutral'

export type TrendResult = { tone: TrendTone; note: string | null }

/** Documented, configurable thresholds for "meaningful" changes. */
export const TREND_CONFIG = {
  /** |Δ| below this per cent is treated as a marginal/flat change (amber). */
  insignificantPct: 3,
  /** Expenses may rise above sales growth up to this per cent before turning red. */
  expensePressurePct: 5,
  /** Interest may rise above operating-profit growth up to this per cent before red. */
  interestPressurePct: 3,
} as const

export type TrendCategory = 'growth' | 'expense' | 'interest' | 'balance' | 'cashflow' | 'unknown'

const INTEREST_LABEL = /interest|finance costs?/i
const EXPENSE_LABEL =
  /expenses?$|cost of materials|cost of sales|raw material|purchase of|employee costs?|other expenses|total expenses|power and fuel|cost of goods/i
const GROWTH_LABEL =
  /^sales$|operating profit|net profit|profit before tax|profit\/tax|eps|other income|profit before depreciation|profit after tax/i
const MARGIN_LABEL = /opm|operating margin|\% margin|roce|roe/i
/** Balance-sheet obligations: less is better for an investor. */
const BALANCE_LOWER_LABEL = /^borrowings|^debt|other liabilities|trade payables|creditors/i
/** Balance-sheet strength/growth: more is better for an investor. */
const BALANCE_HIGHER_LABEL = /^reserves|total assets|^investments|fixed assets|net worth|shareholders? funds/i
/** Cash-flow strength: rising operating / net / free cash flow is favourable. */
const CASHFLOW_HIGHER_LABEL = /cash from operating|cash from operations|operating cash flow|^net cash flow|free cash flow/i

export function classifyLabel(label: string): { category: TrendCategory; direction: 'higher-better' | 'lower-better' } {
  const trimmed = label.toLowerCase().trim()
  if (INTEREST_LABEL.test(trimmed)) return { category: 'interest', direction: 'lower-better' }
  if (EXPENSE_LABEL.test(trimmed)) return { category: 'expense', direction: 'lower-better' }
  if (GROWTH_LABEL.test(trimmed) || MARGIN_LABEL.test(trimmed)) return { category: 'growth', direction: 'higher-better' }
  if (CASHFLOW_HIGHER_LABEL.test(trimmed)) return { category: 'cashflow', direction: 'higher-better' }
  if (BALANCE_LOWER_LABEL.test(trimmed)) return { category: 'balance', direction: 'lower-better' }
  if (BALANCE_HIGHER_LABEL.test(trimmed)) return { category: 'balance', direction: 'higher-better' }
  return { category: 'unknown', direction: 'higher-better' }
}

function percentChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/** Next-earlier non-TTM column index for a cell, or -1 when none exists. */
function previousComparableIndex(columns: string[], valueIndex: number): number {
  for (let index = valueIndex - 1; index >= 0; index -= 1) {
    if (!/ttm/i.test(columns[index])) return index
  }
  return -1
}

function rowChange(row: DetailRow | undefined, previousIndex: number, valueIndex: number): number | null {
  if (!row) return null
  return percentChange(toNumber(row.values[valueIndex]), toNumber(row.values[previousIndex]))
}

function sign(value: number): string {
  return value >= 0 ? '+' : '−'
}

/**
 * Colour a single cell of a financial statement table by comparing it with the
 * previous comparable reporting period. Returns neutral when the comparison is
 * not available or the row's direction cannot be judged safely.
 */
export function financialCellTrend(table: DetailTable, row: DetailRow, valueIndex: number): TrendResult {
  const column = table.columns[valueIndex]
  if (!column || /ttm/i.test(column)) return { tone: 'neutral', note: null }

  const { category, direction } = classifyLabel(row.label)
  if (category === 'unknown') return { tone: 'neutral', note: null }

  const previousIndex = previousComparableIndex(table.columns, valueIndex)
  if (previousIndex < 0) return { tone: 'neutral', note: null }

  const current = toNumber(row.values[valueIndex])
  const previous = toNumber(row.values[previousIndex])
  const pct = percentChange(current, previous)
  if (pct == null) return { tone: 'neutral', note: null } // missing value or zero base: never colour

  const previousColumn = table.columns[previousIndex]
  const metric = row.label.toLowerCase().trim()

  if (category === 'interest' || category === 'expense') {
    const anchorLabel = category === 'interest' ? 'operating profit' : 'sales'
    const anchor = findRow(table, anchorLabel)
    const anchorPct = rowChange(anchor, previousIndex, valueIndex)
    if (anchorPct == null) return { tone: 'neutral', note: null }

    const pressurePct = category === 'interest' ? TREND_CONFIG.interestPressurePct : TREND_CONFIG.expensePressurePct
    const difference = pct - anchorPct
    const tone: TrendTone = difference <= 0 ? 'good' : difference > pressurePct ? 'bad' : 'warn'
    const directionWord = pct >= 0 ? 'rose' : 'fell'
    const anchorWord = anchorPct >= 0 ? 'rose' : 'fell'
    return {
      tone,
      note:
        `${metric} ${directionWord} ${sign(pct)}${Math.abs(pct).toFixed(1)}% vs ${previousColumn} ` +
        `(${anchorLabel} ${anchorWord} ${sign(anchorPct)}${Math.abs(anchorPct).toFixed(1)}%)`,
    }
  }

  const tone: TrendTone =
    direction === 'higher-better'
      ? pct >= TREND_CONFIG.insignificantPct
        ? 'good'
        : pct <= -TREND_CONFIG.insignificantPct
          ? 'bad'
          : 'warn'
      : pct <= -TREND_CONFIG.insignificantPct
        ? 'good'
        : pct >= TREND_CONFIG.insignificantPct
          ? 'bad'
          : 'warn'
  const word = direction === 'higher-better' ? (pct >= 0 ? 'increased' : 'decreased') : pct >= 0 ? 'increased' : 'decreased'
  return { tone, note: `${metric} ${word} ${sign(pct)}${Math.abs(pct).toFixed(1)}% vs ${previousColumn}` }
}

export const TREND_TONE_CLASS: Record<TrendTone, string> = {
  good: 'text-emerald-400',
  warn: 'text-amber-400',
  bad: 'text-red-400',
  neutral: '',
}