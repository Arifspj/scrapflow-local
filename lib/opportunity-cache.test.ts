import { beforeEach, describe, expect, it } from 'vitest'
import {
  ageOfOpportunityCache,
  getInflightOpportunity,
  invalidateOpportunityCache,
  readLatestOpportunityCache,
  readOpportunityCache,
  setInflightOpportunity,
  writeOpportunityCache,
} from './opportunity-cache'

describe('opportunity cache', () => {
  beforeEach(() => {
    invalidateOpportunityCache()
    setInflightOpportunity(null)
  })

  it('returns the value only for the matching signature', () => {
    writeOpportunityCache('sig-1', { n: 1 })
    expect(readOpportunityCache('sig-1')).toEqual({ n: 1 })
    expect(readOpportunityCache('sig-2')).toBeNull()
    expect(readLatestOpportunityCache()).toEqual({ n: 1 })
    expect(ageOfOpportunityCache()).not.toBeNull()
  })

  it('invalidate drops the memo entirely', () => {
    writeOpportunityCache('sig', 1)
    invalidateOpportunityCache()
    expect(readOpportunityCache('sig')).toBeNull()
    expect(readLatestOpportunityCache()).toBeNull()
    expect(ageOfOpportunityCache()).toBeNull()
  })

  it('tracks the inflight promise', () => {
    expect(getInflightOpportunity()).toBeNull()
    const pending = Promise.resolve('x')
    setInflightOpportunity(pending as Promise<unknown>)
    expect(getInflightOpportunity()).toBe(pending)
    setInflightOpportunity(null)
    expect(getInflightOpportunity()).toBeNull()
  })
})
