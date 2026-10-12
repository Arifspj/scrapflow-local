import type { DetailRow, DetailTable, ScreenerDetail } from '@/lib/scrapers/screener-detail'

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

export function capCategory(marketCap: number | null): string | null {
  if (marketCap == null) return null
  if (marketCap >= 50000) return 'Large Cap'
  if (marketCap >= 20000) return 'Mid Cap'
  if (marketCap >= 5000) return 'Small Cap'
  return 'Micro Cap'
}

export type TradeLevels = { fair: number | null; graham: number | null; noGrowth: number | null; conservative: number | null; upside: number | null }

export function deriveValuation(input: {
  price: number | null
  eps: number | null
  bookValue: number | null
  roce: number | null
}): TradeLevels {
  const { price, eps, bookValue, roce } = input
  const fairMultiple = 15
  const fair = eps != null && eps > 0 ? eps * fairMultiple : null
  const graham = eps != null && bookValue != null && eps > 0 && bookValue > 0 ? Math.sqrt(22.5 * eps * bookValue) : null
  const noGrowth = eps != null && eps > 0 ? eps * (roce != null && roce > 12 ? 12 : 10) : null
  const conservative = fair != null ? fair * 0.9 : null
  const upside = fair != null && price != null && price > 0 ? ((fair - price) / price) * 100 : null
  return { fair, graham, noGrowth, conservative, upside }
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
  score: number | null
  valuation: TradeLevels
  salesYoy: number | null
  profitYoy: number | null
  cfoPat: number | null
  workingCapitalDays: number | null
  capCategory: string | null
  badges: Badge[]
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

  const cfoLatest = lastNonEmpty(findDetailRow(detail?.cashFlow, 'cash from operating')?.values)
  const cfo = toNumber(cfoLatest)
  const cfoPat = cfo != null && netProfit != null && netProfit !== 0 ? Number((cfo / netProfit).toFixed(2)) : null
  const workingCapitalDays = toNumber(lastNonEmpty(findDetailRow(detail?.ratios, 'working capital days')?.values))

  const valuation = deriveValuation({ price, eps, bookValue, roce })
  const score = deriveScore(roce, roe)

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
    score,
    valuation,
    salesYoy,
    profitYoy,
    cfoPat,
    workingCapitalDays,
    capCategory: capCategory(marketCap),
    badges: buildBadges({ upside: valuation.upside, salesYoy, profitYoy, roce, debtToEquity }),
    capturedAt: latest?.capturedAt ?? null,
    sourceUrl: latest?.sourceUrl ?? detail?.sourceUrl ?? null,
  }
}
