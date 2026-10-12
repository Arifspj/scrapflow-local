import * as cheerio from 'cheerio'
import type { IndustryLevelName } from './screener-detail'
import { cleanSymbol, parseNumber, symbolFromCompanyHref } from './screener'

export const SCREENER_BASE = 'https://www.screener.in'
export const MARKET_PARSER_VERSION = 'screener-market@1.0.0'

/**
 * Parser for screener.in `/market/<code>/.../` industry listing pages.
 *
 * The listing is paginated (default 25 rows/page) with links of the form
 * `?page=N` and a status line "N results found: Showing page X of Y". We parse
 * the real HTML rather than assuming a page count, and expose the discovered
 * pagination so the importer can walk every page and stop honestly.
 */

export type MarketMetrics = {
  cmp: number | null
  pe: number | null
  marketCap: number | null
  dividendYield: number | null
  npQtr: number | null
  npQtrVar: number | null
  salesQtr: number | null
  salesQtrVar: number | null
  roce: number | null
}

export type MarketCompanyRow = {
  symbol: string
  companyName: string | null
  sourceUrl: string
  serial: number | null
  metrics: MarketMetrics
}

export type MarketBreadcrumbItem = {
  level: IndustryLevelName | 'root'
  name: string
  url: string | null
  current: boolean
}

export type MarketSubCategory = {
  name: string
  url: string
  count: number | null
}

export type MarketPage = {
  segments: string[]
  title: string | null
  breadcrumb: MarketBreadcrumbItem[]
  page: number | null
  totalPages: number | null
  totalResults: number | null
  rows: MarketCompanyRow[]
  subCategories: MarketSubCategory[]
  warnings: string[]
}

const LEVEL_BY_DEPTH: IndustryLevelName[] = ['broadSector', 'sector', 'broadIndustry', 'industry']

const HEADER_KEYS: Record<string, 'serial' | 'company' | keyof MarketMetrics> = {
  's.no.': 'serial',
  's no': 'serial',
  company: 'company',
  cmp: 'cmp',
  'p/e': 'pe',
  'mar cap': 'marketCap',
  'div yld': 'dividendYield',
  'np qtr': 'npQtr',
  'qtr profit var': 'npQtrVar',
  'sales qtr': 'salesQtr',
  'qtr sales var': 'salesQtrVar',
  roce: 'roce',
}

const DEFAULT_COLUMNS: ('serial' | 'company' | keyof MarketMetrics)[] = [
  'serial',
  'company',
  'cmp',
  'pe',
  'marketCap',
  'dividendYield',
  'npQtr',
  'npQtrVar',
  'salesQtr',
  'salesQtrVar',
  'roce',
]

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

/** Parse the "74 results found: Showing page 1 of 3" status line. */
export function parsePageInfo(value: string): { totalResults: number | null; page: number | null; totalPages: number | null } {
  const cleaned = text(value)
  const results = cleaned.match(/([\d,]+)\s+results?\s+found/i)
  const showing = cleaned.match(/showing\s+page\s+(\d+)\s+of\s+(\d+)/i)
  return {
    totalResults: results ? parseNumber(results[1]) : null,
    page: showing ? Number(showing[1]) : null,
    totalPages: showing ? Number(showing[2]) : null,
  }
}

/** Every page number referenced by pagination links in the HTML (plus page 1). */
export function discoverPageNumbers(html: string): number[] {
  const numbers = new Set<number>([1])
  const matches = html.matchAll(/[?&]page=(\d+)/g)
  for (const match of matches) {
    const value = Number(match[1])
    if (Number.isInteger(value) && value > 0) numbers.add(value)
  }
  return [...numbers].sort((a, b) => a - b)
}

/** Canonical source URL for a category page (with the source's `?page=` param). */
export function marketPageUrl(segments: readonly string[], page = 1, limit?: number): string {
  const params = new URLSearchParams()
  if (limit != null) params.set('limit', String(limit))
  params.set('page', String(page))
  return `${SCREENER_BASE}/market/${segments.join('/')}/?${params.toString()}`
}

/** Canonical source URL for a category root (no pagination). */
export function marketCategoryUrl(segments: readonly string[]): string {
  return `${SCREENER_BASE}/market/${segments.join('/')}/`
}

function parseBreadcrumb($: cheerio.CheerioAPI): MarketBreadcrumbItem[] {
  const items: MarketBreadcrumbItem[] = []
  $('.breadcrumb li').each((_, element) => {
    const node = $(element)
    const anchor = node.find('a').first()
    const name = text(node.text())
    if (!name) return
    const href = anchor.attr('href') ?? null
    items.push({ level: 'root', name, url: href, current: !href })
  })

  let depth = 0
  return items.map((item) => {
    if (item.level === 'root' && /^industries$/i.test(item.name)) {
      return { ...item, level: 'root' as const }
    }
    const level = LEVEL_BY_DEPTH[Math.min(depth, LEVEL_BY_DEPTH.length - 1)]
    depth += 1
    return { ...item, level }
  })
}

