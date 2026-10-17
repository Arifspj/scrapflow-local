import { describe, expect, it } from 'vitest'
import { assessTurnaround } from './turnaround'
import type { DetailTable, ScreenerDetail } from './scrapers/screener-detail'

function table(columns: string[], rows: Record<string, (number | string)[]>): DetailTable {
  return { columns, rows: Object.entries(rows).map(([label, values]) => ({ label, values: values.map(String) })) }
}

function detail(overrides: Partial<ScreenerDetail>): ScreenerDetail {
  return {
    sourceUrl: '',
    companyId: null,
    warehouseId: null,
    topRatios: {},
    profitLoss: null,
    quarters: null,
    balanceSheet: null,
    cashFlow: null,
    ratios: null,
    shareholding: { quarterly: null, yearly: null },
    industry: [],
    peers: null,
    peersError: null,
    ...overrides,
  }
}

describe('assessTurnaround', () => {
  it('returns null without detail or without any improving signal', () => {
    expect(assessTurnaround(null)).toBeNull()
    expect(
      assessTurnaround(detail({ profitLoss: table(['Mar 2024', 'Mar 2025'], { 'Net Profit': [10, 12] }) })),
    ).toBeNull()
  })

  it('treats a loss-to-profit swing as genuine and strong', () => {
    const result = assessTurnaround(
      detail({
        profitLoss: table(['Mar 2024', 'Mar 2025'], {
          Sales: [100, 120],
          'Net Profit': [-5, 30],
        }),
      }),
    )
    expect(result).not.toBeNull()
    expect(result!.genuine).toBe(true)
    expect(result!.signals.map((signal) => signal.key)).toContain('loss-to-profit')
    expect(result!.signals.find((signal) => signal.key === 'loss-to-profit')!.strength).toBe('strong')
    expect(result!.score).toBeGreaterThanOrEqual(40)
    expect(result!.caveat).toMatch(/one-off/i)
  })

  it('detects operating-margin expansion with the pp change in the detail', () => {
    const result = assessTurnaround(
      detail({
        profitLoss: table(['Mar 2024', 'Mar 2025'], {
          Sales: [100, 120],
          'Operating Profit': [10, 18],
          'Net Profit': [5, 9],
        }),
      }),
    )
    const margin = result!.signals.find((signal) => signal.key === 'margin-expansion')!
    expect(margin).toBeDefined()
    expect(margin.detail).toMatch(/10\.0%.*15\.0%/)
  })

  it('does not call a lone debt reduction a turnaround (one-off guard)', () => {
    const result = assessTurnaround(
      detail({
        balanceSheet: table(['Mar 2024', 'Mar 2025'], { Borrowings: [100, 80] }),
        profitLoss: table(['Mar 2024', 'Mar 2025'], { Sales: [100, 100] }),
      }),
    )
    expect(result).not.toBeNull()
    expect(result!.signals.map((signal) => signal.key)).toEqual(['debt-reduction'])
    expect(result!.genuine).toBe(false)
    expect(result!.note).toMatch(/one-off/i)
  })

  it('detects operating cash turning positive', () => {
    const result = assessTurnaround(
      detail({ cashFlow: table(['Mar 2024', 'Mar 2025'], { 'Cash from Operating Activity': [-50, 20] }) }),
    )
    expect(result!.signals.map((signal) => signal.key)).toContain('cash-flow-turning-positive')
  })

  it('becomes genuine when two independent moderate signals agree', () => {
    const result = assessTurnaround(
      detail({
        profitLoss: table(['Mar 2024', 'Mar 2025'], {
          Sales: [100, 115],
          'Net Profit': [10, 16],
        }),
        cashFlow: table(['Mar 2024', 'Mar 2025'], { 'Cash from Operating Activity': [5, 18] }),
      }),
    )
    expect(result!.genuine).toBe(true)
    expect(result!.signals.length).toBeGreaterThanOrEqual(2)
    expect(result!.score).toBeGreaterThanOrEqual(40)
  })

  it('does not flag a still-negative cash-flow improvement as turning positive', () => {
    const result = assessTurnaround(
      detail({ cashFlow: table(['Mar 2024', 'Mar 2025'], { 'Cash from Operating Activity': [-9, -4] }) }),
    )
    const keys = result?.signals.map((signal) => signal.key) ?? []
    expect(keys).not.toContain('cash-flow-turning-positive')
    expect(keys).not.toContain('cash-flow-improving')
    expect(result).toBeNull()
  })

  it('keeps a genuine negative-to-positive cash-flow swing as turning positive', () => {
    const result = assessTurnaround(
      detail({ cashFlow: table(['Mar 2024', 'Mar 2025'], { 'Cash from Operating Activity': [-9, 4] }) }),
    )
    const turning = result!.signals.find((signal) => signal.key === 'cash-flow-turning-positive')
    expect(turning).toBeDefined()
    expect(turning!.label).toBe('Operating cash turning positive')
  })

  it('does not describe cash flow that merely reached zero as turning positive', () => {
    const result = assessTurnaround(
      detail({ cashFlow: table(['Mar 2024', 'Mar 2025'], { 'Cash from Operating Activity': [-2, 0] }) }),
    )
    const keys = result?.signals.map((signal) => signal.key) ?? []
    expect(keys).not.toContain('cash-flow-turning-positive')
  })

  it('compares the latest two annual periods and ignores a TTM column', () => {
    const result = assessTurnaround(
      detail({
        cashFlow: table(['Mar 2024', 'Mar 2025', 'TTM'], {
          'Cash from Operating Activity': [-9, 4, 6],
        }),
      }),
    )
    const turning = result!.signals.find((signal) => signal.key === 'cash-flow-turning-positive')!
    expect(turning.detail).toContain('Mar 2024')
    expect(turning.detail).toContain('Mar 2025')
    expect(turning.detail).not.toContain('TTM')
  })
})
