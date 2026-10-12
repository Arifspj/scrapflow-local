import { describe, expect, it } from 'vitest'
import { deriveFundamentals } from './resolve'
import { findRow, latestRowNumber, parseScreenerDetail } from './screener-detail'
import {
  buildBadges,
  buildChartSeries,
  deriveScore,
  deriveValuation,
  yoyPercent,
} from '../stock-detail'

const HTML = `<!doctype html><html><body>
<ul id="top-ratios">
  <li><span class="name">Market Cap</span><span class="value">₹ <span class="number">4,160</span> Cr.</span></li>
  <li><span class="name">Current Price</span><span class="value">₹ <span class="number">625</span></span></li>
  <li><span class="name">High / Low</span><span class="value">₹ <span class="number">700</span> / <span class="number">110</span></span></li>
  <li><span class="name">Stock P/E</span><span class="value"><span class="number">19.6</span></span></li>
  <li><span class="name">Book Value</span><span class="value">₹ <span class="number">126</span></span></li>
  <li><span class="name">ROCE</span><span class="value"><span class="number">21.6</span> %</span></li>
  <li><span class="name">ROE</span><span class="value"><span class="number">27.1</span> %</span></li>
</ul>
<section id="profit-loss"><table>
  <thead><tr><th></th><th>Mar 2024</th><th>Mar 2025</th><th>TTM</th></tr></thead>
  <tbody>
    <tr><td>Sales +</td><td>2,620</td><td>3,203</td><td>3,420</td></tr>
    <tr><td>Operating Profit</td><td>181</td><td>369</td><td>380</td></tr>
    <tr><td>Net Profit +</td><td>68</td><td>202</td><td>214</td></tr>
    <tr><td>EPS in Rs</td><td>10.25</td><td>30.32</td><td>32.02</td></tr>
  </tbody>
</table></section>
<section id="cash-flow"><table>
  <thead><tr><th></th><th>Mar 2024</th><th>Mar 2025</th></tr></thead>
  <tbody><tr><td>Cash from Operating Activity +</td><td>-27</td><td>30</td></tr></tbody>
</table></section>
<section id="ratios"><table>
  <thead><tr><th></th><th>Mar 2025</th></tr></thead>
  <tbody><tr><td>Working Capital Days</td><td>74</td></tr></tbody>
</table></section>
<section id="shareholding"><table>
  <thead><tr><th></th><th>Jun 2026</th></tr></thead>
  <tbody><tr><td>Promoters +</td><td>74.12%</td></tr><tr><td>FIIs +</td><td>0.45%</td></tr></tbody>
</table></section>
</body></html>`

describe('parseScreenerDetail', () => {
  const detail = parseScreenerDetail(HTML, 'https://www.screener.in/company/TBZ/')

  it('reads the top ratios including 52 week range', () => {
    expect(detail.topRatios).toMatchObject({ marketCap: 4160, currentPrice: 625, peRatio: 19.6, high: 700, low: 110 })
  })

  it('cleans row labels and keeps column headers', () => {
    expect(detail.profitLoss?.rows.map((row) => row.label)).toEqual(['Sales', 'Operating Profit', 'Net Profit', 'EPS (₹)'])
    expect(detail.profitLoss?.columns).toEqual(['Mar 2024', 'Mar 2025', 'TTM'])
  })

  it('picks the latest non-TTM value', () => {
    expect(latestRowNumber(findRow(detail.profitLoss, 'sales'), detail.profitLoss!.columns)).toBe(3203)
    expect(latestRowNumber(findRow(detail.profitLoss, 'net profit'), detail.profitLoss!.columns)).toBe(202)
  })

  it('parses shareholding and cash flow sections', () => {
    expect(detail.shareholding.quarterly?.rows.map((row) => row.label)).toEqual(['Promoters', 'FIIs'])
    expect(findRow(detail.cashFlow, 'cash from operating')?.values).toEqual(['-27', '30'])
  })

  it('derives fundamentals from the detail', () => {
    expect(deriveFundamentals(detail)).toMatchObject({ marketCap: 4160, peRatio: 19.6, revenue: 3203, netProfit: 202, eps: 30.32 })
  })
})

describe('stock-detail helpers', () => {
  it('computes valuation, score and growth', () => {
    expect(deriveScore(21.6, 27.1)).toBe(24)
    const valuation = deriveValuation({ price: 625, eps: 30.32, bookValue: 126, roce: 21.6 })
    expect(valuation.fair).toBeCloseTo(454.8, 1)
    expect(valuation.graham).toBeCloseTo(Math.sqrt(22.5 * 30.32 * 126), 1)
    expect(valuation.upside).toBeLessThan(0)
    expect(yoyPercent([2620, 3203])).toBeCloseTo(22.25, 1)
  })

  it('builds chart series and skips TTM', () => {
    const detail = parseScreenerDetail(HTML, 'x')
    const chart = buildChartSeries(detail.profitLoss)
    expect(chart?.columns).toEqual(['Mar 2024', 'Mar 2025'])
    expect(chart?.series[0].values).toEqual([2620, 3203])
  })

  it('derives badges from the metrics', () => {
    const badges = buildBadges({ upside: -23.6, salesYoy: 10, profitYoy: 197, roce: 21.6, debtToEquity: 0.4 })
    expect(badges.map((badge) => badge.label)).toContain('Overvalued')
    expect(badges.map((badge) => badge.label)).toContain('Good Growth')
    expect(badges.map((badge) => badge.label)).toContain('Low Debt')
  })
})
