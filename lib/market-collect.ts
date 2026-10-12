import {
  marketCategoryUrl,
  marketPageUrl,
  parseMarketPage,
  type MarketBreadcrumbItem,
  type MarketCompanyRow,
  type MarketPage,
} from './scrapers/screener-market'

/**
 * Walk every page of a screener.in industry listing and return the complete,
 * deduplicated company set plus an honest import report.
 *
 * Fetching is injected so the orchestration (pagination, partial-failure and
 * retry handling) can be tested without the network. The caller supplies the
 * real fetch (authenticated, rate-limited) in production.
 */

export type FetchHtml = (url: string) => Promise<string | null>

export type PagesFailed = { page: number; error: string }

export type MarketImportStatus = 'complete' | 'partial' | 'failed' | 'limit-reached'

export type MarketImportReport = {
  sourceUrl: string
  segments: string[]
  title: string | null
  breadcrumb: MarketBreadcrumbItem[]
  /** Total companies the source reports for the category, when stated. */
  totalResults: number | null
  /** Total pages the source reports (status line, else pagination links). */
  pagesDiscovered: number | null
  /** Pages this import intended to fetch (bounded by maxPages). */
  pagesPlanned: number
  pagesFetched: number
  pagesFailed: PagesFailed[]
  rowsParsed: number
  uniqueCompanies: number
  duplicatesSkipped: number
  limitReached: boolean
  status: MarketImportStatus
  warnings: string[]
  startedAt: string
  finishedAt: string
}

export type MarketCollectResult = {
  report: MarketImportReport
  rows: MarketCompanyRow[]
  page: MarketPage | null
}

export type CollectOptions = {
  /** Safety guard so a runaway pagination never fetches unlimited pages. */
  maxPages?: number
  /** Polite delay between page requests, in milliseconds. */
  delayMs?: number
}

export const DEFAULT_MAX_PAGES = 20

/**
 * Fetch and parse every page of a category listing. A page that fails does not
 * abort the import; it is recorded and the status becomes `partial` so the
 * caller never reports an incomplete import as complete.
 */
export async function collectMarketCategory(
  segments: readonly string[],
  fetchHtml: FetchHtml,
  options: CollectOptions = {},
): Promise<MarketCollectResult> {
  const maxPages = Math.max(1, options.maxPages ?? 20)
  const startedAt = new Date()

  const report: MarketImportReport = {
    sourceUrl: marketCategoryUrl(segments),
    segments: [...segments],
    title: null,
    breadcrumb: [],
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

  const allRows: MarketCompanyRow[] = []
  let firstPage: MarketPage | null = null

  const firstHtml = await fetchHtml(marketPageUrl(segments, 1))
  if (firstHtml == null) {
    report.pagesFailed.push({ page: 1, error: 'Failed to fetch page 1.' })
    report.finishedAt = new Date().toISOString()
    return { report, rows: [], page: null }
  }

  firstPage = parseMarketPage(firstHtml, segments)
  report.title = firstPage.title
  report.breadcrumb = firstPage.breadcrumb
  report.totalResults = firstPage.totalResults
  report.warnings.push(...firstPage.warnings)
  report.pagesFetched = 1
  allRows.push(...firstPage.rows)

  const discovered = firstPage.totalPages ?? 1
  report.pagesDiscovered = discovered
  const planned = Math.min(discovered, Math.max(1, options.maxPages ?? 20))
  report.pagesPlanned = planned
  report.limitReached = discovered > planned

  for (let page = 2; page <= planned; page += 1) {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs))
    let html: string | null
    try {
      html = await fetchHtml(marketPageUrl(segments, page))
    } catch (error) {
      report.pagesFailed.push({ page, error: error instanceof Error ? error.message : 'Fetch threw.' })
      continue
    }
    if (html == null) {
      report.pagesFailed.push({ page, error: `Failed to fetch page ${page}.` })
      continue
    }
    const parsed = parseMarketPage(html, segments)
    report.warnings.push(...parsed.warnings)
    report.pagesFetched += 1
    allRows.push(...parsed.rows)
  }

  const bySymbol = new Map<string, MarketCompanyRow>()
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
