import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import {
  buildChartSeries,
  buildStockView,
  findDetailRow,
  formatCr,
  formatInr,
  formatIstTimestamp,
  formatNum,
  formatPct,
  lastNonEmpty,
  type StockView,
} from '@/lib/stock-detail'
import { buildCopyMarkdown } from '@/lib/copy-data'
import type { GrowthKey, GrowthPeriod, GrowthSummary } from '@/lib/growth'
import {
  getMetricColorClass,
  getMetricStatus,
  getMetricStatusText,
  isTickerSymbol,
  type MetricTone,
} from '@/lib/metrics'
import type { DetailTable, PeerRow } from '@/lib/scrapers/screener-detail'
import { ensureStockDetail } from '@/lib/stocks'
import { RoceCalculator, TradeCalculator } from './calculators'
import { ProfitLineChart, QuarterlyBarChart } from './charts'
import { CopyDataButton } from './copy-data-button'
import { ScrollToTop } from './scroll-to-top'
import { Sidebar, type SidebarItem } from './sidebar'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ symbol: string }> }

const BADGE_TONE: Record<string, string> = {
  good: 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300',
  warn: 'border-amber-500/50 bg-amber-950/40 text-amber-300',
  info: 'border-cyan-500/50 bg-cyan-950/40 text-cyan-300',
  neutral: 'border-slate-600/50 bg-slate-800/40 text-slate-300',
}

function sliceTable(table: DetailTable | null | undefined, limit: number): DetailTable | null {
  if (!table) return null
  return {
    columns: table.columns.slice(-limit),
    rows: table.rows.map((row) => ({ label: row.label, values: row.values.slice(-limit) })),
  }
}

function Kpi({ label, value, tone, title }: { label: string; value: string; tone: MetricTone; title?: string }) {
  return (
    <div className="flex flex-col justify-between rounded-md border border-[#1d2b45] bg-[#0e1626] p-2" title={title}>
      <span className="text-[10px] font-semibold uppercase text-slate-400">{label}</span>
      <div className="mt-1 flex items-baseline justify-between gap-1">
        <span className={`font-mono text-sm font-bold tabular-nums ${getMetricColorClass(tone)}`}>{value}</span>
        {tone !== 'neutral' && <span className={`text-[9px] font-bold uppercase ${getMetricColorClass(tone)}`}>{getMetricStatusText(tone)}</span>}
      </div>
    </div>
  )
}

function Card({ title, right, children, id }: { title: string; right?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <div id={id} className="flex h-full flex-col rounded-lg border border-[#1d2b45] bg-[#0e1626] p-3">
      <div className="flex items-center justify-between border-b border-[#1b263d] pb-1.5">
        <h3 className="text-xs font-bold text-white">{title}</h3>
        {right}
      </div>
      <div className="mt-1 flex-1">{children}</div>
    </div>
  )
}

function growthTone(pct: number | null): string {
  if (pct == null) return 'text-slate-500'
  if (pct > 0) return 'text-emerald-400'
  if (pct < 0) return 'text-red-400'
  return 'text-amber-400'
}

function GrowthRow({ label, period }: { label: string; period: GrowthPeriod }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-[#1a2b47] bg-[#0b1424] px-3 py-2">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-slate-200">{label}</div>
        <div className="truncate font-mono text-[9px] text-slate-500">
          ₹ {formatNum(period.previous)} Cr → ₹ {formatNum(period.current)} Cr
        </div>
      </div>
      <span className={`shrink-0 font-mono text-sm font-black tabular-nums ${growthTone(period.pct)}`}>
        {period.pct != null ? `${period.pct >= 0 ? '+' : ''}${period.pct.toFixed(1)}%` : 'N/A'}
      </span>
    </div>
  )
}

const GROWTH_ROWS: { label: string; key: GrowthKey }[] = [
  { label: 'Sales', key: 'sales' },
  { label: 'Operating Profit', key: 'operatingProfit' },
  { label: 'Net Profit', key: 'netProfit' },
]

