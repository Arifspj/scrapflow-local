/**
 * Pure helpers for the bounded, resumable list enrichment.
 *
 * Kept free of database/scraper imports so the enrichment order and symbol
 * classification can be unit-tested without a running database.
 */

/** True for BSE/warehouse-style numeric codes that are not real NSE tickers. */
export function isNumericCode(symbol: string): boolean {
  return /^\d+$/.test(symbol)
}

/** Whether a stored snapshot parserVersion represents a full screener detail. */
export function isDetailSnapshot(parserVersion: string | null | undefined): boolean {
  return typeof parserVersion === 'string' && parserVersion.startsWith('screener@')
}

/**
 * Symbols still missing fundamentals, in first-seen order with duplicates
 * removed. This is the resumable cursor: already-enriched symbols never come
 * back, so a capped run keeps advancing instead of re-doing the leading rows.
 */
export function pendingEnrichmentSymbols(all: string[], enriched: Iterable<string>): string[] {
  const done = new Set(enriched)
  const seen = new Set<string>()
  const pending: string[] = []
  for (const symbol of all) {
    if (done.has(symbol) || seen.has(symbol)) continue
    seen.add(symbol)
    pending.push(symbol)
  }
  return pending
}
