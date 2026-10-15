import { describe, expect, it } from 'vitest'
import {
  computeMultibagger,
  multibaggerInputFromView,
  MULTIBAGGER_MIN_COVERAGE,
  MULTIBAGGER_WEIGHTS,
  type MultibaggerInput,
} from './multibagger'
import { assessGrowth } from './growth-quality'
import type { StockView } from './stock-detail'

function reading(current: number | null, previous: number | null, metric = 'x') {
  return assessGrowth({ metric, current, previous })
}

function input(overrides: Partial<MultibaggerInput> = {}): MultibaggerInput {
  return {
    isFinancial: false,
    profitYoy: reading(28, 18, 'Net profit'),
    salesYoy: reading(16, 12, 'Sales'),
    qoqProfitGrowth: reading(9, 7, 'QoQ net profit'),
    profitAccelerationPp: 14,
    salesAccelerationPp: 8,
    roce: 20,
    roe: 19,
    roceTrendPp: 3,
    opmTrendPp: 2,
    cfoPat: 1.1,
    debtToEquity: 0.3,
    debtChangePct: -12,
    marginOfSafety: 22,
    pe: 14,
    scannerCategoryCount: 2,
    scannerMembershipCount: 3,
    daysSinceFirstSeen: 30,
    marketCap: 800,
    promoterChangePp: 0.4,
    fiiChangePp: 0.3,
    diiChangePp: -0.2,
    history: { roceChange: 1.5, profitYoyChange: 6, cfoPatChange: 0.2 },
    ...overrides,
  }
}

const ALL_NULL: MultibaggerInput = {
  isFinancial: false,
  profitYoy: null,
  salesYoy: null,
  qoqProfitGrowth: null,
  profitAccelerationPp: null,
  salesAccelerationPp: null,
  roce: null,
  roe: null,
  roceTrendPp: null,
  opmTrendPp: null,
  cfoPat: null,
  debtToEquity: null,
  debtChangePct: null,
  marginOfSafety: null,
  pe: null,
  scannerCategoryCount: 0,
  scannerMembershipCount: 0,
  daysSinceFirstSeen: null,
  marketCap: null,
  promoterChangePp: null,
  fiiChangePp: null,
  diiChangePp: null,
  history: null,
}

