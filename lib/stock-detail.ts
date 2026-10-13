import { computeForensicValuation, type ForensicValuation } from './intrinsic'
import { computePiotroskiScore } from './piotroski'
import { computeQuarterGrowth } from './growth'
import { annualGrowthReading, type GrowthReading } from './growth-quality'
import { buildBusinessBadges, type BusinessBadge } from './business-badges'
import { computeQuality, type QualityResult } from './quality'
import { computeScore, type ScoreBreakdown } from './score'
import type { DetailRow, DetailTable, IndustryLink, ScreenerDetail } from './scrapers/screener-detail'

export function toNumber(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    const numeric = (value as { toNumber: () => number }).toNumber()
    return Number.isFinite(numeric) ? numeric : null
  }
  const match = String(value)
    .replace(/,/g, '')
    .match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const numeric = Number(match[0])
  return Number.isFinite(numeric) ? numeric : null
}

export function formatNum(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-IN', { maximumFractionDigits: digits })
}

export function formatInr(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `₹ ${formatNum(value, digits)}`
}

export function formatCr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `₹ ${formatNum(value, 0)} Cr.`
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(digits)}%`
}

/** Screener.in quotes live NSE prices in Indian Standard Time. */
export function formatIstTimestamp(date: Date | null | undefined): string {
  if (!date) return '—'
  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
  return `${formatted} IST`
}

export function isScreenerDetail(value: unknown): value is ScreenerDetail {
  return Boolean(value && typeof value === 'object' && ('topRatios' in value || 'profitLoss' in value))
}

export function findDetailRow(table: DetailTable | null | undefined, label: string): DetailRow | null {
  if (!table) return null
  const target = label.toLowerCase()
  return table.rows.find((row) => row.label.toLowerCase().startsWith(target)) ?? null
}

export function lastNonEmpty(values: string[] | undefined): string | null {
  if (!values) return null
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] && values[index] !== '' && values[index] !== '-') return values[index]
  }
  return null
}

export function rowValues(table: DetailTable | null | undefined, label: string, limit?: number): number[] {
  const row = findDetailRow(table, label)
  if (!row) return []
  const values = row.values.map((value) => toNumber(value))
  const trimmed = limit ? values.slice(-limit) : values
  return trimmed.map((value) => value ?? 0)
}

/** Chronological annual values for a row, dropping any trailing TTM column. */
export function annualNumbers(table: DetailTable | null | undefined, label: string): number[] {
  const row = findDetailRow(table, label)
  if (!row || !table) return []
  const values: number[] = []
  table.columns.forEach((column, index) => {
    if (/ttm/i.test(column)) return
    const value = toNumber(row.values[index])
    if (value != null) values.push(value)
  })
  return values
}

/** Order-preserving numeric series for a row, trailing period last (TTM included). */
function seriesWithTtm(table: DetailTable | null | undefined, label: string): number[] {
  const row = findDetailRow(table, label)
  if (!row) return []
  return row.values.map((value) => toNumber(value)).filter((value): value is number => value != null)
}

/** Cumulative numerator ÷ denominator over the last `window` aligned periods. */
function cumulativeRatio(numerators: number[], denominators: number[], window = 3): number | null {
  const length = Math.min(numerators.length, denominators.length)
  if (!length) return null
  const take = Math.min(window, length)
  let sumNumerator = 0
  let sumDenominator = 0
  let count = 0
  for (let index = length - take; index < length; index += 1) {
    const numerator = numerators[index]
    const denominator = denominators[index]
    if (numerator != null && denominator != null && Math.abs(denominator) > 1e-9) {
      sumNumerator += numerator
      sumDenominator += denominator
      count += 1
    }
  }
  if (!count || sumDenominator === 0) return null
  return sumNumerator / sumDenominator
}

export type ChartSeries = {
  columns: string[]
  series: { name: string; color: string; values: number[] }[]
}

const CHART_SPECS = [
  { label: 'sales', name: 'Sales', color: '#22d3ee' },
  { label: 'operating profit', name: 'Op. Profit', color: '#34d399' },
  { label: 'net profit', name: 'Net Profit', color: '#f87171' },
]

export function buildChartSeries(table: DetailTable | null | undefined, limit = 8): ChartSeries | null {
  if (!table || !table.rows.length) return null
  const columns: string[] = []
  const series = CHART_SPECS.map((spec) => ({ name: spec.name, color: spec.color, values: [] as number[] }))

  for (let index = 0; index < table.columns.length; index += 1) {
    const header = table.columns[index]
    if (/ttm/i.test(header)) continue
    columns.push(header)
    CHART_SPECS.forEach((spec, specIndex) => {
      const row = findDetailRow(table, spec.label)
      series[specIndex].values.push(toNumber(row?.values[index]) ?? 0)
    })
  }

  if (!columns.length) return null
  const start = Math.max(0, columns.length - limit)
  return {
    columns: columns.slice(start),
    series: series.map((entry) => ({ ...entry, values: entry.values.slice(start) })),
  }
}

export function yoyPercent(values: number[]): number | null {
  const clean = values.filter((value) => Number.isFinite(value))
  if (clean.length < 2) return null
  const latest = clean[clean.length - 1]
  const previous = clean[clean.length - 2]
  if (!previous) return null
  return ((latest - previous) / Math.abs(previous)) * 100
}

export function deriveScore(roce: number | null, roe: number | null): number | null {
  const parts = [roce, roe].filter((value): value is number => value != null)
  if (!parts.length) return null
  const total = parts.reduce((sum, value) => sum + Math.min(Math.max(value, 0), 100), 0)
  return Math.round(total / parts.length)
}

/** Last finite value of a chronological series (right-most reported period). */
function latestValue(values: number[]): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(values[index])) return values[index]
  }
  return null
}

export function capCategory(marketCap: number | null): string | null {
  if (marketCap == null) return null
  if (marketCap >= 50000) return 'Large Cap'
  if (marketCap >= 20000) return 'Mid Cap'
  if (marketCap >= 5000) return 'Small Cap'
  return 'Micro Cap'
}

/** Fair-value levels produced by the forensic model (see intrinsic.ts). */
export type TradeLevels = ForensicValuation

export function deriveValuation(input: {
  price: number | null
  pe: number | null
  bookValue: number | null
  eps: number | null
  profitSeries: number[]
  ebit: number | null
  otherIncome: number | null
  profitBeforeTax: number | null
  cfo: number | null
  cfoPat3y: number | null
  debt: number | null
  shares: number | null
}): TradeLevels {
  return computeForensicValuation(input)
}

export type Badge = { label: string; tone: 'good' | 'warn' | 'info' | 'neutral' }

export function buildBadges(input: {
  upside: number | null
  salesYoy: number | null
  profitYoy: number | null
  roce: number | null
  debtToEquity: number | null
}): Badge[] {
  const badges: Badge[] = []
  const { upside, salesYoy, profitYoy, roce, debtToEquity } = input

  if (upside != null) {
    if (upside >= 15) badges.push({ label: 'Undervalued', tone: 'good' })
    else if (upside <= -15) badges.push({ label: 'Overvalued', tone: 'warn' })
    else badges.push({ label: 'Fair Value', tone: 'good' })
  }
  if (profitYoy != null && profitYoy > 15) badges.push({ label: 'Good Growth', tone: 'good' })
  else if (profitYoy != null && profitYoy < 0) badges.push({ label: 'Profit Declining', tone: 'warn' })
  if (roce != null && roce >= 15) badges.push({ label: 'High ROCE', tone: 'info' })
  else if (roce != null && roce < 8) badges.push({ label: 'Low ROCE', tone: 'warn' })
  if (debtToEquity != null) {
    if (debtToEquity <= 0.5) badges.push({ label: 'Low Debt', tone: 'good' })
    else if (debtToEquity >= 2) badges.push({ label: 'High Debt', tone: 'warn' })
  }
  if (salesYoy != null && salesYoy > 15) badges.push({ label: 'Sales Momentum', tone: 'info' })
  return badges
}

export type StockView = {
  symbol: string
  companyName: string | null
  detail: ScreenerDetail | null
  price: number | null
  high: number | null
  low: number | null
  marketCap: number | null
  pe: number | null
  bookValue: number | null
  dividendYield: number | null
  roce: number | null
  roe: number | null
  debtToEquity: number | null
  revenue: number | null
  netProfit: number | null
  eps: number | null
  /** Latest annual operating profit margin (%), null when unavailable. */
  opm: number | null
  /** Latest annual borrowings ÷ total assets, using balance-sheet rows. */
  debtToAssets: number | null
  score: number | null
  scoreBreakdown: ScoreBreakdown | null
  quality: QualityResult
  valuation: TradeLevels
  salesYoy: number | null
  profitYoy: number | null
  /** Year-on-year sales growth with periods/absolute values and comparability. */
  salesGrowth: GrowthReading | null
  /** Year-on-year profit growth with periods/absolute values and comparability. */
  profitGrowth: GrowthReading | null
  cfoPat: number | null
  /** Latest working-capital days reported by the source (screener definition). */
  workingCapitalDays: number | null
  /** Latest Cash Conversion Cycle (Debtor Days + Inventory Days − Days Payable). */
  cashConversionCycle: number | null
  /** Change in CCC vs the previous reported year (latest − prev), null when not computable. */
  cashConversionCycleDelta: number | null
  /** Latest debtor (DSO) days, null when the source omits the row. */
  debtorDays: number | null
  /** Latest inventory (DIO) days, null when the source omits the row. */
  inventoryDays: number | null
  /** Latest days payable (DPO), null when the source omits the row. */
  daysPayable: number | null
  piotroski: number | null
  /** Criteria the partial/full Piotroski score is measured against. */
  piotroskiTotal: number
  /** True when the score only missed the source-unavailable current-ratio test. */
  piotroskiPartial: boolean
  /** Signals that could not be evaluated (documented, not fabricated). */
  piotroskiMissing: string[]
  capCategory: string | null
  industry: IndustryLink[]
  growth: ReturnType<typeof computeQuarterGrowth>
  badges: Badge[]
  /** Union of legacy and named business-quality badges (deduped), see business-badges.ts. */
  businessBadges: BusinessBadge[]
  capturedAt: Date | null
  sourceUrl: string | null
}

type SnapshotInput = {
  marketCap?: unknown
  peRatio?: unknown
  bookValue?: unknown
  dividendYield?: unknown
  roce?: unknown
  roe?: unknown
  debtToEquity?: unknown
  revenue?: unknown
  netProfit?: unknown
  rawData?: unknown
  sourceUrl?: string | null
  capturedAt?: Date
}

export function buildStockView(
  stock: { symbol: string; companyName: string | null },
  latest: SnapshotInput | null | undefined,
): StockView {
  const detail = isScreenerDetail(latest?.rawData) ? latest!.rawData : null
  const top = detail?.topRatios ?? {}

  const displaySnapshot = detail ? null : latest
  const marketCap = toNumber(latest?.marketCap) ?? toNumber(top.marketCap)
  const pe = toNumber(latest?.peRatio) ?? toNumber(top.peRatio)
  const bookValue = toNumber(latest?.bookValue) ?? toNumber(top.bookValue)
  const dividendYield = toNumber(latest?.dividendYield) ?? toNumber(top.dividendYield)
  const roce = toNumber(latest?.roce) ?? toNumber(top.roce)
  const roe = toNumber(latest?.roe) ?? toNumber(top.roe)
  const debtToEquity = toNumber(latest?.debtToEquity)
  const revenue = toNumber(latest?.revenue)
  const netProfit = toNumber(latest?.netProfit)
  const price = toNumber(top.currentPrice) ?? toNumber((displaySnapshot?.rawData as { currentPrice?: unknown } | undefined)?.currentPrice)
  const eps = toNumber(lastNonEmpty(findDetailRow(detail?.profitLoss, 'eps')?.values))

  const salesSeries = rowValues(detail?.profitLoss, 'sales', 8).filter((value) => value !== 0)
  const profitSeries = rowValues(detail?.profitLoss, 'net profit', 8).filter((value) => value !== 0)
  const salesYoy = yoyPercent(salesSeries)
  const profitYoy = yoyPercent(profitSeries)

  const salesGrowth = annualGrowthReading(detail?.profitLoss, 'sales', 'Sales')
  const profitGrowth = annualGrowthReading(detail?.profitLoss, 'net profit', 'Net profit')

  const cfoLatest = lastNonEmpty(findDetailRow(detail?.cashFlow, 'cash from operating')?.values)
  const cfo = toNumber(cfoLatest)
  const cfoPat = cfo != null && netProfit != null && netProfit !== 0 ? Number((cfo / netProfit).toFixed(2)) : null
  const workingCapitalDays = toNumber(lastNonEmpty(findDetailRow(detail?.ratios, 'working capital days')?.values))
  const cccSeries = seriesWithTtm(detail?.ratios, 'cash conversion cycle')
  const cashConversionCycle = cccSeries.length ? cccSeries[cccSeries.length - 1] : null
  const cashConversionCyclePrev = cccSeries.length >= 2 ? cccSeries[cccSeries.length - 2] : null
  const cashConversionCycleDelta =
    cashConversionCycle != null && cashConversionCyclePrev != null ? cashConversionCycle - cashConversionCyclePrev : null
  const debtorDays = latestValue(seriesWithTtm(detail?.ratios, 'debtor days'))
  const inventoryDays = latestValue(seriesWithTtm(detail?.ratios, 'inventory days'))
  const daysPayable = latestValue(seriesWithTtm(detail?.ratios, 'days payable'))

  const annualSales = annualNumbers(detail?.profitLoss, 'sales')
  const netProfitSeries = seriesWithTtm(detail?.profitLoss, 'net profit')
  const cashFlowSeries = seriesWithTtm(detail?.cashFlow, 'cash from operating')
  const cfoPat3y = cumulativeRatio(cashFlowSeries, netProfitSeries)
  const ebit = toNumber(lastNonEmpty(findDetailRow(detail?.profitLoss, 'operating profit')?.values))
  const otherIncome = toNumber(lastNonEmpty(findDetailRow(detail?.profitLoss, 'other income')?.values))
  const profitBeforeTax = toNumber(lastNonEmpty(findDetailRow(detail?.profitLoss, 'profit before tax')?.values))
  const borrowingsLatest = toNumber(lastNonEmpty(findDetailRow(detail?.balanceSheet, 'borrowings')?.values))
  const shares = marketCap != null && price != null && price > 0 ? marketCap / price : null
  const valuation = deriveValuation({
    price,
    pe,
    bookValue,
    eps,
    profitSeries: netProfitSeries,
    ebit,
    otherIncome,
    profitBeforeTax,
    cfo,
    cfoPat3y,
    debt: borrowingsLatest,
    shares,
  })
  const piotroskiResult = computePiotroskiScore({
    netProfit: annualNumbers(detail?.profitLoss, 'net profit'),
    cashFromOps: annualNumbers(detail?.cashFlow, 'cash from operating'),
    totalAssets: annualNumbers(detail?.balanceSheet, 'total assets'),
    borrowings: annualNumbers(detail?.balanceSheet, 'borrowings'),
    equityCapital: annualNumbers(detail?.balanceSheet, 'equity capital'),
    sales: annualSales,
    operatingProfit: annualNumbers(detail?.profitLoss, 'operating profit'),
  })

  const latestSales = latestValue(annualSales)
  const latestOperatingProfit = latestValue(annualNumbers(detail?.profitLoss, 'operating profit'))
  const opm = latestSales != null && latestSales > 0 && latestOperatingProfit != null ? (latestOperatingProfit / latestSales) * 100 : null

  const borrowings = latestValue(annualNumbers(detail?.balanceSheet, 'borrowings'))
  const totalAssets = latestValue(annualNumbers(detail?.balanceSheet, 'total assets'))
  const debtToAssets = borrowings != null && totalAssets != null && totalAssets > 0 ? borrowings / totalAssets : null

  const growth = computeQuarterGrowth(detail?.quarters)
  const scoreBreakdown = computeScore(
    { roce, roe, opm, salesYoy, profitYoy, cfoPat, debtToEquity, debtToAssets, pe, upside: valuation.upside },
    latest?.capturedAt ?? new Date(),
  )
  const quality = computeQuality({
    roce,
    roe,
    salesYoy,
    profitYoy,
    cfoPat,
    debtToEquity,
    debtToAssets,
    piotroski: piotroskiResult.score,
    pe,
    netProfit,
    overvaluation: valuation.overvaluation,
    noEquity: valuation.noEquity,
    upside: valuation.upside,
    intrinsic: valuation.intrinsic,
    qoqSalesPct: growth?.qoq.sales.pct ?? null,
    qoqProfitPct: growth?.qoq.netProfit.pct ?? null,
  })
  const score = scoreBreakdown.score

  return {
    symbol: stock.symbol,
    companyName: stock.companyName,
    detail,
    price,
    high: toNumber(top.high),
    low: toNumber(top.low),
    marketCap,
    pe,
    bookValue,
    dividendYield,
    roce,
    roe,
    debtToEquity,
    revenue,
    netProfit,
    eps,
    opm,
    debtToAssets,
    score,
    scoreBreakdown,
    quality,
    valuation,
    salesYoy,
    profitYoy,
    salesGrowth,
    profitGrowth,
    cfoPat,
    workingCapitalDays,
    cashConversionCycle,
    cashConversionCycleDelta,
    debtorDays,
    inventoryDays,
    daysPayable,
    piotroski: piotroskiResult.score,
    piotroskiTotal: piotroskiResult.totalCriteria,
    piotroskiPartial: piotroskiResult.partial,
    piotroskiMissing: piotroskiResult.missing,
    capCategory: capCategory(marketCap),
    industry: detail?.industry ?? [],
    growth,
    badges: buildBadges({ upside: valuation.upside, salesYoy, profitYoy, roce, debtToEquity }),
    businessBadges: buildBusinessBadges({
      upside: valuation.upside,
      pe,
      roce,
      roe,
      salesYoy,
      profitYoy,
      qoqProfitPct: growth?.qoq.netProfit.pct ?? null,
      debtToEquity,
      piotroski: piotroskiResult.score,
    }),
    capturedAt: latest?.capturedAt ?? null,
    sourceUrl: latest?.sourceUrl ?? detail?.sourceUrl ?? null,
  }
}
