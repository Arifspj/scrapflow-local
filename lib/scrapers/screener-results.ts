import * as cheerio from 'cheerio'
import { cleanSymbol } from './screener'
import { isScreenerAuthPage } from './screener-auth'
import type { ParseResult, ParsedSymbol } from './types'

export const SCREENER_BASE = 'https://www.screener.in'
export const SCREENER_RESULTS_PARSER_VERSION = 'screener-results@1.0.0'

/** Rows per page on the screener.in latest-results listing. */
export const RESULTS_PAGE_SIZE = 25

/**
 * Parser for the authenticated screener.in "Latest quarterly results" listing
 * (`/results/latest/`, `/results/`).
 *
 * The page is behind a login, so it is only ever fetched with the signed-in
 * session (see `screener-auth`). Each company is rendered as two sibling blocks
 * inside one list: a header (`<div class="flex-row …">` holding the name link
 * `/company/<symbol>/(consolidated|standalone)/#quarters`, the results PDF link
 * and the price/cap/PE line) followed by the metrics card
 * (`<div class="bg-base …"> > <table class="data-table margin-0">`) whose rows
 * are `data-sales`, `data-ebidt`, `data-net-profit` and `data-eps`. The second
 * cell of each metric row is the YOY change, wrapped in `span.change.up`
 * (green/increase) or `span.change.down` (red/decline) — blank when no
 * comparison is possible.
 *
 * Only companies whose Sales, EBIDT, Net profit **and** EPS are all green
 * (YOY increase) are returned, which is the point of this "QoQ result" source.
 */

export type ResultTrend = 'up' | 'down' | 'flat'

export type ResultTrends = {
  sales: ResultTrend
  ebidt: ResultTrend
  netProfit: ResultTrend
  eps: ResultTrend
}

export type ResultCompanyRow = {
  symbol: string
  companyName: string | null
  sourceUrl: string
  trends: ResultTrends
}

export type ResultPage = {
  totalPages: number | null
  totalResults: number | null
  rows: ResultCompanyRow[]
  /** True when the fetched HTML is screener.in's sign-in page, not the listing. */
  authRequired: boolean
  warnings: string[]
}

const METRIC_KEYS = ['sales', 'ebidt', 'netProfit', 'eps'] as const
type MetricKey = (typeof METRIC_KEYS)[number]

/** DOM `data-*` attribute suffix for each metric row. */
const METRIC_ATTR: Record<MetricKey, string> = {
  sales: 'sales',
  ebidt: 'ebidt',
  netProfit: 'net-profit',
  eps: 'eps',
}