function GrowthPanel({
  growth,
  compare,
  latest,
  footnote,
}: {
  growth: Record<GrowthKey, GrowthPeriod> | null
  compare: string | null
  latest: string | null
  footnote: string
}) {
  if (!growth) return <p className="py-8 text-center text-xs text-slate-500">Quarterly data not available for growth comparison.</p>
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-500">
        <span>
          Latest quarter: <span className="text-slate-300">{latest ?? '—'}</span>
          {compare ? <> · vs <span className="text-slate-300">{compare}</span></> : null}
        </span>
        <span className="text-[9px]">{footnote}</span>
      </div>
      <div className="space-y-1.5">
        {GROWTH_ROWS.map((row) => (
          <GrowthRow key={row.key} label={row.label} period={growth[row.key]} />
        ))}
      </div>
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

function ValuationTable({ view }: { view: StockView }) {
  const { valuation } = view
  const mosTone = getMetricStatus('marginOfSafety', valuation.marginOfSafety)
  const peTone = getMetricStatus('pe', view.pe)
  const roceTone = getMetricStatus('roce', valuation.medianRoce)
  const rows: { label: string; value: string; tone: MetricTone }[] = [
    { label: 'Current Price', value: formatInr(view.price), tone: 'neutral' },
    { label: 'Intrinsic Value', value: formatInr(valuation.intrinsic, 0), tone: mosTone },
    { label: 'Margin of Safety', value: formatPct(valuation.marginOfSafety), tone: mosTone },
    { label: 'Graham Number', value: formatInr(valuation.graham), tone: 'info' },
    { label: 'Median Sales Growth (5Y)', value: formatPct(valuation.medianSalesGrowth), tone: 'neutral' },
    { label: 'Max P/E (5Y growth × 1.5)', value: formatNum(valuation.maxPe, 1), tone: 'neutral' },
    { label: 'Median ROCE (5Y)', value: formatPct(valuation.medianRoce), tone: roceTone },
    { label: 'Max P/BV (5Y ROCE ÷ 8)', value: formatNum(valuation.maxPbv, 2), tone: 'neutral' },
    { label: 'Stock P/E', value: formatNum(view.pe, 1), tone: peTone },
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
            <td className={`py-1 text-right font-mono ${row.tone === 'neutral' ? 'text-white' : getMetricColorClass(row.tone)}`}>{row.value}</td>
            <td className={`py-1 text-right font-semibold ${row.tone === 'neutral' ? 'text-slate-500' : getMetricColorClass(row.tone)}`}>
              {row.tone === 'neutral' ? '-' : getMetricStatusText(row.tone)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function peerSymbolLink(peer: PeerRow, children: ReactNode) {
  if (peer.href && isTickerSymbol(peer.symbol)) {
    return (
      <Link href={`/stocks/${encodeURIComponent(peer.symbol)}`} className="hover:text-cyan-300 hover:underline">
        {children}
      </Link>
    )
  }
  return <span>{children}</span>
}

function PeerComparison({ view }: { view: StockView }) {
  const peers = view.detail?.peers ?? null
  const error = view.detail?.peersError ?? null

  if (peers == null) {
    return <p className="py-8 text-center text-xs text-slate-500">Peer comparison has not been fetched yet. Re-import this stock to load it.</p>
  }
  if (!peers.length) {
    return <p className="py-8 text-center text-xs text-slate-500">{error ?? 'screener.in did not return any peer data for this company.'}</p>
  }

  const updated = view.capturedAt
    ? view.capturedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : '—'

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[10px] text-slate-500">
        <span>Source: screener.in peer comparison</span>
        <span>Updated {updated}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-2xs">
          <thead>
            <tr className="border-b border-[#19263f] text-[10px] text-slate-400">
              <th className="py-1">Company</th>
              <th className="py-1 text-right">LTP ₹</th>
              <th className="py-1 text-right">Mar Cap ₹Cr</th>
              <th className="py-1 text-right">P/E</th>
              <th className="py-1 text-right">Sales Var %</th>
              <th className="py-1 text-right">Profit Var %</th>
              <th className="py-1 text-right">ROCE %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#152136]">
            {peers.map((peer, index) => {
              const salesTone = getMetricStatus('salesGrowth', peer.salesGrowth)
              const profitTone = getMetricStatus('profitGrowth', peer.profitGrowth)
              const roceTone = getMetricStatus('roce', peer.roce)
              const peTone = getMetricStatus('pe', peer.pe)
              return (
                <tr key={peer.companyId ?? `${peer.name}-${index}`} className={peer.isSelf ? 'bg-[#101d33]' : 'hover:bg-[#0f1828]'}>
                  <td className="py-1 pr-2 font-medium text-slate-200">
                    {peerSymbolLink(peer, peer.name)}
                    {peer.isSelf && <span className="ml-1 text-[9px] font-normal text-cyan-300">(this)</span>}
                  </td>
                  <td className="py-1 text-right font-mono text-slate-300">{formatNum(peer.cmp)}</td>
                  <td className="py-1 text-right font-mono text-slate-300">{formatNum(peer.marketCap, 0)}</td>
                  <td className={`py-1 text-right font-mono ${getMetricColorClass(peTone)}`}>{formatNum(peer.pe, 1)}</td>
                  <td className={`py-1 text-right font-mono ${getMetricColorClass(salesTone)}`}>{formatPct(peer.salesGrowth)}</td>
                  <td className={`py-1 text-right font-mono ${getMetricColorClass(profitTone)}`}>{formatPct(peer.profitGrowth)}</td>
                  <td className={`py-1 text-right font-mono ${getMetricColorClass(roceTone)}`}>{formatPct(peer.roce)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
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

  const sidebarItems: SidebarItem[] = relatedViews.map((item) => ({
    id: item.id,
    symbol: item.view.symbol,
    companyName: item.view.companyName,
    price: item.view.price,
    iv: item.view.valuation.fair,
    score: item.view.score,
  }))

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

  const captured = formatIstTimestamp(view.capturedAt)
  const initials = view.symbol.slice(0, 3)
  const copyMarkdown = buildCopyMarkdown(view)
  const growth = view.growth

  const metrics: { label: string; value: string; tone: MetricTone; title?: string }[] = [
    { label: 'Market Cap', value: formatCr(view.marketCap), tone: 'neutral' },
    { label: 'P/E', value: formatNum(view.pe, 1), tone: getMetricStatus('pe', view.pe) },
    { label: 'Intrinsic Value', value: formatInr(view.valuation.intrinsic, 0), tone: getMetricStatus('marginOfSafety', view.valuation.marginOfSafety) },
    { label: 'ROCE', value: formatPct(view.roce), tone: getMetricStatus('roce', view.roce) },
    { label: 'ROE', value: formatPct(view.roe), tone: getMetricStatus('roe', view.roe) },
    { label: 'CFO / PAT', value: view.cfoPat != null ? view.cfoPat.toFixed(2) : '—', tone: getMetricStatus('cfoPat', view.cfoPat) },
    {
      label: 'Piotroski F',
      value: view.piotroski != null ? `${view.piotroski}/${view.piotroskiTotal}` : '—',
      tone: view.piotroski != null && view.piotroskiPartial ? 'info' : 'neutral',
      title: view.piotroskiPartial
        ? 'Piotroski F-Score (partial): the current-ratio test is not exposed by screener standalone statements, so the score covers the ' + `${view.piotroskiTotal}` + ' evaluable criteria.'
        : view.piotroski == null
          ? 'Piotroski F-Score is unavailable for this company (insufficient history in source statements).'
          : 'Piotroski F-Score (0–9) from annual standalone statements.',
    },
    { label: 'Div. Yield', value: formatPct(view.dividendYield, 2), tone: getMetricStatus('dividendYield', view.dividendYield) },
    { label: 'D/E', value: view.debtToEquity != null ? view.debtToEquity.toFixed(2) : '—', tone: getMetricStatus('debtToEquity', view.debtToEquity) },
    { label: 'Working Capital', value: view.workingCapitalDays != null ? `${formatNum(view.workingCapitalDays, 0)} days` : '—', tone: 'neutral' },
  ]

  return (
    <div className="flex flex-col bg-[#070b14] text-xs text-slate-200 antialiased">
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

      <div className="flex items-start">
        <Sidebar items={sidebarItems} activeSymbol={view.symbol} />

        <main className="min-w-0 flex-1 space-y-3 bg-[#080c16] px-4 py-3">
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
                    {view.high != null && (
                      <span className="text-slate-500">
                        52W H: <span className="text-slate-300">₹{formatNum(view.high, 0)}</span> L: <span className="text-slate-300">₹{formatNum(view.low, 0)}</span>
                      </span>
                    )}
                  </div>
                </div>
                <CopyDataButton text={copyMarkdown} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2.5">
              {view.badges.length ? (
                view.badges.map((badge) => (
                  <span key={badge.label} className={`rounded border px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider ${BADGE_TONE[badge.tone]}`}>
                    {badge.label}
                  </span>
                ))
              ) : (
                <span className="text-2xs text-slate-500">No analytics available yet.</span>
              )}
              {view.industry.length > 0 && (
                <nav aria-label="Industry classification" className="ms-auto flex flex-wrap items-center gap-1 text-2xs text-slate-400">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3 text-cyan-400" aria-hidden="true">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {view.industry.map((level, index) => (
                    <Fragment key={level.level}>
                      {index > 0 && <span aria-hidden="true">›</span>}
                      {level.url ? (
                        <a href={level.url} target="_blank" rel="noreferrer" className="rounded px-1 py-0.5 text-slate-300 transition-colors hover:bg-white/5 hover:text-cyan-300" title={level.level}>
                          {level.name}
                        </a>
                      ) : (
                        <span className="rounded px-1 py-0.5 text-slate-300" title={level.level}>{level.name}</span>
                      )}
                    </Fragment>
                  ))}
                </nav>
              )}
            </div>
          </section>

          <section className="grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10">
            {metrics.map((metric) => (
              <Kpi key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
            ))}
          </section>

          <section aria-label="Growth" className="grid auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2">
            <Card title="Quarter on Quarter (QoQ)">
              <GrowthPanel
                growth={growth?.qoq ?? null}
                compare={growth?.qoqPrevious ?? null}
                latest={growth?.latest ?? null}
                footnote="Operating Profit is reported as 'Profit' in the source."
              />
            </Card>
            <Card title="Year on Year (YoY)">
              <GrowthPanel
                growth={growth?.yoy ?? null}
                compare={growth?.yoySame ?? null}
                latest={growth?.latest ?? null}
                footnote="Source: screener.in quarterly results."
              />
            </Card>
          </section>

          <section className="grid auto-rows-fr grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="h-full lg:col-span-4">
              <Card title="Quarterly Trend (₹ Cr)">
                <QuarterlyBarChart chart={quarterlyChart} />
              </Card>
            </div>
            <div className="h-full lg:col-span-4">
              <Card title="Annual Profit Trend (₹ Cr)">
                <ProfitLineChart chart={annualChart} />
              </Card>
            </div>
            <div className="h-full lg:col-span-4">
              <RoceCalculator roce={view.roce} />
            </div>
          </section>

          <section className="grid auto-rows-fr grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="h-full lg:col-span-4">
              <Card title="Intrinsic Value">
                <div className="grid grid-cols-3 gap-2 py-3 text-center">
                  <div>
                    <div className="text-[10px] text-slate-400">Current Price</div>
                    <div className="mt-0.5 font-mono text-base font-black text-emerald-400">{formatInr(view.price)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Intrinsic Value</div>
                    <div className="mt-0.5 font-mono text-base font-black text-cyan-400">{formatInr(view.valuation.intrinsic)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Upside</div>
                    <div className={`mt-0.5 font-mono text-base font-black ${getMetricColorClass(getMetricStatus('marginOfSafety', view.valuation.marginOfSafety))}`}>{formatPct(view.valuation.upside)}</div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-semibold">
                    <span className="text-slate-300">Margin of Safety: {formatPct(view.valuation.marginOfSafety)}</span>
                    <span className="text-cyan-400">IV ₹{formatNum(view.valuation.intrinsic, 0)}</span>
                  </div>
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#1b263d]">
                    <div className="h-full w-1/2 bg-cyan-500" />
                    <div className="h-full w-1/2 bg-rose-500" />
                  </div>
                </div>
                <div className="mt-3 rounded border border-[#1b2d4b] bg-[#0a1220] p-2 text-2xs leading-snug">
                  <div className="font-medium text-emerald-400">Screener.in Graham number: √(EPS × Book Value × max PE × max P/BV)</div>
                  <div className="text-slate-400">max PE = 5-yr median sales growth × 1.5 (capped 8–100); max P/BV = 5-yr median ROCE ÷ 8 (capped 1–10). Not investment advice.</div>
                </div>
              </Card>
            </div>
            <div className="h-full lg:col-span-4">
              <Card title="Valuation Metrics">
                <ValuationTable view={view} />
              </Card>
            </div>
            <div className="h-full lg:col-span-4">
              <TradeCalculator entry={view.price} />
            </div>
          </section>

          <section className="grid auto-rows-fr grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="h-full lg:col-span-6">
              <Card title="Quarterly Results (₹ Cr)">
                <FinancialTable table={quartersTable} />
              </Card>
            </div>
            <div className="h-full lg:col-span-6 space-y-3">
              <Card title="Annual Profit & Loss (₹ Cr)">
                <FinancialTable table={annualTable} />
              </Card>
              <Card title="Cash Flow Statement (₹ Cr)">
                <FinancialTable table={cashFlowTable} />
              </Card>
            </div>
          </section>

          <section className="grid auto-rows-fr grid-cols-1 gap-3 pb-2 lg:grid-cols-12">
            <div className="h-full lg:col-span-5">
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
            <div className="h-full lg:col-span-7">
              <Card title="Peer Comparison" id="peers">
                <PeerComparison view={view} />
              </Card>
            </div>
          </section>
        </main>
      </div>
      <ScrollToTop />
    </div>
  )
}

export const metadata = { title: 'Q-Scan | Stock details' }
