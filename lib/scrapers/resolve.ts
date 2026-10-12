import {
  cleanSymbol,
  parseScreenerCompany,
  parseScreenerSearchResults,
  pickCompanyFromSearchResults,
  symbolFromCompanyHref,
  typoCandidates,
  type ScreenerSearchResult,
} from './screener'
import type { ParsedFundamental } from './types'

const SCREENER_BASE = 'https://www.screener.in'
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export type ScrapedCompany = {
  symbol: string
  companyName: string | null
  fundamentals: ParsedFundamental | null
  sourceUrl: string
  parserVersion: string
  warnings: string[]
}

async function fetchText(url: string, timeoutMs = 12000): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': BROWSER_UA,
        accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  }
}

export async function searchScreenerCompanies(query: string): Promise<ScreenerSearchResult[]> {
  const text = await fetchText(`${SCREENER_BASE}/api/company/search/?q=${encodeURIComponent(query)}`)
  if (!text) return []
  try {
    return parseScreenerSearchResults(JSON.parse(text))
  } catch {
    return []
  }
}

/**
 * Resolve a free-text query (name / symbol / small typo) to a screener company.
 * Mirrors the extension: hit the search API, and fall back to bounded typo
 * variants when the raw query returns nothing (e.g. "reilance" -> "reliance").
 */
export async function resolveScreenerCompany(query: string): Promise<ScreenerSearchResult | null> {
  const direct = pickCompanyFromSearchResults(await searchScreenerCompanies(query), query)
  if (direct) return direct

  for (const candidate of typoCandidates(query)) {
    const hit = pickCompanyFromSearchResults(await searchScreenerCompanies(candidate), candidate)
    if (hit) return hit
  }
  return null
}

/**
 * Fetch and parse a screener company page. Resolves the query first so partial
 * names work, then falls back to treating the query itself as a symbol.
 */
export async function scrapeScreenerCompany(query: string): Promise<ScrapedCompany | null> {
  const hit = await resolveScreenerCompany(query)
  const symbol = (hit ? symbolFromCompanyHref(hit.url) : null) ?? cleanSymbol(query)
  if (!symbol) return null

  const sourceUrl = `${SCREENER_BASE}/company/${symbol}/`
  const html = await fetchText(sourceUrl)
  if (!html) return null

  const parsed = parseScreenerCompany(html, sourceUrl)
  const resolved = parsed.symbols[0]
  const finalSymbol = resolved?.symbol ?? symbol
  if (!resolved && !parsed.fundamentals) return null

  return {
    symbol: finalSymbol,
    companyName: resolved?.companyName ?? hit?.name ?? null,
    fundamentals: parsed.fundamentals,
    sourceUrl,
    parserVersion: parsed.parserVersion,
    warnings: parsed.warnings,
  }
}

const recentHits = new Map<string, number[]>()

/** Best-effort in-memory limiter (per instance) so a public search cannot hammer screener.in. */
export function rateLimited(key: string, limit = 5, windowMs = 60_000): boolean {
  const now = Date.now()
  const hits = (recentHits.get(key) ?? []).filter((time) => now - time < windowMs)
  hits.push(now)
  recentHits.set(key, hits)
  return hits.length > limit
}
