import { describe, expect, it } from 'vitest'
import { computeQuarterGrowth, growthPercent } from './growth'
import type { DetailTable } from './scrapers/screener-detail'

function quartersTable(columns: string[], rows: Record<string, (number | null)[]>): DetailTable {
  return {
    columns,
    rows: Object.entries(rows).map(([label, values]) => ({ label, values: values.map((value) => (value == null ? '' : String(value))) })),
  }
}

const WIDE = ['Sep 2024', 'Dec 2024', 'Mar 2025', 'Jun 2025', 'Sep 2025', 'Dec 2025', 'Mar 2026', 'Jun 2026']

describe('growthPercent', () => {
  it('computes positive and negative growth against the absolute base', () => {
    expect(growthPercent(100, 80)).toBeCloseTo(25)
    expect(growthPercent(80, 100)).toBeCloseTo(-20)
  })

  it('handles a switch from a loss to profit as positive', () => {
    expect(growthPercent(-5, -10)).toBeCloseTo(50)
    expect(growthPercent(-10, -20)).toBeCloseTo(50)
    expect(growthPercent(10, -10)).toBeCloseTo(200)
  })

  it('returns null for missing or zero bases', () => {
    expect(growthPercent(100, 0)).toBeNull()
    expect(growthPercent(null, 80)).toBeNull()
    expect(growthPercent(100, null)).toBeNull()
    expect(growthPercent(Number.NaN, 80)).toBeNull()
  })
})

describe('computeQuarterGrowth', () => {
  it('computes QoQ vs the previous quarter and YoY vs the same quarter last year', () => {
    const table = quartersTable(WIDE, {
      Sales: [200, 210, 220, 230, 240, 250, 260, 300],
      'Operating Profit +': [40, 42, 44, 46, 48, 50, 52, 85],
      'Net Profit +': [25, 26, 27, 28, 29, 30, 31, 55],
    })
    const growth = computeQuarterGrowth(table)
    expect(growth?.latest).toBe('Jun 2026')
    expect(growth?.qoqPrevious).toBe('Mar 2026')
    expect(growth?.yoySame).toBe('Jun 2025')
    // QoQ: 300 vs 260 -> +15.38%
    expect(growth?.qoq.sales.pct).toBeCloseTo((300 / 260 - 1) * 100, 1)
    // YoY: 300 vs Jun 2025 (230) -> +30.43%
    expect(growth?.yoy.sales.pct).toBeCloseTo((300 / 230 - 1) * 100, 1)
    // Operating Profit QoQ: 85 vs 52 -> +63.46%
    expect(growth?.qoq.operatingProfit.pct).toBeCloseTo((85 / 52 - 1) * 100, 1)
    // Net Profit YoY: 55 vs Jun 2025 (28) -> +96.43%
    expect(growth?.yoy.netProfit.pct).toBeCloseTo((55 / 28 - 1) * 100, 1)
  })

  it('keeps the reports label as Operating Profit mapping from the source row', () => {
    const table = quartersTable(WIDE, {
      Sales: [1, 2, 3, 4, 5, 6, 7, 8],
      'Operating Profit': [1, 2, 3, 4, 5, 6, 7, 8],
      'Net Profit': [1, 2, 3, 4, 5, 6, 7, 8],
    })
    const growth = computeQuarterGrowth(table)
    expect(growth?.qoq.operatingProfit.current).toBe(8)
    expect(growth?.qoq.operatingProfit.previous).toBe(7)
  })

  it('returns no YoY when fewer than four quarters are available', () => {
    const table = quartersTable(
      ['Dec 2025', 'Mar 2026', 'Jun 2026'],
      { Sales: [160, 180, 200], 'Net Profit': [30, 35, 40] },
    )
    const growth = computeQuarterGrowth(table)
    expect(growth?.latest).toBe('Jun 2026')
    expect(growth?.qoq.sales.pct).toBeCloseTo((200 / 180 - 1) * 100, 1)
    expect(growth?.yoy.sales.pct).toBeNull()
    expect(growth?.yoySame).toBeNull()
  })

  it('skips missing cells and compares the nearest available quarters', () => {
    const table = quartersTable(WIDE, {
      Sales: [200, 210, null, 230, 240, null, 260, 300],
      'Net Profit': [20, 21, 22, 23, 24, 25, 26, 27],
    })
    const growth = computeQuarterGrowth(table)
    expect(growth?.qoq.sales.pct).toBeCloseTo((300 / 260 - 1) * 100, 1)
    expect(growth?.yoy.sales.pct).toBeCloseTo((300 / 230 - 1) * 100, 1)
  })

  it('returns null for a zero comparison base instead of a fabricated percentage', () => {
    const table = quartersTable(WIDE, {
      Sales: [200, 210, 220, 230, 240, 250, 0, 300],
      'Net Profit': [20, 21, 22, 23, 24, 25, 26, 27],
    })
    const growth = computeQuarterGrowth(table)
    expect(growth?.qoq.sales.pct).toBeNull()
    expect(growth?.qoq.sales.previous).toBe(0)
    expect(growth?.qoq.sales.current).toBe(300)
  })

  it('returns null when there is no quarterly table', () => {
    expect(computeQuarterGrowth(null)).toBeNull()
    expect(computeQuarterGrowth({ columns: [], rows: [] })).toBeNull()
  })
})