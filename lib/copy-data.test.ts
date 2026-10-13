import { describe, expect, it } from 'vitest'
import { buildCopyMarkdown } from './copy-data'
import { parsePeers, parseScreenerDetail } from './scrapers/screener-detail'
import { buildStockView, formatInr, formatNum, formatPct } from './stock-detail'

const HTML = `<!doctype html><html><body>
<div id="company-info" data-company-id="2726" data-warehouse-id="WARE1"></div>
<ul id="top-ratios">
  <li><span class="name">Market Cap</span><span class="value">₹ 8,50,000 Cr.</span></li>
  <li><span class="name">Current Price</span><span class="value">625</span></li>
  <li><span class="name">High / Low</span><span class="value">700 / 500</span></li>
  <li><span class="name">Stock P/E</span><span class="value">19.6</span></li>
  <li><span class="name">Book Value</span><span class="value">127</span></li>
  <li><span class="name">Dividend Yield</span><span class="value">0.42 %</span></li>
  <li><span class="name">ROCE</span><span class="value">22 %</span></li>
  <li><span class="name">ROE</span><span class="value">18 %</span></li>
  <li><span class="name">Face Value</span><span class="value">1</span></li>
</ul>
<section id="profit-loss"><table>
  <thead><tr><th></th><th>Mar 2024</th><th>Mar 2025</th></tr></thead>
  <tbody>
    <tr><td>Sales +</td><td>900</td><td>1100</td></tr>
    <tr><td>Operating Profit +</td><td>150</td><td>200</td></tr>
    <tr><td>Net Profit +</td><td>100</td><td>120</td></tr>
    <tr><td>EPS in Rs</td><td>31.82</td><td>35</td></tr>
  </tbody>
</table></section>
<section id="quarters"><table>
  <thead><tr><th></th><th>Mar 2024</th><th>Jun 2024</th><th>Sep 2024</th><th>Dec 2024</th><th>Mar 2025</th><th>Jun 2025</th><th>Sep 2025</th><th>Dec 2025</th></tr></thead>
  <tbody>
    <tr><td>Sales +</td><td>400</td><td>450</td><td>500</td><td>550</td><td>600</td><td>650</td><td>700</td><td>750</td></tr>
    <tr><td>Operating Profit +</td><td>60</td><td>70</td><td>80</td><td>90</td><td>90</td><td>100</td><td>110</td><td>120</td></tr>
    <tr><td>Net Profit +</td><td>40</td><td>45</td><td>50</td><td>55</td><td>60</td><td>65</td><td>70</td><td>75</td></tr>
  </tbody>
</table></section>
<section id="cash-flow"><table>
  <thead><tr><th></th><th>Mar 2024</th><th>Mar 2025</th></tr></thead>
  <tbody><tr><td>Cash from Operating Activity +</td><td>130</td><td>160</td></tr></tbody>
</table></section>
<section id="balance-sheet"><table>
  <thead><tr><th></th><th>Mar 2024</th><th>Mar 2025</th></tr></thead>
  <tbody>
    <tr><td>Equity Capital +</td><td>100</td><td>100</td></tr>
    <tr><td>Borrowings +</td><td>300</td><td>250</td></tr>
    <tr><td>Total Assets +</td><td>1000</td><td>1100</td></tr>
  </tbody>
</table></section>
<section id="ratios"><table>
  <thead><tr><th></th><th>Mar 2024</th><th>Mar 2025</th></tr></thead>
  <tbody>
    <tr><td>Debtor Days</td><td>90</td><td>120</td></tr>
    <tr><td>Inventory Days</td><td>40</td><td>50</td></tr>
    <tr><td>Days Payable</td><td>60</td><td>80</td></tr>
    <tr><td>Cash Conversion Cycle</td><td>70</td><td>90</td></tr>
    <tr><td>Working Capital Days</td><td>60</td><td>58</td></tr>
    <tr><td>ROCE %</td><td>20</td><td>22</td></tr>
  </tbody>
</table></section>
<section id="shareholding"><table>
  <thead><tr><th></th><th>Mar 2025</th><th>Jun 2025</th></tr></thead>
  <tbody>
    <tr><td>Promoters +</td><td>74.12%</td><td>74.50%</td></tr>
    <tr><td>FIIs +</td><td>0.45%</td><td></td></tr>
  </tbody>
</table></section>
<section id="peers"><div><h2>Peer comparison</h2><p class="sub">
  <a href="/market/IN06/" target="_blank" title="Broad Sector">Healthcare</a>
  <a href="/market/IN06/IN0601/" target="_blank" title="Sector">Healthcare</a>
  <a href="/market/IN06/IN0601/IN060101/" target="_blank" title="Broad Industry">Pharmaceuticals &amp; Biotechnology</a>
  <a href="/market/IN06/IN0601/IN060101/IN060101001/" target="_blank" title="Industry">Pharmaceuticals</a>
</p></div></section>
</body></html>`

