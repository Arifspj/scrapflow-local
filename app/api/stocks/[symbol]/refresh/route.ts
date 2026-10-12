import { NextResponse } from 'next/server'
import { refreshStockData } from '@/lib/stocks'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ symbol: string }> }

/**
 * Manual "Refresh data" endpoint used by the header button. It re-fetches the
 * source, validates the canonical symbol, upserts the snapshot and revalidates
 * the stock page. It never scrapes more than once per symbol concurrently and
 * keeps the last known good data when the source request fails.
 */
export async function POST(_request: Request, context: Context) {
  const symbol = decodeURIComponent((await context.params).symbol ?? '').trim()
  if (!symbol) {
    return NextResponse.json({ ok: false, updatedAt: null, staleAt: null, message: 'A stock symbol is required.' }, { status: 400 })
  }

  try {
    const result = await refreshStockData(symbol)
    const status = result.ok ? 200 : result.message === 'Invalid symbol.' ? 400 : 503
    return NextResponse.json(
      { ok: result.ok, updatedAt: result.updatedAt, staleAt: result.staleAt, message: result.message },
      { status },
    )
  } catch (error) {
    console.error(`[refresh] unexpected failure for ${symbol}`, error)
    return NextResponse.json(
      { ok: false, updatedAt: null, staleAt: null, message: 'Refresh could not be completed; existing data was kept.' },
      { status: 500 },
    )
  }
}