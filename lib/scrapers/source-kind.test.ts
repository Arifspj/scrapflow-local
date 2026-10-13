import { describe, expect, it } from 'vitest'
import { sourceKindFromLabel } from './types'
import { kindFromUrl } from './types'
import { parseScreenerMarketSource, segmentsFromMarketUrl } from './screener-market'

describe('sourceKindFromLabel', () => {
  it('maps the market category label', () => {
    expect(sourceKindFromLabel('Screener market category')).toBe('screener-market')
  })
})

describe('kindFromUrl', () => {
  it('detects screener adapters from the path', () => {
    expect(kindFromUrl('https://www.screener.in/screens/184/value-stocks/')).toBe('screener-screen')
    expect(kindFromUrl('https://www.screener.in/market/IN05/IN0501/')).toBe('screener-market')
    expect(kindFromUrl('https://www.screener.in/company/RELIANCE/')).toBe('screener-company')
  })

  it('detects chartink and ignores unrelated hosts', () => {
    expect(kindFromUrl('https://chartink.com/screener/foo')).toBe('chartink-scan')
    expect(kindFromUrl('https://example.com/screens/1/')).toBeNull()
    expect(kindFromUrl('not a url')).toBeNull()
  })
})

describe('segmentsFromMarketUrl', () => {
  it('extracts upper-cased segments', () => {
    expect(segmentsFromMarketUrl('https://www.screener.in/market/in05/in0501/in050103/')).toEqual(['IN05', 'IN0501', 'IN050103'])
  })

  it('rejects non-market and malformed paths', () => {
    expect(segmentsFromMarketUrl('https://www.screener.in/screens/1/x/')).toBeNull()
    expect(segmentsFromMarketUrl('https://www.screener.in/company/RELIANCE/')).toBeNull()
  })
})

describe('parseScreenerMarketSource', () => {
  const html = `
    <h1>Industry</h1>
    <table class="data-table">
      <thead><tr><th>S.No.</th><th>Company</th><th>CMP</th></tr></thead>
      <tbody>
        <tr><td>1.</td><td><a href="/company/RELIANCE/">Reliance</a></td><td>2500</td></tr>
        <tr><td>2.</td><td><a href="/company/TCS/">TCS</a></td><td>3500</td></tr>
      </tbody>
    </table>`

  it('returns the listed symbols as a generic parse result', () => {
    const result = parseScreenerMarketSource(html, 'https://www.screener.in/market/IN05/IN0501/IN050103/')
    expect(result.kind).toBe('screener-market')
    expect(result.symbols.map((row) => row.symbol)).toEqual(['RELIANCE', 'TCS'])
  })

  it('warns when no rows are present', () => {
    const result = parseScreenerMarketSource('<html><body>empty</body></html>', 'https://www.screener.in/market/IN05/')
    expect(result.symbols).toHaveLength(0)
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})

describe('segmentsFromMarketUrl edge cases', () => {
  it('rejects malformed segment shapes', () => {
    expect(segmentsFromMarketUrl('https://www.screener.in/market/IN05/bad-seg/')).toBeNull()
    expect(segmentsFromMarketUrl('not a url')).toBeNull()
  })
})
