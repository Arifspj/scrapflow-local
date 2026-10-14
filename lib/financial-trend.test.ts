import { describe, expect, it } from 'vitest'
import { classifyLabel, financialCellTrend, TREND_CONFIG } from './financial-trend'
import type { DetailTable } from './scrapers/screener-detail'

function table(columns: string[], rows: [label: string, values: string[]][]): DetailTable {
  return { columns, rows: rows.map(([label, values]) => ({ label, values })) }
}

const QUARTERS = table(
  ['Sep 2025', 'Dec 2025', 'Mar 2026'],
  [
    ['Sales', ['700', '750', '850']],
    ['Expenses', ['550', '590', '640']],
    ['Operating Profit', ['150', '160', '210']],
    ['Net Profit', ['70', '75', '95']],
    ['Interest', ['10', '12', '12']],
    ['EPS in Rs', ['11', '12', '15']],
    ['OPM %', ['21.4', '21.3', '24.7']],
  ],
)

const lastIndex = QUARTERS.columns.length - 1

describe('classifyLabel', () => {
  it('maps metric labels to direction categories', () => {
    expect(classifyLabel('Sales')).toEqual({ category: 'growth', direction: 'higher-better' })
    expect(classifyLabel('Net Profit')).toEqual({ category: 'growth', direction: 'higher-better' })
    expect(classifyLabel('OPM %')).toEqual({ category: 'growth', direction: 'higher-better' })
    expect(classifyLabel('Expenses')).toEqual({ category: 'expense', direction: 'lower-better' })
    expect(classifyLabel('Interest')).toEqual({ category: 'interest', direction: 'lower-better' })
  })

  it('judges balance-sheet rows with an investing direction', () => {
    expect(classifyLabel('Reserves')).toEqual({ category: 'balance', direction: 'higher-better' })
    expect(classifyLabel('Total Assets')).toEqual({ category: 'balance', direction: 'higher-better' })
    expect(classifyLabel('Investments')).toEqual({ category: 'balance', direction: 'higher-better' })
    expect(classifyLabel('Borrowings')).toEqual({ category: 'balance', direction: 'lower-better' })
    expect(classifyLabel('Other Liabilities')).toEqual({ category: 'balance', direction: 'lower-better' })
    // Ambiguous rows stay uncoloured rather than guess.
    expect(classifyLabel('Equity Capital')).toEqual({ category: 'unknown', direction: 'higher-better' })
    expect(classifyLabel('CWIP')).toEqual({ category: 'unknown', direction: 'higher-better' })
  })
})

