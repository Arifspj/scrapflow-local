import { describe, expect, it } from 'vitest'
import {
  applyLiveRefresh,
  beginLiveRefresh,
  sameDashboardBuild,
  type LiveState,
} from './dashboard-live'

type Data = { coverage: { builtAt: string }; rows: number[] }

function build(builtAt: string, rows: number[] = []): Data {
  return { coverage: { builtAt }, rows }
}

function state(data: Data, status: LiveState<Data>['status'] = 'idle'): LiveState<Data> {
  return { data, status }
}

describe('sameDashboardBuild', () => {
  it('compares the server build timestamp', () => {
    expect(sameDashboardBuild(build('t1'), build('t1'))).toBe(true)
    expect(sameDashboardBuild(build('t1'), build('t2'))).toBe(false)
  })
})

describe('beginLiveRefresh', () => {
  it('flags updating without changing the data identity', () => {
    const current = state(build('t1'))
    const next = beginLiveRefresh(current)
    expect(next.status).toBe('updating')
    expect(next.data).toBe(current.data)
  })

  it('returns the same object when already updating', () => {
    const current = state(build('t1'), 'updating')
    expect(beginLiveRefresh(current)).toBe(current)
  })
})

describe('applyLiveRefresh', () => {
  it('keeps the last good data on failure and flags it stale', () => {
    const current = state(build('t1', [1, 2]))
    const next = applyLiveRefresh(current, { ok: false })
    expect(next.data).toBe(current.data)
    expect(next.data.rows).toEqual([1, 2])
    expect(next.status).toBe('stale')
  })

  it('preserves the same object when it is already stale', () => {
    const current = state(build('t1'), 'stale')
    expect(applyLiveRefresh(current, { ok: false })).toBe(current)
  })

  it('is a no-op when a successful poll returns the same build', () => {
    const current = state(build('t1', [1]))
    const same = build('t1', [1])
    const next = applyLiveRefresh(current, { ok: true, data: same })
    expect(next).toBe(current)
    expect(next.data).toBe(current.data)
  })

  it('clears updating to idle when the build is unchanged', () => {
    const current = state(build('t1', [1]), 'updating')
    const next = applyLiveRefresh(current, { ok: true, data: build('t1') })
    expect(next.status).toBe('idle')
    expect(next.data).toBe(current.data)
  })

  it('swaps in new data when the build changed', () => {
    const current = state(build('t1', [1]))
    const changed = build('t2', [1, 2, 3])
    const next = applyLiveRefresh(current, { ok: true, data: changed })
    expect(next.status).toBe('idle')
    expect(next.data).toBe(changed)
    expect(next.data.rows).toEqual([1, 2, 3])
  })

  it('recovers from stale back to idle on a good poll', () => {
    const current = state(build('t1'), 'stale')
    const next = applyLiveRefresh(current, { ok: true, data: build('t1') })
    expect(next.status).toBe('idle')
    expect(next.data).toBe(current.data)
  })
})
