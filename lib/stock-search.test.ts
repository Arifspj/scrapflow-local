import { describe, expect, it } from 'vitest'
import {
  normalizeSearchQuery,
  rankSuggestions,
  SEARCH_MAX_QUERY,
  type SearchCandidate,
} from './stock-search'

const candidates: SearchCandidate[] = [
  { symbol: 'RELIANCE', companyName: 'Reliance Industries Ltd' },
  { symbol: 'RELINFRA', companyName: 'Reliance Infrastructure Ltd' },
  { symbol: 'RPOWER', companyName: 'Reliance Power Ltd' },
  { symbol: 'REL', companyName: 'Something Rel' },
  { symbol: 'BIRLACORP', companyName: 'Aditya Birla Corporation' },
  { symbol: '544876', companyName: 'Amic Forging' },
]

describe('normalizeSearchQuery', () => {
  it('trims, collapses whitespace and caps length', () => {
    expect(normalizeSearchQuery('  reliance   industries ')).toBe('reliance industries')
    expect(normalizeSearchQuery(null)).toBe('')
    expect(normalizeSearchQuery('x'.repeat(SEARCH_MAX_QUERY + 20)).length).toBe(SEARCH_MAX_QUERY)
  })
})

describe('rankSuggestions', () => {
  it('returns nothing below the minimum query length', () => {
    expect(rankSuggestions(candidates, 'r')).toEqual([])
    expect(rankSuggestions(candidates, '')).toEqual([])
  })

  it('puts an exact symbol match first', () => {
    const results = rankSuggestions(candidates, 'rel')
    expect(results[0].symbol).toBe('REL')
  })

  it('orders symbol prefixes before company-name matches', () => {
    const results = rankSuggestions(candidates, 'reli')
    expect(results.map((r) => r.symbol)).toEqual(['RELIANCE', 'RELINFRA', 'RPOWER'])
  })

  it('matches company-name word starts and substrings', () => {
    const results = rankSuggestions(candidates, 'birla')
    expect(results.map((r) => r.symbol)).toEqual(['BIRLACORP'])
  })

  it('excludes unresolved numeric source ids', () => {
    const results = rankSuggestions(candidates, '544876')
    expect(results).toEqual([])
  })

  it('falls back to the symbol when the company name is missing', () => {
    const results = rankSuggestions([{ symbol: 'RELIANCE', companyName: null }], 'reliance')
    expect(results).toEqual([{ symbol: 'RELIANCE', companyName: 'RELIANCE', exchange: null }])
  })

  it('surfaces a reliable exchange when present, otherwise null', () => {
    const results = rankSuggestions(
      [
        { symbol: 'RELIANCE', companyName: 'Reliance Industries', exchange: 'NSE' },
        { symbol: 'RPOWER', companyName: 'Reliance Power' },
      ],
      'reliance',
    )
    expect(results[1].exchange).toBeNull()
    const withExchange = rankSuggestions([{ symbol: 'RELIANCE', companyName: 'Reliance Industries', exchange: 'NSE' }], 'reliance')
    expect(withExchange[0].exchange).toBe('NSE')
  })

  it('deduplicates and respects the limit', () => {
    const many: SearchCandidate[] = Array.from({ length: 20 }, (_, index) => ({
      symbol: `TEST${index}`,
      companyName: 'Test Company',
    }))
    const results = rankSuggestions([...many, many[0]], 'test', 5)
    expect(results).toHaveLength(5)
    expect(new Set(results.map((r) => r.symbol)).size).toBe(5)
  })
})
