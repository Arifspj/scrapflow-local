import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimited } from '@/lib/scrapers/resolve'
import {
  normalizeSearchQuery,
  rankSuggestions,
  SEARCH_CANDIDATE_LIMIT,
  SEARCH_MIN_QUERY,
} from '@/lib/stock-search'

export const dynamic = 'force-dynamic'

/**
 * Read-only stock autocomplete for the public header search.
 *
 * Scope guards (this endpoint must never trigger work beyond a bounded query):
 *  - no scraping, imports, financial calculations or external requests,
 *  - the query is normalized and length-bounded,
 *  - candidates come from the persisted Stock table only, capped, then ranked,
 *  - unresolved numeric source ids are filtered out by `rankSuggestions`,
 *  - internal errors are logged server-side and never returned to the client.
 */
export async function GET(request: Request) {
  const query = normalizeSearchQuery(new URL(request.url).searchParams.get('q'))
  if (query.length < SEARCH_MIN_QUERY) {
    return NextResponse.json({ ok: true, query, results: [] })
  }

  const clientKey = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous'
  if (rateLimited(`search:${clientKey}`, 90, 60_000)) {
    return NextResponse.json({ ok: false, query, results: [], error: 'Too many searches; please slow down.' }, { status: 429 })
  }

  try {
    const candidates = await prisma.stock.findMany({
      where: {
        OR: [
          { symbol: { contains: query, mode: 'insensitive' } },
          { companyName: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { symbol: true, companyName: true, exchange: true },
      take: SEARCH_CANDIDATE_LIMIT,
    })

    return NextResponse.json({ ok: true, query, results: rankSuggestions(candidates, query) })
  } catch (error) {
    console.error('[stocks/search] query failed', error)
    return NextResponse.json({ ok: false, query, results: [], error: 'Search is temporarily unavailable.' }, { status: 500 })
  }
}
