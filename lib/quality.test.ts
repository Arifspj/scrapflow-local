import { describe, expect, it } from 'vitest'
import { computeQuality, type QualityInput } from './quality'

function input(overrides: Partial<QualityInput>): QualityInput {
  return {
    roce: null,
    roe: null,
    salesYoy: null,
    profitYoy: null,
    cfoPat: null,
    debtToEquity: null,
    debtToAssets: null,
    piotroski: null,
  pe: null,
  netProfit: null,
  overvaluation: null,
  noEquity: false,
  upside: null,
  intrinsic: null,
    qoqSalesPct: null,
    qoqProfitPct: null,
    ...overrides,
  }
}

describe('computeQuality', () => {
  it('awards MULTIBAGGER only when every criterion passes and no risk fires', () => {
    const result = computeQuality(
      input({ roce: 28, roe: 22, salesYoy: 35, profitYoy: 25, cfoPat: 0.8, debtToEquity: 0.3, debtToAssets: 0.15, piotroski: 8, pe: 15, netProfit: 100, overvaluation: null, upside: 24, intrinsic: 700, qoqSalesPct: 5, qoqProfitPct: 6 }),
    )
    expect(result.primary.label).toBe('MULTIBAGGER')
    expect(result.primary.tone).toBe('good')
    expect(result.risks).toHaveLength(0)
    expect(result.primary.criteriaPassed).toHaveLength(6)
  })

  it('degrades to STRONG COMPOUNDER when one multibagger criterion fails', () => {
    const result = computeQuality(
      input({ roce: 24, roe: 22, salesYoy: 35, profitYoy: 25, cfoPat: 0.8, debtToAssets: 0.15, piotroski: 8 }),
    )
    expect(result.primary.label).toBe('STRONG COMPOUNDER')
  })

  it('keeps a CASH TRAP warning visible even when growth looks attractive', () => {
    const result = computeQuality(
      input({ roce: 28, roe: 22, salesYoy: 35, profitYoy: 25, cfoPat: -0.2, debtToAssets: 0.1, piotroski: 7, pe: 12, netProfit: 120 }),
    )
    const cashTrap = result.risks.find((risk) => risk.kind === 'cash-trap')
    expect(cashTrap).toBeDefined()
    expect(cashTrap!.reasons[0]).toContain('CFO/PAT')
    // profit is real and rising, so the positive story may remain but the flag is not hidden
    expect(result.primary.label).not.toBe('MULTIBAGGER')
  })

  it('does not fire CASH TRAP when PAT is negative (ratio would be meaningless)', () => {
    const result = computeQuality(
      input({ profitYoy: 25, cfoPat: -0.2, netProfit: -50 }),
    )
    expect(result.risks.find((risk) => risk.kind === 'cash-trap')).toBeUndefined()
  })

  it('surfaces HIGH LEVERAGE and blocks a positive classification', () => {
    const result = computeQuality(
      input({ roce: 30, roe: 25, salesYoy: 40, profitYoy: 30, cfoPat: 1, debtToAssets: 0.75 }),
    )
    expect(result.risks.find((risk) => risk.kind === 'high-leverage')).toBeDefined()
    expect(result.primary.label).toBe('WATCH')
  })

  it('triggers OVERPRICED above a 30% premium, and for a wiped-out equity value', () => {
    const overpriced = computeQuality(input({ intrinsic: 100, overvaluation: 60 }))
    expect(overpriced.risks.find((risk) => risk.kind === 'overpriced')).toBeDefined()

    const noFairValue = computeQuality(input({ intrinsic: null, overvaluation: null, noEquity: false }))
    expect(noFairValue.risks.find((risk) => risk.kind === 'overpriced')).toBeUndefined()

    const notOverpriced = computeQuality(input({ intrinsic: 100, overvaluation: 20 }))
    expect(notOverpriced.risks.find((risk) => risk.kind === 'overpriced')).toBeUndefined()

    const wipedOut = computeQuality(input({ intrinsic: 0.4, noEquity: true }))
    expect(wipedOut.risks.find((risk) => risk.kind === 'overpriced')).toBeDefined()
  })

  it('flags SLOWING only when both QoQ sales and profit are negative', () => {
    const slowing = computeQuality(input({ qoqSalesPct: -4, qoqProfitPct: -6 }))
    expect(slowing.risks.find((risk) => risk.kind === 'slowing')).toBeDefined()

    const oneNegative = computeQuality(input({ qoqSalesPct: -4, qoqProfitPct: 2 }))
    expect(oneNegative.risks.find((risk) => risk.kind === 'slowing')).toBeUndefined()
  })

  it('returns WATCH (neutral) when no stronger classification and no risk applies', () => {
    const result = computeQuality(input({ roce: 10, roe: 8, salesYoy: 4, profitYoy: 3, cfoPat: 0.2, debtToAssets: 0.1, piotroski: 3 }))
    expect(result.primary.label).toBe('WATCH')
    expect(result.primary.tone).toBe('neutral')
    expect(result.risks).toHaveLength(0)
  })

  it('shows INSUFFICIENT DATA instead of inventing a classification', () => {
    const result = computeQuality(input({}))
    expect(result.primary.label).toBe('INSUFFICIENT DATA')
  })

  it('downgrades MULTIBAGGER candidates that are simultaneously OVERPRICED', () => {
    const result = computeQuality(
      input({ roce: 28, roe: 22, salesYoy: 35, profitYoy: 25, cfoPat: 0.8, debtToAssets: 0.15, piotroski: 8, intrinsic: 100, overvaluation: 70 }),
    )
    expect(result.primary.label).not.toBe('MULTIBAGGER')
    expect(result.risks.some((risk) => risk.kind === 'overpriced')).toBe(true)
  })
})