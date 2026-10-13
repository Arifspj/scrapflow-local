import { describe, expect, it } from 'vitest'
import { computeOpportunity, isFinancialIndustry, opportunityInputFromView, OPPORTUNITY_WEIGHTS } from './opportunity'
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

const FINANCIAL_INPUT = {
  isFinancial: true,
  roce: 16,
  roe: 18,
  opm: 12,
  salesYoy: 14,
  profitYoy: 22,
  qoqSalesPct: 5,
  qoqProfitPct: 9,
  cfoPat: 1.1,
  cfoPat3y: null,
  debtToEquity: 6.2,
  debtToAssets: 0.5,
  pe: 14,
  upside: 22,
}

describe('computeOpportunity', () => {
  it('reports the evaluated weight and normalised score, never a fake 100', () => {
    const result = computeOpportunity(FINANCIAL_INPUT)
    expect(result.evaluatedMax).toBe(80)
    expect(result.coveragePct).toBe(80)
    expect(result.provisional).toBe(false)
    expect(result.normalized).not.toBeNull()
    expect(result.normalized!).toBeGreaterThan(0)
    expect(result.normalized!).toBeLessThanOrEqual(100)
  })

  it('flags triggers and price/volume as not evaluated', () => {
    const result = computeOpportunity(FINANCIAL_INPUT)
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

  it('excludes the debt/equity rule for financials but keeps it for others', () => {
    const financial = computeOpportunity(FINANCIAL_INPUT)
    const industrial = computeOpportunity({ ...FINANCIAL_INPUT, isFinancial: false, debtToEquity: 6.2 })
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
      salesYoy: null,
      profitYoy: null,
      qoqSalesPct: null,
      qoqProfitPct: null,
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
    const input = opportunityInputFromView(
      view({
        roce: 21,
        profitYoy: 30,
        pe: 12,
        debtToEquity: 0.2,
        industry: [{ level: 'sector', name: 'Financials', url: null }],
        growth: {
          latest: 'Mar 2026',
          qoqPrevious: 'Dec 2025',
          yoySame: 'Mar 2025',
          qoq: { sales: { pct: 3, current: null, previous: null }, operatingProfit: { pct: null, current: null, previous: null }, netProfit: { pct: 6, current: null, previous: null } },
          yoy: { sales: { pct: 12, current: null, previous: null }, operatingProfit: { pct: null, current: null, previous: null }, netProfit: { pct: 30, current: null, previous: null } },
        },
      }),
    )
    expect(input.isFinancial).toBe(true)
    expect(input.roce).toBe(21)
    expect(input.profitYoy).toBe(30)
    expect(input.qoqProfitPct).toBe(6)
    expect(input.qoqSalesPct).toBe(3)
  })
})
