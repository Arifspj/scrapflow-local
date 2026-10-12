import { describe, expect, it } from 'vitest'
import { buildBusinessBadges, type BusinessBadgeInput } from './business-badges'

function input(overrides: Partial<BusinessBadgeInput>): BusinessBadgeInput {
  return {
    upside: null,
    pe: null,
    roce: null,
    roe: null,
    salesYoy: null,
    profitYoy: null,
    qoqProfitPct: null,
    debtToEquity: null,
    piotroski: null,
    ...overrides,
  }
}

const labels = (overrides: Partial<BusinessBadgeInput>) => buildBusinessBadges(input(overrides)).map((badge) => badge.label)

describe('buildBusinessBadges', () => {
  it('produces no badges when every metric is missing', () => {
    expect(buildBusinessBadges(input({}))).toEqual([])
  })

  it('keeps the legacy valuation, growth, leverage and momentum badges', () => {
    const result = labels({ upside: 25, profitYoy: 18, roce: 17, debtToEquity: 0.3, salesYoy: 20 })
    expect(result).toEqual(expect.arrayContaining(['UNDERVALUED', 'GOOD GROWTH', 'SALES MOMENTUM', 'LOW DEBT']))
    expect(result).toContain('HIGH ROCE')
  })

  it('flags an overvalued, low-return, indebted, declining business', () => {
    const result = labels({ upside: -30, profitYoy: -5, roce: 4, debtToEquity: 2.5 })
    expect(result).toEqual(expect.arrayContaining(['OVERVALUED', 'LOW ROCE', 'PROFIT DECLINING', 'HIGH DEBT']))
  })

  it('awards UNDERVALUED and LOW P/E on a cheap, high-quality compounder', () => {
    const result = labels({ upside: 40, pe: 12, roce: 28, roe: 24, salesYoy: 18, profitYoy: 22, qoqProfitPct: 6, debtToEquity: 0.2 })
    expect(result).toEqual(expect.arrayContaining(['UNDERVALUED', 'LOW P/E', 'ROCE STAR', 'QUALITY BUSINESS', 'COMPOUNDER', 'EARNING ACCELERATION']))
  })

  it('marks EARNING ACCELERATION instead of GOOD GROWTH for accelerating profit', () => {
    const result = labels({ profitYoy: 25, qoqProfitPct: 4 })
    expect(result).toContain('EARNING ACCELERATION')
    expect(result).not.toContain('GOOD GROWTH')
  })

  it('requires low leverage for QUALITY BUSINESS', () => {
    expect(labels({ roce: 25, roe: 22, debtToEquity: 1.4 })).not.toContain('QUALITY BUSINESS')
    expect(labels({ roce: 25, roe: 22, debtToEquity: 0.8 })).toContain('QUALITY BUSINESS')
  })

  it('treats unknown leverage as acceptable for quality/compounder rules', () => {
    expect(labels({ roce: 25, roe: 22 })).toContain('QUALITY BUSINESS')
    expect(labels({ salesYoy: 20, profitYoy: 20, roce: 20 })).toContain('COMPOUNDER')
  })

  it('does not award LOW P/E for zero or negative earnings', () => {
    expect(labels({ pe: 0 })).not.toContain('LOW P/E')
    expect(labels({ pe: -5 })).not.toContain('LOW P/E')
  })

  it('does not duplicate a label across rules', () => {
    const badges = buildBusinessBadges(input({ upside: 40, pe: 10, roce: 30, roe: 25, salesYoy: 20, profitYoy: 25, qoqProfitPct: 3, debtToEquity: 0.1 }))
    const seen = new Set<string>()
    for (const badge of badges) {
      expect(seen.has(badge.label)).toBe(false)
      seen.add(badge.label)
    }
  })

  it('documents a reason for every badge', () => {
    for (const badge of buildBusinessBadges(input({ upside: 40, pe: 10, roce: 30, roe: 25, salesYoy: 20, profitYoy: 25, qoqProfitPct: 3, debtToEquity: 0.1 }))) {
      expect(badge.reason.length).toBeGreaterThan(0)
      expect(['good', 'warn', 'info', 'neutral']).toContain(badge.tone)
    }
  })
})
