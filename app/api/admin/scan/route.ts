import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { ensureCanonicalScanners } from '@/lib/scanners'
import { runDueSources } from '@/lib/ingest'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Admin-triggered scheduler. Starts the same work the Vercel cron does — every
 * enabled source whose fetch interval has elapsed — and returns immediately so
 * the button never blocks on a long run. Progress is visible in the admin
 * "Scanning now" tile and the Fetch Logs table. Protected by ADMIN_SECRET.
 */
export async function POST(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied

  // Fire-and-forget: the run can take minutes, so we do not await it on the
  // request path. (On Vercel prefer the cron route, which awaits inside the
  // function's maxDuration; this endpoint is intended for local/admin use.)
  void (async () => {
    const run = async () => {
      await ensureCanonicalScanners()
      await runDueSources()
    }
    try {
      await run()
    } catch (error: any) {
      const msg = String(error?.message ?? '')
      // Transient Prisma DB hiccup on local daemon — retry once
      if (msg.includes('P1001') || msg.includes('Can\'t reach database') || msg.includes('ECONNREFUSED')) {
        try {
          await new Promise((r) => setTimeout(r, 1500))
          await run()
        } catch (e) {
          console.error('[admin/scan] background run failed after retry', e)
        }
        return
      }
      console.error('[admin/scan] background run failed', error)
    }
  })()

  return NextResponse.json({ ok: true, started: true })
}
