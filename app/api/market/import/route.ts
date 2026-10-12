import { NextResponse } from 'next/server'
import { normalizeMarketSegments } from '@/lib/category'
import { importMarketCategory } from '@/lib/category-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Import (or re-import) a screener.in industry/category listing. Walks every
 * page, then persists the companies as members of the category. A partial run is
 * reported honestly and leaves prior data intact so a retry can finish it.
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const raw = (body as { segments?: unknown } | null)?.segments
  const segments = normalizeMarketSegments(Array.isArray(raw) ? raw.map((value) => String(value)) : [])
  if (!segments) {
    return NextResponse.json({ ok: false, error: 'A valid market category path is required.' }, { status: 400 })
  }

  try {
    const { report, persisted } = await importMarketCategory(segments)
    return NextResponse.json({ ok: report.status !== 'failed', report, persisted })
  } catch (error) {
    console.error(`[market-import] failed for ${segments.join('/')}`, error)
    return NextResponse.json(
      { ok: false, error: 'Category import could not be completed; existing data was kept.' },
      { status: 500 },
    )
  }
}
