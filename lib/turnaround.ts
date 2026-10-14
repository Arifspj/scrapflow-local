import { rowLabelMatches, type DetailRow, type DetailTable, type ScreenerDetail } from './scrapers/screener-detail'
import { annualSeriesWithLabels, assessGrowth, type GrowthReading } from './growth-quality'

/**
 * Turnaround detection.
 *
 * A "turnaround" is a *verified* improvement in the operating business, not a
 * single flattering ratio. This module only ever reports signals that can be
 * read straight from the saved annual statements (loss→profit, operating-margin
 * expansion, sales+profit recovery, operating cash turning positive / improving,
 * borrowings coming down). It deliberately refuses to call a lone signal a
 * turnaround — one improving line can be a one-off — so `genuine` requires either
 * a strong signal or at least two independent ones.
 *
 * What it cannot see: exceptional / one-off items, discontinued operations and
 * restructuring, because those are not in the saved statement rows. When an
 * assessment is surfaced as genuine the caller shows a caveat saying so.
 */

export type TurnaroundStrength = 'strong' | 'moderate'

export type TurnaroundSignal = {
  key: string
  label: string
  detail: string
  strength: TurnaroundStrength
}

export type TurnaroundAssessment = {
  signals: TurnaroundSignal[]
  /** 0–100 composite of the signal strengths. */
  score: number
  /** True only when the improvement is corroborated (strong or ≥2 signals). */
  genuine: boolean
  note: string | null
  caveat: string | null
}

const STRONG_POINTS = 40
const MODERATE_POINTS = 20
const MARGIN_STRONG_DELTA = 5
const MARGIN_SIGNAL_DELTA = 2
const DEBT_REDUCTION_RATIO = 0.1
const SALES_FLOOR_PCT = -5

function toNumber(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const numeric = Number(match[0])
  return Number.isFinite(numeric) ? numeric : null
}

function findRow(table: DetailTable | null | undefined, label: string): DetailRow | undefined {
  if (!table) return undefined
  return table.rows.find((row) => rowLabelMatches(row.label, label))
}

type AnnualPoint = { label: string; sales: number | null; profit: number | null; opm: number | null }

/** Annual sales / profit / operating-margin points, aligned by column, TTM dropped. */
function annualPoints(detail: ScreenerDetail | null | undefined): AnnualPoint[] {
  const table = detail?.profitLoss
  if (!table) return []
  const salesRow = findRow(table, 'sales')
  const opRow = findRow(table, 'operating profit')
  const profitRow = findRow(table, 'net profit')
  const points: AnnualPoint[] = []
  table.columns.forEach((column, index) => {
    if (/ttm/i.test(column)) return
    const sales = salesRow ? toNumber(salesRow.values[index]) : null
    const op = opRow ? toNumber(opRow.values[index]) : null
    const profit = profitRow ? toNumber(profitRow.values[index]) : null
    if (sales == null && op == null && profit == null) return
    const opm = sales != null && sales > 0 && op != null ? (op / sales) * 100 : null
    points.push({ label: column, sales, profit, opm })
  })
  return points
}

function readingFromPoints(
  points: AnnualPoint[],
  selector: (point: AnnualPoint) => number | null,
  metric: string,
): GrowthReading | null {
  const series = points
    .map((point) => ({ value: selector(point), label: point.label }))
    .filter((entry): entry is { value: number; label: string } => entry.value != null)
  if (!series.length) return null
  const latest = series[series.length - 1]
  const prior = series.length >= 2 ? series[series.length - 2] : null
  return assessGrowth({
    metric,
    current: latest.value,
    previous: prior ? prior.value : null,
    currentPeriod: latest.label,
    previousPeriod: prior ? prior.label : null,
  })
}

