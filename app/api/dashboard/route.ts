import { NextResponse } from 'next/server'
import { getOpportunityDashboard, toDashboardView } from '@/lib/opportunity-data'

export const dynamic = 'force-dynamic'

/**
 * Read-only JSON view of the opportunity dashboard, used by the homepage's
 * in-place refresh. It calls the same signature-cached builder as the page
 * render, so it never scrapes and never ingests — it only reads data that is
 * already persisted and returns "no-store" so no CDN layer can serve it stale.
 */
export async function GET() {
  const data = await getOpportunityDashboard()
  return NextResponse.json(toDashboardView(data), { headers: { 'Cache-Control': 'no-store' } })
}
