import { describe, expect, it } from 'vitest'
import { deriveFundamentals } from './resolve'
import { findRow, latestRowNumber, parsePeers, parseScreenerDetail } from './screener-detail'
import type { DetailTable } from './screener-detail'
import {
  buildBadges,
  buildChartSeries,
  buildStockView,
  deriveScore,
  deriveValuation,
  formatIstTimestamp,
  isScreenerDetail,
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
  <thead><tr><th></th><th>Mar 2025</th><th>Mar 2026</th></tr></thead>
  <tbody>
    <tr><td>Debtor Days</td><td>277</td><td>332</td></tr>
    <tr><td>Inventory Days</td><td>6</td><td>18</td></tr>
    <tr><td>Days Payable</td><td>492</td><td>582</td></tr>
    <tr><td>Cash Conversion Cycle</td><td>-209</td><td>-232</td></tr>
    <tr><td>Working Capital Days</td><td>-27</td><td>74</td></tr>
    <tr><td>ROCE %</td><td>20</td><td>22</td></tr>
  </tbody>
</table></section>
<section id="shareholding"><table>
  <thead><tr><th></th><th>Jun 2026</th></tr></thead>
  <tbody><tr><td>Promoters +</td><td>74.12%</td></tr><tr><td>FIIs +</td><td>0.45%</td></tr></tbody>
</table></section>
<section id="quarters"><table>
  <thead><tr><th></th><th>Mar 2025</th><th>Jun 2025</th><th>Sep 2025</th><th>Dec 2025</th></tr></thead>
  <tbody>
    <tr><td>Sales +</td><td>600</td><td>650</td><td>700</td><td>750</td></tr>
    <tr><td>Operating Profit +</td><td>90</td><td>100</td><td>110</td><td>120</td></tr>
    <tr><td>Net Profit +</td><td>60</td><td>65</td><td>70</td><td>75</td></tr>
  </tbody>
</table></section>
<section id="peers"><div><h2>Peer comparison</h2><p class="sub">
  <a href="/market/IN06/" target="_blank" title="Broad Sector">Healthcare</a>
  <a href="/market/IN06/IN0601/" target="_blank" title="Sector">Healthcare</a>
  <a href="/market/IN06/IN0601/IN060101/" target="_blank" title="Broad Industry">Pharmaceuticals &amp; Biotechnology</a>
  <a href="/market/IN06/IN0601/IN060101/IN060101001/" target="_blank" title="Industry">Pharmaceuticals</a>
</p></div></section>
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
    const valuation = deriveValuation({
      price: 625,
      pe: 625 / 30.32,
      bookValue: 126,
      eps: 30.32,
      profitSeries: [100, 120],
      ebit: 200,
      otherIncome: 0,
      profitBeforeTax: 180,
      cfo: 160,
      cfoPat3y: 1.2,
      debt: 250,
      shares: 50,
    })
    expect(valuation.eps).toBeCloseTo(30.32, 2)
    expect(valuation.growthRate).toBe(15)
    expect(valuation.fairPe).toBeCloseTo(38.5, 1)
    expect(valuation.graham).toBeCloseTo(Math.sqrt(22.5 * 30.32 * 126), 1)
    expect(valuation.intrinsic).toBeCloseTo(730.3, 0)
    expect(valuation.method).toBe('blended')
    expect(valuation.marginOfSafety).toBeGreaterThan(0)
    expect(yoyPercent([2620, 3203])).toBeCloseTo(22.25, 1)
  })

  it('formats the live timestamp in IST', () => {
    const formatted = formatIstTimestamp(new Date('2026-10-12T12:43:00Z'))
    expect(formatted).toContain('12 Oct 2026')
    expect(formatted).toMatch(/6:13\s*pm/i)
    expect(formatted.endsWith('IST')).toBe(true)
    expect(formatIstTimestamp(null)).toBe('—')
  })

  it('parses the industry hierarchy from the peers header', () => {
    const detail = parseScreenerDetail(HTML, 'x')
    expect(detail.industry.map((item) => item.level)).toEqual(['broadSector', 'sector', 'broadIndustry', 'industry'])
    expect(detail.industry[0]).toMatchObject({ name: 'Healthcare', url: '/market/IN06/' })
    expect(detail.industry[3]).toMatchObject({ name: 'Pharmaceuticals', url: '/market/IN06/IN0601/IN060101/IN060101001/' })
  })

  it('surfaces the cash conversion cycle alongside the source working-capital days and marks Piotroski N/A', () => {
    const detail = parseScreenerDetail(HTML, 'x')
    const view = buildStockView(
      { symbol: 'TBZ', companyName: 'TBZ' },
      { rawData: detail, capturedAt: new Date('2026-10-12T12:43:00Z'), marketCap: 4160, peRatio: 19.6 },
    )
    expect(view.cashConversionCycle).toBe(-232)
    expect(view.cashConversionCycleDelta).toBe(-23)
    expect(view.debtorDays).toBe(332)
    expect(view.inventoryDays).toBe(18)
    expect(view.daysPayable).toBe(582)
    expect(view.workingCapitalDays).toBe(74)
    expect(view.piotroski).toBeNull()
    expect(view.valuation.intrinsic).not.toBeNull()
  })

  it('builds chart series and skips TTM', () => {
    const detail = parseScreenerDetail(HTML, 'x')
    const chart = buildChartSeries(detail.profitLoss)
    expect(chart?.columns).toEqual(['Mar 2024', 'Mar 2025'])
    expect(chart?.series[0].values).toEqual([2620, 3203])
  })

  it('overlays borrowings from the balance sheet on matching periods', () => {
    const pnl: DetailTable = {
      columns: ['Mar 2024', 'Mar 2025', 'Mar 2026'],
      rows: [
        { label: 'Sales', values: ['100', '200', '300'] },
        { label: 'Net Profit', values: ['10', '20', '30'] },
      ],
    }
    const balance: DetailTable = {
      columns: ['Mar 2023', 'Mar 2024', 'Mar 2025', 'Mar 2026'],
      rows: [{ label: 'Borrowings +', values: ['5', '8', '9', '40'] }],
    }
    const chart = buildChartSeries(pnl, 8, { borrowings: balance })
    expect(chart?.series.map((entry) => entry.name)).toEqual(['Sales', 'Op. Profit', 'Net Profit', 'Borrowings'])
    expect(chart?.series[3].values).toEqual([8, 9, 40])
  })

  it('leaves borrowings blank on periods the balance sheet does not cover', () => {
    const quarters: DetailTable = {
      columns: ['Sep 2024', 'Mar 2025', 'Sep 2025', 'Mar 2026'],
      rows: [{ label: 'Sales', values: ['1', '2', '3', '4'] }],
    }
    const balance: DetailTable = {
      columns: ['Mar 2025', 'Mar 2026'],
      rows: [{ label: 'Borrowings', values: ['33', '261'] }],
    }
    const chart = buildChartSeries(quarters, 8, { borrowings: balance })
    expect(chart?.series.at(-1)?.values).toEqual([null, 33, null, 261])
  })

  it('derives badges from the metrics', () => {    const badges = buildBadges({ upside: -23.6, salesYoy: 10, profitYoy: 197, roce: 21.6, debtToEquity: 0.4 })
    expect(badges.map((badge) => badge.label)).toContain('Overvalued')
    expect(badges.map((badge) => badge.label)).toContain('Good Growth')
    expect(badges.map((badge) => badge.label)).toContain('Low Debt')
  })

  it('derives QoQ/YoY growth and industry from quarters + peers in the view', () => {
    const detail = parseScreenerDetail(HTML, 'x')
    const view = buildStockView({ symbol: 'TBZ', companyName: 'TBZ' }, { rawData: detail })
    expect(view.growth?.latest).toBe('Dec 2025')
    expect(view.growth?.qoq.sales.pct).toBeCloseTo((750 / 700 - 1) * 100, 1)
    expect(view.growth?.qoq.netProfit.pct).toBeCloseTo((75 / 70 - 1) * 100, 1)
    expect(view.growth?.yoy.sales.pct).toBeNull()
    expect(view.growth?.yoySame).toBeNull()
    expect(view.industry).toHaveLength(4)
    expect(view.industry[3]?.name).toBe('Pharmaceuticals')
  })

  it('flags old-format rawData so the page can re-scrape it', () => {
    const detail = parseScreenerDetail(HTML, 'x')
    expect(isScreenerDetail(detail)).toBe(true)
    expect(isScreenerDetail({ marketCap: 4160, peRatio: 19.6 })).toBe(false)
    expect(isScreenerDetail(null)).toBe(false)
  })
})