const PEERS = `<div data-page-results><table class="data-table"><tbody>
<tr>
  <th class="text">S.No.</th>
  <th class="text">Company</th>
  <th data-tooltip="Current Price">CMP</th>
  <th data-tooltip="Price to Earning">P/E</th>
  <th data-tooltip="Market Capitalization">Mar Cap</th>
  <th data-tooltip="Sales latest quarter">Sales Qtr</th>
  <th data-tooltip="YOY Quarterly sales growth">Qtr Sales Var</th>
  <th data-tooltip="Net Profit latest quarter">NP Qtr</th>
  <th data-tooltip="YOY Quarterly profit growth">Qtr Profit Var</th>
  <th data-tooltip="Return on capital employed">ROCE</th>
</tr>
<tr data-row-company-id="2726">
  <td class="text">1.</td>
  <td class="text"><a href="/company/TBZ/" target="_blank">TBZ Ltd</a></td>
  <td>625</td><td>19.6</td><td>850000</td><td>750</td><td>20</td><td>120</td><td>25</td><td>22</td>
</tr>
<tr data-row-company-id="1448">
  <td class="text">2.</td>
  <td class="text"><a href="/company/RELIANCE/" target="_blank">Reliance Industries</a></td>
  <td>1158.9</td><td>39.97</td><td>1567615.73</td><td>163631</td><td>40.65</td><td>13272</td><td>32.25</td><td>7.78</td>
</tr>
</tbody></table></div>`

function buildView() {
  const detail = parseScreenerDetail(HTML, 'https://www.screener.in/company/TBZ/')
  detail.peers = parsePeers(PEERS, '2726')
  detail.peersError = null
  const capturedAt = new Date('2026-10-12T12:43:00Z')
  return buildStockView({ symbol: 'TBZ', companyName: 'TBZ Ltd' }, { rawData: detail, capturedAt, sourceUrl: detail.sourceUrl })
}

describe('buildCopyMarkdown', () => {
  const view = buildView()
  const markdown = buildCopyMarkdown(view)

  it('starts with the canonical company line, source and IST fetch time', () => {
    expect(markdown).toContain('# TBZ Ltd (TBZ)')
    expect(markdown).toContain('https://www.screener.in/company/TBZ/')
    expect(markdown).toContain('12 Oct 2026')
  })

  it('uses the SAME valuation functions as the UI (no copy/paste drift)', () => {
    expect(view.valuation.intrinsic).not.toBeNull()
    expect(markdown).toContain(`Intrinsic Value (${view.valuation.method}): ${formatInr(view.valuation.intrinsic, 0)}`)
    expect(markdown).toContain(`Margin of Safety: ${formatPct(view.valuation.marginOfSafety)}`)
    expect(markdown).toContain(`Upside / Downside: ${formatPct(view.valuation.upside)}`)
  })

  it('documents the valuation method, inputs and calculation date', () => {
    expect(markdown).toContain('blended Graham + growth fair value')
    expect(markdown).toContain('Calculation date:')
    expect(markdown).toContain(`Fair P/E (min(8.5 + 2 × growth, 38.5), no-growth floor 11): ${formatNum(view.valuation.fairPe, 1)}`)
    expect(markdown).toContain('Graham Number')
  })

  it('reports the cash conversion cycle alongside the source working-capital days', () => {
    expect(markdown).toContain(
      `Working Capital (CCC): ${formatNum(view.cashConversionCycle, 0)} days (+${formatNum(view.cashConversionCycleDelta, 0)} vs prev year)`,
    )
    expect(markdown).toContain('Working Capital Days: 58 days (source)')
  })

  it('reports a documented partial Piotroski when current-ratio is unavailable', () => {
    expect(markdown).toContain('Piotroski F-Score: 8/8 (partial) (calculated)')
    expect(markdown).toContain('current-ratio')
    expect(markdown).toContain('Warning')
  })

  it('emits the industry classification hierarchy', () => {
    expect(markdown).toContain('**industry**: Pharmaceuticals')
    expect(markdown).toContain('[link](/market/IN06/IN0601/IN060101/IN060101001/)')
  })

  it('includes quarterly/annual/cash flow/shareholding with reporting periods', () => {
    expect(markdown).toContain('## Quarterly Results')
    expect(markdown).toContain('## Annual Profit & Loss')
    expect(markdown).toContain('## Cash Flow Statement')
    expect(markdown).toContain('| Category | Jun 2025 | Mar 2025 |')
  })

  it('carries QoQ/YoY comparison periods and calculation basis', () => {
    expect(markdown).toContain('QoQ vs Sep 2025')
    expect(markdown).toContain('YoY vs Dec 2024')
    expect(markdown).toContain('QoQ = (current − previous quarter) / |previous| × 100')
  })

  it('lists each peer with its canonical symbol', () => {
    expect(markdown).toContain('[RELIANCE](https://www.screener.in/company/RELIANCE/)')
    expect(markdown).toContain('Reliance Industries')
  })

  it('renders missing cells as N/A instead of inventing zero', () => {
    expect(markdown).not.toContain('| FIIs | 0')
    expect(markdown).toContain('| FIIs | N/A')
  })

  it('includes a Data Quality section and never leaks secrets', () => {
    expect(markdown).toContain('## Data Quality Warnings & Notes')
    expect(markdown.toLowerCase()).not.toContain('password')
    expect(markdown.toLowerCase()).not.toContain('screener_email')
  })
})