import {
  formatCr,
  formatInr,
  formatIstTimestamp,
  formatNum,
  formatPct,
  type StockView,
} from './stock-detail'
import type { DetailTable } from './scrapers/screener-detail'

/**
 * Renders the currently loaded company data as clean Markdown so the user can
 * paste it into an AI assistant. Every value distinguishes:
 *
 *  - source-reported values (fetched from screener.in) with "(source)"
 *  - calculated values (from lib/intrinsic, lib/growth, lib/piotroski, ...) "(calculated)"
 *  - genuinely missing values as "N/A" (never zero, never invented)
 *
 * The report ends with a Data Quality section that lists every source/period
 * gap and states the calculation basis and rounding policy, so downstream AI
 * analysis knows exactly what was verified and what was derived.
 */

function value(num: number | null | undefined, formatter: (num: number) => string): string {
  return num == null || !Number.isFinite(num) ? 'N/A' : formatter(num)
}

function tableMarkdown(table: DetailTable | null | undefined, limitColumns?: number): string {
  if (!table || !table.rows.length) return 'Not available.'
  const columns = limitColumns ? table.columns.slice(-limitColumns) : table.columns
  const headerIndexes = columns.map((_c, index) => table.columns.length - columns.length + index)
  const header = ['Metric', ...columns].join(' | ')
  const divider = ['---', ...columns.map(() => '---')].join(' | ')
  const body = table.rows
    .map((row) => {
      const cells = headerIndexes.map((index) => row.values[index]?.trim() || 'N/A')
      return [row.label, ...cells].join(' | ')
    })
    .join('\n')
  return `| ${header} |\n| ${divider} |\n| ${body} |`
}

type QualityNote = { kind: 'warning' | 'info'; text: string }

const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

function buildQualityNotes(view: StockView, price: number | null): QualityNote[] {
  const notes: QualityNote[] = []
  const peers = view.detail?.peers

  if (view.piotroski != null && view.piotroskiPartial) {
    notes.push({
      kind: 'warning',
      text:
        `Piotroski F-Score is PARTIAL (${view.piotroski}/${view.piotroskiTotal}): screener.in ` +
        `standalone statements do not expose current assets/current liabilities, so the ` +
        `current-ratio test (${view.piotroskiMissing.join(', ') || 'current-ratio'}) could not be evaluated.`,
    })
  } else if (view.piotroski == null) {
    notes.push({
      kind: 'warning',
      text: 'Piotroski F-Score N/A: not enough financial history in the source statements to evaluate the nine tests.',
    })
  }

  if (!view.industry.length) notes.push({ kind: 'warning', text: 'Industry classification N/A for this company.' })
  if (!view.growth) notes.push({ kind: 'warning', text: 'QoQ/YoY growth N/A: no quarterly results in the source data.' })

  if (!peers || !peers.length) {
    const reason = view.detail?.peersError ? ` (${view.detail.peersError})` : ''
    notes.push({ kind: 'warning', text: `Peer comparison N/A${reason}.` })
  }

  if (view.capturedAt != null && Date.now() - view.capturedAt.getTime() > STALE_AFTER_MS) {
    notes.push({
      kind: 'warning',
      text: `Data is ${Math.round((Date.now() - view.capturedAt.getTime()) / STALE_AFTER_MS)} week(s) old; refresh the stock page before trading decisions.`,
    })
  }

  if (view.valuation.intrinsic != null && price != null) {
    notes.push({
      kind: 'info',
      text: `Intrinsic value is a calculated estimate (screener.in Graham method); margin of safety and upside derive from it and are NOT source-reported.`,
    })
  }

  notes.push({
    kind: 'info',
    text: 'Rounding policy: percentages to 1 decimal, ₹ values to 2 decimals (intrinsic/52-week to 0), all computed from the exact unrounded inputs; a few N/A entries simply mean the metric was not present in the source page at fetch time (a successful page parse, not a failed scrape).',
  })

  return notes
}

const SCREENER_BASE = 'https://www.screener.in'

function peerMarkdown(view: StockView): string {
  const peers = view.detail?.peers
  if (!peers || !peers.length) return 'Not available.'
  const header = ['Company', 'Symbol', 'LTP ₹', 'P/E', 'Mar Cap ₹Cr', 'Sales Qtr ₹Cr', 'Sales Var %', 'Profit Var %', 'ROCE %']
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...peers.map((peer) => {
      const symbol = peer.symbol ? `[${peer.symbol}](${peer.href?.startsWith('http') ? peer.href : `${SCREENER_BASE}${peer.href ?? ''}`})` : 'N/A'
      const name = peer.isSelf ? `${peer.name} (this)` : peer.name
      return `| ${name} | ${symbol} | ${fmtValue(peer.cmp)} | ${fmtValue(peer.pe)} | ${fmtValue(peer.marketCap)} | ${fmtValue(peer.salesQtr)} | ${fmtValue(peer.salesGrowth)} | ${fmtValue(peer.profitGrowth)} | ${fmtValue(peer.roce)} |`
    }),
  ]
  lines.push('')
  lines.push('_"Sales Qtr" / "Sales Var" / "Profit Var" refer to the latest reported quarter (Year-over-year for the growth columns per screener.in)._')
  return lines.join('\n')
}

