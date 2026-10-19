import { NextResponse } from 'next/server'
import { ensureStockDetail } from '@/lib/stocks'
import { buildListStockView } from '@/lib/view-summary'
import { compareValuesForView } from '@/lib/compare-data'

export const dynamic = 'force-dynamic'

/**
 * Read-only compare row for a single symbol.
 *
 * The `/compare` universe is scoped to one scanner, but the header search (like
 * the detail page's) is global. This lets the terminal pull the KPI values for a
 * stock that is not part of the active scanner.
 *
 * It reuses the exact detail-page loader (`ensureStockDetail`), so a symbol that
 * was never scraped — or whose snapshot predates full detail parsing — is
 * fetched and persisted on demand, then its view is mapped to the compare
 * taxonomy. This is what makes "search a stock, add it" show real numbers
 * instead of blanks without first visiting the stock page.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol).trim()
  if (!symbol) return NextResponse.json({ ok: false, error: 'Missing symbol.' }, { status: 400 })

  try {
    // Loads the saved stock, or scrapes + persists it when missing/stale — the
    // same call the `/stocks/[symbol]` page makes before rendering.
    const stock = await ensureStockDetail(symbol)
    if (!stock) return NextResponse.json({ ok: false, error: 'Stock not found.' }, { status: 404 })

    const list = buildListStockView({ symbol: stock.symbol, companyName: stock.companyName }, stock.fundamentals[0] ?? null)
    const view = list.view

    return NextResponse.json({
      ok: true,
      row: {
        symbol: stock.symbol,
        name: stock.companyName || stock.symbol,
        ltp: view.price ?? null,
        iv: view.valuation.intrinsic ?? null,
        upside: view.valuation.upside ?? null,
        score: view.score ?? null,
        values: compareValuesForView(list),
      },
    })
  } catch (error) {
    console.error('[stocks/compare] lookup failed', error)
    return NextResponse.json({ ok: false, error: 'Lookup is temporarily unavailable.' }, { status: 500 })
  }
}
