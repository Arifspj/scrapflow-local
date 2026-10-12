import { describe, expect, it } from 'vitest'
import { computeScore, SCORE_VERSION, scoreBand, scoreColor, SCORE_WEIGHTS } from './score'

const NOW = new Date('2026-10-13T06:00:00.000Z')

describe('computeScore', () => {
  it('normalises all five components to 100 and full coverage', () => {
    const result = computeScore(
      { roce: 22, roe: 18, opm: 16, salesYoy: 20, profitYoy: 25, cfoPat: 1, debtToEquity: 0.4, debtToAssets: 0.15, pe: 18, upside: 10 },
      NOW,
    )
    expect(result.version).toBe(SCORE_VERSION)
    expect(result.coveragePct).toBe(100)
    expect(result.provisional).toBe(false)
    expect(result.calculatedAt).toBe('2026-10-13T06:00:00.000Z')
    expect(result.score).toBe(84)
    expect(result.parts).toHaveLength(5)
    const maxTotal = result.parts.reduce((sum, part) => sum + part.max, 0)
    expect(maxTotal).toBe(100)
    expect(result.parts.some((part) => part.earned > 0)).toBe(true)
    for (const part of result.parts) {
      expect(part.earned).toBeLessThanOrEqual(part.weight)
      expect(part.weight).toBe(SCORE_WEIGHTS[part.key])
    }
  })

  it('limits a component to its own weight (a single metric cannot exceed max)', () => {
    const result = computeScore(
      { roce: 30, roe: null, opm: null, salesYoy: null, profitYoy: null, cfoPat: null, debtToEquity: null, debtToAssets: null, pe: null, upside: null },
      NOW,
    )
    const profitability = result.parts.find((part) => part.key === 'profitability')!
    expect(profitability.earned).toBe(25)
    expect(result.score).toBe(25)
    expect(result.coveragePct).toBe(25)
    expect(result.provisional).toBe(true)
  })

  it('lowers coverage when data is missing instead of rewarding it', () => {
    const partial = computeScore(
      { roce: null, roe: null, opm: null, salesYoy: null, profitYoy: null, cfoPat: null, debtToEquity: null, debtToAssets: null, pe: 10, upside: null },
      NOW,
    )
    expect(partial.coveragePct).toBe(15)
    expect(partial.provisional).toBe(true)
    for (const part of partial.parts) expect(part.earned).toBeLessThanOrEqual(part.weight)
  })

  it('returns null score and zero coverage when nothing is evaluable', () => {
    const result = computeScore(
      { roce: null, roe: null, opm: null, salesYoy: null, profitYoy: null, cfoPat: null, debtToEquity: null, debtToAssets: null, pe: null, upside: null },
      NOW,
    )
    expect(result.score).toBeNull()
    expect(result.coveragePct).toBe(0)
    expect(result.provisional).toBe(true)
  })

  it('is deterministic and exposes the calculation timestamp', () => {
    const input = { roce: 22, roe: 18, opm: 16, salesYoy: 20, profitYoy: 25, cfoPat: 1, debtToEquity: 0.4, debtToAssets: 0.15, pe: 18, upside: 10 }
    expect(computeScore(input, NOW).score).toBe(computeScore(input, NOW).score)
    expect(computeScore(input, NOW).calculatedAt).not.toBe(computeScore(input, new Date()).calculatedAt)
  })

  it('keeps negative cash conversion from earning high growth points', () => {
    const strongProfit = computeScore(
      { roce: 30, roe: 28, opm: 25, salesYoy: 35, profitYoy: 40, cfoPat: -0.5, debtToEquity: 1, debtToAssets: 0.5, pe: 25, upside: 5 },
      NOW,
    )
    const balanced = computeScore(
      { roce: 22, roe: 18, opm: 16, salesYoy: 20, profitYoy: 25, cfoPat: 1, debtToEquity: 0.4, debtToAssets: 0.15, pe: 18, upside: 10 },
      NOW,
    )
    expect(strongProfit.score!).toBeLessThan(balanced.score!)
    const cashflow = strongProfit.parts.find((part) => part.key === 'cashflow')!
    expect(cashflow.earned).toBeLessThan(10)
  })
})

describe('scoreBand', () => {
  it('maps bands and colours', () => {
    expect(scoreBand(80)).toBe('good')
    expect(scoreBand(74)).toBe('warn')
    expect(scoreBand(50)).toBe('warn')
    expect(scoreBand(49)).toBe('bad')
    expect(scoreBand(null)).toBe('neutral')
    expect(scoreColor('good')).toBe('text-emerald-400')
    expect(scoreColor('warn')).toBe('text-amber-400')
    expect(scoreColor('bad')).toBe('text-red-400')
    expect(scoreColor('neutral')).toBe('text-slate-400')
  })
})