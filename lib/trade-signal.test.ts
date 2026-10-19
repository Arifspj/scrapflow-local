import { describe, expect, it } from 'vitest'
import {
  classifySignal,
  scorePoints,
  upsidePoints,
  volumeSurgeAt,
  VOLUME_LOOKBACK,
  VOLUME_SURGE_RATIO,
} from './trade-signal'

describe('trade-signal', () => {
  it('grades the score and valuation into points', () => {
    expect(scorePoints(80)).toBe(2)
    expect(scorePoints(60)).toBe(1)
    expect(scorePoints(40)).toBe(-1)
    expect(scorePoints(null)).toBe(0)

    expect(upsidePoints(20)).toBe(2)
    expect(upsidePoints(5)).toBe(1)
    expect(upsidePoints(-5)).toBe(-1)
    expect(upsidePoints(-20)).toBe(-2)
    expect(upsidePoints(null)).toBe(0)
  })

  it('returns BUY only when score and valuation combine to a strong total', () => {
    expect(classifySignal(74, 18)).toBe('BUY')
    expect(classifySignal(60, 20)).toBe('BUY')
    expect(classifySignal(60, 5)).toBe('BUY')
    // Strong score but a rich price stays HOLD.
    expect(classifySignal(80, -5)).toBe('HOLD')
    // Cheap but weak stays HOLD.
    expect(classifySignal(40, 20)).toBe('HOLD')
  })

  it('returns SELL only for weak fundamentals with a rich price', () => {
    expect(classifySignal(40, -20)).toBe('SELL')
    expect(classifySignal(40, -5)).toBe('SELL')
    expect(classifySignal(60, -20)).toBe('HOLD')
  })

  it('lets volume confirmation tip a borderline call', () => {
    expect(classifySignal(60, 5, null)).toBe('BUY')
    expect(classifySignal(50, 0, 'up')).toBe('BUY')
    expect(classifySignal(80, -5, 'down')).toBe('HOLD')
    expect(classifySignal(40, -5, null)).toBe('SELL')
  })

  it('drops a borderline BUY on a volume-down bar but keeps a stronger total', () => {
    // Score 60(1) + upside 5(1) = exactly the BUY threshold, so a down surge removes it.
    expect(classifySignal(60, 5, 'down')).toBe('HOLD')
    // A stronger total stays BUY even against a down bar.
    expect(classifySignal(74, 18, 'down')).toBe('BUY')
  })

  it('never fabricates a BUY from missing inputs', () => {
    expect(classifySignal(null, null)).toBe('HOLD')
    expect(classifySignal(null, 20)).toBe('HOLD')
    expect(classifySignal(80, null)).toBe('HOLD')
  })

  describe('volumeSurgeAt', () => {
    const bar = (close: number, volume: number) => ({ close, volume })

    it('ignores bars inside the warm-up window', () => {
      const bars = Array.from({ length: 5 }, () => bar(100, 1000))
      expect(volumeSurgeAt(bars, 2, 3)).toBeNull()
    })

    it('signs an elevated bar by the day’s move', () => {
      const quiet = Array.from({ length: 3 }, () => bar(100, 1000))
      expect(volumeSurgeAt([...quiet, bar(105, 2000)], 3, 3)).toBe('up')
      expect(volumeSurgeAt([...quiet, bar(95, 2000)], 3, 3)).toBe('down')
    })

    it('requires the volume to clear the surge ratio', () => {
      const quiet = Array.from({ length: 3 }, () => bar(100, 1000))
      expect(volumeSurgeAt([...quiet, bar(105, 1400)], 3, 3)).toBeNull()
      expect(volumeSurgeAt([...quiet, bar(105, 1500)], 3, 3)).toBe('up')
    })

    it('defaults to a 20-bar lookback at 1.5×', () => {
      expect(VOLUME_LOOKBACK).toBe(20)
      expect(VOLUME_SURGE_RATIO).toBe(1.5)
      const bars = Array.from({ length: VOLUME_LOOKBACK + 1 }, (_, index) => bar(100, index === VOLUME_LOOKBACK ? 2000 : 1000))
      expect(volumeSurgeAt(bars, VOLUME_LOOKBACK)).toBe('up')
    })
  })
})
