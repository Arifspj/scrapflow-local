import { describe, expect, it } from 'vitest'
import { collectScreenerScreen } from './screen-collect'
import { pageUrl } from './scrapers/paging'

type Row = { symbol: string; name: string }

function screenPage(options: {
  page: number
  totalPages: number
  totalResults: number
  rows: Row[]
  omitStatus?: boolean
}): string {
  const { page: current, totalPages, totalResults, rows } = options
  const body = rows
    .map((row) => `<tr><td class="text"><a href="/company/${row.symbol}/">${row.name}</a></td><td>100.00</td></tr>`)
    .join('')
  const status = options.omitStatus ? '' : `<div data-page-info>${totalResults} results found: Showing page ${current} of ${totalPages}</div>`
  const pagination = `<nav>${Array.from({ length: totalPages }, (_, i) => `<a href="?page=${i + 1}">${i + 1}</a>`).join('')}</nav>`
  return `<!doctype html><html><body><h1>Screen</h1>${status}${pagination}<table class="data-table"><tbody>${body}</tbody></table></body></html>`
}

const SOURCE = 'https://www.screener.in/screens/234/bluest-of-the-blue-chips/'

function fetchFrom(pages: Record<number, string | null>): (url: string) => Promise<string | null> {
  return async (url: string) => {
    const match = url.match(/[?&]page=(\d+)/)
    const page = match ? Number(match[1]) : 1
    return pages[page] ?? null
  }
}

describe('pageUrl', () => {
  it('adds the page query parameter to a screen URL', () => {
    expect(pageUrl(SOURCE, 2)).toBe(`${SOURCE}?page=2`)
  })
})

describe('collectScreenerScreen', () => {
  const p1 = screenPage({ page: 1, totalPages: 3, totalResults: 59, rows: [{ symbol: 'AAA', name: 'Aaa Ltd' }, { symbol: 'BBB', name: 'Bbb Ltd' }] })
  const p2 = screenPage({ page: 2, totalPages: 3, totalResults: 59, rows: [{ symbol: 'CCC', name: 'Ccc Ltd' }, { symbol: 'AAA', name: 'Aaa Ltd' }] })
  const p3 = screenPage({ page: 3, totalPages: 3, totalResults: 59, rows: [{ symbol: 'DDD', name: 'Ddd Ltd' }] })

  it('walks every page, deduplicates and reports complete', async () => {
    const { symbols, report } = await collectScreenerScreen(SOURCE, fetchFrom({ 1: p1, 2: p2, 3: p3 }), { maxPages: 50 })
    expect(report.status).toBe('complete')
    expect(report.totalResults).toBe(59)
    expect(report.pagesDiscovered).toBe(3)
    expect(report.pagesFetched).toBe(3)
    expect(report.pagesFailed).toHaveLength(0)
    expect(report.rowsParsed).toBe(5)
    expect(report.uniqueSymbols).toBe(4)
    expect(report.duplicatesSkipped).toBe(1)
    expect(symbols.map((row) => row.symbol).sort()).toEqual(['AAA', 'BBB', 'CCC', 'DDD'])
  })

  it('is partial (never complete) when a page fails and keeps the rest', async () => {
    const { symbols, report } = await collectScreenerScreen(SOURCE, fetchFrom({ 1: p1, 3: p3 }), { maxPages: 50 })
    expect(report.status).toBe('partial')
    expect(report.pagesFailed.map((item) => item.page)).toEqual([2])
    expect(report.pagesFetched).toBe(2)
    expect(symbols.map((row) => row.symbol).sort()).toEqual(['AAA', 'BBB', 'DDD'])
  })

  it('fails when page 1 cannot be fetched', async () => {
    const { symbols, report } = await collectScreenerScreen(SOURCE, async () => null)
    expect(report.status).toBe('failed')
    expect(report.pagesFetched).toBe(0)
    expect(symbols).toHaveLength(0)
  })

  it('stops at the page limit and reports limit-reached', async () => {
    const { report } = await collectScreenerScreen(SOURCE, fetchFrom({ 1: p1, 2: p2, 3: p3 }), { maxPages: 2 })
    expect(report.status).toBe('limit-reached')
    expect(report.limitReached).toBe(true)
    expect(report.pagesFetched).toBe(2)
  })

  it('infers pagination from links when the status line is absent', async () => {
    const first = screenPage({ page: 1, totalPages: 3, totalResults: 59, rows: [{ symbol: 'AAA', name: 'Aaa Ltd' }], omitStatus: true })
    const { report } = await collectScreenerScreen(SOURCE, fetchFrom({ 1: first, 2: p2, 3: p3 }), { maxPages: 50 })
    expect(report.pagesDiscovered).toBe(3)
    expect(report.pagesFetched).toBe(3)
    expect(report.status).toBe('complete')
  })

  it('treats a single-page screen as complete', async () => {
    const one = screenPage({ page: 1, totalPages: 1, totalResults: 2, rows: [{ symbol: 'AAA', name: 'Aaa Ltd' }, { symbol: 'BBB', name: 'Bbb Ltd' }] })
    const { report } = await collectScreenerScreen(SOURCE, fetchFrom({ 1: one }), { maxPages: 50 })
    expect(report.status).toBe('complete')
    expect(report.pagesDiscovered).toBe(1)
    expect(report.pagesFetched).toBe(1)
  })

  it('treats a thrown fetch as a failed page rather than crashing the import', async () => {
    const { report } = await collectScreenerScreen(
      SOURCE,
      async (url) => {
        if (url.includes('page=2')) throw new Error('boom')
        return url.includes('page=3') ? p3 : p1
      },
      { maxPages: 50 },
    )
    expect(report.status).toBe('partial')
    expect(report.pagesFailed[0]).toMatchObject({ page: 2, error: 'boom' })
  })

  it('reports authRequired when the source returns the sign-in page', async () => {
    const auth = '<!doctype html><html><head><title>Register - Screener</title></head><body><form action="/register/">Already have an account?</form></body></html>'
    const { symbols, report } = await collectScreenerScreen(SOURCE, async () => auth)
    expect(report.authRequired).toBe(true)
    expect(report.status).toBe('failed')
    expect(symbols).toHaveLength(0)
  })
})
