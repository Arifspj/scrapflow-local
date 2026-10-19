/**
 * KPI taxonomy for the Multi-Stock Spread Terminal (`/compare`).
 *
 * This module is data-shape only: metric ids, labels, comparison direction,
 * formatting and the plain-language help text. It holds no figures — every
 * value is supplied by the server-side loader (`lib/compare-data.ts`) from the
 * persisted `ViewSummary` pipeline so nothing here can be mistaken for a quote.
 */

export type MetricDirection = 'higher' | 'lower' | 'none'

export type MetricFormat = 'inr' | 'pct' | 'ratio' | 'score' | 'pending'

export type MetricSource = 'calculated' | 'source' | 'derived' | 'pending'

export type MetricDef = {
  id: string
  label: string
  format: MetricFormat
  /** Which end of the range is "best" when comparing peers. */
  direction: MetricDirection
  source: MetricSource
  hint?: string
  /** Plain-language "what is it" shown in the hover tooltip. */
  about?: string
  /** Optional "what good looks like" guidance shown in the hover tooltip. */
  benchmark?: string
}

export type MetricCategory = {
  id: string
  code: string
  title: string
  description: string
  metrics: MetricDef[]
}

export type UniverseStock = {
  symbol: string
  name: string
  ltp: number | null
  iv: number | null
  upside: number | null
  score: number | null
}

/** Metric id -> value, exactly the shape `compare-data.ts` produces. */
export type MetricValues = Record<string, number | null>

/** A universe member plus its resolved KPI values for the selected scanner. */
export type UniverseRow = UniverseStock & { values: MetricValues }

/**
 * The KPI taxonomy. `direction` drives best/worst highlighting and is the only
 * place comparison semantics live, so a metric can never be ranked the wrong
 * way. `pending` metrics are rendered as "—" with an explicit "awaiting rule"
 * note instead of a fabricated value.
 */
