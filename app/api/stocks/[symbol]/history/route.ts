import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ symbol: string }> }

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

const INTERVALS = new Set(['1d', '1wk', '1mo'])
const RANGES = new Set(['1y', '5y', '10y', 'max'])

/** Build the exchange-suffixed symbol candidates to try, NSE first then BSE. */
function candidateSymbols(raw: string): string[] {
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
 * Proxies Yahoo Finance's public chart endpoint and normalises it into a flat
 * `{ time, open, high, low, close, volume }` series. Tries the NSE suffix first,
 * then falls back to BSE for BSE-only / SME tickers. Returns 404 when neither
 * exchange has history so the client can show its empty state.
 */
export async function GET(request: Request, context: Context) {
  const raw = (await context.params).symbol ?? ''
  const candidates = candidateSymbols(raw)
  if (!candidates.length) {
    return NextResponse.json({ ok: false, error: 'A stock symbol is required.' }, { status: 400 })
  }

  const url = new URL(request.url)
  const interval = url.searchParams.get('interval') ?? '1mo'
  const range = url.searchParams.get('range') ?? '5y'
  if (!INTERVALS.has(interval) || !RANGES.has(range)) {
    return NextResponse.json({ ok: false, error: 'Unsupported interval or range.' }, { status: 400 })
  }

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
      const stamps = result?.timestamp
      if (!result || !quote || !stamps?.length) continue

      const offset = result.meta?.gmtoffset ?? 0
      const points: { time: string; open: number; high: number; low: number; close: number; volume: number }[] = []
      for (let index = 0; index < stamps.length; index += 1) {
        const stamp = stamps[index]
        const close = quote.close?.[index]
        const volume = quote.volume?.[index]
        if (stamp == null || close == null || volume == null) continue
        if (!Number.isFinite(close) || !Number.isFinite(volume)) continue
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

      return NextResponse.json({ ok: true, symbol, currency: result.meta?.currency ?? 'INR', points })
    } catch {
      // Try the next exchange suffix before giving up.
    }
  }

  return NextResponse.json({ ok: false, error: 'Historical data unavailable for this ticker.' }, { status: 404 })
}
