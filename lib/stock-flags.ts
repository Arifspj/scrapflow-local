import type { StockView } from './stock-detail'

/**
 * Structured, explainable research warnings for a stock.
 *
 * Design rules (see the dashboard forensic audit):
 *  - a flag needs a concrete value plus the period/threshold behind it,
 *  - missing data is NOT flagged (only genuinely poor, present data is),
 *  - financial businesses are exempt from the ordinary debt / cash-flow rules
 *    because their balance sheets and cash flows are structurally different,
 *  - contradictory flags are suppressed (e.g. "profit declining" is dropped
 *    when the company is already flagged "loss-making").
 */

export type StockFlag = {
  key: string
  label: string
  /** Human reason including the metric value, period and threshold. */
  detail: string
  severity: 'warn' | 'bad'
}

function pct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

/**
 * Whether any input `buildFlags` reasons about is present. Used by the UI to tell
 * "no risk was found" apart from "no risk data was available" — an empty flag
 * list means nothing when the underlying fields are all missing.
 */
export function hasRiskInputs(view: StockView, isFinancial: boolean): boolean {
  if (view.cfoPat != null) return true
  if (!isFinancial && view.debtToEquity != null) return true
  if (view.netProfit != null) return true
  if (view.roce != null) return true
  if (view.profitGrowth && view.profitGrowth.comparable && view.profitGrowth.pct != null) return true
  if (view.salesGrowth && view.salesGrowth.comparable && view.salesGrowth.pct != null) return true
  return false
}

export function buildFlags(view: StockView, isFinancial: boolean): StockFlag[] {
  const flags: StockFlag[] = []

  if (view.cfoPat != null && view.cfoPat < 0) {
    flags.push({
      key: 'cfo-negative',
      label: 'Operating cash negative',
      detail: `Latest annual CFO/PAT ${view.cfoPat.toFixed(2)} — operating cash flow is negative.`,
      severity: 'bad',
    })
  } else if (!isFinancial && view.cfoPat != null && view.cfoPat < 1) {
    flags.push({
      key: 'cfo-below-profit',
      label: 'Operating cash below profit',
      detail: `Latest annual CFO/PAT ${view.cfoPat.toFixed(2)} (< 1) — cash generation lags reported profit.`,
      severity: 'warn',
    })
  }

  if (!isFinancial && view.debtToEquity != null && view.debtToEquity > 2) {
    flags.push({
      key: 'high-leverage',
      label: 'High leverage',
      detail: `Debt/Equity ${view.debtToEquity.toFixed(2)} (> 2.0).`,
      severity: 'warn',
    })
  }

  const loss = view.netProfit != null && view.netProfit < 0
  if (loss) {
    flags.push({ key: 'loss-making', label: 'Loss-making', detail: 'Latest annual net profit is negative.', severity: 'bad' })
  }

  const profit = view.profitGrowth
  if (!loss && profit && profit.comparable && profit.pct != null && profit.pct < 0) {
    flags.push({
      key: 'profit-declining',
      label: 'Profit declining',
      detail: `Net profit ${pct(profit.pct)} YoY (${profit.previousPeriod ?? 'prior'} → ${profit.currentPeriod ?? 'latest'}).`,
      severity: 'warn',
    })
  }

  const sales = view.salesGrowth
  if (sales && sales.comparable && sales.pct != null && sales.pct < 0) {
    flags.push({
      key: 'sales-declining',
      label: 'Sales declining',
      detail: `Sales ${pct(sales.pct)} YoY (${sales.previousPeriod ?? 'prior'} → ${sales.currentPeriod ?? 'latest'}).`,
      severity: 'warn',
    })
  }

  if (view.roce != null && view.roce < 10 && view.roce >= 0) {
    flags.push({ key: 'weak-roce', label: 'Weak ROCE', detail: `ROCE ${view.roce.toFixed(1)}% (< 10%).`, severity: 'warn' })
  }

  return flags
}
