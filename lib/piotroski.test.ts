import { describe, expect, it } from 'vitest'
import { computePiotroskiScore } from './piotroski'

const BULLISH = {
  netProfit: [100, 120],
  cashFromOps: [130, 160],
  totalAssets: [1000, 1100],
  borrowings: [300, 250],
  equityCapital: [100, 100],
  sales: [900, 1100],
  operatingProfit: [150, 200],
  currentRatio: [1.5, 1.8],
}

const BEARISH = {
  netProfit: [-50, -80],
  cashFromOps: [-100, -200],
  totalAssets: [1000, 1100],
  borrowings: [300, 350],
  equityCapital: [100, 120],
  sales: [900, 800],
  operatingProfit: [-50, -100],
  currentRatio: [1.8, 1.5],
}

describe('computePiotroskiScore', () => {
  it('scores 9/9 when every fundamental test passes', () => {
    const result = computePiotroskiScore(BULLISH)
    expect(result.score).toBe(9)
    expect(result.missing).toEqual([])
    expect(result.criteria.every((criterion) => criterion.passed === true)).toBe(true)
  })

  it('scores 0/9 for a deteriorating business', () => {
    const result = computePiotroskiScore(BEARISH)
    expect(result.score).toBe(0)
    expect(result.missing).toEqual([])
  })

  it('returns N/A when a signal is unavailable instead of guessing', () => {
    const { currentRatio: _currentRatio, ...withoutCurrentRatio } = BULLISH
    const result = computePiotroskiScore(withoutCurrentRatio)
    expect(result.score).toBeNull()
    expect(result.missing).toContain('current-ratio')
    expect(result.criteria).toHaveLength(9)
  })

  it('returns N/A when there is not enough history for change tests', () => {
    const result = computePiotroskiScore({
      netProfit: [120],
      cashFromOps: [160],
      totalAssets: [1100],
      borrowings: [250],
      equityCapital: [100],
      sales: [1100],
      operatingProfit: [200],
      currentRatio: [1.8],
    })
    expect(result.score).toBeNull()
    expect(result.missing.length).toBeGreaterThan(0)
  })
})
