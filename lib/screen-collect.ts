import { parseScreenerScreen } from './scrapers/screener'
import { discoverPageNumbers, parsePageInfo, pageUrl } from './scrapers/paging'
import type { ParsedSymbol } from './scrapers/types'

/**
 * Walk every page of a screener.in public screen (`/screens/<id>/.../`) and
 * return the complete, deduplicated company set plus an honest import report.
 *
 * Screener screens paginate at 25 rows/page with a "N results found: Showing
 * page X of Y" status line and `?page=N` links, exactly like the market
 * listings. Fetching is injected so pagination, partial-failure and retry
 * handling can be tested without the network; production passes the polite,
 * rate-limited fetch.
 */

export type FetchHtml = (url: string) => Promise<string | null>

export type ScreenPagesFailed = { page: number; error: string }

export type ScreenImportStatus = 'complete' | 'partial' | 'failed' | 'limit-reached'

export type ScreenImportReport = {
  sourceUrl: string
  /** Total rows the screen reports, when the status line states it. */
  totalResults: number | null
  /** Total pages the screen reports (status line, else pagination links). */
  pagesDiscovered: number | null
  /** Pages this import intended to fetch (bounded by maxPages). */
  pagesPlanned: number
  pagesFetched: number
  pagesFailed: ScreenPagesFailed[]
  rowsParsed: number
  uniqueSymbols: number
  duplicatesSkipped: number
  limitReached: boolean
  status: ScreenImportStatus
  warnings: string[]
  startedAt: string
  finishedAt: string
}

export type ScreenCollectResult = {
  symbols: ParsedSymbol[]
  report: ScreenImportReport
}

export type ScreenCollectOptions = { maxPages?: number; delayMs?: number }

/**
 * Fetch and parse every page of a screen. A page that fails is recorded and the
 * run is reported as `partial` (never `complete`) so an incomplete import is
 * never presented as whole. Only page 1 failing is fatal.
 */
export async function collectScreenerScreen(
  sourceUrl: string,
  fetchHtml: FetchHtml,
  options: ScreenCollectOptions = {},
): Promise<ScreenCollectResult> {
  const maxPages = Math.max(1, options.maxPages ?? 20)
  const startedAt = new Date()

  const report: ScreenImportReport = {
    sourceUrl,
    totalResults: null,
    pagesDiscovered: null,
    pagesPlanned: 1,
    pagesFetched: 0,
    pagesFailed: [],
    rowsParsed: 0,
    uniqueSymbols: 0,
    duplicatesSkipped: 0,
    limitReached: false,
    status: 'failed',
    warnings: [],
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
  }

  const allSymbols: ParsedSymbol[] = []

  const firstHtml = await fetchHtml(pageUrl(sourceUrl, 1))
  if (firstHtml == null) {
    report.pagesFailed.push({ page: 1, error: 'Failed to fetch page 1.' })
    report.finishedAt = new Date().toISOString()
    return { symbols: [], report }
  }

  const first = parseScreenerScreen(firstHtml)
  report.warnings.push(...first.warnings)
  report.pagesFetched = 1
  allSymbols.push(...first.symbols)

  const info = parsePageInfo(firstHtml)
  report.totalResults = info.totalResults
  const linkedPages = discoverPageNumbers(firstHtml)
  const discovered = info.totalPages ?? (linkedPages.length ? Math.max(...linkedPages) : 1)
  report.pagesDiscovered = discovered
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
    const parsed = parseScreenerScreen(html)
    report.warnings.push(...parsed.warnings)
    report.pagesFetched += 1
    allSymbols.push(...parsed.symbols)
  }

  const bySymbol = new Map<string, ParsedSymbol>()
  for (const row of allSymbols) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, row)
  }
  report.rowsParsed = allSymbols.length
  report.duplicatesSkipped = allSymbols.length - bySymbol.size
  report.uniqueSymbols = bySymbol.size

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