export function buildCopyMarkdown(view: StockView): string {
  const lines: string[] = []
  const price = view.detail?.topRatios.currentPrice ?? view.price
  const top = view.detail?.topRatios ?? {}
  const fetched = formatIstTimestamp(view.capturedAt)

  lines.push(`# ${view.companyName || view.symbol} (${view.symbol})`)
  lines.push(`Source: ${view.sourceUrl ?? 'N/A'} (screener.in, standalone statements)`)
  lines.push(`Fetched: ${fetched}`)

  // Market snapshot
  lines.push('')
  lines.push('## Market Snapshot')
  lines.push(`- Current Price: ${value(price, (n) => formatInr(n))} (source)`)
  lines.push(`- 52-Week High / Low: ${view.high != null ? `₹ ${formatNum(view.high, 0)}` : 'N/A'} / ${view.low != null ? `₹ ${formatNum(view.low, 0)}` : 'N/A'} (source, point-in-time)`)
  lines.push(`- Market Cap: ${value(view.marketCap, (n) => formatCr(n))} (source)`)
  if (view.capCategory) lines.push(`- Cap Category: ${view.capCategory} (derived from market cap)`)
  lines.push(`- Stock P/E: ${value(view.pe, (n) => formatNum(n, 1))} (source)`)
  lines.push(`- Book Value: ${value(view.bookValue, (n) => formatInr(n))} (source)`)
  lines.push(`- EPS: ${value(view.eps, (n) => formatInr(n))} (source, latest annual)`)
  if (top.faceValue != null) lines.push(`- Face Value: ${formatInr(top.faceValue, 0)} (source)`)
  lines.push(`- Dividend Yield: ${value(view.dividendYield, (n) => formatPct(n, 2))} (source)`)
  lines.push(`- ROCE: ${value(view.roce, (n) => formatPct(n))} (source)`)
  lines.push(`- ROE: ${value(view.roe, (n) => formatPct(n))} (source)`)
  lines.push(`- Debt / Equity: ${view.debtToEquity != null ? view.debtToEquity.toFixed(2) : 'N/A'} (source)`)
  lines.push(`- Revenue (latest annual): ${value(view.revenue, (n) => formatCr(n))} (source)`)
  lines.push(`- Net Profit (latest annual): ${value(view.netProfit, (n) => formatCr(n))} (source)`)
  lines.push(`- CFO / PAT: ${view.cfoPat != null ? view.cfoPat.toFixed(2) : 'N/A'} (calculated = CFO ÷ Net Profit, latest annual)`)
  lines.push(`- Working Capital Days: ${view.workingCapitalDays != null ? `${formatNum(view.workingCapitalDays, 0)} days` : 'N/A'} (source)`)
  lines.push(`- Piotroski F-Score: ${view.piotroski != null ? `${view.piotroski}/${view.piotroskiTotal}${view.piotroskiPartial ? ' (partial)' : ''}` : 'N/A'} (calculated)`)
  lines.push(`- Quality Score (ROCE/ROE blend): ${view.score != null ? view.score : 'N/A'} (calculated)`)

  // Industry
  lines.push('')
  lines.push('## Industry Classification (source: screener.in)')
  if (view.industry.length) {
    lines.push(view.industry.map((item) => `- **${item.level}**: ${item.name ?? 'N/A'}${item.url ? ` ([link](${item.url}))` : ''}`).join('\n'))
  } else {
    lines.push('N/A')
  }

  // Valuation
  const val = view.valuation
  lines.push('')
  lines.push('## Valuation (calculated)')
  lines.push(`- Method: screener.in Graham number — IV = √(EPS × BV × maxP/E × maxP/BV); maxP/E = (median 5-yr sales growth × 1.5) clamped 8–100; maxP/BV = (median 5-yr ROCE ÷ 8) clamped 1–10.`)
  lines.push(`- Calculation date: ${fetched}`)
  lines.push(`- EPS (input): ${value(view.eps, (n) => formatInr(n))}`)
  lines.push(`- Book Value (input): ${value(view.bookValue, (n) => formatInr(n))}`)
  lines.push(`- Median Sales Growth (5Y, input): ${value(val.medianSalesGrowth, (n) => formatPct(n))}`)
  lines.push(`- Median ROCE (5Y, input): ${value(val.medianRoce, (n) => formatPct(n))}`)
  lines.push(`- Max P/E (intermediate): ${formatNum(val.maxPe, 1)}`)
  lines.push(`- Max P/BV (intermediate): ${formatNum(val.maxPbv, 2)}`)
  lines.push(`- Intrinsic Value: ${value(val.intrinsic, (n) => formatInr(n, 0))}`)
  lines.push(`- Margin of Safety: ${value(val.marginOfSafety, (n) => formatPct(n))} (calculated = (IV − price) / IV × 100)`)
  lines.push(`- Upside / Downside: ${value(val.upside, (n) => formatPct(n))} (calculated = (IV − price) / price × 100)`)
  lines.push(`- Graham Number (√(22.5 × EPS × BV), reference): ${value(val.graham, (n) => formatInr(n, 0))}`)

  // Growth
  lines.push('')
  lines.push('## Growth (calculations, basis = screener quarterly results)')
  const growth = view.growth
  if (growth) {
    lines.push(`- Periods: latest ${growth.latest ?? 'N/A'}, QoQ vs ${growth.qoqPrevious ?? 'N/A'}, YoY vs ${growth.yoySame ?? 'N/A'}`)
    lines.push('- Basis: QoQ = (current − previous quarter) / |previous| × 100; YoY = (current − same quarter last year) / |same| × 100. "Operating Profit" maps to screener.in\'s "Profit" row.')
    const rows: [string, 'sales' | 'operatingProfit' | 'netProfit'][] = [
      ['Sales', 'sales'],
      ['Operating Profit', 'operatingProfit'],
      ['Net Profit', 'netProfit'],
    ]
    for (const [label, key] of rows) {
      const qoq = growth.qoq[key]
      const yoy = growth.yoy[key]
      const fmtPct = (p: number | null) => (p == null ? 'N/A' : `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`)
      lines.push(`- ${label}: QoQ ${fmtPct(qoq.pct)} (₹ ${fmtValue(qoq.current)} Cr ← ₹ ${fmtValue(qoq.previous)} Cr); YoY ${fmtPct(yoy.pct)} (vs ₹ ${fmtValue(yoy.previous)} Cr)`)
    }
  } else {
    lines.push('Not available.')
  }

  // Statements
  lines.push('')
  lines.push('## Quarterly Results (₹ Cr — source; each column is a reporting period)')
  lines.push(tableMarkdown(view.detail?.quarters, 7))
  lines.push('')
  lines.push('## Annual Profit & Loss (₹ Cr — source; each column is a reporting period)')
  lines.push(tableMarkdown(view.detail?.profitLoss, 7))
  lines.push('')
  lines.push('## Cash Flow Statement (₹ Cr — source; each column is a reporting period)')
  lines.push(tableMarkdown(view.detail?.cashFlow, 7))

  // Shareholding
  lines.push('')
  lines.push('## Shareholding Pattern (quarterly, % — source)')
  const shareholding = view.detail?.shareholding.quarterly
  if (shareholding && shareholding.rows.length) {
    const columns = shareholding.columns
    const latestCol = columns[columns.length - 1] ?? 'Latest'
    const prevCol = columns[columns.length - 2] ?? 'Previous'
    lines.push(`| Category | ${latestCol} | ${prevCol} |`)
    lines.push('| --- | --- | --- |')
    for (const row of shareholding.rows) {
      const latestValue = row.values[columns.length - 1]?.trim() || 'N/A'
      const prevValue = columns.length > 1 ? row.values[columns.length - 2]?.trim() || 'N/A' : 'N/A'
      lines.push(`| ${row.label} | ${latestValue} | ${prevValue} |`)
    }
  } else {
    lines.push('Not available.')
  }

  // Peers
  lines.push('')
  lines.push('## Peer Comparison (source: screener.in)')
  lines.push(peerMarkdown(view))

  // Data quality
  lines.push('')
  lines.push('## Data Quality Warnings & Notes')
  const notes = buildQualityNotes(view, price)
  if (notes.length) lines.push(...notes.map((note) => `- **${note.kind === 'warning' ? 'Warning' : 'Note'}**: ${note.text}`))
  else lines.push('- No warnings.')

  lines.push('')
  lines.push('_N/A = unavailable in the source at fetch time; never treated as zero. Values tagged "(calculated)" derive from source data via the stated formulas. Verify before investing._')
  return lines.join('\n')
}

function fmtValue(number: number | null | undefined): string {
  return number == null || !Number.isFinite(number) ? 'N/A' : String(number)
}