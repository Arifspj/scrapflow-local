import { describe, expect, it } from 'vitest'
import { isDetailSnapshot, isNumericCode, pendingEnrichmentSymbols } from './enrich-queue'

describe('isNumericCode', () => {
  it('flags BSE/warehouse numeric codes', () => {
    expect(isNumericCode('543709')).toBe(true)
    expect(isNumericCode('543971')).toBe(true)
  })

  it('accepts real tickers (including digits, &, . and -)', () => {
    for (const symbol of ['RELIANCE', 'M&M', 'BAJAJ-AUTO', '3MINDIA', 'BAJAJ.AUTO']) {
      expect(isNumericCode(symbol)).toBe(false)
    }
  })
})

describe('isDetailSnapshot', () => {
  it('recognises full screener detail versions', () => {
    expect(isDetailSnapshot('screener@1.0.0')).toBe(true)
  })

  it('rejects list-only / market snapshots', () => {
    expect(isDetailSnapshot('screener-screen@1.0.0')).toBe(false)
    expect(isDetailSnapshot('screener-market@1.0.0')).toBe(false)
    expect(isDetailSnapshot(null)).toBe(false)
    expect(isDetailSnapshot(undefined)).toBe(false)
  })
})

describe('pendingEnrichmentSymbols', () => {
  it('drops already-enriched symbols so a capped run keeps advancing', () => {
    expect(pendingEnrichmentSymbols(['A', 'B', 'C', 'D'], ['A', 'B'])).toEqual(['C', 'D'])
  })

  it('de-duplicates while preserving first-seen order', () => {
    expect(pendingEnrichmentSymbols(['B', 'A', 'B', 'C', 'A'], [])).toEqual(['B', 'A', 'C'])
  })

  it('returns an empty list when everything is enriched', () => {
    expect(pendingEnrichmentSymbols(['A', 'B'], ['A', 'B', 'C'])).toEqual([])
  })
})
