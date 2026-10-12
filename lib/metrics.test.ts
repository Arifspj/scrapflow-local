import { describe, expect, it } from 'vitest'
import { getMetricStatus, isTickerSymbol, METRIC_BENCHMARKS } from './metrics'

describe('getMetricStatus', () => {
  it('treats higher ROCE/ROE as favourable', () => {
    expect(getMetricStatus('roce', 25)).toBe('good')
    expect(getMetricStatus('roce', 15)).toBe('warn')
    expect(getMetricStatus('roce', 6)).toBe('bad')
    expect(getMetricStatus('roe', 18)).toBe('good')
    expect(getMetricStatus('roe', 4)).toBe('bad')
  })

  it('treats higher P/E and debt as risk, lower as favourable', () => {
    expect(getMetricStatus('pe', 12)).toBe('good')
    expect(getMetricStatus('pe', 28)).toBe('warn')
    expect(getMetricStatus('pe', 60)).toBe('bad')
    expect(getMetricStatus('debtToEquity', 0.2)).toBe('good')
    expect(getMetricStatus('debtToEquity', 1.1)).toBe('warn')
    expect(getMetricStatus('debtToEquity', 2.5)).toBe('bad')
  })

  it('keeps missing data neutral instead of red', () => {
    expect(getMetricStatus('pe', null)).toBe('neutral')
    expect(getMetricStatus('roce', undefined)).toBe('neutral')
    expect(getMetricStatus('roce', Number.NaN)).toBe('neutral')
  })

  it('exposes documented, metric-specific benchmarks', () => {
    expect(METRIC_BENCHMARKS.pe.higherIsBetter).toBe(false)
    expect(METRIC_BENCHMARKS.roce.higherIsBetter).toBe(true)
  })
})

describe('isTickerSymbol', () => {
  it('links only alphabetic tickers, not numeric screener ids', () => {
    expect(isTickerSymbol('RELIANCE')).toBe(true)
    expect(isTickerSymbol('IOC')).toBe(true)
    expect(isTickerSymbol('526873')).toBe(false)
    expect(isTickerSymbol(null)).toBe(false)
  })
})
