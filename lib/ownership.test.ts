import { describe, expect, it } from 'vitest'
import { ownershipTrend } from './ownership'
import type { DetailTable } from './scrapers/screener-detail'

function table(columns: string[], rows: Record<string, (number | string)[]>): DetailTable {
  return { columns, rows: Object.entries(rows).map(([label, values]) => ({ label, values: values.map(String) })) }
}

const empty = { quarterly: null, yearly: null }

describe('ownershipTrend', () => {
  it('returns null when there is no shareholding table', () => {
    expect(ownershipTrend(null)).toBeNull()
    expect(ownershipTrend(empty)).toBeNull()
  })

  it('compares the last two quarterly holdings and emits signals above the threshold', () => {
    const trend = ownershipTrend({
      quarterly: table(['Mar 2025', 'Jun 2025'], {
        Promoters: ['74.00%', '73.50%'],
        FIIs: ['5.00%', '6.50%'],
        DIIs: ['8.00%', '8.10%'],
      }),
      yearly: null,
    })!
    expect(trend.basis).toBe('quarterly')
    expect(trend.holdings.find((holding) => holding.key === 'promoter')!.changePp).toBeCloseTo(-0.5)
    expect(trend.holdings.find((holding) => holding.key === 'fii')!.changePp).toBeCloseTo(1.5)
    expect(trend.signals.join(' ')).toMatch(/FIIs rising \+1\.50 pp/)
    expect(trend.signals.join(' ')).toMatch(/Promoters falling -0.50 pp/)
    expect(trend.signals.join(' ')).not.toMatch(/DIIs/)
  })

  it('falls back to the yearly table when quarterly is not comparable', () => {
    const trend = ownershipTrend({
      quarterly: table(['Jun 2025'], { Promoters: ['73.50%'] }),
      yearly: table(['Mar 2024', 'Mar 2025'], { Promoters: ['75.00%', '73.50%'] }),
    })!
    expect(trend.basis).toBe('yearly')
    expect(trend.holdings.find((holding) => holding.key === 'promoter')!.changePp).toBeCloseTo(-1.5)
  })

  it('reports a single period without inventing a trend', () => {
    const trend = ownershipTrend({
      quarterly: table(['Jun 2025'], { Promoters: ['73.50%'], FIIs: ['6.00%'] }),
      yearly: table(['Mar 2025'], { Promoters: ['74.00%'] }),
    })
    expect(trend).toBeNull()
  })
})
