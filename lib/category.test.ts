import { describe, expect, it } from 'vitest'
import {
  categoryHref,
  categoryLevel,
  categorySourceUrl,
  industryTrail,
  isInCategory,
  LEVEL_LABEL,
  normalizeMarketSegments,
} from './category'
import type { IndustryLink } from './scrapers/screener-detail'

const INDUSTRY: IndustryLink[] = [
  { level: 'broadSector', name: 'Healthcare', url: '/market/IN06/' },
  { level: 'sector', name: 'Pharma & Biotech', url: '/market/IN06/IN0601/' },
  { level: 'broadIndustry', name: 'Pharmaceuticals & Biotechnology', url: '/market/IN06/IN0601/IN060101/' },
  { level: 'industry', name: 'Pharmaceuticals', url: '/market/IN06/IN0601/IN060101/IN060101001/' },
]

describe('normalizeMarketSegments', () => {
  it('accepts one to four alphanumeric segments and upper-cases them', () => {
    expect(normalizeMarketSegments(['in06'])).toEqual(['IN06'])
    expect(normalizeMarketSegments(['IN06', 'IN0601'])).toEqual(['IN06', 'IN0601'])
    expect(normalizeMarketSegments(['IN06', 'IN0601', 'IN060101', 'IN060101001'])).toEqual([
      'IN06',
      'IN0601',
      'IN060101',
      'IN060101001',
    ])
  })

  it('rejects empty, too deep or malformed paths', () => {
    expect(normalizeMarketSegments([])).toBeNull()
    expect(normalizeMarketSegments(undefined)).toBeNull()
    expect(normalizeMarketSegments(['a', 'b', 'c', 'd', 'e'])).toBeNull()
    expect(normalizeMarketSegments(['IN06', 'bad code'])).toBeNull()
    expect(normalizeMarketSegments(['IN-06'])).toBeNull()
  })
})

describe('category paths', () => {
  it('builds the screener source url with a trailing slash', () => {
    expect(categorySourceUrl(['IN06', 'IN0601'])).toBe('/market/IN06/IN0601/')
  })

  it('maps depth to the industry level', () => {
    expect(categoryLevel(['IN06'])).toBe('broadSector')
    expect(categoryLevel(['IN06', 'IN0601'])).toBe('sector')
    expect(categoryLevel(['IN06', 'IN0601', 'IN060101'])).toBe('broadIndustry')
    expect(categoryLevel(['IN06', 'IN0601', 'IN060101', 'IN060101001'])).toBe('industry')
  })

  it('builds a local href without a trailing slash', () => {
    expect(categoryHref(['IN06', 'IN0601'])).toBe('/market/IN06/IN0601')
  })

  it('exposes human-readable level labels', () => {
    expect(LEVEL_LABEL.broadSector).toBe('Broad Sector')
    expect(LEVEL_LABEL.industry).toBe('Industry')
  })
})

describe('isInCategory', () => {
  it('matches a company that links to exactly that path', () => {
    expect(isInCategory(INDUSTRY, ['IN06'])).toBe(true)
    expect(isInCategory(INDUSTRY, ['IN06', 'IN0601'])).toBe(true)
    expect(isInCategory(INDUSTRY, ['IN06', 'IN0601', 'IN060101', 'IN060101001'])).toBe(true)
  })

  it('does not match a path the company is not classified under', () => {
    expect(isInCategory(INDUSTRY, ['IN07'])).toBe(false)
    expect(isInCategory(INDUSTRY, ['IN06', 'IN0602'])).toBe(false)
  })

  it('tolerates source urls without a trailing slash', () => {
    const link: IndustryLink[] = [{ level: 'sector', name: 'X', url: '/market/IN09/IN0901' }]
    expect(isInCategory(link, ['IN09', 'IN0901'])).toBe(true)
  })
})

describe('industryTrail', () => {
  it('returns the hierarchy up to and including the matched category', () => {
    const trail = industryTrail(INDUSTRY, ['IN06', 'IN0601'])
    expect(trail.map((link) => link.level)).toEqual(['broadSector', 'sector'])
    expect(trail[1]?.name).toBe('Pharma & Biotech')
  })

  it('returns an empty trail when nothing matches', () => {
    expect(industryTrail(INDUSTRY, ['IN07'])).toEqual([])
  })
})