const PEERS_HTML = `<div data-page-results><table class="data-table"><tbody>
<tr>
  <th class="text">S.No.</th>
  <th class="text">Company</th>
  <th data-tooltip="Current Price">CMP <span>Rs.</span></th>
  <th data-tooltip="Price to Earning">P/E</th>
  <th data-tooltip="Market Capitalization">Mar Cap <span>Rs.Cr.</span></th>
  <th data-tooltip="Dividend yield">Div Yld <span>%</span></th>
  <th data-tooltip="Net Profit latest quarter">NP Qtr</th>
  <th data-tooltip="YOY Quarterly profit growth">Qtr Profit Var <span>%</span></th>
  <th data-tooltip="Sales latest quarter">Sales Qtr</th>
  <th data-tooltip="YOY Quarterly sales growth">Qtr Sales Var <span>%</span></th>
  <th data-tooltip="Return on capital employed">ROCE <span>%</span></th>
</tr>
<tr data-row-company-id="2726">
  <td class="text">1.</td>
  <td class="text"><a href="/company/RELIANCE/" target="_blank">Reliance Industries</a></td>
  <td>1158.90</td><td>39.97</td><td>1567615.73</td><td>0.52</td><td>13272.00</td><td>32.25</td><td>163631.00</td><td>40.65</td><td>7.78</td>
</tr>
<tr data-row-company-id="1448">
  <td class="text">2.</td>
  <td class="text"><a href="/company/IOC/consolidated/" target="_blank">I O C L</a></td>
  <td>125.35</td><td>5.26</td><td>176869.74</td><td>6.58</td><td>-1141.09</td><td>-123.93</td><td>266407.28</td><td></td><td>18.66</td>
</tr>
</tbody><tfoot><tr><td></td><td class="text">Median: 9 Co.</td><td>173.72</td><td>9.82</td><td>30451.45</td><td>2.3</td><td>4.46</td><td>7.87</td><td>38254.19</td><td>36.46</td><td>19.34</td></tr></tfoot></table></div>`

describe('parsePeers', () => {
  const peers = parsePeers(PEERS_HTML, '2726')

  it('maps peer columns by their data-tooltip, not by guessing', () => {
    expect(peers).toHaveLength(2)
    expect(peers[0]).toMatchObject({
      name: 'Reliance Industries',
      symbol: 'RELIANCE',
      cmp: 1158.9,
      pe: 39.97,
      marketCap: 1567615.73,
      dividendYield: 0.52,
      profitGrowth: 32.25,
      salesGrowth: 40.65,
      roce: 7.78,
      isSelf: true,
    })
  })

  it('marks the requested company and keeps empty cells null', () => {
    expect(peers[1]).toMatchObject({ symbol: 'IOC', isSelf: false, salesGrowth: null, profitGrowth: -123.93 })
  })

  it('ignores the median footer row', () => {
    expect(peers.some((peer) => peer.name.includes('Median'))).toBe(false)
  })
})