function parseSubCategories($: cheerio.CheerioAPI, segments: readonly string[]): MarketSubCategory[] {
  const prefix = `/market/${segments.join('/')}/`
  const out: MarketSubCategory[] = []
  const seen = new Set<string>()
  $('.dropdown-content a, .dropdown-menu a').each((_, element) => {
    const href = $(element).attr('href')
    if (!href || !href.startsWith(prefix)) return
    if (href.replace(/\/+$/, '') === prefix.replace(/\/+$/, '')) return
    if (seen.has(href)) return
    seen.add(href)
    const label = text($(element).text())
    const countMatch = label.match(/-\s*([\d,]+)\s*$/)
    out.push({
      name: countMatch ? text(label.slice(0, label.lastIndexOf('-'))) : label,
      url: href,
      count: countMatch ? parseNumber(countMatch[1]) : null,
    })
  })
  return out
}

function headerColumns($: cheerio.CheerioAPI, table: cheerio.Cheerio<any>): ('serial' | 'company' | keyof MarketMetrics)[] {
  const headerCells = table.find('tr').first().find('th')
  if (!headerCells.length) return DEFAULT_COLUMNS
  const columns: ('serial' | 'company' | keyof MarketMetrics)[] = []
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
  const label = text(anchor.text()) || null
  const fromHref = symbolFromCompanyHref(href)
  // Some rows link by numeric warehouse id (e.g. /company/544937/); fall back to
  // the visible label, which carries the ticker for those rows.
  const numericHref = fromHref != null && /^\d+$/.test(fromHref)
  const symbol = (numericHref ? cleanSymbol(label) : fromHref) ?? fromHref ?? cleanSymbol(label)
  if (!symbol) return null
  const url = href.startsWith('http') ? href : `${SCREENER_BASE}${href}`
  return { symbol, companyName: label, sourceUrl: url }
}

const EMPTY_METRICS: MarketMetrics = {
  cmp: null,
  pe: null,
  marketCap: null,
  dividendYield: null,
  npQtr: null,
  npQtrVar: null,
  salesQtr: null,
  salesQtrVar: null,
  roce: null,
}

function parseRows($: cheerio.CheerioAPI): { rows: MarketCompanyRow[]; warnings: string[] } {
  const warnings: string[] = []
  const table = $('table.data-table')
    .filter((_, element) => $(element).find('a[href*="/company/"]').length > 0)
    .first()
  if (!table.length) return { rows: [], warnings: ['No company result table found on the page.'] }

  const keys = headerColumns($, table)

  const rows: MarketCompanyRow[] = []
  let skipped = 0
  table.find('tr').each((_, tr) => {
    const cells = $(tr).children('td')
    if (!cells.length) return
    const metrics: MarketMetrics = { ...EMPTY_METRICS }
    let company: MarketCompanyRow['companyName'] = null
    let symbol: string | null = null
    let sourceUrl = ''
    let serial: number | null = null

    cells.each((index, cell) => {
      const key = keys[index]
      if (!key) return
      if (key === 'company') {
        const parsed = extractCompany($(cell))
        if (parsed) {
          symbol = parsed.symbol
          company = parsed.companyName
          sourceUrl = parsed.sourceUrl
        }
        return
      }
      const value = parseNumber($(cell).text())
      if (key === 'serial') serial = value
      else metrics[key] = value
    })

    if (!symbol || !sourceUrl) {
      skipped += 1
      return
    }
    rows.push({ symbol, companyName: company, sourceUrl, serial, metrics })
  })

  if (skipped) warnings.push(`Skipped ${skipped} row(s) without a resolvable company symbol.`)
  return { rows, warnings }
}

export function parseMarketPage(html: string, segments: readonly string[]): MarketPage {
  const $ = cheerio.load(html)
  const warnings: string[] = []
  const pageInfo = parsePageInfo($('[data-page-info]').first().text() || $('body').text())

  const title = text($('h1').first().text()) || null
  const breadcrumb = parseBreadcrumb($)
  const subCategories = parseSubCategories($, segments)
  const { rows, warnings: rowWarnings } = parseRows($)
  warnings.push(...rowWarnings)

  const discovered = discoverPageNumbers(html)
  const totalPages = pageInfo.totalPages ?? (discovered.length ? Math.max(...discovered) : null)

  if (pageInfo.totalPages == null && discovered.length > 1) {
    warnings.push('Page count not stated in the status line; inferred from pagination links.')
  }

  return {
    segments: [...segments],
    title,
    breadcrumb,
    page: pageInfo.page,
    totalPages,
    totalResults: pageInfo.totalResults,
    rows,
    subCategories,
    warnings,
  }
}
