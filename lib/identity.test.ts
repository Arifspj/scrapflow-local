import { describe, expect, it } from 'vitest'
import { isNumericSymbol, symbolIdentity } from './identity'

describe('isNumericSymbol', () => {
  it('flags bare numeric source ids', () => {
    expect(isNumericSymbol('2726')).toBe(true)
    expect(isNumericSymbol(' 500325 ')).toBe(true)
  })

  it('keeps real tickers (including digits) as non-numeric', () => {
    expect(isNumericSymbol('RELIANCE')).toBe(false)
    expect(isNumericSymbol('BAJAJ-AUTO')).toBe(false)
    expect(isNumericSymbol('3MINDIA')).toBe(false)
    expect(isNumericSymbol(null)).toBe(false)
    expect(isNumericSymbol('')).toBe(false)
  })
})

describe('symbolIdentity', () => {
  it('labels a numeric code without presenting it as a ticker', () => {
    const identity = symbolIdentity('2726')
    expect(identity.numeric).toBe(true)
    expect(identity.label).toBe('#2726')
    expect(identity.note).toMatch(/not a verified/i)
  })

  it('passes a real symbol through untouched', () => {
    const identity = symbolIdentity('INFY')
    expect(identity.numeric).toBe(false)
    expect(identity.label).toBe('INFY')
    expect(identity.note).toBeNull()
  })
})
