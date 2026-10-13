/**
 * Security-identity helpers.
 *
 * screener.in addresses companies by `/company/<slug>/` where the slug is usually
 * the NSE/BSE symbol — but some rows (and some redirects) use a bare numeric
 * company id, e.g. `/company/2726/`. A numeric slug is NOT a tradable ticker, and
 * showing it next to real symbols invites mistaking it for an NSE code. Callers
 * use these helpers to label such rows honestly instead of presenting them as
 * ordinary tickers.
 */

const NUMERIC_SYMBOL = /^\d+$/

export function isNumericSymbol(symbol: string | null | undefined): boolean {
  return !!symbol && NUMERIC_SYMBOL.test(symbol.trim())
}

export type SymbolIdentity = {
  symbol: string
  numeric: boolean
  /** Label safe to render in a table: flagged when the code is unresolved. */
  label: string
  note: string | null
}

export function symbolIdentity(symbol: string): SymbolIdentity {
  if (isNumericSymbol(symbol)) {
    return {
      symbol,
      numeric: true,
      label: `#${symbol}`,
      note: 'Unresolved numeric source id — not a verified exchange ticker.',
    }
  }
  return { symbol, numeric: false, label: symbol, note: null }
}
