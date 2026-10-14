import { isAllGreen, parseScreenerResultsPage, resultsPageUrl, type ResultCompanyRow, type ResultPage } from './scrapers/screener-results'
import type { ParsedSymbol } from './scrapers/types'

/**
 * Walk every page of the authenticated screener.in latest-results listing
 * (`/results/latest/`) and return the companies whose Sales, EBIDT, Net profit
 * and EPS are all green (YOY increase), deduplicated, plus an honest report.
 *
 * The listing paginates with `?p=N` links (25 companies/page) and states the
 * total in "N results", so the page count is derived from that count (falling
 * back to the highest linked page). Fetching is injected so pagination,
 * partial-failure and retry handling can be tested without the network;
 * production passes the polite, session-authenticated fetch.
 */

export type FetchHtml = (url: string) => Promise<string | null>

export type ResultsPagesFailed = { page: number; error: string }

export type ResultsImportStatus = 'complete' | 'partial' | 'failed' | 'limit-reached'

export type ResultsImportReport = {
  sourceUrl: string
  /** Total companies the listing reports ("N results"), when stated. */
  totalResults: number | null
  /** Total pages discovered (from the count, else pagination links). */
  pagesDiscovered: number | null
  /** Pages this import intended to fetch (bounded by maxPages). */
  pagesPlanned: number
  pagesFetched: number
  pagesFailed: ResultsPagesFailed[]
  /** Every company card parsed (green or not). */
  rowsParsed: number
  /** Companies whose four metrics are all green. */
  qualified: number
  /** Distinct all-green companies after dedup. */
  uniqueCompanies: number
  duplicatesSkipped: number
  limitReached: boolean
  status: ResultsImportStatus
  warnings: string[]
  startedAt: string
  finishedAt: string
}

export type ResultsCollectResult = {
  symbols: ParsedSymbol[]
  report: ResultsImportReport
}

export type ResultsCollectOptions = { maxPages?: number; delayMs?: number }

export const DEFAULT_RESULTS_MAX_PAGES = 60

export async function collectScreenerResults(
  sourceUrl: string,
  fetchHtml: FetchHtml,
  options: ResultsCollectOptions = {},
): Promise<ResultsCollectResult> {
  const maxPages = Math.max(1, options.maxPages ?? DEFAULT_RESULTS_MAX_PAGES)
  const startedAt = new Date()

  const report: ResultsImportReport = {
    sourceUrl,
    totalResults: null,
    pagesDiscovered: null,
    pagesPlanned: 1,
    pagesFetched: 0,
    pagesFailed: [],
    rowsParsed: 0,
    qualified: 0,
    uniqueCompanies: 0,
    duplicatesSkipped: 0,
    limitReached: false,
    status: 'failed',
    warnings: [],
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
  }

  const allRows: ResultCompanyRow[] = []
  let firstPage: ResultPage | null = null

  const firstHtml = await fetchHtml(resultsPageUrl(sourceUrl, 1))
  if (firstHtml == null) {
    report.pagesFailed.push({ page: 1, error: 'Failed to fetch page 1.' })
    report.finishedAt = new Date().toISOString()
    return { symbols: [], report }
  }

  firstPage = parseScreenerResultsPage(firstHtml)
  report.totalResults = firstPage.totalResults
  report.pagesDiscovered = firstPage.totalPages
  report.warnings.push(...firstPage.warnings)
  report.pagesFetched = 1
  allRows.push(...firstPage.rows)

  const discovered = firstPage.totalPages ?? 1
  const planned = Math.min(discovered, maxPages)
  report.pagesPlanned = planned
  report.limitReached = discovered > planned

  for (let page = 2; page <= planned; page += 1) {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs))
    let html: string | null
    try {
      html = await fetchHtml(resultsPageUrl(sourceUrl, page))
    } catch (error) {
      report.pagesFailed.push({ page, error: error instanceof Error ? error.message : 'Fetch threw.' })
      continue
    }
    if (html == null) {
      report.pagesFailed.push({ page, error: `Failed to fetch page ${page}.` })
      continue
    }
    const parsed = parseScreenerResultsPage(html)
    report.warnings.push(...parsed.warnings)
    report.pagesFetched += 1
    allRows.push(...parsed.rows)
  }

  const qualified = allRows.filter((row) => isAllGreen(row.trends))
  const bySymbol = new Map<string, ParsedSymbol>()
  for (const row of qualified) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, { symbol: row.symbol, companyName: row.companyName })
  }
  report.rowsParsed = allRows.length
  report.qualified = qualified.length
  report.duplicatesSkipped = qualified.length - bySymbol.size
  report.uniqueCompanies = bySymbol.size

  if (report.pagesFetched === 0) {
    report.status = 'failed'
  } else if (report.limitReached) {
    report.status = 'limit-reached'
  } else if (report.pagesFailed.length > 0 || (report.pagesDiscovered != null && report.pagesFetched < report.pagesDiscovered)) {
    report.status = 'partial'
  } else {
    report.status = 'complete'
  }

  report.finishedAt = new Date().toISOString()
  return { symbols: [...bySymbol.values()], report }
}
