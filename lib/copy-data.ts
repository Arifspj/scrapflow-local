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
 * paste it into an AI assistant. Only the data actually loaded for THIS
 * company is included; every missing value becomes N/A. Calculated values carry
 * an explicit method label so they are not confused with source values.
 */

function value(num: number | null | undefined, formatter: (value: number | null) => string): string {
  return num == null ? 'N/A' : formatter(num)
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

export function buildCopyMarkdown(view: StockView): string {
  const lines: string[] = []
  const price = view.detail?.topRatios.currentPrice ?? view.price

  lines.push(`# ${view.companyName || view.symbol} (${view.symbol})`)
  lines.push(`Source: ${view.sourceUrl ?? 'N/A'}`)
  lines.push(`Fetched: ${formatIstTimestamp(view.capturedAt)}`)

  // Market snapshot
  lines.push('')
  lines.push('## Market Snapshot')
  lines.push(`- Current Price: ${value(price, (n) => formatInr(n))}`)
  if (view.high != null || view.low != null) lines.push(`- 52-Week High / Low: ${view.high != null ? `₹ ${formatNum(view.high, 0)}` : 'N/A'} / ${view.low != null ? `₹ ${formatNum(view.low, 0)}` : 'N/A'}`)
  lines.push(`- Market Cap: ${value(view.marketCap, (n) => formatCr(n))}`)
  lines.push(`- Stock P/E: ${value(view.pe, (n) => formatNum(n, 1))}`)
  lines.push(`- Book Value: ${value(view.bookValue, (n) => formatInr(n))}`)
  lines.push(`- Dividend Yield: ${value(view.dividendYield, (n) => formatPct(n, 2))}`)
  lines.push(`- ROCE: ${value(view.roce, (n) => formatPct(n))}`)
  lines.push(`- ROE: ${value(view.roe, (n) => formatPct(n))}`)
  lines.push(`- Debt / Equity: ${view.debtToEquity != null ? view.debtToEquity.toFixed(2) : 'N/A'}`)
  lines.push(`- CFO / PAT: ${view.cfoPat != null ? view.cfoPat.toFixed(2) : 'N/A'}`)
  lines.push(`- Working Capital Days: ${view.workingCapitalDays != null ? `${formatNum(view.workingCapitalDays, 0)} days` : 'N/A'}`)
  lines.push(`- Piotroski F-Score: ${view.piotroski != null ? `${view.piotroski}/9` : 'N/A'}`)

  // Industry
  lines.push('')
  lines.push('## Industry Classification')
  if (view.industry.length) {
    lines.push(view.industry.map((item) => `- **${item.level}**: ${item.name ?? 'N/A'}${item.url ? ` ([link](${item.url}))` : ''}`).join('\n'))
  } else {
    lines.push('Not available.')
  }

  // Valuation
  lines.push('')
  lines.push('## Valuation')
  lines.push(`- Intrinsic Value (screener Graham number = √(EPS × BV × max P/E × max P/BV), calculated): ${value(view.valuation.intrinsic, (n) => formatInr(n, 0))}`)
  lines.push(`- Margin of Safety vs Intrinsic Value (calculated): ${value(view.valuation.marginOfSafety, (n) => formatPct(n))}`)
  lines.push(`- Upside vs Current Price (calculated): ${value(view.valuation.upside, (n) => formatPct(n))}`)
  lines.push(`- Graham Number (√(22.5 × EPS × BV), reference): ${value(view.valuation.graham, (n) => formatInr(n, 0))}`)
  lines.push(`- Median Sales Growth (5Y): ${value(view.valuation.medianSalesGrowth, (n) => formatPct(n))}`)
  lines.push(`- Median ROCE (5Y): ${value(view.valuation.medianRoce, (n) => formatPct(n))}`)
  lines.push(`- Max P/E (5Y growth × 1.5, capped 8–100): ${formatNum(view.valuation.maxPe, 1)}`)
  lines.push(`- Max P/BV (5Y ROCE ÷ 8, capped 1–10): ${formatNum(view.valuation.maxPbv, 2)}`)

  // Growth
  lines.push('')
  lines.push('## Growth (Quarter over Quarter / Year over Year)')
  const growth = view.growth
  if (growth) {
    lines.push(`Periods: latest ${growth.latest ?? 'N/A'}, QoQ vs ${growth.qoqPrevious ?? 'N/A'}, YoY vs ${growth.yoySame ?? 'N/A'}`)
    const rows: [string, 'sales' | 'operatingProfit' | 'netProfit'][] = [
      ['Sales', 'sales'],
      ['Operating Profit', 'operatingProfit'],
      ['Net Profit', 'netProfit'],
    ]
    for (const [label, key] of rows) {
      const qoq = growth.qoq[key]
      const yoy = growth.yoy[key]
      const fmtPct = (p: number | null) => (p == null ? 'N/A' : `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`)
      lines.push(`- ${label}: QoQ ${fmtPct(qoq.pct)} (₹ ${fmtValue(qoq.current)} Cr → vs ₹ ${fmtValue(qoq.previous)} Cr); YoY ${fmtPct(yoy.pct)} (vs ₹ ${fmtValue(yoy.previous)} Cr)`)
    }
  } else {
    lines.push('Not available.')
  }

  // Statements
  lines.push('')
  lines.push('## Quarterly Results (₹ Cr)')
  lines.push(tableMarkdown(view.detail?.quarters, 7))
  lines.push('')
  lines.push('## Annual Profit & Loss (₹ Cr)')
  lines.push(tableMarkdown(view.detail?.profitLoss, 7))
  lines.push('')
  lines.push('## Cash Flow Statement (₹ Cr)')
  lines.push(tableMarkdown(view.detail?.cashFlow, 7))

  // Shareholding
  lines.push('')
  lines.push('## Shareholding Pattern')
  const shareholding = view.detail?.shareholding.quarterly
  if (shareholding) {
    const rows = shareholding.rows.map((row) => {
      const latest = [...row.values].reverse().find((value) => value && value.trim())
      const previous = row.values.length > 1 ? row.values[row.values.length - 2] : null
      return `| ${row.label} | ${latest?.trim() || 'N/A'} | ${previous?.trim() || 'N/A'} |`
    })
    lines.push('| Category | Latest | Previous |')
    lines.push('| --- | --- | --- |')
    lines.push(rows.join('\n'))
  } else {
    lines.push('Not available.')
  }

  // Peers
  lines.push('')
  lines.push('## Peer Comparison (source: screener.in)')
  const peers = view.detail?.peers
  if (peers && peers.length) {
    lines.push('| Company | LTP ₹ | P/E | Mar Cap ₹Cr | Sales Var % | Profit Var % | ROCE % |')
    lines.push('| --- | --- | --- | --- | --- | --- | --- |')
    for (const peer of peers) {
      lines.push(
        `| ${peer.isSelf ? `${peer.name} (this)` : peer.name} | ${fmtValue(peer.cmp)} | ${fmtValue(peer.pe)} | ${fmtValue(peer.marketCap)} | ${fmtValue(peer.salesGrowth)} | ${fmtValue(peer.profitGrowth)} | ${fmtValue(peer.roce)} |`,
      )
    }
  } else {
    lines.push('Not available.')
  }

  lines.push('')
  lines.push('_Values are in ₹ Crore. N/A = unavailable at fetch time. "Calculated" figures derive from source data; verify before investing._')
  return lines.join('\n')
}

function fmtValue(number: number | null | undefined): string {
  return number == null || !Number.isFinite(number) ? 'N/A' : String(number)
}