function text(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Resolve a `/company/…/…/#quarters` href to a ticker. The ticker-less
 * `/company/id/<number>/…` form is skipped because `/company/<symbol>/` — the
 * path every downstream adapter fetches — 404s for it.
 */
export function symbolFromResultsHref(href: string | undefined | null): string | null {
  if (!href) return null
  const path = href.replace(/^https?:\/\/[^/]+/i, '')
  if (/^\/company\/id(\/|$)/i.test(path)) return null
  const match = path.match(/^\/company\/([^/?#]+)/i)
  if (!match) return null
  try {
    return cleanSymbol(decodeURIComponent(match[1]))
  } catch {
    return cleanSymbol(match[1])
  }
}

function trendFromCell(cell: cheerio.Cheerio<any>): ResultTrend {
  if (cell.find('.change.up').length > 0) return 'up'
  if (cell.find('.change.down').length > 0) return 'down'
  return 'flat'
}

/** The company header is the sibling element immediately preceding each metrics table. */
function headerForTable($: cheerio.CheerioAPI, table: cheerio.Cheerio<any>): cheerio.Cheerio<any> {
  let candidate = table.parent().prev()
  let guard = 0
  while (candidate.length && candidate.find('a[href*="/company/"]').length === 0 && guard < 5) {
    candidate = candidate.prev()
    guard += 1
  }
  return candidate
}

/** A row qualifies only if all four metrics are green (YOY increase). */
export function isAllGreen(trends: ResultTrends): boolean {
  return METRIC_KEYS.every((key) => trends[key] === 'up')
}

function parseRows($: cheerio.CheerioAPI): { rows: ResultCompanyRow[]; warnings: string[] } {
  const warnings: string[] = []
  const tables = $('table.data-table').filter((_, element) => $(element).find('tr[data-sales]').length > 0)
  if (!tables.length) return { rows: [], warnings: ['No quarterly result cards were found on the page.'] }

  const rows: ResultCompanyRow[] = []
  let skippedNoSymbol = 0

  tables.each((_, element) => {
    const table = $(element)
    const header = headerForTable($, table)
    const anchor = header.find('a[href*="/company/"]').first()
    const href = anchor.attr('href')
    const symbol = symbolFromResultsHref(href)
    if (!symbol) {
      if (href) skippedNoSymbol += 1
      return
    }
    const companyName = text(anchor.find('span.hover-link').first().text()) || text(anchor.text()) || null
    const trends = {} as ResultTrends
    for (const key of METRIC_KEYS) {
      trends[key] = trendFromCell(table.find(`tr[data-${METRIC_ATTR[key]}] > td`).eq(1))
    }
    const sourceUrl = href && !/^https?:\/\//i.test(href) ? `${SCREENER_BASE}${href}` : href ?? SCREENER_BASE
    rows.push({ symbol, companyName, sourceUrl, trends })
  })

  if (skippedNoSymbol) warnings.push(`Skipped ${skippedNoSymbol} result row(s) without a resolvable company symbol.`)
  return { rows, warnings }
}

/** Every page number referenced by `?p=N` pagination links in the HTML. */
export function discoverResultsPages(html: string): number[] {
  const decoded = html.replace(/&amp;/gi, '&').replace(/&#0*38;/g, '&')
  const numbers = new Set<number>([1])
  for (const match of decoded.matchAll(/[?&]p=(\d+)/g)) {
    const value = Number(match[1])
    if (Number.isInteger(value) && value > 0) numbers.add(value)
  }
  return [...numbers].sort((a, b) => a - b)
}

/** Total companies the listing reports, from the "N results" text. */
export function parseResultsCount(html: string): number | null {
  const match = html.replace(/\s+/g, ' ').match(/([\d,]+)\s+results?/i)
  if (!match) return null
  const value = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}

export function parseScreenerResultsPage(html: string): ResultPage {
  const $ = cheerio.load(html)
  const { rows, warnings } = parseRows($)
  const authRequired = isScreenerAuthPage(html)
  if (authRequired && !rows.length) {
    warnings.length = 0
    warnings.push('Screener.in returned its sign-in page — the latest-results listing needs an authenticated session (SCREENER_EMAIL / SCREENER_PASSWORD).')
  }
  const totalResults = parseResultsCount(html)
  const linkedMax = discoverResultsPages(html).reduce((max, page) => Math.max(max, page), 1)
  const fromCount = totalResults != null ? Math.ceil(totalResults / RESULTS_PAGE_SIZE) : null
  const totalPages = fromCount != null ? Math.max(fromCount, 1) : linkedMax
  return { totalPages, totalResults, rows, authRequired, warnings }
}

/** Append (or replace) the `?p=` query parameter on a results listing URL. */
export function resultsPageUrl(baseUrl: string, page: number): string {
  const url = new URL(baseUrl, SCREENER_BASE)
  url.searchParams.set('p', String(page))
  return url.toString()
}

/**
 * Parse a latest-results listing through the generic `ParseResult` shape so it
 * can be previewed and stored like any other source. Only all-green companies
 * are emitted; pagination is handled by the collector, not here.
 */
export function parseScreenerResultsSource(html: string): ParseResult {
  const page = parseScreenerResultsPage(html)
  const symbols = new Map<string, ParsedSymbol>()
  for (const row of page.rows) {
    if (!isAllGreen(row.trends)) continue
    if (!symbols.has(row.symbol)) symbols.set(row.symbol, { symbol: row.symbol, companyName: row.companyName })
  }
  const warnings = [...page.warnings]
  if (!symbols.size) warnings.push('No companies with all-green quarterly results were found on this page.')
  return {
    kind: 'screener-results',
    parserVersion: SCREENER_RESULTS_PARSER_VERSION,
    symbols: [...symbols.values()],
    fundamentals: null,
    warnings,
  }
}