describe('financialCellTrend', () => {
  it('is green for improving sales, profits and margins', () => {
    const sales = QUARTERS.rows.find((row) => row.label === 'Sales')!
    const profit = QUARTERS.rows.find((row) => row.label === 'Net Profit')!
    const opm = QUARTERS.rows.find((row) => row.label === 'OPM %')!
    expect(financialCellTrend(QUARTERS, sales, lastIndex).tone).toBe('good')
    expect(financialCellTrend(QUARTERS, profit, lastIndex).tone).toBe('good')
    expect(financialCellTrend(QUARTERS, opm, lastIndex).tone).toBe('good')
  })

  it('colours balance-sheet rows with an investing direction', () => {
    const t = table(
      ['Mar 2025', 'Mar 2026'],
      [
        ['Reserves', ['500', '766']], // up -> good
        ['Borrowings', ['33', '261']], // up -> bad
        ['Total Assets', ['1,000', '900']], // down -> bad
        ['Equity Capital', ['20', '40']], // ambiguous -> never coloured
      ],
    )
    expect(financialCellTrend(t, t.rows[0], 1).tone).toBe('good')
    expect(financialCellTrend(t, t.rows[1], 1).tone).toBe('bad')
    expect(financialCellTrend(t, t.rows[2], 1).tone).toBe('bad')
    expect(financialCellTrend(t, t.rows[3], 1).tone).toBe('neutral')
  })

  it('greens falling borrowings (deleveraging)', () => {
    const t = table(['Mar 2025', 'Mar 2026'], [['Borrowings', ['100', '60']]])
    expect(financialCellTrend(t, t.rows[0], 1).tone).toBe('good')
  })

  it('is red when sales decline meaningfully', () => {
    const t = table(['Sep', 'Dec'], [['Sales', ['100', '80']]])
    const sale = t.rows[0]
    const result = financialCellTrend(t, sale, 1)
    expect(result.tone).toBe('bad')
    expect(result.note).toContain('vs Sep')
  })

  it('is amber for flat/marginal changes (within the insignificant band)', () => {
    const t = table(['Sep', 'Dec'], [['Sales', ['100', '102']]]) // +2% < 3%
    expect(financialCellTrend(t, t.rows[0], 1).tone).toBe('warn')
  })

  it('treats the exact boundary as meaningful', () => {
    const up = table(['Sep', 'Dec'], [['Sales', ['100', '103']]])
    expect(financialCellTrend(up, up.rows[0], 1).tone).toBe('good')
    const down = table(['Sep', 'Dec'], [['Sales', ['100', '97']]])
    expect(financialCellTrend(down, down.rows[0], 1).tone).toBe('bad')
  })

  it('is neutral for missing values or unavailable comparisons', () => {
    const missing = table(['Sep', 'Dec'], [['Sales', ['', '100']]])
    expect(financialCellTrend(missing, missing.rows[0], 0).tone).toBe('neutral') // no previous column
    expect(financialCellTrend(missing, missing.rows[0], 1).tone).toBe('neutral') // blank base -> never coloured
  })

  it('never colours a zero base or a NaN value', () => {
    const zeroBase = table(['Sep', 'Dec'], [['Net Profit', ['0', '50']]])
    expect(financialCellTrend(zeroBase, zeroBase.rows[0], 1).tone).toBe('neutral')
    const bad = table(['Sep', 'Dec'], [['Net Profit', ['garbage', '50']]])
    expect(financialCellTrend(bad, bad.rows[0], 1).tone).toBe('neutral')
  })

  it('skips TTM columns entirely', () => {
    const ttm = table(['Mar 2025', 'Mar 2026', 'TTM'], [['Sales', ['100', '120', '124']]])
    expect(financialCellTrend(ttm, ttm.rows[0], 0).tone).toBe('neutral')
    expect(financialCellTrend(ttm, ttm.rows[0], 2).tone).toBe('neutral') // TTM never coloured
    expect(financialCellTrend(ttm, ttm.rows[0], 1).tone).toBe('good')
  })

  it('flags expenses that grow faster than sales', () => {
    const t = table(
      ['Mar 2025', 'Mar 2026'],
      [
        ['Sales', ['100', '104']], // +4%
        ['Expenses', ['70', '78']], // +11.4% -> pressure 7.4pp > 5pp -> bad
      ],
    )
    const result = financialCellTrend(t, t.rows[1], 1)
    expect(result.tone).toBe('bad')
    expect(result.note).toContain('sales')
  })

  it('allows expenses growing slightly faster than sales (within pressure band)', () => {
    const t = table(
      ['Mar 2025', 'Mar 2026'],
      [
        ['Sales', ['100', '120']], // +20%
        ['Expenses', ['70', '83']], // +18.6% -> slower than sales -> good
      ],
    )
    expect(financialCellTrend(t, t.rows[1], 1).tone).toBe('good')
  })

  it('warns when interest rises faster than operating profit', () => {
    const t = table(
      ['Mar 2025', 'Mar 2026'],
      [
        ['Operating Profit', ['100', '105']], // +5%
        ['Interest', ['10', '12']], // +20% -> +15pp vs op profit -> bad
      ],
    )
    const result = financialCellTrend(t, t.rows[1], 1)
    expect(result.tone).toBe('bad')
    expect(result.note).toContain('operating profit')
  })

  it('is neutral for risk metrics when the anchor metric is unavailable', () => {
    const t = table(['Mar 2025', 'Mar 2026'], [['Interest', ['10', '12']]])
    expect(financialCellTrend(t, t.rows[0], 1).tone).toBe('neutral')
  })

  it('compares against the previous non-TTM column, not the immediate one', () => {
    const t = table(
      ['Mar 2024', 'TTM', 'Mar 2025'],
      [['Sales', ['100', '110', '130']]],
    )
    const sale = t.rows[0]
    expect(financialCellTrend(t, sale, 1).tone).toBe('neutral') // TTM cell itself -> neutral
    expect(financialCellTrend(t, sale, 2).note).toContain('Mar 2024') // falls back past TTM
    expect(financialCellTrend(t, sale, 2).tone).toBe('good')
  })
})