/**
 * Server-side Yahoo Finance price-history fetcher, shared by the stock-page chart
 * API route and the homepage BUY screener (which needs a stock's volume to confirm
 * a fundamental BUY). Normalises Yahoo's chart payload into a flat bar series and
 * lets Next cache each request for 30 minutes.
 */

export type PricePoint = {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type PriceHistory = {
  /** The resolved exchange-suffixed ticker, e.g. RELIANCE.NS. */
  symbol: string
  currency: string
  points: PricePoint[]
}

export type HistoryQuery = { interval?: string; range?: string }

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: { currency?: string; gmtoffset?: number }
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          open?: (number | null)[]
          high?: (number | null)[]
          low?: (number | null)[]
          close?: (number | null)[]
          volume?: (number | null)[]
        }>
      }
    }>
    error?: unknown
  }
}

export const HISTORY_INTERVALS = new Set(['1d', '1wk', '1mo'])
export const HISTORY_RANGES = new Set(['1y', '5y', '10y', 'max'])

/** Build the exchange-suffixed symbol candidates to try, NSE first then BSE. */
export function candidateSymbols(raw: string): string[] {
  const clean = decodeURIComponent(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.&-]/g, '')
  if (!clean) return []
  if (/\.(NS|BO)$/.test(clean)) return [clean]
  // NSE/BSE first, then the NSE SME ("-SM") series used by Emerge-listed tickers.
  return [`${clean}.NS`, `${clean}-SM.NS`, `${clean}.BO`, `${clean}-SM.BO`]
}

/**
 * Fetches Yahoo Finance's public chart endpoint and normalises it into a flat
 * `{ time, open, high, low, close, volume }` series. Tries the NSE suffix first,
 * then falls back to BSE for BSE-only / SME tickers. Returns null when no
 * exchange suffix resolves so callers can decide how to degrade.
 */
export async function fetchPriceHistory(raw: string, query: HistoryQuery = {}): Promise<PriceHistory | null> {
  const candidates = candidateSymbols(raw)
  if (!candidates.length) return null

  const interval = query.interval ?? '1mo'
  const range = query.range ?? '5y'

  for (const symbol of candidates) {
    try {
      const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`
      const response = await fetch(endpoint, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
          Accept: 'application/json',
        },
        next: { revalidate: 1800 },
      })
      if (!response.ok) continue

      const data = (await response.json()) as YahooChart
      const result = data.chart?.result?.[0]
      const quote = result?.indicators?.quote?.[0]
      const timestamp = result?.timestamp
      if (!result || !quote || !timestamp) continue

      const offset = result.meta?.gmtoffset ?? 0
      const points: PricePoint[] = []
      for (let index = 0; index < timestamp.length; index++) {
        const stamp = timestamp[index]
        const close = quote.close?.[index]
        const volume = quote.volume?.[index]
        if (stamp == null || close == null || volume == null) continue
        points.push({
          time: new Date((stamp + offset) * 1000).toISOString().slice(0, 10),
          open: quote.open?.[index] ?? close,
          high: quote.high?.[index] ?? close,
          low: quote.low?.[index] ?? close,
          close,
          volume,
        })
      }
      if (!points.length) continue

      return { symbol, currency: result.meta?.currency ?? 'INR', points }
    } catch {
      // Try the next exchange suffix before giving up.
    }
  }

  return null
}
