import { describe, expect, it } from 'vitest'
import { collectScreenerIpo } from './ipo-collect'
import { pageUrl } from './scrapers/paging'

type Row = { symbol: string; name: string }

function ipoPage(options: { rows: Row[]; totalPages?: number; totalResults?: number }): string {
  const body = options.rows
    .map(
      (row) =>
        `<tr><td class="text"><a href="/company/${row.symbol}/"><span>${row.name}</span></a></td><td>09 Oct 2026</td><td>100</td><td>50</td><td>75</td><td><span class="change up">50%</span></td></tr>`,
    )
    .join('')
  const status = options.totalResults != null ? `<p class="smaller ink-700">Showing ${options.totalResults} companies.</p>` : ''
  const pagination =
    options.totalPages != null
      ? `<nav>${Array.from({ length: options.totalPages }, (_, i) => `<a href="?page=${i + 1}">${i + 1}</a>`).join('')}</nav>`
      : ''
  return `<!doctype html><html><body>${status}${pagination}<table class="data-table"><thead><tr><th>Name</th><th>Listing Date</th><th>IPO MCap</th><th>IPO Price</th><th>Current Price</th><th>% Change</th></tr></thead><tbody>${body}</tbody></table></body></html>`
}

const SOURCE = 'https://www.screener.in/ipo/recent/?sort=percent_gain_loss&order=desc'

function fetchFrom(pages: Record<number, string | null>): (url: string) => Promise<string | null> {
  return async (url: string) => {
    const match = url.match(/[?&]page=(\d+)/)
    const page = match ? Number(match[1]) : 1
    return pages[page] ?? null
  }
}

describe('pageUrl for IPO listings', () => {
  it('adds the page parameter while preserving the sort query', () => {
    expect(pageUrl(SOURCE, 2)).toBe(`${SOURCE}&page=2`)
  })
})

describe('collectScreenerIpo', () => {
  it('walks the discovered pages and deduplicates companies', async () => {
    const p1 = ipoPage({ totalPages: 2, totalResults: 3, rows: [{ symbol: 'AAA', name: 'Aaa Ltd' }, { symbol: 'BBB', name: 'Bbb Ltd' }] })
    const p2 = ipoPage({ totalPages: 2, totalResults: 3, rows: [{ symbol: 'BBB', name: 'Bbb Ltd' }, { symbol: 'CCC', name: 'Ccc Ltd' }] })
    const { report, rows } = await collectScreenerIpo(SOURCE, fetchFrom({ 1: p1, 2: p2 }))

    expect(report.status).toBe('complete')
    expect(report.pagesFetched).toBe(2)
    expect(report.pagesDiscovered).toBe(2)
    expect(report.rowsParsed).toBe(4)
    expect(report.uniqueCompanies).toBe(3)
    expect(report.duplicatesSkipped).toBe(1)
    expect(rows.map((row) => row.symbol).sort()).toEqual(['AAA', 'BBB', 'CCC'])
  })

  it('reports a partial import when a later page fails', async () => {
    const p1 = ipoPage({ totalPages: 3, totalResults: 5, rows: [{ symbol: 'AAA', name: 'Aaa Ltd' }] })
    const { report } = await collectScreenerIpo(SOURCE, fetchFrom({ 1: p1, 2: null, 3: null }))

    expect(report.status).toBe('partial')
    expect(report.pagesFetched).toBe(1)
    expect(report.pagesFailed.map((failure) => failure.page)).toEqual([2, 3])
  })

  it('stops at maxPages and flags the limit', async () => {
    const p1 = ipoPage({ totalPages: 43, totalResults: 1069, rows: [{ symbol: 'AAA', name: 'Aaa Ltd' }] })
    let calls = 0
    const fetch = async (url: string) => {
      calls += 1
      return p1.replace('/company/AAA/', `/company/AAA${calls}/`).replace('Aaa Ltd', `Aaa ${calls}`)
    }
    const { report } = await collectScreenerIpo(SOURCE, fetch, { maxPages: 3 })

    expect(report.status).toBe('limit-reached')
    expect(report.limitReached).toBe(true)
    expect(report.pagesPlanned).toBe(3)
    expect(report.pagesFetched).toBe(3)
    expect(calls).toBe(3)
  })

  it('fails cleanly when page 1 cannot be fetched', async () => {
    const { report, rows } = await collectScreenerIpo(SOURCE, fetchFrom({ 1: null }))
    expect(report.status).toBe('failed')
    expect(report.pagesFetched).toBe(0)
    expect(rows).toHaveLength(0)
  })
})
