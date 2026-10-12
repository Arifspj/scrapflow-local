import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import {
  buildChartSeries,
  buildStockView,
  findDetailRow,
  formatCr,
  formatInr,
  formatNum,
  formatPct,
  lastNonEmpty,
  type ChartSeries,
  type StockView,
} from '@/lib/stock-detail'
import type { DetailTable } from '@/lib/scrapers/screener-detail'
import { ensureStockDetail } from '@/lib/stocks'
import { RoceCalculator, TradeCalculator } from './calculators'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ symbol: string }> }

const TONE: Record<string, string> = {
  good: 'text-emerald-400',
  warn: 'text-amber-400',
  bad: 'text-red-400',
  info: 'text-cyan-400',
  neutral: 'text-slate-400',
}

const BADGE_TONE: Record<string, string> = {
  good: 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300',
  warn: 'border-amber-500/50 bg-amber-950/40 text-amber-300',
  info: 'border-cyan-500/50 bg-cyan-950/40 text-cyan-300',
  neutral: 'border-slate-600/50 bg-slate-800/40 text-slate-300',
}

function scoreTone(score: number | null): string {
  if (score == null) return 'bg-slate-800 text-slate-300'
  if (score >= 70) return 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/50'
  if (score >= 50) return 'bg-amber-950/80 text-amber-400 border border-amber-500/50'
  return 'bg-red-950/80 text-red-400 border border-red-600/50'
}

function tag(value: number | null, good: (n: number) => boolean, goodText: string, badText: string): { text: string; tone: string } | null {
  if (value == null) return null
  return good(value) ? { text: goodText, tone: TONE.good } : { text: badText, tone: TONE.warn }
}

function sliceTable(table: DetailTable | null | undefined, limit: number): DetailTable | null {
  if (!table) return null
  return {
    columns: table.columns.slice(-limit),
    rows: table.rows.map((row) => ({ label: row.label, values: row.values.slice(-limit) })),
  }
}

function Kpi({ label, value, value2, tag: tagProp }: { label: string; value: string; value2?: { text: string; tone: string }; tag?: { text: string; tone: string } | null }) {
  return (
    <div className="flex flex-col justify-between rounded-md border border-[#1d2b45] bg-[#0e1626] p-2">
      <span className="text-[10px] font-semibold uppercase text-slate-400">{label}</span>
      <div className="mt-1 flex items-baseline justify-between gap-1">
        <span className="font-mono text-sm font-bold tabular-nums text-white">{value}</span>
        {tagProp && <span className={`text-[10px] font-bold ${tagProp.tone}`}>{tagProp.text}</span>}
        {value2 && <span className={`text-[10px] font-bold ${value2.tone}`}>{value2.text}</span>}
      </div>
    </div>
  )
}

function Card({ title, right, children, id }: { title: string; right?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <div id={id} className="flex flex-col rounded-lg border border-[#1d2b45] bg-[#0e1626] p-3">
      <div className="flex items-center justify-between border-b border-[#1b263d] pb-1.5">
        <h3 className="text-xs font-bold text-white">{title}</h3>
        {right}
      </div>
      <div className="mt-1 flex-1">{children}</div>
    </div>
  )
}

