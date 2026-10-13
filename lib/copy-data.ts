import {
  formatCr,
  formatInr,
  formatIstTimestamp,
  formatNum,
  formatPct,
  type StockView,
} from './stock-detail'
import type { DetailTable } from './scrapers/screener-detail'
import { appendPromptToMarkdown, type CopyPromptTemplate } from './copy-prompts'

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
      text: `Intrinsic value is a calculated estimate (blended Graham + capped growth fair value, with a debt-adjusted fallback for cash traps); margin of safety and upside derive from it and are NOT source-reported.`,
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

export function buildCopyMarkdown(view: StockView, prompt?: Pick<CopyPromptTemplate, 'title' | 'instruction'> | null): string {
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
  lines.push(
    `- Working Capital (CCC): ${view.cashConversionCycle != null ? `${formatNum(view.cashConversionCycle, 0)} days` : 'N/A'}${
      view.cashConversionCycleDelta != null ? ` (${view.cashConversionCycleDelta >= 0 ? '+' : ''}${formatNum(view.cashConversionCycleDelta, 0)} vs prev year)` : ''
    } (calculated = Debtor Days + Inventory Days − Days Payable, lower is better)`,
  )
  lines.push(`- Working Capital Days: ${view.workingCapitalDays != null ? `${formatNum(view.workingCapitalDays, 0)} days` : 'N/A'} (source)`)
  lines.push(`- Piotroski F-Score: ${view.piotroski != null ? `${view.piotroski}/${view.piotroskiTotal}${view.piotroskiPartial ? ' (partial)' : ''}` : 'N/A'} (calculated)`)
  const score = view.scoreBreakdown
  lines.push(
    `- Q-Scan Score: ${score && score.score != null ? `${score.score}/100` : 'N/A'} (calculated, model v${score?.version ?? '?'}${score?.provisional ? ', provisional' : ''}; data coverage ${score?.coveragePct ?? 0}%)`,
  )
  for (const part of score?.parts ?? []) {
    lines.push(`  - ${part.label}: ${part.earned.toFixed(1)}/${part.weight}${part.note ? ` — ${part.note}` : ''}`)
  }
  lines.push(
    `- Quality Badge: ${view.quality.primary.label} (rule-based, separate from the score)${view.quality.primary.criteriaPassed.length ? `; met: ${view.quality.primary.criteriaPassed.join(', ')}` : ''}${
      view.quality.primary.criteriaMissing.length ? `; not met/unavailable: ${view.quality.primary.criteriaMissing.join(', ')}` : ''
    }`,
  )
  if (view.quality.risks.length) {
    for (const risk of view.quality.risks) {
      lines.push(`- Risk Flag — ${risk.label}: ${risk.reasons.join('; ')}`)
    }
  } else {
    lines.push('- Risk Flags: none triggered.')
  }

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
  lines.push(
    `- Method: ${
      val.method === 'debt-adjusted'
        ? 'debt-adjusted EV/EBIT — Graham & growth-P/E disabled because the stock is a cash trap (negative CFO or CFO/PAT < 0.3)'
        : val.method === 'no-growth'
          ? 'Graham number + no-growth fair value (growth ≤ 0 → Fair P/E floor 11; blended = min of both)'
          : 'blended Graham + growth fair value (growth > 0 → average of the two)'
    }.`,
  )
  lines.push(`- Calculation date: ${fetched}`)
  lines.push(`- EPS (price ÷ P/E, else reported): ${value(val.eps, (n) => formatInr(n))}`)
  lines.push(`- Book Value (input): ${value(view.bookValue, (n) => formatInr(n))}`)
  lines.push(`- Growth used (latest YoY net profit; 0% if EBIT < 0, else capped 0–5% when other income > 40% of PBT, hard cap 15%): ${value(val.growthRate, (n) => formatPct(n))}`)
  lines.push(`- Fair P/E (min(8.5 + 2 × growth, 38.5), no-growth floor 11): ${value(val.fairPe, (n) => formatNum(n, 1))}`)
  lines.push(`- Graham Number (√(22.5 × EPS × BV)): ${value(val.graham, (n) => formatInr(n, 0))}`)
  lines.push(`- Fair Value (Growth, EPS × Fair P/E): ${value(val.growthValue, (n) => formatInr(n, 0))}`)
  lines.push(`- Intrinsic Value (${val.method === 'debt-adjusted' ? 'debt-adjusted' : 'blended'}): ${value(val.intrinsic, (n) => formatInr(n, 0))}`)
  lines.push(`- Margin of Safety: ${value(val.marginOfSafety, (n) => formatPct(n))} (discount to fair value; 0.0% when the price is above fair value)`)
  lines.push(`- Overvaluation vs Fair Value: ${val.noEquity ? 'No Equity Value' : value(val.overvaluation, (n) => formatPct(n))} (premium when the price is above fair value)`)
  lines.push(`- Upside / Downside: ${value(val.upside, (n) => formatPct(n))} (calculated = (IV − price) / price × 100)`)
  if (val.method === 'debt-adjusted') {
    lines.push(`- Debt-Adjusted inputs: EBITDA ${value(val.ebitda, (n) => formatCr(n))} × ${val.multiple ?? 'N/A'} − Net Debt ${value(val.netDebt, (n) => formatCr(n))}`)
  }

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
  const report = lines.join('\n')
  return prompt ? appendPromptToMarkdown(report, prompt) : report
}

function fmtValue(number: number | null | undefined): string {
  return number == null || !Number.isFinite(number) ? 'N/A' : String(number)
}