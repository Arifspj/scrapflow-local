import { describe, expect, it } from 'vitest'
import {
  computeMultibagger,
  computeMultibaggerV2,
  MULTIBAGGER_VERSION,
  MULTIBAGGER_VERSION_2,
  MULTIBAGGER_MIN_COVERAGE,
  MULTIBAGGER_WEIGHTS,
  type MultibaggerInput,
} from './multibagger'
import { assessGrowth } from './growth-quality'

function reading(current: number, previous: number, metric = 'x') {
  return assessGrowth({ metric, current, previous })
}

/** Full-model fixture: every submetric present and improving. */
const FULL: MultibaggerInput = {
  isFinancial: false,
  profitYoy: reading(30, 18, 'Net profit'),
  salesYoy: reading(18, 12, 'Sales'),
  qoqProfitGrowth: reading(9, 7, 'QoQ net profit'),
  profitAccelerationPp: 15,
  salesAccelerationPp: 9,
  roce: 24,
  roe: 20,
  roceTrendPp: 3,
  opmTrendPp: 2,
  cfoPat: 1.2,
  debtToEquity: 0.3,
  debtChangePct: -12,
  marginOfSafety: 22,
  pe: 14,
  scannerCategoryCount: 3,
  scannerMembershipCount: 4,
  daysSinceFirstSeen: 10,
  marketCap: 300,
  promoterChangePp: 0.5,
  fiiChangePp: 0.4,
  diiChangePp: -0.1,
  history: { roceChange: 1.5, profitYoyChange: 6, cfoPatChange: 0.2 },
}