describe('computeMultibagger', () => {
  it('uses the documented weights that sum to 100', () => {
    const total = Object.values(MULTIBAGGER_WEIGHTS).reduce((sum, weight) => sum + weight, 0)
    expect(total).toBe(100)
    expect(MULTIBAGGER_WEIGHTS.earningsAcceleration).toBe(25)
    expect(MULTIBAGGER_WEIGHTS.businessQuality).toBe(20)
    expect(MULTIBAGGER_WEIGHTS.cashAndBalanceSheet).toBe(15)
    expect(MULTIBAGGER_WEIGHTS.valuation).toBe(15)
    expect(MULTIBAGGER_WEIGHTS.scannerConfluence).toBe(10)
    expect(MULTIBAGGER_WEIGHTS.smallBase).toBe(10)
    expect(MULTIBAGGER_WEIGHTS.ownership).toBe(5)
  })

  it('reports a normalised score over available evidence and never a fake 100', () => {
    const result = computeMultibagger(input())
    expect(result.coveragePct).toBe(100)
    expect(result.candidate).toBe(true)
    expect(result.normalized).not.toBeNull()
    expect(result.normalized!).toBeLessThanOrEqual(100)
    expect(result.earned).toBeLessThanOrEqual(result.evaluatedMax)
    expect(result.reasons.length).toBeGreaterThan(0)
  })

  it('never counts a missing metric as positive evidence and lowers coverage', () => {
    const result = computeMultibagger(input({ ...ALL_NULL, roce: 20 }))
    expect(result.coveragePct).toBe(MULTIBAGGER_WEIGHTS.businessQuality)
    expect(result.normalized).toBeNull()
    expect(result.parts.filter((part) => part.evaluated).map((part) => part.key)).toEqual(['businessQuality'])
    expect(result.parts.filter((part) => !part.evaluated).every((part) => part.max === 0 && part.earned === 0)).toBe(true)
  })

  it('withholds a score and candidate status when coverage is below the minimum', () => {
    const result = computeMultibagger(input({ ...ALL_NULL, roce: 20, roe: 19 }))
    expect(result.coveragePct).toBeLessThan(MULTIBAGGER_MIN_COVERAGE)
    expect(result.normalized).toBeNull()
    expect(result.candidate).toBe(false)
  })

  it('rewards genuine acceleration over flat growth', () => {
    const accelerating = computeMultibagger(input({ profitAccelerationPp: 20, salesAccelerationPp: 15 }))
    const flat = computeMultibagger(input({ profitAccelerationPp: -10, salesAccelerationPp: -10 }))
    const accelPart = (r: typeof accelerating) => r.parts.find((part) => part.key === 'earningsAcceleration')!.earned
    expect(accelPart(accelerating)).toBeGreaterThan(accelPart(flat))
  })

  it('does not award earnings points for non-comparable (loss) growth', () => {
    const result = computeMultibagger(input({ profitYoy: reading(34, -0.5, 'Net profit'), profitAccelerationPp: null }))
    const earnings = result.parts.find((part) => part.key === 'earningsAcceleration')!
    expect(earnings.sub.find((sub) => sub.label === 'Profit YoY')!.value).toBeNull()
  })

  it('excludes the debt/equity rule for financials but keeps the leverage-relaxed note', () => {
    const financial = computeMultibagger(input({ isFinancial: true, debtToEquity: 6.2 }))
    const industrial = computeMultibagger(input({ isFinancial: false, debtToEquity: 6.2 }))
    const financialLabels = financial.parts.find((part) => part.key === 'cashAndBalanceSheet')!.sub.map((sub) => sub.label)
    const industrialLabels = industrial.parts.find((part) => part.key === 'cashAndBalanceSheet')!.sub.map((sub) => sub.label)
    expect(financialLabels).not.toContain('Debt / Equity')
    expect(industrialLabels).toContain('Debt / Equity')
    expect(industrial.earned).toBeLessThan(financial.earned)
  })

  it('is versioned', () => {
    expect(computeMultibagger(input()).version).toBe(1)
  })
})

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

describe('multibaggerInputFromView', () => {
  it('maps fundamentals and derives scanner confluence + recency', () => {
    const now = Date.now()
    const mapped = multibaggerInputFromView(
      view({
        roce: 21,
        pe: 12,
        marketCap: 950,
        profitGrowth: reading(30, 18, 'Net profit'),
        valuation: { intrinsic: 120, marginOfSafety: 18 } as unknown as StockView['valuation'],
      }),
      {
        isFinancial: false,
        memberships: [
          { scannerId: 'a', category: 'Growth', firstSeenAt: new Date(now - 30 * 86_400_000), lastSeenAt: new Date(now) },
          { scannerId: 'b', category: 'Growth', firstSeenAt: new Date(now - 20 * 86_400_000), lastSeenAt: new Date(now) },
          { scannerId: 'c', category: 'Value', firstSeenAt: new Date(now - 10 * 86_400_000), lastSeenAt: new Date(now) },
        ],
        ownership: {
          basis: 'quarterly',
          period: 'Mar 2026',
          signals: [],
          holdings: [
            { key: 'promoter', label: 'Promoters', latest: 51, previous: 50, changePp: 1, latestPeriod: 'Mar 2026', previousPeriod: 'Dec 2025' },
          ],
        },
        history: { roceChange: 2, profitYoyChange: 5, cfoPatChange: 0.1 },
      },
    )
    expect(mapped.roce).toBe(21)
    expect(mapped.pe).toBe(12)
    expect(mapped.marketCap).toBe(950)
    expect(mapped.marginOfSafety).toBe(18)
    expect(mapped.scannerMembershipCount).toBe(3)
    expect(mapped.scannerCategoryCount).toBe(2)
    expect(mapped.daysSinceFirstSeen).toBeGreaterThanOrEqual(29)
    expect(mapped.promoterChangePp).toBe(1)
    expect(mapped.fiiChangePp).toBeNull()
  })
})
