import { describe, expect, it } from 'vitest'
import { buildCompareUniverse, compareValuesForView, defaultSelection } from './compare-data'
import { buildListStockView, type ListStockView } from './view-summary'

/**
 * Builds a list view from a full snapshot then overlays just the fields a test
 * cares about, so each case states only the numbers under test.
 */
function listWith(view: Partial<ReturnType<typeof buildListStockView>['view']>, ownership?: ListStockView['ownership']): ListStockView {
  const base = buildListStockView({ symbol: 'TEST', companyName: 'Test Ltd' }, null)
  return { ...base, view: { ...base.view, ...view }, ownership: ownership ?? base.ownership }
}

describe('compareValuesForView', () => {
  it('maps persisted fields and derives the ratio/manual metrics', () => {
    const list = buildListStockView({ symbol: 'TBZ', companyName: 'TBZ Ltd' }, null)
    const values = compareValuesForView({
      ...list,
      view: {
        ...list.view,
        price: 100,
        high: 125,
        low: 80,
        pe: 10,
        bookValue: 50,
        marketCap: 5000,
        revenue: 1000,
        netProfit: 100,
        roce: 21.4,
        roe: 17.9,
        opm: 8.4,
        debtToEquity: 0.46,
        dividendYield: 1.8,
        cfoPat: 1.18,
        salesYoy: 18.6,
        profitYoy: 24.1,
        workingCapitalDays: 128,
        score: 72,
        piotroski: 7,
        valuation: { ...list.view.valuation, intrinsic: 118, marginOfSafety: 15.8, upside: 18, graham: 120 },
      },
    })

    expect(values.fundScore).toBe(72)
    expect(values.iv).toBe(118)
    expect(values.mos).toBe(15.8)
    expect(values.piotroski).toBe(7)
    expect(values.pe).toBe(10)
    expect(values.pb).toBe(2) // 100 / 50
    expect(values.ps).toBe(5) // 5000 / 1000
    expect(values.patMargin).toBe(10) // 100 / 1000 * 100
    expect(values.grahamSpread).toBe(20) // (120 - 100) / 100 * 100
    expect(values.debtEquity).toBe(0.46)
    expect(values.offHigh).toBe(-20) // (100 - 125) / 125 * 100
  })

  it('leaves the 52W-high distance null when the price or high is missing', () => {
    expect(compareValuesForView(listWithPriceHigh(100, null)).offHigh).toBeNull()
    expect(compareValuesForView(listWithPriceHigh(null, 125)).offHigh).toBeNull()
  })

  it('returns null (never a fabricated value) for metrics with no approved rule', () => {
    const list = buildListStockView({ symbol: 'TBZ', companyName: null }, null)
    const values = compareValuesForView(list)
    for (const id of ['riskReward', 'evEbitda', 'assetTurnover', 'salesCagr3', 'profitCagr3', 'fcfYield', 'pledged', 'vs200dma', 'return1y']) {
      expect(values[id]).toBeNull()
    }
  })

  it('leaves derived ratios null when the denominator is zero or missing', () => {
    const list = buildListStockView({ symbol: 'TBZ', companyName: null }, null)
    const values = compareValuesForView({
      ...list,
      view: { ...list.view, price: 100, bookValue: 0, marketCap: 5000, revenue: 0, netProfit: 10 },
    })
    expect(values.pb).toBeNull()
    expect(values.ps).toBeNull()
    expect(values.patMargin).toBeNull()
  })

  it('sums FII + DII and reads the promoter holding from ownership', () => {
    const list = buildListStockView({ symbol: 'TBZ', companyName: null }, null)
    const values = compareValuesForView({
      ...list,
      ownership: {
        basis: 'quarterly',
        period: 'Mar 2026',
        signals: [],
        holdings: [
          { key: 'promoter', label: 'Promoters', latest: 51.6, previous: null, changePp: null, latestPeriod: 'Mar 2026', previousPeriod: null },
          { key: 'fii', label: 'FIIs', latest: 8.3, previous: null, changePp: null, latestPeriod: 'Mar 2026', previousPeriod: null },
          { key: 'dii', label: 'DIIs', latest: 4.1, previous: null, changePp: null, latestPeriod: 'Mar 2026', previousPeriod: null },
        ],
      },
    })
    expect(values.promoter).toBe(51.6)
    expect(values.instStake).toBe(12.4)
  })
})

describe('buildCompareUniverse', () => {
  it('maps rows and sorts by score descending, keeping unknown-score stocks last', () => {
    const rows = [
      { stock: { symbol: 'A', companyName: 'Alpha Ltd', list: withScore(60) } },
      { stock: { symbol: 'B', companyName: 'Beta Ltd', list: withScore(90) } },
      { stock: { symbol: 'C', companyName: null, list: null } },
    ]
    const universe = buildCompareUniverse(rows)
    expect(universe.map((stock) => stock.symbol)).toEqual(['B', 'A', 'C'])
    expect(universe[0].name).toBe('Beta Ltd')
    expect(universe[2].name).toBe('C') // falls back to the symbol
    expect(universe[2].values).toEqual({})
  })

  it('selects the top N symbols by default', () => {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F'].map((symbol, index) => ({ stock: { symbol, companyName: null, list: withScore(90 - index) } }))
    const universe = buildCompareUniverse(rows)
    expect(defaultSelection(universe)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(defaultSelection(universe, 2)).toEqual(['A', 'B'])
  })
})

function withScore(score: number): ListStockView {
  const list = buildListStockView({ symbol: 'X', companyName: null }, null)
  return { ...list, view: { ...list.view, score } }
}

function listWithPriceHigh(price: number | null, high: number | null): ListStockView {
  const list = buildListStockView({ symbol: 'X', companyName: null }, null)
  return { ...list, view: { ...list.view, price, high } }
}