export const METRIC_CATEGORIES: MetricCategory[] = [
  {
    id: 'proprietary',
    code: 'A',
    title: 'Q-Scan Proprietary Specials',
    description: 'Calculated signals produced by the Q-Scan scoring and valuation engines.',
    metrics: [
      {
        id: 'fundScore',
        label: 'Fundamental Score',
        format: 'score',
        direction: 'higher',
        source: 'calculated',
        hint: 'Q-Scan blended quality score',
        about: 'A single 0–100 blend of profitability, growth, balance-sheet strength and valuation produced by the Q-Scan engine.',
        benchmark: 'Above 70 is strong; below 40 flags a weak business.',
      },
      {
        id: 'iv',
        label: 'Intrinsic Value',
        format: 'inr',
        direction: 'higher',
        source: 'calculated',
        hint: 'Blended Graham + growth fair value',
        about: 'A calculated estimate of fair value: Graham number blended with a capped growth fair value (debt-adjusted for cash traps).',
        benchmark: 'Price below intrinsic value suggests a discount to fair value.',
      },
      {
        id: 'mos',
        label: 'Margin of Safety',
        format: 'pct',
        direction: 'higher',
        source: 'calculated',
        hint: 'Discount to fair value',
        about: 'How far the current price sits below the calculated intrinsic value. 0% means price is at or above fair value.',
        benchmark: 'A 20–30% discount is a comfortable margin of safety.',
      },
      {
        id: 'grahamSpread',
        label: 'Graham Number Spread',
        format: 'pct',
        direction: 'higher',
        source: 'derived',
        hint: 'Graham number vs price',
        about: 'Percentage gap between the Graham number (√(22.5 × EPS × book value)) and the current price.',
        benchmark: 'Positive means the stock trades below its Graham number.',
      },
      {
        id: 'piotroski',
        label: 'Piotroski F-Score',
        format: 'score',
        direction: 'higher',
        source: 'calculated',
        hint: 'Out of 9 criteria',
        about: 'Nine pass/fail tests of profitability, leverage, liquidity and operating efficiency.',
        benchmark: '8–9 is very strong; 0–3 is weak.',
      },
      {
        id: 'riskReward',
        label: 'Risk : Reward',
        format: 'pending',
        direction: 'none',
        source: 'pending',
        hint: 'Awaiting an approved business rule',
        about: 'A planned signal comparing potential upside to downside. No approved formula exists yet, so nothing is shown.',
      },
    ],
  },
  {
    id: 'valuation',
    code: 'B',
    title: 'Valuation Multiples',
    description: 'Price- and enterprise-based multiples. Lower is generally cheaper.',
    metrics: [
      {
        id: 'marketCap',
        label: 'Market Cap (₹ Cr)',
        format: 'ratio',
        direction: 'none',
        source: 'source',
        hint: 'Absolute size — not ranked',
        about: 'Total market value of the company in ₹ crore. Shown for context but never ranked as better or worse.',
        benchmark: 'Size is not inherently good or bad — it sets liquidity and volatility expectations.',
      },
      {
        id: 'pe',
        label: 'P/E (TTM)',
        format: 'ratio',
        direction: 'lower',
        source: 'source',
        about: 'Price divided by trailing-twelve-month earnings per share.',
        benchmark: 'Lower is cheaper; compare against the sector median and the company’s growth.',
      },
      {
        id: 'pb',
        label: 'Price / Book',
        format: 'ratio',
        direction: 'lower',
        source: 'derived',
        about: 'Price divided by book value per share.',
        benchmark: 'Below ~3 is moderate for most sectors; high P/B needs high ROE to justify it.',
      },
      {
        id: 'ps',
        label: 'Price / Sales',
        format: 'ratio',
        direction: 'lower',
        source: 'derived',
        about: 'Market capitalisation divided by annual revenue.',
        benchmark: 'Useful for thin-margin businesses; below ~2 is generally reasonable.',
      },
      {
        id: 'evEbitda',
        label: 'EV / EBITDA',
        format: 'ratio',
        direction: 'lower',
        source: 'derived',
        about: 'Enterprise value (market cap + debt − cash) divided by EBITDA — a capital-structure-neutral multiple.',
        benchmark: 'Below ~10 is cheap for most Indian mid-caps.',
      },
      {
        id: 'divYield',
        label: 'Dividend Yield',
        format: 'pct',
        direction: 'higher',
        source: 'source',
        about: 'Annual dividend per share as a percentage of the current price.',
        benchmark: 'Above ~2% is attractive for income; sustainability matters more than the headline.',
      },
    ],
  },
  {
    id: 'profitability',
    code: 'C',
    title: 'Profitability & Operating Efficiency',
    description: 'How efficiently capital and revenue are converted into returns.',
    metrics: [
      {
        id: 'roce',
        label: 'ROCE',
        format: 'pct',
        direction: 'higher',
        source: 'source',
        about: 'Return on capital employed — operating profit generated per rupee of capital used.',
        benchmark: 'Above 15% is good; above 20% is excellent.',
      },
      {
        id: 'roe',
        label: 'ROE',
        format: 'pct',
        direction: 'higher',
        source: 'source',
        about: 'Return on equity — net profit divided by shareholders’ equity.',
        benchmark: 'Above 15% is good, but check it is not driven purely by leverage.',
      },
      {
        id: 'opm',
        label: 'Operating Margin',
        format: 'pct',
        direction: 'higher',
        source: 'source',
        about: 'Operating profit as a percentage of revenue (EBITDA margin).',
        benchmark: 'Higher and stable is better; compare within the same industry.',
      },
      {
        id: 'patMargin',
        label: 'PAT Margin',
        format: 'pct',
        direction: 'higher',
        source: 'derived',
        hint: 'Net profit ÷ revenue',
        about: 'Net profit after tax as a percentage of revenue — the bottom-line efficiency.',
        benchmark: 'Higher is better; a widening gap vs operating margin signals cost or tax drag.',
      },
      {
        id: 'assetTurnover',
        label: 'Asset Turnover',
        format: 'ratio',
        direction: 'higher',
        source: 'derived',
        hint: 'Revenue ÷ total assets',
        about: 'Revenue generated per rupee of total assets — how hard the asset base works.',
        benchmark: 'Higher is better; capital-light businesses usually show >1.5.',
      },
    ],
  },
  {
    id: 'growth',
    code: 'D',
    title: 'Growth Trajectory',
    description: 'Reported and compounded top- and bottom-line momentum.',
    metrics: [
      {
        id: 'salesYoy',
        label: 'Sales Growth (Qtr YoY)',
        format: 'pct',
        direction: 'higher',
        source: 'source',
        about: 'Latest quarterly revenue growth versus the same quarter last year.',
        benchmark: 'Double-digit growth is healthy; compare with peers in the same cycle.',
      },
      {
        id: 'profitYoy',
        label: 'Profit Growth (Qtr YoY)',
        format: 'pct',
        direction: 'higher',
        source: 'source',
        about: 'Latest quarterly net-profit growth versus the same quarter last year.',
        benchmark: 'Profit should ideally grow at least as fast as sales.',
      },
      {
        id: 'salesCagr3',
        label: '3Y Sales CAGR',
        format: 'pct',
        direction: 'higher',
        source: 'derived',
        about: 'Compound annual growth rate of revenue over the last three years.',
        benchmark: 'Above 15% is strong compounding.',
      },
      {
        id: 'profitCagr3',
        label: '3Y Profit CAGR',
        format: 'pct',
        direction: 'higher',
        source: 'derived',
        about: 'Compound annual growth rate of net profit over the last three years.',
        benchmark: 'Above 15–20% is strong; consistency matters more than a single year.',
      },
    ],
  },
  {
    id: 'health',
    code: 'E',
    title: 'Financial Health & Forensic Risks',
    description: 'Leverage, cash conversion, working-capital efficiency and shareholding structure.',
    metrics: [
      {
        id: 'debtEquity',
        label: 'Debt / Equity',
        format: 'ratio',
        direction: 'lower',
        source: 'source',
        about: 'Total debt divided by shareholders’ equity — the leverage ratio.',
        benchmark: 'Below 1.0 is comfortable for most sectors; capital-intensive ones run higher.',
      },
      {
        id: 'cfoPat',
        label: 'CFO / PAT',
        format: 'ratio',
        direction: 'higher',
        source: 'derived',
        hint: 'Cash conversion of reported profit',
        about: 'Cash flow from operations divided by net profit — how much paper profit actually turns into cash.',
        benchmark: 'Around 1.0 or above is healthy; persistently below 0.5 is a forensic red flag.',
      },
      {
        id: 'fcfYield',
        label: 'Free Cash Flow Yield',
        format: 'pct',
        direction: 'higher',
        source: 'derived',
        about: 'Free cash flow (operating cash flow − capex) as a percentage of market capitalisation.',
        benchmark: 'Above ~5% is attractive for an otherwise quality business.',
      },
      {
        id: 'workingCapitalDays',
        label: 'Working Capital Days',
        format: 'score',
        direction: 'lower',
        source: 'source',
        about: 'Days of sales tied up in working capital (receivables + inventory − payables).',
        benchmark: 'Lower is more efficient; rising days can signal a demand or collection problem.',
      },
      {
        id: 'promoter',
        label: 'Promoter Holding',
        format: 'pct',
        direction: 'higher',
        source: 'source',
        about: 'Percentage of the company owned by promoters.',
        benchmark: 'Higher and stable is reassuring; a falling stake warrants a look.',
      },
      {
        id: 'pledged',
        label: 'Promoter Pledged',
        format: 'pct',
        direction: 'lower',
        source: 'source',
        about: 'Percentage of promoter shares pledged as collateral.',
        benchmark: '0% is ideal; any meaningful pledge is a governance risk.',
      },
      {
        id: 'instStake',
        label: 'FII + DII Stake',
        format: 'pct',
        direction: 'higher',
        source: 'source',
        about: 'Combined institutional holdings (foreign + domestic).',
        benchmark: 'Rising institutional ownership supports quality; there is no single ideal level.',
      },
    ],
  },
  {
    id: 'price-action',
    code: 'F',
    title: 'Price Action & Momentum',
    description: 'Where the price sits versus its own range and trend — useful for timing an entry.',
    metrics: [
      {
        id: 'offHigh',
        label: 'Distance from 52W High',
        format: 'pct',
        direction: 'higher',
        source: 'source',
        hint: 'How far below the 52-week high',
        about: 'Percentage by which the current price is below its 52-week high (e.g. −15% from the top).',
        benchmark: 'Closer to 0% is stronger momentum; a deep drawdown may be a warning or an opportunity.',
      },
      {
        id: 'vs200dma',
        label: 'Price vs 200 DMA',
        format: 'pct',
        direction: 'higher',
        source: 'derived',
        hint: 'Long-term trend position',
        about: 'Current price relative to its 200-day moving average — a proxy for the long-term trend.',
        benchmark: 'Above 0% = uptrend; sustained below 0% signals a downtrend.',
      },
      {
        id: 'return1y',
        label: '1-Year Return',
        format: 'pct',
        direction: 'higher',
        source: 'derived',
        hint: 'Price change over 12 months',
        about: 'Close-to-close price change over the last twelve months, from the same 1Y price history the detail-page chart uses.',
        benchmark: 'Compare with profit growth — price running far ahead of earnings is a caution.',
      },
    ],
  },
]

export const TOTAL_METRICS = METRIC_CATEGORIES.reduce((sum, category) => sum + category.metrics.length, 0)

export const MAX_STOCKS = 5

export function formatMetric(value: number | null, format: MetricFormat): string {
  if (value == null || !Number.isFinite(value)) return '—'
  switch (format) {
    case 'inr':
      return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
    case 'pct':
      return `${value.toFixed(1)}%`
    case 'ratio':
      return value.toFixed(2)
    case 'score':
      return String(Math.round(value))
    case 'pending':
      return '—'
    default:
      return String(value)
  }
}
