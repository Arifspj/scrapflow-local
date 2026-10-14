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
import type { BusinessBadge } from '@/lib/business-badges'
import { financialCellTrend, TREND_TONE_CLASS } from '@/lib/financial-trend'
import type { GrowthKey, GrowthPeriod, GrowthSummary } from '@/lib/growth'
import {
  getMetricColorClass,
  getMetricStatus,
  getMetricStatusText,
  isTickerSymbol,
  type MetricTone,
} from '@/lib/metrics'
import type { DetailTable, IndustryLink, PeerRow } from '@/lib/scrapers/screener-detail'
import { ensureStockDetail } from '@/lib/stocks'
import { rankPeers } from '@/lib/peer-rank'
import { categoryHref, categoryLevel, LEVEL_LABEL, MARKET_LEVELS } from '@/lib/category'
import { getCategoryData } from '@/lib/category-data'
import { getPublicSnapshot } from '@/lib/public-data'
import { CashFlowTrend, GrowthCompareBars, OwnershipTrend, ValuationBridge } from './card-extras'
import { RoceCalculator, TradeCalculator } from './calculators'
import { ProfitLineChart, QuarterlyBarChart } from './charts'
import { CopyDataMenu } from './copy-data-button'
import { RefreshButton } from './refresh-button'
import { ScoreBadge } from './score-breakdown'
import { ScrollToTop } from '@/app/scroll-to-top'
import type { SidebarItem } from './sidebar'
import { StockTicker, type TickerItem } from './stock-ticker'
import { StockSearch } from '@/app/stock-search'
import { StockWorkspace } from './workspace'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ symbol: string }>; searchParams: Promise<{ scanner?: string; market?: string }> }

const QUALITY_TONE: Record<'good' | 'neutral', string> = {
  good: 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300',
  neutral: 'border-slate-600/50 bg-slate-800/40 text-slate-300',
}

const RISK_BADGE_TONE = 'border-rose-500/50 bg-rose-950/40 text-rose-300'

