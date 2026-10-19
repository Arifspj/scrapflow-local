import { NextResponse } from 'next/server'
import { candidateSymbols, fetchPriceHistory, HISTORY_INTERVALS, HISTORY_RANGES } from '@/lib/price-history'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ symbol: string }> }

/**
 * Proxies the shared Yahoo Finance price-history fetcher for the stock-page chart.
 * Returns 400 for a blank/invalid symbol and 404 when no exchange suffix resolves,
 * so the client can show its empty state.
 */
export async function GET(request: Request, context: Context) {
  const raw = (await context.params).symbol ?? ''
  if (!candidateSymbols(raw).length) {
    return NextResponse.json({ ok: false, error: 'A stock symbol is required.' }, { status: 400 })
  }

  const url = new URL(request.url)
  const interval = url.searchParams.get('interval') ?? '1mo'
  const range = url.searchParams.get('range') ?? '5y'
  if (!HISTORY_INTERVALS.has(interval) || !HISTORY_RANGES.has(range)) {
    return NextResponse.json({ ok: false, error: 'Unsupported interval or range.' }, { status: 400 })
  }

  const history = await fetchPriceHistory(raw, { interval, range })
  if (!history) {
    return NextResponse.json({ ok: false, error: 'Historical data unavailable for this ticker.' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, ...history })
}
