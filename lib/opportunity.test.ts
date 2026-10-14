import { describe, expect, it } from 'vitest'
import { computeOpportunity, isFinancialIndustry, opportunityInputFromView, OPPORTUNITY_WEIGHTS, type OpportunityInput } from './opportunity'
import { assessGrowth, annualGrowthReading, EXTREME_GROWTH_PCT } from './growth-quality'
import type { StockView } from './stock-detail'

function view(overrides: Partial<StockView> = {}): StockView {
  return {
    symbol: 'TEST',
    companyName: 'Test Ltd',
    detail: null,
    price: null,
    high: null,
    low: null,
    marketCap: null,
    pe: null,
    bookValue: null,
    dividendYield: null,
    roce: null,
    roe: null,
    debtToEquity: null,
    revenue: null,
    netProfit: null,
    eps: null,
    opm: null,
    debtToAssets: null,
    score: null,
    scoreBreakdown: null,
    quality: { badge: '', tone: 'neutral', risks: [] } as unknown as StockView['quality'],
    valuation: { intrinsic: null, marginOfSafety: null } as unknown as StockView['valuation'],
    salesYoy: null,
    profitYoy: null,
    operatingProfitYoy: null,
    salesGrowth: null,
    profitGrowth: null,
    cfoPat: null,
    workingCapitalDays: null,
    cashConversionCycle: null,
    cashConversionCycleDelta: null,
    debtorDays: null,
    inventoryDays: null,
    daysPayable: null,
    piotroski: null,
    piotroskiTotal: 9,
    piotroskiPartial: false,
    piotroskiMissing: [],
    capCategory: null,
    industry: [],
    growth: null,
    badges: [],
    businessBadges: [],
    capturedAt: null,
    sourceUrl: null,
    ...overrides,
  }
}

function reading(current: number | null, previous: number | null, metric = 'x') {
  return assessGrowth({ metric, current, previous })
}

function input(overrides: Partial<OpportunityInput> = {}): OpportunityInput {
  return {
    isFinancial: false,
    roce: 16,
    roe: 18,
    opm: 12,
    salesGrowth: reading(14, 12, 'Sales'),
    profitGrowth: reading(22, 18, 'Net profit'),
    qoqSalesGrowth: reading(5, 4, 'QoQ sales'),
    qoqProfitGrowth: reading(9, 7, 'QoQ net profit'),
    cfoPat: 1.1,
    cfoPat3y: null,
    debtToEquity: 0.3,
    debtToAssets: 0.3,
    pe: 14,
    upside: 22,
    ...overrides,
  }
}

describe('computeOpportunity', () => {
  it('reports the evaluated weight and normalised score, never a fake 100', () => {
    const result = computeOpportunity(input())
    expect(result.evaluatedMax).toBe(80)
    expect(result.coveragePct).toBe(80)
    expect(result.provisional).toBe(false)
    expect(result.normalized).not.toBeNull()
    expect(result.earned).toBeGreaterThan(0)
    expect(result.earned).toBeLessThanOrEqual(result.evaluatedMax)
    expect(result.normalized!).toBeLessThanOrEqual(100)
  })

  it('flags triggers and price/volume as not evaluated', () => {
    const result = computeOpportunity(input())
    const keys = result.parts.map((part) => part.key)
    expect(keys).toEqual(['earningsAcceleration', 'businessQuality', 'valuation', 'cashAndBalanceSheet', 'triggers', 'priceVolume'])
    const triggers = result.parts.find((part) => part.key === 'triggers')!
    const pv = result.parts.find((part) => part.key === 'priceVolume')!
    expect(triggers.evaluated).toBe(false)
    expect(triggers.max).toBe(0)
    expect(triggers.note).toMatch(/not evaluated/i)
    expect(pv.evaluated).toBe(false)
    expect(result.notes).toHaveLength(2)
  })

  it('does not award momentum points for non-comparable (loss) growth', () => {
    const result = computeOpportunity(input({ profitGrowth: reading(34, -0.5, 'Net profit'), qoqProfitGrowth: reading(10, -2, 'QoQ net profit') }))
    const earnings = result.parts.find((part) => part.key === 'earningsAcceleration')!
    expect(earnings.sub.find((sub) => sub.label === 'Profit YoY')!.value).toBeNull()
    expect(earnings.sub.find((sub) => sub.label === 'QoQ profit growth')!.value).toBeNull()
    expect(earnings.note).toMatch(/loss/i)
  })

  it('does not award momentum points for an extreme low-base swing', () => {
    const result = computeOpportunity(input({ profitGrowth: reading(5000, 0.4, 'Net profit') }))
    const earnings = result.parts.find((part) => part.key === 'earningsAcceleration')!
    expect(earnings.sub.find((sub) => sub.label === 'Profit YoY')!.value).toBeNull()
    expect(earnings.note).toMatch(/low base|not directly comparable/i)
  })

  it('excludes the debt/equity rule for financials but keeps it for others', () => {
    const financial = computeOpportunity(input({ isFinancial: true, debtToEquity: 6.2 }))
    const industrial = computeOpportunity(input({ isFinancial: false, debtToEquity: 6.2 }))
    const financialLabels = financial.parts.find((part) => part.key === 'cashAndBalanceSheet')!.sub.map((sub) => sub.label)
    const industrialLabels = industrial.parts.find((part) => part.key === 'cashAndBalanceSheet')!.sub.map((sub) => sub.label)
    expect(financialLabels).not.toContain('Debt / Equity')
    expect(industrialLabels).toContain('Debt / Equity')
    expect(industrial.earned).toBeLessThan(financial.earned)
  })

  it('returns null normalised score and zero coverage when nothing is available', () => {
    const result = computeOpportunity({
      isFinancial: false,
      roce: null,
      roe: null,
      opm: null,
      salesGrowth: null,
      profitGrowth: null,
      qoqSalesGrowth: null,
      qoqProfitGrowth: null,
      cfoPat: null,
      cfoPat3y: null,
      debtToEquity: null,
      debtToAssets: null,
      pe: null,
      upside: null,
    })
    expect(result.normalized).toBeNull()
    expect(result.coveragePct).toBe(0)
    expect(result.provisional).toBe(true)
    expect(result.parts.every((part) => part.max === 0)).toBe(true)
  })

  it('uses the documented weights', () => {
    expect(OPPORTUNITY_WEIGHTS.earningsAcceleration).toBe(25)
    expect(OPPORTUNITY_WEIGHTS.businessQuality).toBe(20)
    expect(OPPORTUNITY_WEIGHTS.valuation).toBe(20)
    expect(OPPORTUNITY_WEIGHTS.cashAndBalanceSheet).toBe(15)
    expect(OPPORTUNITY_WEIGHTS.triggers).toBe(10)
    expect(OPPORTUNITY_WEIGHTS.priceVolume).toBe(10)
  })
})