function FinancialTable({ table, suffix = '' }: { table: DetailTable | null; suffix?: string }) {
  if (!table) return <p className="py-6 text-center text-xs text-slate-500">Financial data not available. Re-import this stock to fetch it.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-2xs">
        <thead>
          <tr className="border-b border-[#19263f] text-[10px] text-slate-400">
            <th className="py-1">Metric</th>
            {table.columns.map((column) => (
              <th key={column} className="py-1 text-right">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#152136] font-mono tabular-nums text-slate-300">
          {table.rows.map((row) => (
            <tr key={row.label}>
              <td className="py-1 font-sans font-medium text-slate-200">
                {row.label}
                {suffix}
              </td>
              {row.values.map((value, index) => (
                <td key={index} className={`py-1 text-right ${index === row.values.length - 1 ? 'font-semibold text-white' : ''}`}>
                  {value || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function QuarterlyBarChart({ chart }: { chart: ChartSeries | null }) {
  if (!chart) return <p className="flex h-44 items-center justify-center text-xs text-slate-500">Quarterly data not available.</p>
  const max = Math.max(...chart.series.flatMap((entry) => entry.values), 1)
  return (
    <div>
      <div className="flex h-40 items-end justify-between gap-2 border-b border-slate-800 px-2">
        {chart.columns.map((column, index) => (
          <div key={column} className="flex h-full flex-1 items-end justify-center gap-0.5">
            {chart.series.map((entry) => (
              <div
                key={entry.name}
                className="w-2 rounded-t-sm"
                style={{ height: `${Math.max((entry.values[index] / max) * 100, 1)}%`, background: entry.color }}
                title={`${entry.name}: ${formatNum(entry.values[index], 0)}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex justify-between px-2 pt-1 font-mono text-[9px] text-slate-400">
        {chart.columns.map((column) => (
          <span key={column}>{column}</span>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-center gap-4 border-t border-[#172236] pt-2 text-[10px]">
        {chart.series.map((entry) => (
          <span key={entry.name} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-slate-300">{entry.name}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function ProfitLineChart({ chart }: { chart: ChartSeries | null }) {
  if (!chart) return <p className="flex h-44 items-center justify-center text-xs text-slate-500">Annual data not available.</p>
  const all = chart.series.flatMap((entry) => entry.values)
  const maxV = Math.max(...all, 1)
  const minV = Math.min(...all, 0)
  const range = maxV - minV || 1
  const width = 300
  const height = 130
  const pad = 12
  const xFor = (index: number) => pad + (index * (width - pad * 2)) / Math.max(chart.columns.length - 1, 1)
  const yFor = (value: number) => height - pad - ((value - minV) / range) * (height - pad * 2)
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-40 w-full">
        {chart.series.map((entry) => (
          <g key={entry.name}>
            <polyline fill="none" stroke={entry.color} strokeWidth="2" points={entry.values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(' ')} />
            {entry.values.map((value, index) => (
              <circle key={index} cx={xFor(index)} cy={yFor(value)} r="2.4" fill={entry.color} />
            ))}
          </g>
        ))}
      </svg>
      <div className="flex justify-between px-2 font-mono text-[9px] text-slate-400">
        {chart.columns.map((column) => (
          <span key={column}>{column.replace(/^Mar\s+/, '').replace(/^Mar$/, '')}</span>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-center gap-4 border-t border-[#172236] pt-2 text-[10px]">
        {chart.series.map((entry) => (
          <span key={entry.name} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-slate-300">{entry.name}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function ValuationTable({ view }: { view: StockView }) {
  const { valuation } = view
  const rows: { label: string; value: string; status?: { text: string; tone: string } }[] = [
    { label: 'Current Price', value: formatInr(view.price) },
    { label: 'Graham Number', value: formatInr(valuation.graham), status: { text: 'Est.', tone: TONE.info } },
    { label: 'No-Growth Fair Value', value: formatInr(valuation.noGrowth), status: { text: 'Est.', tone: TONE.info } },
    { label: 'Conservative Fair Value', value: formatInr(valuation.conservative), status: { text: 'Est.', tone: TONE.info } },
    { label: 'P/E (fair 15)', value: formatNum(view.pe, 1), status: view.pe != null ? (view.pe <= 20 ? { text: 'Fair', tone: TONE.good } : { text: 'Rich', tone: TONE.warn }) : undefined },
    { label: 'Potential Upside', value: formatPct(valuation.upside), status: valuation.upside != null ? (valuation.upside >= 0 ? { text: '+', tone: TONE.good } : { text: '-', tone: TONE.warn }) : undefined },
  ]
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="border-b border-[#19263f] text-[10px] text-slate-400">
          <th className="py-1">Metric</th>
          <th className="py-1 text-right">Value</th>
          <th className="py-1 text-right">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#152035] text-2xs">
        {rows.map((row) => (
          <tr key={row.label}>
            <td className="py-1 font-medium text-slate-300">{row.label}</td>
            <td className="py-1 text-right font-mono text-white">{row.value}</td>
            <td className={`py-1 text-right font-semibold ${row.status ? row.status.tone : 'text-slate-500'}`}>{row.status ? row.status.text : '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default async function StockPage({ params }: Props) {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase()
  const stock = await ensureStockDetail(symbol)
  if (!stock) notFound()

  const related = await prisma.stock.findMany({
    take: 40,
    orderBy: { updatedAt: 'desc' },
    include: { fundamentals: { orderBy: { capturedAt: 'desc' }, take: 1 } },
  })
  const relatedViews = related.map((item) => ({ id: item.id, view: buildStockView(item, item.fundamentals[0] ?? null) }))
  const view = buildStockView(stock, stock.fundamentals[0] ?? null)

  const quarterlyChart = buildChartSeries(sliceTable(view.detail?.quarters, 8), 8)
  const annualChart = buildChartSeries(sliceTable(view.detail?.profitLoss, 8), 8)
  const quartersTable = sliceTable(view.detail?.quarters, 7)
  const annualTable = sliceTable(view.detail?.profitLoss, 6)
  const cashFlowTable = sliceTable(view.detail?.cashFlow, 6)

  const shareholding = view.detail?.shareholding.quarterly ?? null
  const shareCategories = [
    ['Promoters', findDetailRow(shareholding, 'promoters')],
    ['FIIs', findDetailRow(shareholding, 'fiis')],
    ['DIIs', findDetailRow(shareholding, 'diis')],
    ['Public', findDetailRow(shareholding, 'public')],
    ['No. of Shareholders', findDetailRow(shareholding, 'no. of shareholders')],
  ] as const

  const captured = view.capturedAt ? view.capturedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
  const initials = view.symbol.slice(0, 3)

  const metrics: { label: string; value: string; tag?: { text: string; tone: string } | null }[] = [
    { label: 'Market Cap', value: formatCr(view.marketCap) },
    { label: 'P/E', value: formatNum(view.pe, 1), tag: view.pe != null ? (view.pe <= 25 ? { text: 'Fair', tone: TONE.good } : { text: 'Rich', tone: TONE.warn }) : null },
    { label: 'Fair Value', value: formatInr(view.valuation.fair, 0), tag: view.valuation.upside != null ? { text: formatPct(view.valuation.upside, 0), tone: view.valuation.upside >= 0 ? TONE.good : TONE.warn } : null },
    { label: 'ROCE', value: formatPct(view.roce), tag: tag(view.roce, (n) => n >= 15, 'Good', 'Low') },
    { label: 'ROE', value: formatPct(view.roe), tag: tag(view.roe, (n) => n >= 15, 'Good', 'Low') },
    { label: 'CFO / PAT', value: view.cfoPat != null ? view.cfoPat.toFixed(2) : '—', tag: view.cfoPat != null ? (view.cfoPat >= 1 ? { text: 'Solid', tone: TONE.good } : { text: 'Weak', tone: TONE.warn }) : null },
    { label: 'Piotroski F', value: '—' },
    { label: 'Div. Yield', value: formatPct(view.dividendYield, 2), tag: view.dividendYield != null ? (view.dividendYield >= 1 ? { text: 'Good', tone: TONE.good } : { text: 'Low', tone: TONE.warn }) : null },
    { label: 'D/E', value: view.debtToEquity != null ? view.debtToEquity.toFixed(2) : '—', tag: tag(view.debtToEquity, (n) => n <= 1, 'Low', 'High') },
    { label: 'Working Capital', value: view.workingCapitalDays != null ? `${formatNum(view.workingCapitalDays, 0)} days` : '—' },
  ]

  return (
    <div className="min-h-screen bg-[#070b14] text-xs text-slate-200 antialiased">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-[#1b263b] bg-[#0b1220] px-4 py-2">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex items-end gap-0.5 rounded-lg border border-cyan-800/40 bg-[#0e1e38] p-1.5">
              <div className="h-3 w-1.5 rounded-sm bg-cyan-400" />
              <div className="h-4 w-1.5 rounded-sm bg-emerald-400" />
              <div className="h-6 w-1.5 rounded-sm bg-cyan-300" />
            </div>
            <div>
              <span className="block text-lg font-black leading-none tracking-tight text-white">Q-Scan</span>
              <span className="block text-[10px] leading-none tracking-wider text-slate-400">Fundamental Stock Scanner</span>
            </div>
          </Link>
          {stock.scanners[0] && <span className="rounded-md border border-cyan-700/50 bg-[#14233c] px-3 py-1.5 font-medium text-cyan-400">{stock.scanners[0].scanner.name}</span>}
        </div>
        <form action="/" method="get" className="relative w-80">
          <input name="q" placeholder="Search company name or symbol..." className="w-full rounded-md border border-[#1e293b] bg-[#0a0f1b] py-1.5 pl-3 pr-3 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none" />
        </form>
      </header>

      <div className="flex h-[calc(100vh-53px)] overflow-hidden">
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-[#1a2539] bg-[#090f1a]">
          <div className="grid grid-cols-12 border-b border-[#182338] bg-[#0c1322] px-2 py-1.5 text-center text-[10px] font-bold uppercase text-slate-400">
            <div className="col-span-1 text-left">#</div>
            <div className="col-span-5 text-left">Company</div>
            <div className="col-span-2 text-right">LTP</div>
            <div className="col-span-2 text-right">IV</div>
            <div className="col-span-2 text-right">Score</div>
          </div>
          <div className="flex-1 divide-y divide-[#131d2e] overflow-y-auto">
            {relatedViews.map((item, index) => {
              const active = item.view.symbol === view.symbol
              return (
                <Link
                  key={item.id}
                  href={`/stocks/${encodeURIComponent(item.view.symbol)}`}
                  className={`flex items-center justify-between border-l-2 px-2.5 py-2 transition-colors ${active ? 'border-cyan-400 bg-[#12284c]' : 'border-transparent hover:bg-[#121c30]'}`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className={`w-4 shrink-0 text-center font-mono text-[10px] ${active ? 'font-bold text-cyan-300' : 'text-slate-500'}`}>{index + 1}</span>
                    <div className="min-w-0">
                      <div className={`truncate text-xs leading-snug ${active ? 'font-bold text-white' : 'font-medium text-slate-200'}`}>{item.view.companyName || item.view.symbol}</div>
                      <div className={`truncate font-mono text-[9px] tracking-wider ${active ? 'text-cyan-200' : 'text-slate-400'}`}>{item.view.symbol}</div>
                    </div>
                  </div>
                  <div className="mr-2.5 shrink-0 text-right">
                    <div className={`font-mono text-xs tabular-nums ${active ? 'font-bold text-white' : 'text-slate-100'}`}>{formatNum(item.view.price)}</div>
                    <div className="font-mono text-[10px] tabular-nums text-slate-400">IV {formatNum(item.view.valuation.fair, 0)}</div>
                  </div>
                  <span className={`inline-flex h-5 w-7 shrink-0 items-center justify-center rounded font-mono text-[11px] font-bold ${scoreTone(item.view.score)}`}>{item.view.score ?? '—'}</span>
                </Link>
              )
            })}
          </div>
          <div className="border-t border-[#1a2539] bg-[#080d17] p-2 text-[11px] text-slate-400">Showing {relatedViews.length} saved stock{relatedViews.length === 1 ? '' : 's'}</div>
        </aside>

        <main className="flex-1 space-y-3 overflow-y-auto bg-[#080c16] px-4 py-3">
          <section className="rounded-lg border border-[#1d2b45] bg-[#0e1626] p-3 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1b273d] pb-3">
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-amber-400/60 bg-[#0a0f1b] font-mono text-base font-black uppercase text-amber-300">{initials}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-xl font-black tracking-tight text-white">{view.companyName || view.symbol}</h1>
                    <Link href={view.sourceUrl ?? '#'} target="_blank" rel="noreferrer" className="text-[10px] text-cyan-400 hover:text-cyan-300">
                      {view.sourceUrl ? 'screener.in ↗' : ''}
                    </Link>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="rounded border border-cyan-700/50 bg-[#13223d] px-1.5 py-0.5 font-mono text-xs font-bold tracking-wider text-cyan-300">{view.symbol} • NSE</span>
                    {view.capCategory && (
                      <span className="inline-flex items-center gap-1 rounded border border-slate-700/60 bg-[#14233c] px-2 py-0.5 text-2xs font-medium text-slate-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {view.capCategory}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-5">
                <div className="text-right">
                  <div className="font-mono text-2xl font-black tracking-tight text-white">₹ {formatNum(view.price)}</div>
                  <div className="mt-0.5 flex items-center justify-end gap-2 font-mono text-[10px] text-slate-400">
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Live NSE
                    </span>
                    <span>•</span>
                    <span>{captured}</span>
                    {view.high != null && <span className="text-slate-500">52W H: <span className="text-slate-300">₹{formatNum(view.high, 0)}</span> L: <span className="text-slate-300">₹{formatNum(view.low, 0)}</span></span>}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2.5">
              {view.badges.length ? view.badges.map((badge) => (
                <span key={badge.label} className={`rounded border px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider ${BADGE_TONE[badge.tone]}`}>{badge.label}</span>
              )) : <span className="text-2xs text-slate-500">No analytics available yet.</span>}
            </div>
          </section>

          <section className="grid grid-cols-10 gap-2">
            {metrics.map((metric) => (
              <Kpi key={metric.label} label={metric.label} value={metric.value} tag={metric.tag} />
            ))}
          </section>

          <section className="grid grid-cols-12 gap-3">
            <div className="col-span-4">
              <Card title="Quarterly Trend (₹ Cr)">
                <QuarterlyBarChart chart={quarterlyChart} />
              </Card>
            </div>
            <div className="col-span-4">
              <Card title="Annual Profit Trend (₹ Cr)">
                <ProfitLineChart chart={annualChart} />
              </Card>
            </div>
            <div className="col-span-4">
              <RoceCalculator roce={view.roce} />
            </div>
          </section>

          <section className="grid grid-cols-12 gap-3">
            <div className="col-span-4">
              <Card title="Intrinsic Value">
                <div className="grid grid-cols-3 gap-2 py-3 text-center">
                  <div>
                    <div className="text-[10px] text-slate-400">Current Price</div>
                    <div className="mt-0.5 font-mono text-base font-black text-emerald-400">{formatInr(view.price)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Fair Value</div>
                    <div className="mt-0.5 font-mono text-base font-black text-cyan-400">{formatInr(view.valuation.fair)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Upside</div>
                    <div className={`mt-0.5 font-mono text-base font-black ${view.valuation.upside != null && view.valuation.upside < 0 ? 'text-rose-500' : 'text-emerald-400'}`}>{formatPct(view.valuation.upside)}</div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-semibold">
                    <span className="text-slate-300">Margin of Safety: {formatPct(view.valuation.upside)}</span>
                    <span className="text-cyan-400">Fair ₹{formatNum(view.valuation.fair, 0)}</span>
                  </div>
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#1b263d]">
                    <div className="h-full w-1/2 bg-cyan-500" />
                    <div className="h-full w-1/2 bg-rose-500" />
                  </div>
                </div>
                <div className="mt-3 rounded border border-[#1b2d4b] bg-[#0a1220] p-2 text-2xs leading-snug">
                  <div className="font-medium text-emerald-400">Fair value uses reported EPS × 15 (estimate)</div>
                  <div className="text-slate-400">Not investment advice.</div>
                </div>
              </Card>
            </div>
            <div className="col-span-4">
              <Card title="Valuation Metrics">
                <ValuationTable view={view} />
              </Card>
            </div>
            <div className="col-span-4">
              <TradeCalculator entry={view.price} target={view.valuation.fair} />
            </div>
          </section>

          <section className="grid grid-cols-12 gap-3">
            <div className="col-span-6">
              <Card title="Quarterly Results (₹ Cr)">
                <FinancialTable table={quartersTable} />
              </Card>
            </div>
            <div className="col-span-6 space-y-3">
              <Card title="Annual Profit & Loss (₹ Cr)">
                <FinancialTable table={annualTable} />
              </Card>
              <Card title="Cash Flow Statement (₹ Cr)">
                <FinancialTable table={cashFlowTable} />
              </Card>
            </div>
          </section>

          <section className="grid grid-cols-12 gap-3 pb-2">
            <div className="col-span-5">
              <Card title="Shareholding Pattern" id="shareholding">
                {shareholding ? (
                  <table className="w-full text-left text-2xs">
                    <thead>
                      <tr className="border-b border-[#19263f] text-[10px] text-slate-400">
                        <th className="py-1">Category</th>
                        <th className="py-1 text-right">Latest</th>
                        <th className="py-1 text-right">Previous</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#152136] text-slate-300">
                      {shareCategories.map(([label, row]) => {
                        const latest = lastNonEmpty(row?.values)
                        const previous = row && row.values.length > 1 ? row.values[row.values.length - 2] : null
                        return (
                          <tr key={label}>
                            <td className="py-1 font-medium text-slate-200">{label}</td>
                            <td className="py-1 text-right font-mono font-bold text-white">{latest ?? '—'}</td>
                            <td className="py-1 text-right font-mono text-slate-400">{previous ?? '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="py-6 text-center text-xs text-slate-500">Shareholding data not available.</p>
                )}
              </Card>
            </div>
            <div className="col-span-7">
              <Card title="Peer Comparison" id="peers">
                <p className="py-8 text-center text-xs text-slate-500">
                  Peer comparison is not fetched yet. screener.in loads peers asynchronously and requires a separate request.
                </p>
              </Card>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export const metadata = { title: 'Q-Scan | Stock details' }