function fmtCr(value: number): string {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr`
}

function pct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

export function assessTurnaround(detail: ScreenerDetail | null | undefined): TurnaroundAssessment | null {
  if (!detail) return null
  const points = annualPoints(detail)
  const signals: TurnaroundSignal[] = []

  const profitReading = readingFromPoints(points, (point) => point.profit, 'Net profit')
  const salesReading = readingFromPoints(points, (point) => point.sales, 'Sales')

  if (profitReading?.status === 'loss-to-profit') {
    signals.push({
      key: 'loss-to-profit',
      label: 'Loss to profit',
      strength: 'strong',
      detail: `Net profit ${fmtCr(profitReading.current!)} in ${profitReading.currentPeriod} vs a loss of ${fmtCr(Math.abs(profitReading.previous!))} in ${profitReading.previousPeriod}.`,
    })
  }

  const margins = points.filter((point) => point.opm != null)
  if (margins.length >= 2) {
    const latest = margins[margins.length - 1]
    const prior = margins[margins.length - 2]
    const delta = latest.opm! - prior.opm!
    if (delta >= MARGIN_SIGNAL_DELTA) {
      signals.push({
        key: 'margin-expansion',
        label: 'Operating margin expanding',
        strength: delta >= MARGIN_STRONG_DELTA ? 'strong' : 'moderate',
        detail: `Operating margin ${prior.opm!.toFixed(1)}% (${prior.label}) → ${latest.opm!.toFixed(1)}% (${latest.label}), +${delta.toFixed(1)} pp.`,
      })
    }
  }

  if (
    profitReading?.status === 'ok' &&
    profitReading.comparable &&
    profitReading.pct != null &&
    profitReading.pct > 0 &&
    salesReading?.status === 'ok' &&
    salesReading.comparable &&
    salesReading.pct != null &&
    salesReading.pct > 0
  ) {
    signals.push({
      key: 'growth-recovery',
      label: 'Sales and profit rising',
      strength: 'moderate',
      detail: `Sales ${pct(salesReading.pct)} and net profit ${pct(profitReading.pct)} YoY (${profitReading.previousPeriod} → ${profitReading.currentPeriod}).`,
    })
  }

  const cfo = annualSeriesWithLabels(detail.cashFlow, 'cash from operating')
  if (cfo.length >= 2) {
    const latest = cfo[cfo.length - 1]
    const prior = cfo[cfo.length - 2]
    if (prior.value < 0 && latest.value >= 0) {
      signals.push({
        key: 'cash-flow-turning-positive',
        label: 'Operating cash turning positive',
        strength: 'moderate',
        detail: `Operating cash flow ${fmtCr(prior.value)} (${prior.label}) → ${fmtCr(latest.value)} (${latest.label}).`,
      })
    } else if (latest.value > prior.value && latest.value > 0) {
      signals.push({
        key: 'cash-flow-improving',
        label: 'Operating cash improving',
        strength: 'moderate',
        detail: `Operating cash flow ${fmtCr(prior.value)} (${prior.label}) → ${fmtCr(latest.value)} (${latest.label}).`,
      })
    }
  }

  const borrowings = annualSeriesWithLabels(detail.balanceSheet, 'borrowings')
  if (borrowings.length >= 2) {
    const latest = borrowings[borrowings.length - 1]
    const prior = borrowings[borrowings.length - 2]
    if (prior.value > 0 && latest.value < prior.value) {
      const reduction = (prior.value - latest.value) / prior.value
      const salesHoldingUp = !(salesReading?.comparable && salesReading.pct != null && salesReading.pct < SALES_FLOOR_PCT)
      if (reduction >= DEBT_REDUCTION_RATIO && salesHoldingUp) {
        signals.push({
          key: 'debt-reduction',
          label: 'Borrowings reducing',
          strength: 'moderate',
          detail: `Borrowings ${fmtCr(prior.value)} (${prior.label}) → ${fmtCr(latest.value)} (${latest.label}), −${(reduction * 100).toFixed(0)}%.`,
        })
      }
    }
  }

  if (!signals.length) return null

  const strongCount = signals.filter((signal) => signal.strength === 'strong').length
  const genuine = strongCount >= 1 || signals.length >= 2
  const score = Math.min(100, strongCount * STRONG_POINTS + (signals.length - strongCount) * MODERATE_POINTS)

  let note: string | null = null
  if (!genuine) {
    note = 'Only one improving signal — could be a one-off; not shown as a turnaround.'
  } else if (profitReading?.status === 'loss-to-profit' && salesReading?.comparable && (salesReading.pct ?? 0) < 0) {
    note = 'Profit recovered while sales are still falling — verify exceptional or one-off items.'
  }

  const caveat = genuine
    ? 'Exceptional / one-off items cannot be identified from saved fundamentals; confirm against the filings.'
    : null

  return { signals, score, genuine, note, caveat }
}
