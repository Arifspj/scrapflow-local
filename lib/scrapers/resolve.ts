import { cleanSymbol, parseScreenerCompany, parseScreenerSearchResults, pickCompanyFromSearchResults, symbolFromCompanyHref, typoCandidates, type ScreenerSearchResult } from './screener'
import { findRow, latestRowNumber, parsePeers, parseScreenerDetail, type ScreenerDetail } from './screener-detail'
import { screenerFetchText } from './screener-auth'
import type { ParsedFundamental } from './types'

const SCREENER_BASE = 'https://www.screener.in'

/**
 * Fetch and attach the peer-comparison table for a company. Best-effort: on any
 * failure we record an error and mark peers as an empty (attempted) list so the
 * page never retries on every render.
 */
async function attachPeers(detail: ScreenerDetail): Promise<void> {
  if (!detail.warehouseId) {
    detail.peers = []
    detail.peersError = 'Peer data unavailable (no warehouse id on the company page).'
    return
  }
  try {
    const url = `${SCREENER_BASE}/api/company/${encodeURIComponent(detail.warehouseId)}/peers/`
    const peerHtml = await screenerFetchText(url)
    if (!peerHtml) {
      detail.peers = []
      detail.peersError = 'Peer request failed.'
      return
    }
    const peers = parsePeers(peerHtml, detail.companyId)
    detail.peers = peers
    detail.peersError = peers.length ? null : 'No peer rows were returned.'
  } catch (error) {
    detail.peers = []
    detail.peersError = error instanceof Error ? error.message : 'Peer request failed.'
  }
}

export type ScrapedCompany = {
  symbol: string
  companyName: string | null
  fundamentals: ParsedFundamental | null
  detail: ScreenerDetail | null
  sourceUrl: string
  parserVersion: string
  warnings: string[]
}

async function searchScreener(query: string): Promise<ScreenerSearchResult[]> {
  const text = await screenerFetchText(`${SCREENER_BASE}/api/company/search/?q=${encodeURIComponent(query)}`)
  if (!text) return []
  try {
    return parseScreenerSearchResults(JSON.parse(text))
  } catch {
    return []
  }
}

export async function searchScreenerCompanies(query: string): Promise<ScreenerSearchResult[]> {
  return searchScreener(query)
}

/**
 * Resolve a free-text query (name / symbol / small typo) to a screener company.
 * Mirrors the extension: hit the search API, and fall back to bounded typo
 * variants when the raw query returns nothing (e.g. "reilance" -> "reliance").
 */
export async function resolveScreenerCompany(query: string): Promise<ScreenerSearchResult | null> {
  const direct = pickCompanyFromSearchResults(await searchScreener(query), query)
  if (direct) return direct

  for (const candidate of typoCandidates(query)) {
    const hit = pickCompanyFromSearchResults(await searchScreener(candidate), candidate)
    if (hit) return hit
  }
  return null
}

export function deriveFundamentals(detail: ScreenerDetail): ParsedFundamental {
  const { topRatios, profitLoss, balanceSheet } = detail
  const fundamentals: ParsedFundamental = {
    currentPrice: topRatios.currentPrice,
    marketCap: topRatios.marketCap,
    peRatio: topRatios.peRatio,
    bookValue: topRatios.bookValue,
    dividendYield: topRatios.dividendYield,
    roce: topRatios.roce,
    roe: topRatios.roe,
  }

  if (profitLoss) {
    fundamentals.revenue = latestRowNumber(findRow(profitLoss, 'sales'), profitLoss.columns) ?? undefined
    fundamentals.netProfit = latestRowNumber(findRow(profitLoss, 'net profit'), profitLoss.columns) ?? undefined
    fundamentals.eps = latestRowNumber(findRow(profitLoss, 'eps'), profitLoss.columns) ?? undefined
  }

  if (balanceSheet) {
    const borrowings = latestRowNumber(findRow(balanceSheet, 'borrowings'), balanceSheet.columns)
    const equity = latestRowNumber(findRow(balanceSheet, 'equity capital'), balanceSheet.columns)
    const reserves = latestRowNumber(findRow(balanceSheet, 'reserves'), balanceSheet.columns)
    if (borrowings != null && equity != null && reserves != null && equity + reserves > 0) {
      fundamentals.debtToEquity = Number((borrowings / (equity + reserves)).toFixed(2))
    }
  }

  for (const key of Object.keys(fundamentals) as (keyof ParsedFundamental)[]) {
    if (fundamentals[key] == null) delete fundamentals[key]
  }
  return fundamentals
}

/**
 * Fetch and parse a screener company page (authenticated when credentials are
 * configured). Resolves the query first so partial names work, then falls back
 * to treating the query itself as a symbol.
 */
export async function scrapeScreenerCompany(query: string): Promise<ScrapedCompany | null> {
  const hit = await resolveScreenerCompany(query)
  const symbol = (hit ? symbolFromCompanyHref(hit.url) : null) ?? cleanSymbol(query)
  if (!symbol) return null

  const sourceUrl = `${SCREENER_BASE}/company/${symbol}/`
  const html = await screenerFetchText(sourceUrl)
  if (!html) return null

  const base = parseScreenerCompany(html, sourceUrl)
  const resolved = base.symbols[0]
  const finalSymbol = resolved?.symbol ?? symbol
  const detail = parseScreenerDetail(html, sourceUrl)
  await attachPeers(detail)
  const fundamentals = deriveFundamentals(detail)
  if (!resolved && !Object.keys(fundamentals).length) return null

  return {
    symbol: finalSymbol,
    companyName: resolved?.companyName ?? hit?.name ?? null,
    fundamentals: Object.keys(fundamentals).length ? fundamentals : null,
    detail,
    sourceUrl,
    parserVersion: base.parserVersion,
    warnings: base.warnings,
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