describe('assessGrowth', () => {
  it('returns ok for a normal positive base', () => {
    const result = reading(22, 18)
    expect(result.status).toBe('ok')
    expect(result.comparable).toBe(true)
    expect(result.pct).toBeCloseTo(22.222, 2)
  })

  it('flags a zero base as not computable', () => {
    const result = reading(5, 0)
    expect(result.status).toBe('zero-base')
    expect(result.pct).toBeNull()
    expect(result.comparable).toBe(false)
  })

  it('flags loss-to-profit without an exploding percentage', () => {
    const result = reading(34, -0.5)
    expect(result.status).toBe('loss-to-profit')
    expect(result.pct).toBeNull()
    expect(result.comparable).toBe(false)
    expect(result.note).toMatch(/loss/i)
  })

  it('flags an extreme low-base swing and keeps the raw percentage for display', () => {
    const result = reading(34, 0.5)
    expect(result.pct).toBeGreaterThan(EXTREME_GROWTH_PCT)
    expect(result.status).toBe('extreme')
    expect(result.comparable).toBe(false)
  })

  it('flags missing comparison data', () => {
    const result = reading(34, null)
    expect(result.status).toBe('missing')
    expect(result.comparable).toBe(false)
  })
})

describe('annualGrowthReading', () => {
  it('pairs the latest two non-TTM annual periods and labels them', () => {
    const table = {
      columns: ['Mar 2023', 'Mar 2024', 'Mar 2025', 'TTM'],
      rows: [{ label: 'Sales', values: ['100', '120', '150', '160'] }],
    }
    const result = annualGrowthReading(table, 'sales', 'Sales')!
    expect(result.current).toBe(150)
    expect(result.previous).toBe(120)
    expect(result.currentPeriod).toBe('Mar 2025')
    expect(result.previousPeriod).toBe('Mar 2024')
    expect(result.pct).toBeCloseTo(25, 5)
    expect(result.status).toBe('ok')
  })

  it('returns null when the row is absent', () => {
    expect(annualGrowthReading({ columns: ['Mar 2025'], rows: [] }, 'sales')).toBeNull()
  })
})

describe('isFinancialIndustry', () => {
  it('detects banks, NBFCs and insurers from the hierarchy', () => {
    expect(isFinancialIndustry([{ name: 'Financials' }, { name: 'Private Sector Bank' }])).toBe(true)
    expect(isFinancialIndustry([{ name: 'Insurance' }])).toBe(true)
    expect(isFinancialIndustry([{ name: 'Information Technology' }])).toBe(false)
    expect(isFinancialIndustry([])).toBe(false)
    expect(isFinancialIndustry(null)).toBe(false)
  })
})

describe('opportunityInputFromView', () => {
  it('maps the view fields and detects financials from the industry', () => {
    const mapped = opportunityInputFromView(
      view({
        roce: 21,
        profitGrowth: reading(30, 18, 'Net profit'),
        pe: 12,
        debtToEquity: 0.2,
        industry: [{ level: 'sector', name: 'Financials', url: null }],
        growth: {
          latest: 'Mar 2026',
          qoqPrevious: 'Dec 2025',
          yoySame: 'Mar 2025',
          qoq: {
            sales: { pct: 3, current: 100, previous: 97 },
            operatingProfit: { pct: null, current: null, previous: null },
            netProfit: { pct: 6, current: 12, previous: 11 },
          },
          yoy: {
            sales: { pct: 12, current: 100, previous: 89 },
            operatingProfit: { pct: null, current: null, previous: null },
            netProfit: { pct: 30, current: 12, previous: 9 },
          },
        },
      }),
    )
    expect(mapped.isFinancial).toBe(true)
    expect(mapped.roce).toBe(21)
    expect(mapped.profitGrowth?.pct).toBeCloseTo(66.667, 2)
    expect(mapped.qoqProfitGrowth?.pct).toBeCloseTo(9.09, 1)
    expect(mapped.qoqSalesGrowth?.pct).toBeCloseTo(3.09, 1)
  })
})
