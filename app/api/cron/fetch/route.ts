import { NextResponse } from 'next/server'
import { requireCron } from '@/lib/admin-auth'
import { ensureCanonicalScanners } from '@/lib/scanners'
import { runDueSources } from '@/lib/ingest'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Scheduler entry point (Vercel Cron or a manual ping). Ensures the canonical
 * scanners exist, then runs only the sources whose fetch interval has elapsed.
 * Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  const denied = requireCron(request)
  if (denied) return denied

  try {
    await ensureCanonicalScanners()
    const result = await runDueSources()
    return NextResponse.json({ ok: true, ran: result.ran, results: result.results })
  } catch (error) {
    console.error('[cron/fetch] failed', error)
    return NextResponse.json({ ok: false, error: 'Scheduler run failed.' }, { status: 500 })
  }
}

export const POST = GET
