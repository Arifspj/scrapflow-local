import { getOpportunityDashboard, toDashboardView } from '@/lib/opportunity-data'
import { DashboardView } from './dashboard-view'

/**
 * Server wrapper: read the signature-cached dashboard once for the initial paint,
 * then hand off to the client `DashboardView`, which keeps it fresh in place.
 *
 * Keeping the data read here preserves server rendering and the existing cache.
 * The old approach called `router.refresh()` on a timer, which re-rendered the
 * `force-dynamic` route and flashed the Suspense skeleton over the whole
 * dashboard; the client now polls instead, so updates reconcile in place.
 */
export async function OpportunityDashboard() {
  const data = await getOpportunityDashboard()
  return <DashboardView initial={toDashboardView(data)} />
}