const base: MultibaggerInput = {
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

describe('v1 vs v2 version separation', () => {
  it('keeps v1 explicitly versioned and unchanged', () => {
    expect(computeMultibagger(FULL).version).toBe(MULTIBAGGER_VERSION)
    expect(MULTIBAGGER_VERSION).toBe(1)
  })

  it('reports v2 as its own version', () => {
    expect(computeMultibaggerV2(FULL).version).toBe(MULTIBAGGER_VERSION_2)
    expect(MULTIBAGGER_VERSION_2).toBe(2)
  })

  it('counts full evidence at 100% and only the small-base cap lowers the score', () => {
    const v1 = computeMultibagger(FULL)
    const v2 = computeMultibaggerV2(FULL)
    expect(v1.evaluatedMax).toBe(100)
    expect(v2.evaluatedMax).toBe(100)
    expect(v2.parts.every((part) => part.presentCount === part.totalCount && part.subCoveragePct === 100)).toBe(true)
    expect(v2.normalized).not.toBeNull()
    expect(v2.normalized!).toBeLessThanOrEqual(v1.normalized!)
  })
})

describe('v2 component-level evidence coverage', () => {
  it('scales a component maximum by the share of its inputs with data', () => {
    const v2 = computeMultibaggerV2({ ...base, roce: 24 })
    const quality = v2.parts.find((part) => part.key === 'businessQuality')!
    expect(quality.presentCount).toBe(1)
    expect(quality.totalCount).toBe(4)
    expect(quality.subCoveragePct).toBe(25)
    expect(quality.max).toBe(MULTIBAGGER_WEIGHTS.businessQuality / 4)
    expect(v2.coveragePct).toBe(quality.max)
  })

  it('never lets one metric make a component look fully evidenced (unlike v1)', () => {
    const input: MultibaggerInput = { ...base, roce: 30 }
    const v1 = computeMultibagger(input)
    const v2 = computeMultibaggerV2(input)
    const v1Quality = v1.parts.find((part) => part.key === 'businessQuality')!
    const v2Quality = v2.parts.find((part) => part.key === 'businessQuality')!
    expect(v1Quality.max).toBe(MULTIBAGGER_WEIGHTS.businessQuality)
    expect(v2Quality.max).toBe(MULTIBAGGER_WEIGHTS.businessQuality / 4)
    expect(v2Quality.subCoveragePct).toBe(25)
  })

  it('keeps missing metrics unevaluated rather than scoring them', () => {
    const v2 = computeMultibaggerV2(base)
    expect(v2.coveragePct).toBe(0)
    expect(v2.normalized).toBeNull()
    expect(v2.candidate).toBe(false)
    expect(v2.parts.every((part) => !part.evaluated && part.earned === 0 && part.max === 0)).toBe(true)
  })
})

describe('v2 small-base cap', () => {
  it('does not award a small company full small-base points for being small', () => {
    const v2 = computeMultibaggerV2({ ...base, marketCap: 40 })
    const small = v2.parts.find((part) => part.key === 'smallBase')!
    expect(small.evaluated).toBe(true)
    expect(small.earned).toBeLessThanOrEqual(MULTIBAGGER_WEIGHTS.smallBase / 2)
    expect(small.earned).toBeGreaterThan(0)
  })
})

describe('v2 scanner confluence corroboration', () => {
  it('gives only weak credit to a single, freshly-imported scanner', () => {
    const v2 = computeMultibaggerV2({ ...base, scannerCategoryCount: 1, scannerMembershipCount: 1, daysSinceFirstSeen: 3 })
    const confluence = v2.parts.find((part) => part.key === 'scannerConfluence')!
    expect(confluence.presentCount).toBe(1)
    expect(confluence.totalCount).toBe(1)
    expect(confluence.earned).toBeLessThanOrEqual(MULTIBAGGER_WEIGHTS.scannerConfluence * 0.25)
  })

  it('only counts fresh entry once two independent categories corroborate', () => {
    const lone = computeMultibaggerV2({ ...base, scannerCategoryCount: 1, scannerMembershipCount: 2, daysSinceFirstSeen: 3 })
    const corroborated = computeMultibaggerV2({ ...base, scannerCategoryCount: 2, scannerMembershipCount: 2, daysSinceFirstSeen: 3 })
    const loneConfluence = lone.parts.find((part) => part.key === 'scannerConfluence')!
    const corroboratedConfluence = corroborated.parts.find((part) => part.key === 'scannerConfluence')!
    expect(loneConfluence.sub.map((sub) => sub.label)).not.toContain('Fresh entry')
    expect(corroboratedConfluence.sub.map((sub) => sub.label)).toContain('Fresh entry')
    expect(corroboratedConfluence.earned).toBeGreaterThan(loneConfluence.earned)
  })
})

describe('v2 ranking discrimination', () => {
  it('ranks a fully-evidenced improver above a thin-evidence small cap', () => {
    const thinSmallCap: MultibaggerInput = { ...base, roce: 30, marketCap: 30, scannerCategoryCount: 1, scannerMembershipCount: 1, daysSinceFirstSeen: 3 }
    const evidenced: MultibaggerInput = {
      ...base,
      roce: 24,
      roe: 20,
      roceTrendPp: 3,
      profitYoy: reading(30, 18, 'Net profit'),
      profitAccelerationPp: 12,
      salesYoy: reading(18, 12, 'Sales'),
      cfoPat: 1.1,
      debtToEquity: 0.3,
      marginOfSafety: 20,
      marketCap: 1500,
      scannerCategoryCount: 2,
      scannerMembershipCount: 2,
      daysSinceFirstSeen: 20,
    }
    const thin = computeMultibaggerV2(thinSmallCap)
    const full = computeMultibaggerV2(evidenced)
    expect(full.coveragePct).toBeGreaterThan(thin.coveragePct)
    expect(full.normalized ?? -1).toBeGreaterThan(thin.normalized ?? -1)
  })

  it('can withhold a score from a thin small cap that v1 scored highly', () => {
    // A classic v1 inflation case: tiny cap + single fresh scanner + two thin ratios.
    const thin: MultibaggerInput = { ...base, roce: 30, marginOfSafety: 25, marketCap: 40, scannerCategoryCount: 1, scannerMembershipCount: 1, daysSinceFirstSeen: 3 }
    const v1 = computeMultibagger(thin)
    const v2 = computeMultibaggerV2(thin)
    expect(v1.normalized).not.toBeNull()
    expect(v2.coveragePct).toBeLessThan(MULTIBAGGER_MIN_COVERAGE)
    expect(v2.normalized).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// v1 reproduction of the three production rows, reconstructed from the
// component ratios shown on the live dashboard (the DB is not available here,
// so these are representative inputs that hit the same component ratios, not a
// live read of the rows).
// ---------------------------------------------------------------------------

describe('v1 reproduction of production rows (reconstructed inputs)', () => {
  const armour: MultibaggerInput = {
    ...base,
    roce: 23, // ROCE score 86 -> Quality 86%
    marginOfSafety: 25, // MoS score 85 -> Valuation 85%
    scannerCategoryCount: 2, // (75 + 100) / 2 = 87.5 -> Confluence 88%
    scannerMembershipCount: 2,
    daysSinceFirstSeen: 3,
    marketCap: 120, // small-base score ~96.5
  }

  const slone: MultibaggerInput = {
    ...base,
    roce: 26, // ROCE score 92 -> Quality 92%
    marginOfSafety: 23, // MoS score 83 -> Valuation 83%
    scannerCategoryCount: 1, // (45 + 100) / 2 = 72.5 -> Confluence 73%
    scannerMembershipCount: 1,
    daysSinceFirstSeen: 3,
    marketCap: 120,
  }

  const simca: MultibaggerInput = {
    ...base,
    profitYoy: reading(140, 100, 'Net profit'), // +40% -> Profit YoY 100 -> Earnings 100%
    roce: 27, // ROCE score 94 -> Quality 94%
    cfoPat: 0.52, // CFO/PAT score 76 -> Cash/BS 76% (and below 1: operating cash below profit)
    pe: 18, // P/E score 69 -> Valuation 69%
    scannerCategoryCount: 1, // Confluence 73%
    scannerMembershipCount: 1,
    daysSinceFirstSeen: 3,
    marketCap: 290,
  }

  it('reproduces ARMOUR at v1 = 88 over 55% coverage', () => {
    const v1 = computeMultibagger(armour)
    expect(v1.coveragePct).toBe(55)
    expect(v1.normalized).toBe(88)
  })

  it('reproduces SLONE at v1 = 87 over 55% coverage', () => {
    const v1 = computeMultibagger(slone)
    expect(v1.coveragePct).toBe(55)
    expect(v1.normalized).toBe(87)
  })

  it('reproduces SIMCA at v1 = 86 over 95% coverage', () => {
    const v1 = computeMultibagger(simca)
    expect(v1.coveragePct).toBe(95)
    expect(v1.normalized).toBe(86)
  })

  // The same reconstructed rows lose their comparable score under v2, because
  // each of their components rested on a single metric: v1's 55%/95% coverage
  // was really 1-of-4 inputs. This is the honesty correction, shown as a
  // regression so a future change cannot silently re-inflate these rows.
  it('drops all three from the v2 shortlist once evidence is counted per-input', () => {
    expect(computeMultibaggerV2(armour).normalized).toBeNull()
    expect(computeMultibaggerV2(armour).coveragePct).toBe(33)
    expect(computeMultibaggerV2(slone).normalized).toBeNull()
    expect(computeMultibaggerV2(slone).coveragePct).toBe(33)
    expect(computeMultibaggerV2(simca).normalized).toBeNull()
    expect(computeMultibaggerV2(simca).coveragePct).toBe(43)
  })
})
