/**
 * Pure helpers for the header stock autocomplete.
 *
 * The header search must suggest *real, persisted* stocks from the same
 * database that powers the Details pages — never a hardcoded list and never a
 * fabricated ticker. Matching and ordering are kept here (no Prisma import) so
 * they can be unit-tested in isolation; the API route only runs the query.
 */
import { isNumericSymbol } from './identity'

/** Below this many typed characters we do not query the database at all. */
export const SEARCH_MIN_QUERY = 2
/** Hard cap so a pathological query can never widen the scan. */
export const SEARCH_MAX_QUERY = 48
/** Maximum number of suggestions returned to the browser. */
export const SEARCH_RESULT_LIMIT = 10
/** Upper bound on candidate rows pulled from the database before ranking. */
export const SEARCH_CANDIDATE_LIMIT = 60

export type SearchCandidate = {
  symbol: string
  companyName: string | null
  exchange?: string | null
}

export type StockSuggestion = {
  symbol: string
  companyName: string
  /** Only set when the database holds a reliable exchange for this stock. */
  exchange: string | null
}

/**
 * Trim, collapse internal whitespace and bound the length of a raw query.
 * Returns '' for missing input so callers can treat "too short" uniformly.
 */
export function normalizeSearchQuery(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/\s+/g, ' ').trim().slice(0, SEARCH_MAX_QUERY)
}

function nameTokens(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9&]+/).filter(Boolean)
}

/**
 * Relevance score for one candidate against a lowercased query. Lower is
 * better; `null` means "no match, drop it".
 *
 *   0  exact symbol            -> RELIANCE
 *   1  symbol prefix           -> REL...
 *   2  symbol substring        -> ...LIAN...
 *   3  company-name prefix     -> "Reliance Industries"
 *   4  company-name word start -> "Aditya Birla ..."
 *   5  company-name substring  -> ...liance...
 */
function scoreCandidate(symbol: string, name: string, query: string): number | null {
  const s = symbol.toLowerCase()
  const n = name.toLowerCase()
  if (s === query) return 0
  if (s.startsWith(query)) return 1
  if (s.includes(query)) return 2
  if (n.startsWith(query)) return 3
  if (nameTokens(name).some((token) => token.startsWith(query))) return 4
  if (n.includes(query)) return 5
  return null
}

/**
 * Rank persisted candidates for a query and return at most `limit` suggestions.
 *
 * Unresolved numeric source ids (e.g. `544876`) are dropped: they are not
 * verified exchange tickers, so they must never appear as company suggestions.
 */
export function rankSuggestions(
  candidates: readonly SearchCandidate[],
  rawQuery: string,
  limit: number = SEARCH_RESULT_LIMIT,
): StockSuggestion[] {
  const query = normalizeSearchQuery(rawQuery).toLowerCase()
  if (query.length < SEARCH_MIN_QUERY) return []

  const scored: { score: number; suggestion: StockSuggestion }[] = []
  for (const candidate of candidates) {
    const symbol = candidate.symbol?.trim()
    if (!symbol || isNumericSymbol(symbol)) continue
    const companyName = candidate.companyName?.trim() || symbol
    const score = scoreCandidate(symbol, companyName, query)
    if (score == null) continue
    const exchange = candidate.exchange?.trim() || null
    scored.push({ score, suggestion: { symbol, companyName, exchange } })
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    if (a.suggestion.symbol.length !== b.suggestion.symbol.length) {
      return a.suggestion.symbol.length - b.suggestion.symbol.length
    }
    return a.suggestion.symbol.localeCompare(b.suggestion.symbol)
  })

  const seen = new Set<string>()
  const results: StockSuggestion[] = []
  for (const { suggestion } of scored) {
    if (seen.has(suggestion.symbol)) continue
    seen.add(suggestion.symbol)
    results.push(suggestion)
    if (results.length >= limit) break
  }
  return results
}
