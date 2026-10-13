import * as cheerio from 'cheerio'
import { cleanSymbol, parseNumber } from './screener'
import { discoverPageNumbers } from './paging'
import type { ParseResult } from './types'

export const SCREENER_BASE = 'https://www.screener.in'
export const IPO_PARSER_VERSION = 'screener-ipo@1.0.0'

/**
 * Parser for screener.in IPO listing pages (`/ipo/`, `/ipo/recent/`,
 * `/ipo/below-price/`, `/ipo/rights/`).
 *
 * The table lists one row per company with a "Showing N companies." status line
 * and `?page=N` links. Company cells link to `/company/<ticker>/` when a ticker
 * exists, to `/company/<number>/` for a numeric warehouse page (which resolves
 * at the same path) or to `/company/id/<number>/` for a company that has no
 * ticker yet. The last form is skipped because `/company/<symbol>/` — the path
 * every downstream adapter fetches — 404s for it, so persisting such a row would
 * create a stock that can never be opened.
 */

export type IpoMetrics = {
  listingDate: string | null
  ipoMcap: number | null
  ipoPrice: number | null
  currentPrice: number | null
  pctChange: number | null
}

export type IpoCompanyRow = {
  symbol: string
  companyName: string | null
  sourceUrl: string
  serial: number | null
  metrics: IpoMetrics
}

export type IpoPage = {
  totalPages: number | null
  totalResults: number | null
  rows: IpoCompanyRow[]
  warnings: string[]
}

type IpoColumn = 'company' | 'listingDate' | 'ipoMcap' | 'ipoPrice' | 'currentPrice' | 'pctChange'

const HEADER_KEYS: Record<string, IpoColumn> = {
  name: 'company',
  company: 'company',
  'listing date': 'listingDate',
  'ipo mcap': 'ipoMcap',
  'ipo price': 'ipoPrice',
  'current price': 'currentPrice',
  '% change': 'pctChange',
  change: 'pctChange',
}

const DEFAULT_COLUMNS: IpoColumn[] = ['company', 'listingDate', 'ipoMcap', 'ipoPrice', 'currentPrice', 'pctChange']

function text(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeHeader(value: string): string {
  return value
    .replace(/rs\.?\s*cr\.?/gi, '')
    .replace(/rs\.?/gi, '')
    .replace(/%/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Resolve a `/company/…/` href to a ticker. Returns null for the ticker-less
 * `/company/id/<number>/` form so callers never persist an unopenable symbol.
 */
function symbolFromIpoHref(href: string): string | null {
  const match = href.match(/^\/company\/([^/?#]+)/i)
  if (!match) return null
  let segment: string
  try {
    segment = decodeURIComponent(match[1])
  } catch {
    segment = match[1]
  }
  if (/^id$/i.test(segment)) return null
  return cleanSymbol(segment)
}

function headerColumns($: cheerio.CheerioAPI, table: cheerio.Cheerio<any>): IpoColumn[] {
  const headerCells = table.find('tr').first().find('th')
  if (!headerCells.length) return DEFAULT_COLUMNS
  const columns: IpoColumn[] = []
  headerCells.each((_, element) => {
    const key = HEADER_KEYS[normalizeHeader($(element).text())]
    if (key) columns.push(key)
  })
  return columns.length ? columns : DEFAULT_COLUMNS
}

function extractCompany(cell: cheerio.Cheerio<any>): { symbol: string; companyName: string | null; sourceUrl: string } | null {
  const anchor = cell.find('a[href*="/company/"]').first()
  const href = anchor.attr('href')
  if (!href) return null
  const symbol = symbolFromIpoHref(href)
  if (!symbol) return null
  const label = text(anchor.text()) || null
  const url = href.startsWith('http') ? href : `${SCREENER_BASE}${href}`
  return { symbol, companyName: label, sourceUrl: url }
}

const EMPTY_METRICS: IpoMetrics = {
  listingDate: null,
  ipoMcap: null,
  ipoPrice: null,
  currentPrice: null,
  pctChange: null,
}

function parseCompanyCount(value: string): number | null {
  const match = value.replace(/\s+/g, ' ').match(/([\d,]+)\s+companies?/i)
  return match ? parseNumber(match[1]) : null
}

function parseRows($: cheerio.CheerioAPI): { rows: IpoCompanyRow[]; warnings: string[] } {
  const warnings: string[] = []
  const table = $('table.data-table')
    .filter((_, element) => $(element).find('a[href*="/company/"]').length > 0)
    .first()
  if (!table.length) return { rows: [], warnings: ['No IPO result table found on the page.'] }

  const keys = headerColumns($, table)

  const rows: IpoCompanyRow[] = []
  let skippedNoTicker = 0
  let skippedUnresolved = 0

  table.find('tr').each((_, tr) => {
    const cells = $(tr).children('td')
    if (!cells.length) return
    const metrics: IpoMetrics = { ...EMPTY_METRICS }
    let companyName: string | null = null
    let symbol: string | null = null
    let sourceUrl = ''

    cells.each((index, cell) => {
      const key = keys[index]
      if (!key) return
      if (key === 'company') {
        const anchor = $(cell).find('a[href*="/company/"]').first()
        const href = anchor.attr('href')
        if (href?.match(/^\/company\/id\//i)) {
          skippedNoTicker += 1
          return
        }
        const parsed = extractCompany($(cell))
        if (parsed) {
          symbol = parsed.symbol
          companyName = parsed.companyName
          sourceUrl = parsed.sourceUrl
        } else {
          skippedUnresolved += 1
        }
        return
      }
      if (key === 'listingDate') {
        metrics.listingDate = text($(cell).text()) || null
        return
      }
      const change = key === 'pctChange' ? $(cell).find('.change') : null
      let value = parseNumber($(cell).text())
      if (key === 'pctChange' && value != null && change != null && change.hasClass('down')) value = -value
      metrics[key] = value
    })

    if (!symbol || !sourceUrl) return
    rows.push({ symbol, companyName, sourceUrl, serial: null, metrics })
  })

  if (skippedNoTicker) warnings.push(`Skipped ${skippedNoTicker} IPO row(s) that screener lists without a ticker yet (/company/id/…).`)
  if (skippedUnresolved) warnings.push(`Skipped ${skippedUnresolved} IPO row(s) without a resolvable company symbol.`)
  return { rows, warnings }
}

export function parseScreenerIpoPage(html: string): IpoPage {
  const $ = cheerio.load(html)
  const { rows, warnings } = parseRows($)
  const discovered = discoverPageNumbers(html)
  const totalPages = discovered.length ? Math.max(...discovered) : null
  const totalResults = parseCompanyCount($('p.smaller').first().text() || $('body').text())
  return { totalPages, totalResults, rows, warnings }
}

/**
 * Parse an IPO listing through the generic `ParseResult` shape so it can be
 * previewed and stored like any other source. Pagination is handled by the
 * collector, not here.
 */
export function parseScreenerIpoSource(html: string): ParseResult {
  const page = parseScreenerIpoPage(html)
  const symbols = new Map<string, { symbol: string; companyName: string | null }>()
  for (const row of page.rows) {
    if (!symbols.has(row.symbol)) symbols.set(row.symbol, { symbol: row.symbol, companyName: row.companyName })
  }
  const warnings = [...page.warnings]
  if (!symbols.size) warnings.push('No company rows were found in the IPO listing HTML.')
  return {
    kind: 'screener-ipo',
    parserVersion: IPO_PARSER_VERSION,
    symbols: [...symbols.values()],
    fundamentals: null,
    warnings,
  }
}
