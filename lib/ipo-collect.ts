import { pageUrl } from './scrapers/paging'
import { parseScreenerIpoPage, type IpoCompanyRow, type IpoPage } from './scrapers/screener-ipo'

/**
 * Walk every page of a screener.in IPO listing (`/ipo/…`) and return the
 * complete, deduplicated company set plus an honest import report.
 *
 * The listing shows "Showing N companies." and paginates with `?page=N` links.
 * Unlike a screen, the page count is never stated, so it is discovered from the
 * pagination links (or capped by `maxPages`). Fetching is injected so the
 * orchestration can be tested without the network.
 */

export type FetchHtml = (url: string) => Promise<string | null>

export type IpoPagesFailed = { page: number; error: string }

export type IpoImportStatus = 'complete' | 'partial' | 'failed' | 'limit-reached'

export type IpoImportReport = {
  sourceUrl: string
  /** Total companies the source reports ("Showing N companies."), when stated. */
  totalResults: number | null
  /** Total pages discovered from pagination links. */
  pagesDiscovered: number | null
  /** Pages this import intended to fetch (bounded by maxPages). */
  pagesPlanned: number
  pagesFetched: number
  pagesFailed: IpoPagesFailed[]
  rowsParsed: number
  uniqueCompanies: number
  duplicatesSkipped: number
  limitReached: boolean
  status: IpoImportStatus
  warnings: string[]
  startedAt: string
  finishedAt: string
}

export type IpoCollectResult = {
  report: IpoImportReport
  rows: IpoCompanyRow[]
  page: IpoPage | null
}

export type IpoCollectOptions = { maxPages?: number; delayMs?: number }

export const DEFAULT_IPO_MAX_PAGES = 20

export async function collectScreenerIpo(
  sourceUrl: string,
  fetchHtml: FetchHtml,
  options: IpoCollectOptions = {},
): Promise<IpoCollectResult> {
  const maxPages = Math.max(1, options.maxPages ?? DEFAULT_IPO_MAX_PAGES)
  const startedAt = new Date()

  const report: IpoImportReport = {
    sourceUrl,
    totalResults: null,
    pagesDiscovered: null,
    pagesPlanned: 1,
    pagesFetched: 0,
    pagesFailed: [],
    rowsParsed: 0,
    uniqueCompanies: 0,
    duplicatesSkipped: 0,
    limitReached: false,
    status: 'failed',
    warnings: [],
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
  }

  const allRows: IpoCompanyRow[] = []
  let firstPage: IpoPage | null = null

  const firstHtml = await fetchHtml(pageUrl(sourceUrl, 1))
  if (firstHtml == null) {
    report.pagesFailed.push({ page: 1, error: 'Failed to fetch page 1.' })
    report.finishedAt = new Date().toISOString()
    return { report, rows: [], page: null }
  }

  firstPage = parseScreenerIpoPage(firstHtml)
  report.totalResults = firstPage.totalResults
  report.warnings.push(...firstPage.warnings)
  report.pagesFetched = 1
  allRows.push(...firstPage.rows)

  const discovered = firstPage.totalPages ?? 1
  report.pagesDiscovered = firstPage.totalPages
  const planned = Math.min(discovered, maxPages)
  report.pagesPlanned = planned
  report.limitReached = discovered > planned

  for (let page = 2; page <= planned; page += 1) {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs))
    let html: string | null
    try {
      html = await fetchHtml(pageUrl(sourceUrl, page))
    } catch (error) {
      report.pagesFailed.push({ page, error: error instanceof Error ? error.message : 'Fetch threw.' })
      continue
    }
    if (html == null) {
      report.pagesFailed.push({ page, error: `Failed to fetch page ${page}.` })
      continue
    }
    const parsed = parseScreenerIpoPage(html)
    report.warnings.push(...parsed.warnings)
    report.pagesFetched += 1
    allRows.push(...parsed.rows)
  }

  const bySymbol = new Map<string, IpoCompanyRow>()
  for (const row of allRows) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, row)
  }
  report.rowsParsed = allRows.length
  report.duplicatesSkipped = allRows.length - bySymbol.size
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
  return { report, rows: [...bySymbol.values()], page: firstPage }
}
