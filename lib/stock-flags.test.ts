import { describe, expect, it } from 'vitest'
import { buildFlags } from './stock-flags'
import { assessGrowth } from './growth-quality'
import type { StockView } from './stock-detail'

function view(overrides: Partial<StockView>): StockView {
  return {
    cfoPat: null,
    debtToEquity: null,
    netProfit: null,
    roce: null,
    salesGrowth: null,
    profitGrowth: null,
    ...overrides,
  } as unknown as StockView
}

// buildFlags only reads a handful of fields; the cast keeps the test focused.
const flags = (overrides: Partial<StockView>, isFinancial = false) => buildFlags(view(overrides), isFinancial)

describe('buildFlags', () => {
  it('does not raise a flag when data is simply missing', () => {
    expect(flags({})).toHaveLength(0)
  })

  it('raises "operating cash negative" for a negative CFO/PAT', () => {
    const result = flags({ cfoPat: -0.4 })
    expect(result.map((flag) => flag.key)).toEqual(['cfo-negative'])
    expect(result[0].detail).toMatch(/negative/i)
    expect(result[0].severity).toBe('bad')
  })

  it('raises "operating cash below profit" only when CFO/PAT < 1 (and not for financials)', () => {
    expect(flags({ cfoPat: 0.6 }).map((flag) => flag.key)).toEqual(['cfo-below-profit'])
    expect(flags({ cfoPat: 1.5 })).toHaveLength(0)
    expect(flags({ cfoPat: 0.6 }, true)).toHaveLength(0)
  })

  it('exempts financials from the leverage rule', () => {
    expect(flags({ debtToEquity: 6 }, false).map((flag) => flag.key)).toContain('high-leverage')
    expect(flags({ debtToEquity: 6 }, true).map((flag) => flag.key)).not.toContain('high-leverage')
  })

  it('suppresses "profit declining" when the company is loss-making (no contradictory flags)', () => {
    const result = flags({ netProfit: -5, profitGrowth: assessGrowth({ metric: 'Net profit', current: -5, previous: 2 }) })
    const keys = result.map((flag) => flag.key)
    expect(keys).toContain('loss-making')
    expect(keys).not.toContain('profit-declining')
  })

  it('flags a comparable profit decline with the period in the detail', () => {
    const result = flags({
      netProfit: 50,
      profitGrowth: assessGrowth({ metric: 'Net profit', current: 50, previous: 80, currentPeriod: 'Mar 2025', previousPeriod: 'Mar 2024' }),
    })
    const decline = result.find((flag) => flag.key === 'profit-declining')!
    expect(decline.detail).toMatch(/Mar 2024 → Mar 2025/)
  })

  it('ignores a non-comparable profit drop (loss base) rather than flagging it', () => {
    const result = flags({ netProfit: 10, profitGrowth: assessGrowth({ metric: 'Net profit', current: 10, previous: -3 }) })
    expect(result.map((flag) => flag.key)).not.toContain('profit-declining')
  })
})
