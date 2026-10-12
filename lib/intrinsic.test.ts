import { describe, expect, it } from 'vitest'
import { annualGrowthRates, clamp, computeIntrinsicValue, marginOfSafety, median } from './intrinsic'

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

describe('computeIntrinsicValue (screener.in Graham number)', () => {
  it('matches the documented formula for a TBZ-like profile', () => {
    const result = computeIntrinsicValue({
      eps: 31.82,
      bookValue: 127,
      sales: [1342, 1844, 2394, 2299, 2620, 3203],
      roce: [6, 9, 11, 12, 22],
    })
    expect(result.medianSalesGrowth).toBeCloseTo(22.25, 1)
    expect(result.maxPe).toBeCloseTo(33.38, 1)
    expect(result.medianRoce).toBe(11)
    expect(result.maxPbv).toBeCloseTo(1.375, 3)
    expect(result.intrinsicValue).toBeCloseTo(430.7, 0)
    expect(marginOfSafety(625, result.intrinsicValue)).toBeCloseTo(-45.1, 1)
  })

  it('clamps max PE to 8 and max PBV to 1 for weak businesses', () => {
    const result = computeIntrinsicValue({ eps: 10, bookValue: 50, sales: [100, 95, 90], roce: [2, 3, 4] })
    expect(result.maxPe).toBe(8)
    expect(result.maxPbv).toBe(1)
    expect(result.intrinsicValue).toBeCloseTo(Math.sqrt(10 * 50 * 8 * 1), 5)
  })

  it('clamps max PE to 100 and max PBV to 10 for high-flyers', () => {
    const result = computeIntrinsicValue({ eps: 10, bookValue: 50, sales: [100, 200, 400], roce: [90, 120, 150] })
    expect(result.maxPe).toBe(100)
    expect(result.maxPbv).toBe(10)
  })

  it('returns no intrinsic value when EPS or book value is unusable', () => {
    expect(computeIntrinsicValue({ eps: -3, bookValue: 50, sales: [100, 120], roce: [20] }).intrinsicValue).toBeNull()
    expect(computeIntrinsicValue({ eps: 10, bookValue: 0, sales: [100, 120], roce: [20] }).intrinsicValue).toBeNull()
    expect(computeIntrinsicValue({ eps: null, bookValue: null, sales: [], roce: [] }).intrinsicValue).toBeNull()
  })
})

describe('marginOfSafety', () => {
  it('compares price against intrinsic value and guards bad inputs', () => {
    expect(marginOfSafety(80, 100)).toBeCloseTo(20, 5)
    expect(marginOfSafety(120, 100)).toBeCloseTo(-20, 5)
    expect(marginOfSafety(null, 100)).toBeNull()
    expect(marginOfSafety(100, 0)).toBeNull()
    expect(marginOfSafety(0, 100)).toBeNull()
    expect(marginOfSafety(100, -5)).toBeNull()
  })

  it('is consistent with the HNDFDS-style example (price 572, IV 221)', () => {
    // (IV − price) / IV × 100 = (221 − 572) / 221 × 100 ≈ −158.82%
    const moS = marginOfSafety(572, 221)
    expect(moS).toBeCloseTo(-158.82, 2)
    // Upside (IV − price) / price × 100 ≈ −61.36%
    expect(((221 - 572) / 572) * 100).toBeCloseTo(-61.36, 2)
  })
})
