import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { runSourceImport } from '@/lib/ingest'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

/**
 * Fetch and persist a source: discover rows, save the Stock + ScannerStock
 * memberships (+ a listing snapshot where available) and record a FetchRun. A
 * partial or blocked run is reported honestly and never reported as success.
 */
export async function POST(request: Request, { params }: Params) {
  const denied = requireAdmin(request)
  if (denied) return denied
  const { id } = await params

  const body = await request.json().catch(() => null)
  const options = {
    maxPages: Number.isFinite(Number(body?.maxPages)) ? Number(body.maxPages) : undefined,
    maxEnrich: Number.isFinite(Number(body?.maxEnrich)) ? Number(body.maxEnrich) : undefined,
  }

  try {
    const summary = await runSourceImport(id, options)
    return NextResponse.json(summary)
  } catch (error) {
    console.error(`[admin/sources/${id}/import] failed`, error)
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Import failed.' }, { status: 500 })
  }
}