const BUSINESS_BADGE_TONE: Record<BusinessBadge['tone'], string> = {
  good: 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300',
  warn: 'border-rose-500/50 bg-rose-950/40 text-rose-300',
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

/** Extract the industry code segments from a screener.in `/market/.../` URL. */
function marketSegments(url: string | null | undefined): string[] | null {
  if (!url) return null
  const match = url.match(/\/market\/([A-Za-z0-9/]+)/)
  if (!match) return null
  const segments = match[1].split('/').filter(Boolean)
  if (segments.length < 1 || segments.length > MARKET_LEVELS.length) return null
  return segments
}

/** Industry categories for a stock, deepest (most specific) first. */
function industryCategories(industry: readonly IndustryLink[]): string[][] {
  const candidates: string[][] = []
  for (const level of industry) {
    const segments = marketSegments(level.url)
    if (segments) candidates.push(segments)
  }
  return candidates.reverse()
}

function withTrailingSlash(url: string | null): string {
  return (url ?? '').replace(/\/+$/, '') + '/'
}

/** Friendly label for a category path, falling back to its level name. */
function categoryLabel(industry: readonly IndustryLink[], segments: readonly string[]): string {
  const path = withTrailingSlash(`/market/${segments.join('/')}`)
  const match = industry.find((level) => withTrailingSlash(level.url) === path)
  return match?.name ?? LEVEL_LABEL[categoryLevel(segments)]
}

function Kpi({ label, value, tone, title }: { label: string; value: string; tone: MetricTone; title?: string }) {
  return (
    <div className="flex flex-col justify-between rounded-md border border-[#1d2b45] bg-[#0e1626] p-2" title={title}>
      <span className="text-[12px] font-semibold uppercase text-slate-400">{label}</span>
      <div className="mt-1 flex items-baseline justify-between gap-1">
        <span className={`font-mono text-sm font-bold tabular-nums ${getMetricColorClass(tone)}`}>{value}</span>
        {tone !== 'neutral' && <span className={`text-[11px] font-bold uppercase ${getMetricColorClass(tone)}`}>{getMetricStatusText(tone)}</span>}
      </div>
    </div>
  )
}

function Card({ title, right, children, id, className }: { title: string; right?: ReactNode; children: ReactNode; id?: string; className?: string }) {
  return (
    <div id={id} className={`flex flex-col rounded-lg border border-[#1d2b45] bg-[#0e1626] p-3 ${className ?? ''}`}>
      <div className="flex items-center justify-between border-b border-[#1b263d] pb-1.5">
        <h3 className="text-xs font-bold text-white">{title}</h3>
        {right}
      </div>
      <div className="mt-1 flex flex-1 flex-col">{children}</div>
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
        <div className="text-[13px] font-semibold text-slate-200">{label}</div>
        <div className="truncate font-mono text-[11px] text-slate-500">
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
    <div className="flex h-full flex-1 flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-[12px] text-slate-500">
        <span>
          Latest quarter: <span className="text-slate-300">{latest ?? '—'}</span>
          {compare ? <> · vs <span className="text-slate-300">{compare}</span></> : null}
        </span>
        <span className="text-[11px]">{footnote}</span>
      </div>
      <div className="space-y-1.5">
        {GROWTH_ROWS.map((row) => (
          <GrowthRow key={row.key} label={row.label} period={growth[row.key]} />
        ))}
      </div>
      <GrowthCompareBars growth={growth} />
    </div>
  )
}

function FinancialTable({ table, suffix = '' }: { table: DetailTable | null; suffix?: string }) {
  if (!table) return <p className="py-6 text-center text-xs text-slate-500">Financial data not available. Re-import this stock to fetch it.</p>
  return (
    <div className="overflow-x-auto">
      <table className="qscan-table w-full text-left text-2xs">
        <thead>
          <tr className="border-b border-[#19263f] text-[12px] text-slate-400">
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
              {row.values.map((value, index) => {
                const isLast = index === row.values.length - 1
                const trend = value ? financialCellTrend(table, row, index) : { tone: 'neutral' as const, note: null }
                const toneClass = trend.tone !== 'neutral' ? TREND_TONE_CLASS[trend.tone] : isLast ? 'text-white' : 'text-slate-300'
                return (
                  <td key={index} title={trend.note ?? undefined} className={`py-1 text-right ${isLast ? 'font-semibold' : ''} ${toneClass}`}>
                    {value || '—'}
                  </td>
                )
              })}
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
  const overTone: MetricTone = view.valuation.noEquity ? 'bad' : (view.valuation.overvaluation ?? 0) > 30 ? 'bad' : (view.valuation.overvaluation ?? 0) > 0 ? 'warn' : 'good'
  const methodLabel =
    valuation.method === 'debt-adjusted'
      ? 'Debt-adjusted EV/EBIT (cash trap)'
      : valuation.method === 'no-growth'
        ? 'Graham + no-growth value'
        : valuation.method === 'blended'
          ? 'Blended Graham + growth'
          : '—'
  const rows: { label: string; value: string; tone: MetricTone }[] = [
    { label: 'Current Price', value: formatInr(view.price), tone: 'neutral' },
    { label: 'Intrinsic Value', value: formatInr(valuation.intrinsic, 0), tone: mosTone },
    { label: 'Margin of Safety', value: formatPct(valuation.marginOfSafety), tone: mosTone },
    { label: 'Overvaluation vs Fair Value', value: valuation.noEquity ? 'No Equity Value' : formatPct(valuation.overvaluation ?? 0), tone: overTone },
    { label: 'Graham Number', value: formatInr(valuation.graham), tone: 'info' },
    { label: 'Fair Value (Growth)', value: formatInr(valuation.growthValue), tone: 'info' },
    { label: 'Fair P/E (8.5 + 2 × growth)', value: formatNum(valuation.fairPe, 1), tone: 'neutral' },
    { label: 'Growth Used (capped 15%)', value: formatPct(valuation.growthRate), tone: 'neutral' },
    { label: 'Method', value: view.valuation.method === 'none' ? 'n/a' : view.valuation.method, tone: 'neutral' },
    { label: 'Stock P/E', value: formatNum(view.pe, 1), tone: peTone },
  ]
  return (
    <table className="qscan-table w-full text-left text-xs">
      <thead>
        <tr className="border-b border-[#19263f] text-[12px] text-slate-400">
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

  const { bestRoce, topPick, topPickScore, topPickReasons } = rankPeers(peers)

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[12px] text-slate-500">
        <span>Source: screener.in peer comparison</span>
        <span>Updated {updated}</span>
      </div>
      {(bestRoce || topPick) && (
        <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 rounded border border-[#1b2d4b] bg-[#0a1220] px-3 py-2 text-[12px]">
          {bestRoce && (
            <span className="text-slate-400">
              Best ROCE:{' '}
              <span className="font-bold text-emerald-300">{peerSymbolLink(bestRoce, bestRoce.name)}</span>{' '}
              <span className="font-mono text-emerald-400">{formatPct(bestRoce.roce)}</span>
            </span>
          )}
          {topPick && (
            <span className="text-slate-400" title={topPickReasons.length ? `Rule-based blend — ${topPickReasons.join(' · ')}` : undefined}>
              Top Pick:{' '}
              <span className="font-bold text-amber-300">{peerSymbolLink(topPick, topPick.name)}</span>
              {topPickScore != null && <span className="font-mono text-amber-400/80"> {topPickScore.toFixed(0)}</span>}
            </span>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="qscan-table w-full text-left text-2xs">
          <thead>
            <tr className="border-b border-[#19263f] text-[12px] text-slate-400">
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
              const isTopPick = topPick === peer
              const isBestRoce = bestRoce === peer
              return (
                <tr
                  key={peer.companyId ?? `${peer.name}-${index}`}
                  className={[peer.isSelf ? 'qscan-row-selected' : '', isTopPick ? 'ring-1 ring-inset ring-amber-500/40' : ''].join(' ')}
                >
                  <td className="py-1 pr-2 font-medium text-slate-200">
                    {peerSymbolLink(peer, peer.name)}
                    {peer.isSelf && <span className="ml-1 text-[11px] font-normal text-cyan-300">(this)</span>}
                    {isTopPick && (
                      <span className="ml-1 rounded border border-amber-500/50 bg-amber-950/40 px-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                        Top Pick
                      </span>
                    )}
                  </td>
                  <td className="py-1 text-right font-mono text-slate-300">{formatNum(peer.cmp)}</td>
                  <td className="py-1 text-right font-mono text-slate-300">{formatNum(peer.marketCap, 0)}</td>
                  <td className={`py-1 text-right font-mono ${getMetricColorClass(peTone)}`}>{formatNum(peer.pe, 1)}</td>
                  <td className={`py-1 text-right font-mono ${getMetricColorClass(salesTone)}`}>{formatPct(peer.salesGrowth)}</td>
                  <td className={`py-1 text-right font-mono ${getMetricColorClass(profitTone)}`}>{formatPct(peer.profitGrowth)}</td>
                  <td
                    className={`py-1 text-right font-mono ${getMetricColorClass(roceTone)} ${isBestRoce ? 'font-bold' : ''}`}
                    title={isBestRoce ? 'Best ROCE among the comparison' : undefined}
                  >
                    {formatPct(peer.roce)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type TickerContext = {
  items: TickerItem[]
  contextQuery: string
  viewAllHref: string
  /** Name of the scanner the visitor arrived from (null for a market context). */
  scannerName: string | null
  /** Market/category segments the visitor arrived from (null for a scanner context). */
  marketSegments: string[] | null
}

/**
 * Build the sibling-stock ticker for the context the visitor arrived from — a
 * scanner (`?scanner=<id>`) or a market/category path (`?market=<segments>`).
 * Returns null when there is no usable context or fewer than two siblings, so
 * a plain visit or a one-company category does not render a pointless strip.
 */
async function buildTickerContext(scanner: string | null, market: string | null): Promise<TickerContext | null> {
  if (scanner) {
    const snap = await getPublicSnapshot(scanner, '', 200)
    const items: TickerItem[] = snap.rows.map((row) => {
      const v = buildStockView(row.stock, row.stock.fundamentals[0] ?? null)
      return { symbol: v.symbol, company: v.companyName || v.symbol, price: v.price, score: v.score }
    })
    if (items.length < 2) return null
    return {
      items,
      contextQuery: `scanner=${encodeURIComponent(scanner)}`,
      viewAllHref: `/?scanner=${encodeURIComponent(snap.scanner?.name ?? scanner)}`,
      scannerName: snap.scanner?.name ?? scanner,
      marketSegments: null,
    }
  }

  if (market) {
    const segments = market
      .split('/')
      .map((segment) => segment.trim().toUpperCase())
      .filter((segment) => /^[A-Z0-9]+$/.test(segment))
    if (!segments.length) return null
    const { rows } = await getCategoryData(segments)
    const items: TickerItem[] = rows.map((row) => ({
      symbol: row.symbol,
      company: row.companyName || row.symbol,
      price: row.price,
      score: row.score,
    }))
    if (items.length < 2) return null
    return {
      items,
      contextQuery: `market=${encodeURIComponent(segments.join('/'))}`,
      viewAllHref: categoryHref(segments),
      scannerName: null,
      marketSegments: segments,
    }
  }

  return null
}

export default async function StockPage({ params, searchParams }: Props) {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase()
  const search = await searchParams
  const stock = await ensureStockDetail(symbol)
  if (!stock) notFound()

  const related = await prisma.stock.findMany({
    take: 40,
    orderBy: { updatedAt: 'desc' },
    include: { fundamentals: { orderBy: { capturedAt: 'desc' }, take: 1 } },
  })
  const relatedViews = related.map((item) => ({ id: item.id, view: buildStockView(item, item.fundamentals[0] ?? null) }))
  const view = buildStockView(stock, stock.fundamentals[0] ?? null)

  // Ticker context: prefer the scanner/market the visitor came from; otherwise
  // fall back to this stock's own saved scanner membership so a direct visit
  // still shows a relevant sibling strip.
  const requestedScanner = search.scanner?.trim() || null
  const requestedMarket = search.market?.trim() || null
  let ticker = await buildTickerContext(requestedScanner, requestedMarket)
  if (!ticker && !requestedScanner && !requestedMarket) {
    // Direct visit: prefer this stock's own saved scanner membership, then fall
    // back to its industry (deepest, most specific category first) so the
    // sibling strip still appears without an explicit scanner/market context.
    if (stock.scanners[0]) ticker = await buildTickerContext(stock.scanners[0].scanner.id, null)
    if (!ticker) {
      for (const segments of industryCategories(view.industry)) {
        ticker = await buildTickerContext(null, segments.join('/'))
        if (ticker) break
      }
    }
  }

  const sidebarItems: SidebarItem[] = relatedViews.map((item) => ({
    id: item.id,
    symbol: item.view.symbol,
    companyName: item.view.companyName,
    price: item.view.price,
    iv: item.view.valuation.intrinsic,
    score: item.view.score,
  }))

  const quarterlyChart = buildChartSeries(sliceTable(view.detail?.quarters, 8), 8, { borrowings: view.detail?.balanceSheet })
  const annualChart = buildChartSeries(sliceTable(view.detail?.profitLoss, 8), 8, { borrowings: view.detail?.balanceSheet })
  const quartersTable = sliceTable(view.detail?.quarters, 7)
  const annualTable = sliceTable(view.detail?.profitLoss, 6)
  const cashFlowTable = sliceTable(view.detail?.cashFlow, 6)
  const balanceSheetTable = sliceTable(view.detail?.balanceSheet, 8)

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

  // Business badges complement the quality badge + risk flags; drop any label
  // already shown by those so the same classification never appears twice.
  const takenLabels = new Set<string>([view.quality.primary.label.toUpperCase(), ...view.quality.risks.map((risk) => risk.label.toUpperCase())])
  const businessBadges = view.businessBadges.filter((badge) => !takenLabels.has(badge.label.toUpperCase()))

  // Collapse consecutive duplicate names (e.g. Financial Services › Financial Services).
  const industryCrumbs = view.industry.filter((level, index, all) => index === 0 || (level.name ?? '').trim().toLowerCase() !== (all[index - 1].name ?? '').trim().toLowerCase())

  // Header "where did I come from" chip. Prefer the scanner/market the visitor
  // arrived from so it matches the ticker and the list they clicked, and only
  // fall back to this stock's own saved membership on a direct visit. A
  // category-imported scanner stores its screener.in listing URL as its name,
  // so peel that back one level into a populated broad-industry page.
  const contextScannerName = ticker?.scannerName ?? null
  const contextMarketSegments = ticker?.marketSegments ?? null
  const scannerName = contextScannerName ?? stock.scanners[0]?.scanner.name ?? null
  const brandSegments = contextMarketSegments ?? marketSegments(scannerName)
  const browseSegments = brandSegments && brandSegments.length > 1 ? brandSegments.slice(0, -1) : brandSegments
  const browseCategory = browseSegments ? { href: categoryHref(browseSegments), label: categoryLabel(view.industry, browseSegments) } : null
  const scannerHref = scannerName && !browseCategory && !/^https?:\/\//i.test(scannerName) ? `/?scanner=${encodeURIComponent(scannerName)}` : null

  const ccc = view.cashConversionCycle
  const cccDelta = view.cashConversionCycleDelta
  const workingCapital = ccc ?? view.workingCapitalDays
  const cccTone: MetricTone = cccDelta == null ? 'neutral' : Math.abs(cccDelta) < 1 ? 'neutral' : cccDelta < 0 ? 'good' : 'warn'
  const workingCapitalTitle = [
    'Cash Conversion Cycle (CCC) = Debtor Days + Inventory Days − Days Payable (lower = better)',
    ccc != null ? `CCC: ${Math.round(ccc)}d${cccDelta != null ? ` (${cccDelta >= 0 ? '+' : ''}${Math.round(cccDelta)}d vs prev)` : ''}` : 'CCC not reported by this source',
    view.debtorDays != null ? `Debtor Days: ${Math.round(view.debtorDays)}d` : null,
    view.inventoryDays != null ? `Inventory Days: ${Math.round(view.inventoryDays)}d` : null,
    view.daysPayable != null ? `Days Payable: ${Math.round(view.daysPayable)}d` : null,
    view.workingCapitalDays != null ? `Working Capital Days (source): ${Math.round(view.workingCapitalDays)}d` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n')

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
    { label: 'Working Capital (CCC)', value: workingCapital != null ? `${formatNum(workingCapital, 0)} days` : '—', tone: cccTone, title: workingCapitalTitle },
  ]

  return (
    <div className="flex flex-col bg-[#070b14] text-xs text-slate-200 antialiased">
      <header className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 border-b border-[#1b263b] bg-[#0b1220] px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex items-end gap-0.5 rounded-lg border border-cyan-800/40 bg-[#0e1e38] p-1.5">
              <div className="h-3 w-1.5 rounded-sm bg-cyan-400" />
              <div className="h-4 w-1.5 rounded-sm bg-emerald-400" />
              <div className="h-6 w-1.5 rounded-sm bg-cyan-300" />
            </div>
            <div>
              <span className="block text-lg font-black leading-none tracking-tight text-white">Q-Scan</span>
              <span className="hidden text-[12px] leading-none tracking-wider text-slate-400 sm:block">Fundamental Stock Scanner</span>
            </div>
          </Link>
          {browseCategory ? (
            <Link
              href={browseCategory.href}
              title={`Browse ${browseCategory.label} category`}
              className="hidden rounded-md border border-cyan-700/50 bg-[#14233c] px-3 py-1.5 font-medium text-cyan-400 transition-colors hover:border-cyan-500 hover:text-cyan-300 sm:block"
            >
              {browseCategory.label}
            </Link>
          ) : scannerHref ? (
            <Link
              href={scannerHref}
              title={`Back to ${scannerName}`}
              className="hidden max-w-[16rem] truncate rounded-md border border-cyan-700/50 bg-[#14233c] px-3 py-1.5 font-medium text-cyan-400 transition-colors hover:border-cyan-500 hover:text-cyan-300 sm:block"
            >
              {scannerName}
            </Link>
          ) : scannerName ? (
            <span className="hidden max-w-[16rem] truncate rounded-md border border-cyan-700/50 bg-[#14233c] px-3 py-1.5 font-medium text-cyan-400 sm:block">{scannerName}</span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none">
          <StockSearch variant="compact" />
          <RefreshButton symbol={view.symbol} />
        </div>
      </header>

      <StockWorkspace items={sidebarItems} activeSymbol={view.symbol}>
        <main className="min-w-0 flex-1 space-y-3 bg-[#080c16] px-4 py-3">
          {ticker && (
            <StockTicker items={ticker.items} activeSymbol={view.symbol} contextQuery={ticker.contextQuery} viewAllHref={ticker.viewAllHref} />
          )}
          <section className="rounded-lg border border-[#1d2b45] bg-[#0e1626] p-3 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1b273d] pb-3">
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-amber-400/60 bg-[#0a0f1b] font-mono text-base font-black uppercase text-amber-300">{initials}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-xl font-black tracking-tight text-white">{view.companyName || view.symbol}</h1>
                    <Link href={view.sourceUrl ?? '#'} target="_blank" rel="noreferrer" className="text-[12px] text-cyan-400 hover:text-cyan-300">
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
              <div className="flex min-w-0 items-center gap-3 sm:gap-5">
                <div className="text-right">
                  <div className="font-mono text-xl font-black tracking-tight text-white sm:text-2xl">₹ {formatNum(view.price)}</div>
                  <div className="mt-0.5 flex items-center justify-end gap-2 font-mono text-[12px] text-slate-400">
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
                <CopyDataMenu text={copyMarkdown} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2.5">
              <span
                className={`rounded border px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider ${QUALITY_TONE[view.quality.primary.tone]}`}
                title={
                  [
                    view.quality.primary.criteriaPassed.length ? `Met: ${view.quality.primary.criteriaPassed.join(', ')}` : null,
                    view.quality.primary.criteriaMissing.length ? `Not met / unavailable: ${view.quality.primary.criteriaMissing.join(', ')}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
              >
                {view.quality.primary.label}
              </span>
              {view.quality.risks.map((risk) => (
                <span key={risk.kind} className={`rounded border px-2 py-0.5 text-2xs font-bold uppercase tracking-wider ${RISK_BADGE_TONE}`} title={risk.reasons.join(' · ')}>
                  ⚠ {risk.label}
                </span>
              ))}
              {businessBadges.map((badge) => (
                <span key={badge.label} className={`rounded border px-2 py-0.5 text-2xs font-bold uppercase tracking-wider ${BUSINESS_BADGE_TONE[badge.tone]}`} title={badge.reason}>
                  {badge.label}
                </span>
              ))}
              <ScoreBadge breakdown={view.scoreBreakdown} />
            </div>
          </section>

          {industryCrumbs.length > 0 && (
            <nav aria-label="Industry classification" className="flex flex-wrap items-center gap-1 px-1 text-2xs text-slate-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3 text-cyan-400" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {industryCrumbs.map((level, index) => (
                <Fragment key={`${level.level}-${level.name}`}>
                  {index > 0 && <span aria-hidden="true" className="text-slate-600">›</span>}
                  {level.url ? (
                    <Link href={level.url} className="rounded px-1 py-0.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-cyan-300" title={level.level}>
                      {level.name}
                    </Link>
                  ) : (
                    <span className="rounded px-1 py-0.5 text-slate-300" title={level.level}>{level.name}</span>
                  )}
                </Fragment>
              ))}
            </nav>
          )}

          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10">
            {metrics.map((metric) => (
              <Kpi key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
            ))}
          </section>

          <section aria-label="Growth" className="grid grid-cols-1 gap-3 lg:grid-cols-3">
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
            <Card title="Shareholding Pattern" id="shareholding">
              {shareholding ? (
                <table className="qscan-table w-full text-left text-2xs">
                  <thead>
                    <tr className="border-b border-[#19263f] text-[12px] text-slate-400">
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
              {shareholding && <OwnershipTrend table={shareholding} />}
            </Card>
          </section>

          <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Card title="Quarterly Trend (₹ Cr)">
              <QuarterlyBarChart chart={quarterlyChart} />
            </Card>
            <Card title="Annual Profit Trend (₹ Cr)">
              <ProfitLineChart chart={annualChart} />
            </Card>
            <RoceCalculator roce={view.roce} />
          </section>

          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card title="Intrinsic Value">
              <div className="grid grid-cols-3 gap-2 py-3 text-center">
                <div>
                  <div className="text-[12px] text-slate-400">Current Price</div>
                  <div className="mt-0.5 font-mono text-base font-black text-emerald-400">{formatInr(view.price)}</div>
                </div>
                <div>
                  <div className="text-[12px] text-slate-400">Intrinsic Value</div>
                  <div className="mt-0.5 font-mono text-base font-black text-cyan-400">{formatInr(view.valuation.intrinsic)}</div>
                </div>
                <div>
                  <div className="text-[12px] text-slate-400">Upside</div>
                  <div className={`mt-0.5 font-mono text-base font-black ${getMetricColorClass(getMetricStatus('marginOfSafety', view.valuation.marginOfSafety))}`}>{formatPct(view.valuation.upside)}</div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[12px] font-semibold">
                  <span className="text-slate-300">Margin of Safety: {formatPct(view.valuation.marginOfSafety)}</span>
                  <span className="text-cyan-400">IV ₹{formatNum(view.valuation.intrinsic, 0)}</span>
                </div>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#1b263d]">
                  <div className="h-full w-1/2 bg-cyan-500" />
                  <div className="h-full w-1/2 bg-rose-500" />
                </div>
              </div>
              <div className="mt-3 rounded border border-[#1b2d4b] bg-[#0a1220] p-2 text-2xs leading-snug">
                <div className="font-medium text-emerald-400">
                  {view.valuation.method === 'debt-adjusted'
                    ? 'Debt-adjusted EV/EBIT value — Graham & growth-P/E disabled (cash trap)'
                    : 'Blended fair value: average of Graham number and growth fair value'}
                </div>
                <div className="text-slate-400">
                  Fair P/E = min(8.5 + 2 × growth, 38.5); growth is the latest YoY net profit (0% when EBIT is negative, capped 5% when other income &gt; 40% of PBT, hard cap 15%). Margin of safety is 0% when the price is above fair value. Not investment advice.
                </div>
              </div>
              <ValuationBridge graham={view.valuation.graham} growth={view.valuation.growthValue} intrinsic={view.valuation.intrinsic} price={view.price} />
            </Card>
            <TradeCalculator entry={view.price} />
          </section>

          <Card title="Valuation Metrics">
            <ValuationTable view={view} />
          </Card>

          <Card title="Quarterly Results (₹ Cr)">
            <FinancialTable table={quartersTable} />
          </Card>

          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card title="Annual Profit & Loss (₹ Cr)">
              <FinancialTable table={annualTable} />
            </Card>
            <Card title="Cash Flow Statement (₹ Cr)">
              <FinancialTable table={cashFlowTable} />
              <CashFlowTrend profitLoss={view.detail?.profitLoss} cashFlow={view.detail?.cashFlow} />
            </Card>
          </section>

          <Card title="Balance Sheet (₹ Cr)" id="balance-sheet">
            <FinancialTable table={balanceSheetTable} />
          </Card>

          <Card title="Peer Comparison" id="peers" className="mb-2">
            <PeerComparison view={view} />
          </Card>
        </main>
      </StockWorkspace>
      <ScrollToTop />
    </div>
  )
}

export const metadata = { title: 'Q-Scan | Stock details' }
