import { describe, expect, it } from 'vitest'
import { annualGrowthRates, clamp, computeForensicValuation, computeGrowthRate, marginOfSafety, median } from './intrinsic'

describe('median', () => {
  it('averages the middle pair for even counts', () => {
    expect(median([3, 1, 2, 4])).toBe(2.5)
    expect(median([5, 1, 9])).toBe(5)
  })

  it('ignores non-finite values and returns null when empty', () => {
    expect(median([1, Number.NaN, 3])).toBe(2)
    expect(median([])).toBeNull()
  })
})

describe('clamp', () => {
  it('bounds values into the inclusive range', () => {
    expect(clamp(3, 8, 100)).toBe(8)
    expect(clamp(150, 8, 100)).toBe(100)
    expect(clamp(42, 8, 100)).toBe(42)
  })
})

describe('annualGrowthRates', () => {
  it('computes year-on-year growth and skips zero bases', () => {
    expect(annualGrowthRates([100, 120, 150])).toEqual([20, 25])
    expect(annualGrowthRates([100, 120, 0, 60])).toEqual([20, -100])
  })
})

describe('computeGrowthRate (sanitisers)', () => {
  const base = { series: [100, 105], ebit: 50, otherIncome: 0, profitBeforeTax: 40 }

  it('uses the latest year-on-year net-profit change', () => {
    expect(computeGrowthRate(base)).toBeCloseTo(5, 5)
  })

  it('returns 0 when the latest operating profit (EBIT) is negative', () => {
    expect(computeGrowthRate({ ...base, ebit: -1 })).toBe(0)
  })

  it('caps growth to 0–5% when other income exceeds 40% of PBT', () => {
    expect(computeGrowthRate({ ...base, otherIncome: 60, profitBeforeTax: 100 })).toBe(5)
    expect(computeGrowthRate({ ...base, series: [100, 90], otherIncome: 60, profitBeforeTax: 100 })).toBe(0)
  })

  it('hard-caps growth at 15%', () => {
    expect(computeGrowthRate({ ...base, series: [100, 300] })).toBe(15)
  })

  it('falls back to the average trend when the latest YoY is undefined, else null', () => {
    expect(computeGrowthRate({ ...base, series: [100, 0, 50] })).toBeCloseTo(-100, 5)
    expect(computeGrowthRate({ ...base, series: [100] })).toBeNull()
    expect(computeGrowthRate({ ...base, series: [] })).toBeNull()
  })
})

describe('computeForensicValuation', () => {
  it('matches the NINtec-style blended profile (growth 3.57%, EPS from P/E)', () => {
    const result = computeForensicValuation({
      price: 805,
      pe: 805 / 15.84,
      bookValue: 44,
      eps: null,
      profitSeries: [27, 28, 29],
      ebit: 42,
      otherIncome: 0,
      profitBeforeTax: 39,
      cfo: 30,
      cfoPat3y: 1.2,
      debt: 0,
      shares: 300,
    })
    expect(result.growthRate).toBeCloseTo(3.57, 1)
    expect(result.eps).toBeCloseTo(15.84, 2)
    expect(result.fairPe).toBeCloseTo(15.64, 1)
    expect(result.growthValue).toBeCloseTo(247.8, 0)
    expect(result.graham).toBeCloseTo(125.2, 0)
    expect(result.intrinsic).toBeCloseTo(186.5, 0)
    expect(result.method).toBe('blended')
    expect(result.trapped).toBe(false)
    expect(result.noEquity).toBe(false)
    expect(result.overvaluation).toBeCloseTo(331.6, 0)
    expect(result.marginOfSafety).toBe(0)
  })

  it('uses min(Graham, no-growth value) with an 11 Fair P/E when growth ≤ 0', () => {
    const result = computeForensicValuation({
      price: 40,
      pe: 4,
      bookValue: 20,
      eps: null,
      profitSeries: [120, 100],
      ebit: 30,
      otherIncome: 0,
      profitBeforeTax: 25,
      cfo: 20,
      cfoPat3y: 1,
      debt: 0,
      shares: 10,
    })
    expect(result.growthRate).toBeLessThan(0)
    expect(result.fairPe).toBe(11)
    expect(result.growthValue).toBeCloseTo(110, 5)
    expect(result.graham).toBeCloseTo(Math.sqrt(22.5 * 10 * 20), 5)
    expect(result.intrinsic).toBeCloseTo(Math.min(Math.sqrt(22.5 * 10 * 20), 110), 5)
    expect(result.method).toBe('no-growth')
  })

  it('disables Graham / growth-P-E and uses a debt-adjusted value for cash traps', () => {
    const result = computeForensicValuation({
      price: 100,
      pe: 10,
      bookValue: 50,
      eps: null,
      profitSeries: [10, 12],
      ebit: 20,
      otherIncome: 0,
      profitBeforeTax: 15,
      cfo: -5,
      cfoPat3y: -0.5,
      debt: 0,
      shares: 10,
    })
    expect(result.trapped).toBe(true)
    expect(result.method).toBe('debt-adjusted')
    expect(result.intrinsic).toBeCloseTo(12, 5)
    expect(result.debtAdjusted).toBeCloseTo(12, 5)
    expect(result.ebitda).toBe(20)
    expect(result.multiple).toBe(6)
    expect(result.overvaluation).toBeCloseTo(((100 - 12) / 12) * 100, 2)
    expect(result.marginOfSafety).toBe(0)
  })

  it('flags "no equity value" when the fair value collapses below ₹1', () => {
    const result = computeForensicValuation({
      price: 100,
      pe: 100000,
      bookValue: 0.001,
      eps: null,
      profitSeries: [1, 1],
      ebit: 0,
      otherIncome: 0,
      profitBeforeTax: 0,
      cfo: 5,
      cfoPat3y: 1,
      debt: 0,
      shares: 10,
    })
    expect(result.noEquity).toBe(true)
    expect(result.intrinsic).toBeLessThan(1)
    expect(result.marginOfSafety).toBe(0)
    expect(result.overvaluation).toBeNull()
  })

  it('returns a null valuation (never a fabricated number) when inputs are missing', () => {
    const result = computeForensicValuation({
      price: null,
      pe: null,
      bookValue: null,
      eps: null,
      profitSeries: [],
      ebit: null,
      otherIncome: null,
      profitBeforeTax: null,
      cfo: null,
      cfoPat3y: null,
      debt: null,
      shares: null,
    })
    expect(result.intrinsic).toBeNull()
    expect(result.method).toBe('none')
    expect(result.marginOfSafety).toBeNull()
  })
})

describe('marginOfSafety', () => {
  it('is the discount to fair value and 0% when the price is above fair value', () => {
    expect(marginOfSafety(80, 100)).toBeCloseTo(20, 5)
    expect(marginOfSafety(120, 100)).toBe(0)
  })

  it('guards missing / non-equity inputs', () => {
    expect(marginOfSafety(null, 100)).toBeNull()
    expect(marginOfSafety(100, 0)).toBeNull()
    expect(marginOfSafety(0, 100)).toBeNull()
    expect(marginOfSafety(100, -5)).toBeNull()
    expect(marginOfSafety(100, null)).toBeNull()
  })
})
