import { describe, expect, it } from 'vitest'
import { computeMultibaggerV2, multibaggerInputFromView } from './multibagger'
import { parseScreenerDetail } from './scrapers/screener-detail'
import { buildStockView } from './stock-detail'
import { buildListStockView, buildViewSummary, readViewSummary, summarizeListStockView } from './view-summary'

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
    <tr><td>FIIs +</td><td>0.45%</td><td>0.60%</td></tr>
  </tbody>
</table></section>
<section id="peers"><div><h2>Peer comparison</h2><p class="sub">
  <a href="/market/IN06/" target="_blank" title="Broad Sector">Healthcare</a>
  <a href="/market/IN06/IN0601/" target="_blank" title="Sector">Healthcare</a>
  <a href="/market/IN06/IN0601/IN060101/" target="_blank" title="Broad Industry">Pharmaceuticals &amp; Biotechnology</a>
  <a href="/market/IN06/IN0601/IN060101/IN060101001/" target="_blank" title="Industry">Pharmaceuticals</a>
</p></div></section>
</body></html>`

const STOCK = { symbol: 'TBZ', companyName: 'TBZ Ltd' }

function detailSnapshot() {
  return {
    rawData: parseScreenerDetail(HTML, 'https://www.screener.in/company/TBZ/'),
    capturedAt: new Date('2026-10-12T12:43:00Z'),
    sourceUrl: 'https://www.screener.in/company/TBZ/',
  }
}

function roundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

describe('view summary', () => {
  it('round-trips the full list view through JSON', () => {
    const direct = buildListStockView(STOCK, detailSnapshot())
    const restored = readViewSummary(roundTrip(summarizeListStockView(direct)))
    expect(restored).not.toBeNull()
    // `detail` is intentionally dropped; everything else must survive verbatim.
    expect(restored!.view).toEqual({ ...direct.view, detail: null })
    expect(restored!.ownership).toEqual(direct.ownership)
    expect(restored!.turnaround).toEqual(direct.turnaround)
    expect(restored!.multibaggerInputs).toEqual(direct.multibaggerInputs)
  })

  it('keeps detail-only consumers identical: multibagger input and score', () => {
    const direct = buildListStockView(STOCK, detailSnapshot())
    const restored = readViewSummary(roundTrip(summarizeListStockView(direct)))!
    const ctx = { isFinancial: false, memberships: [], ownership: direct.ownership, history: null }
    const now = new Date('2026-10-15T00:00:00Z')
    const before = multibaggerInputFromView(direct.view, ctx)
    const after = multibaggerInputFromView(restored.view, ctx, restored.multibaggerInputs)
    expect(after).toEqual(before)
    expect(computeMultibaggerV2(after, now)).toEqual(computeMultibaggerV2(before, now))
  })

  it('keeps the classic detail-derived score, quality and valuation identical', () => {
    const view = buildStockView(STOCK, detailSnapshot())
    const restored = readViewSummary(roundTrip(buildViewSummary(STOCK, detailSnapshot())))!
    expect(view.score).not.toBeNull()
    expect(restored.view.score).toBe(view.score)
    expect(restored.view.quality).toEqual(view.quality)
    expect(restored.view.valuation).toEqual(view.valuation)
    expect(restored.view.industry).toEqual(view.industry)
  })

  it('summarizes list-only snapshots without a detail blob', () => {
    const capturedAt = new Date('2026-10-12T12:43:00Z')
    const snapshot = {
      marketCap: 1000,
      rawData: { source: 'screener-market', metrics: { marketCap: 1000, pe: 12 } },
      capturedAt,
      sourceUrl: null,
    }
    const summary = buildViewSummary(STOCK, snapshot)
    expect(summary.view.score).toBeNull()
    const restored = readViewSummary(roundTrip(summary))!
    expect(restored.view.symbol).toBe('TBZ')
    expect(restored.view.detail).toBeNull()
    expect(restored.view.capturedAt).toEqual(capturedAt)
    expect(restored.view.marketCap).toBe(1000)
  })

  it('rejects payloads that are not summaries', () => {
    expect(readViewSummary(null)).toBeNull()
    expect(readViewSummary({})).toBeNull()
    expect(readViewSummary({ view: {}, multibagger: {} })).toBeNull()
    expect(readViewSummary({ view: { symbol: 'X' }, multibagger: {} })).toBeNull()
    expect(readViewSummary({ view: { symbol: 'X', capturedAt: null, industry: [] }, multibagger: {} })).toBeNull()
  })
})
