/**
 * Pure state helpers for the homepage dashboard's in-place refresh.
 *
 * The homepage used to call `router.refresh()` on a 60s timer. On a
 * `force-dynamic` route that re-rendered the whole tree and flashed the
 * Suspense skeleton over the dashboard, unmounting every table and losing sort
 * state. The dashboard now polls a read-only endpoint and folds the result into
 * local state instead. Keeping that fold pure makes it unit-testable and
 * guarantees a failed or unchanged poll never disturbs the visible data.
 */

export type LiveStatus = 'idle' | 'updating' | 'stale'

export type LiveState<T> = { data: T; status: LiveStatus }

type WithBuild = { coverage: { builtAt: string } }

/** Two dashboards are the same build when the server stamped the same time. */
export function sameDashboardBuild(a: WithBuild, b: WithBuild): boolean {
  return a.coverage.builtAt === b.coverage.builtAt
}

/** Mark a poll in progress without touching the visible data. */
export function beginLiveRefresh<T>(state: LiveState<T>): LiveState<T> {
  return state.status === 'updating' ? state : { data: state.data, status: 'updating' }
}

/**
 * Fold one poll outcome into the state:
 * - a failure keeps the last good data and flags it stale,
 * - an unchanged build keeps the *same* data object so React does not re-render,
 * - a changed build swaps in the new data.
 *
 * Returns the very same state object when nothing changed, so a steady poll is a
 * no-op for the component tree.
 */
export function applyLiveRefresh<T extends WithBuild>(
  state: LiveState<T>,
  outcome: { ok: true; data: T } | { ok: false },
): LiveState<T> {
  if (!outcome.ok) {
    return state.status === 'stale' ? state : { data: state.data, status: 'stale' }
  }
  if (sameDashboardBuild(state.data, outcome.data)) {
    return state.status === 'idle' ? state : { data: state.data, status: 'idle' }
  }
  return { data: outcome.data, status: 'idle' }
}
