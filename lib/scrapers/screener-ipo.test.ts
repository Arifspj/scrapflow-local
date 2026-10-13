import { describe, expect, it } from 'vitest'
import { kindFromUrl, sourceKindFromLabel } from './types'
import { parseScreenerIpoPage, parseScreenerIpoSource } from './screener-ipo'

const PAGE = `<!doctype html><html><body>
<p class="smaller ink-700">Showing 1069 companies.</p>
<table class="data-table">
  <thead><tr>
    <th class="text"><a href="?sort=name">Name</a></th>
    <th><a href="?sort=listdate">Listing Date</a></th>
    <th><a href="?sort=ipo_mcap">IPO MCap</a> Rs. Cr</th>
    <th><a href="?sort=ipo_price">IPO Price</a></th>
    <th><a href="?sort=current_price">Current Price</a></th>
    <th><a href="?sort=percent_gain_loss">% Change</a></th>
  </tr></thead>
  <tbody>
    <tr class="stripe"><td class="text"><a href="/company/NITYAS/" target="_blank"><span class="ink-900 hover-link">Nityas Gems</span></a></td><td class="ink-600">12 Oct 2026</td><td>127</td><td><span class="ink-600">₹</span> 43</td><td><span class="ink-600">₹</span> 1058.00</td><td><span class="change up">⇡ 2389%</span></td></tr>
    <tr><td class="text"><a href="/company/544982/" target="_blank"><span>Paramount Syntex</span></a></td><td class="ink-600">09 Oct 2026</td><td>234</td><td>127</td><td>98.65</td><td><span class="change down">⇣ 22%</span></td></tr>
    <tr class="stripe"><td class="text"><a href="/company/id/1286233/" target="_blank"><span>R.K. Fashion Accessories</span></a></td><td class="ink-600">12 Oct 2026</td><td>18</td><td>43</td><td>1058</td><td></td></tr>
  </tbody>
</table>
<nav><a href="?page=2">2</a><a href="?page=43">43</a></nav>
</body></html>`

describe('screener-ipo source detection', () => {
  it('maps the label', () => {
    expect(sourceKindFromLabel('Screener IPO listing')).toBe('screener-ipo')
  })

  it('detects the /ipo path', () => {
    expect(kindFromUrl('https://www.screener.in/ipo/recent/?sort=percent_gain_loss&order=desc')).toBe('screener-ipo')
    expect(kindFromUrl('https://www.screener.in/ipo/')).toBe('screener-ipo')
    expect(kindFromUrl('https://www.screener.in/ipo/below-price/')).toBe('screener-ipo')
  })

  it('does not treat unrelated paths as IPOs', () => {
    expect(kindFromUrl('https://www.screener.in/screens/1/x/')).toBe('screener-screen')
    expect(kindFromUrl('https://www.screener.in/ipo2/')).toBeNull()
  })
})

describe('parseScreenerIpoPage', () => {
  const page = parseScreenerIpoPage(PAGE)

  it('reads the stated company count and discovered pages', () => {
    expect(page.totalResults).toBe(1069)
    expect(page.totalPages).toBe(43)
  })

  it('reads rows with ticker, numeric and id hrefs', () => {
    expect(page.rows.map((row) => row.symbol)).toEqual(['NITYAS', '544982'])
    expect(page.rows[0].companyName).toBe('Nityas Gems')
    expect(page.rows[1].companyName).toBe('Paramount Syntex')
  })

  it('parses the IPO metrics and signs % change from the arrow direction', () => {
    expect(page.rows[0].metrics).toEqual({ listingDate: '12 Oct 2026', ipoMcap: 127, ipoPrice: 43, currentPrice: 1058, pctChange: 2389 })
    expect(page.rows[1].metrics.pctChange).toBe(-22)
    expect(page.rows[1].metrics.listingDate).toBe('09 Oct 2026')
  })

  it('warns about ticker-less /company/id/ rows instead of persisting them', () => {
    expect(page.warnings.some((warning) => /without a ticker yet/.test(warning))).toBe(true)
  })
})

describe('parseScreenerIpoSource', () => {
  it('returns the listed symbols as a generic parse result', () => {
    const result = parseScreenerIpoSource(PAGE)
    expect(result.kind).toBe('screener-ipo')
    expect(result.symbols.map((row) => row.symbol)).toEqual(['NITYAS', '544982'])
  })

  it('warns when the table is missing', () => {
    const result = parseScreenerIpoSource('<html><body>empty</body></html>')
    expect(result.symbols).toHaveLength(0)
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})
