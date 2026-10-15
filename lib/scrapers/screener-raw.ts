import { parseScreenerScreen } from './screener'
import { isScreenerAuthPage } from './screener-auth'
import type { ParseResult } from './types'

export const SCREENER_RAW_PARSER_VERSION = 'screener-raw@1.0.0'

/**
 * Parser for screener.in "raw query" result pages
 * (`/screen/raw/?source_id=…&query=…`).
 *
 * These are the query behind a saved screen and — unlike a public
 * `/screens/<id>/…/` page — are **login-gated**: an anonymous fetch is
 * redirected to `/register/`. The result DOM is the same company `data-table`
 * with `/company/<code>/` links, so row extraction reuses `parseScreenerScreen`;
 * only the authentication guard is added here. Pagination (`?page=N`) is handled
 * by the collector, exactly like the public screens.
 *
 * Some rows link by a numeric BSE/warehouse code (e.g. `/company/544765/`)
 * instead of a ticker; those are kept as-is and resolved (or dropped) by the
 * importer, never invented.
 */
export function parseScreenerRawSource(html: string): ParseResult {
  if (isScreenerAuthPage(html)) {
    return {
      kind: 'screener-raw-screen',
      parserVersion: SCREENER_RAW_PARSER_VERSION,
      symbols: [],
      fundamentals: null,
      warnings: ['Screener.in returned its sign-in page — the raw query needs an authenticated session (SCREENER_EMAIL / SCREENER_PASSWORD).'],
    }
  }

  const base = parseScreenerScreen(html)
  return {
    kind: 'screener-raw-screen',
    parserVersion: SCREENER_RAW_PARSER_VERSION,
    symbols: base.symbols,
    fundamentals: null,
    warnings: base.warnings,
  }
}
