import { describe, expect, it } from 'vitest'
import { collectScreenerResults } from './results-collect'

type Trends = { sales: string; ebidt: string; netProfit: string; eps: string }
const ALL_UP: Trends = { sales: 'up', ebidt: 'up', netProfit: 'up', eps: 'up' }

function cell(trend: string): string {
  if (trend === 'up') return '<span class="change up">\u21e1 10%</span>'
  if (trend === 'down') return '<span class="change down">\u21e3 10%</span>'
  return ''
}

function card(symbol: string, name: string, trends: Trends): string {
  const row = (attr: string, label: string, trend: string) =>
    `<tr data-${attr}><td class="text">${label}</td><td>${cell(trend)}</td><td>10</td><td>9</td><td>8</td></tr>`
  return (
    `<div class="mark-visited"><div class="flex-row flex-space-between"><a href="/company/${symbol}/#quarters"><span class="hover-link ink-900">${name}</span></a></div>` +
    `<div class="bg-base border-radius-8 padding-small responsive-holder"><table class="data-table margin-0"><tbody>` +
    row('sales', 'Sales', trends.sales) +
    row('ebidt', 'EBIDT', trends.ebidt) +
    row('net-profit', 'Net profit', trends.netProfit) +
    row('eps', 'EPS', trends.eps) +
    `</tbody></table></div></div>`
  )
}

function page(cards: string[], totalResults?: number, pages?: number): string {
  const count = totalResults != null ? `<p>${totalResults} results</p>` : ''
  const pagination =
    pages != null
      ? `<p class="paginator">${Array.from({ length: pages }, (_, i) => `<a href="?p=${i + 1}">${i + 1}</a>`).join('')}<a href="?all=">Show all</a></p>`
      : ''
  return `<!doctype html><html><body>${count}${pagination}${cards.join('')}</body></html>`
}

const SOURCE = 'https://www.screener.in/results/latest/'

function fetchFrom(pages: Record<number, string | null>): (url: string) => Promise<string | null> {
  return async (url: string) => {
    const match = url.match(/[?&]p=(\d+)/)
    const page = match ? Number(match[1]) : 1
    return pages[page] ?? null
  }
}

describe('collectScreenerResults', () => {
  it('walks the pages, keeps only all-green companies and deduplicates them', async () => {
    const p1 = page([card('AAA', 'Aaa Ltd', ALL_UP), card('BBB', 'Bbb Ltd', { ...ALL_UP, eps: 'down' })], 30, 2)
    const p2 = page([card('CCC', 'Ccc Ltd', ALL_UP), card('AAA', 'Aaa Ltd', ALL_UP)], 30, 2)
    const { symbols, report } = await collectScreenerResults(SOURCE, fetchFrom({ 1: p1, 2: p2 }))

    expect(report.status).toBe('complete')
    expect(report.pagesFetched).toBe(2)
    expect(report.pagesDiscovered).toBe(2)
    expect(report.rowsParsed).toBe(4)
    expect(report.qualified).toBe(3)
    expect(report.uniqueCompanies).toBe(2)
    expect(report.duplicatesSkipped).toBe(1)
    expect(symbols.map((row) => row.symbol).sort()).toEqual(['AAA', 'CCC'])
  })

  it('reports a partial import when a later page fails', async () => {
    const p1 = page([card('AAA', 'Aaa Ltd', ALL_UP)], 60, 3)
    const { report } = await collectScreenerResults(SOURCE, fetchFrom({ 1: p1, 2: null, 3: null }))

    expect(report.status).toBe('partial')
    expect(report.pagesFetched).toBe(1)
    expect(report.pagesFailed.map((failure) => failure.page)).toEqual([2, 3])
  })

  it('stops at maxPages and flags the limit', async () => {
    const p1 = page([card('AAA', 'Aaa Ltd', ALL_UP)], 60, 3)
    let calls = 0
    const fetch = async () => {
      calls += 1
      return p1
    }
    const { report } = await collectScreenerResults(SOURCE, fetch, { maxPages: 1 })

    expect(report.status).toBe('limit-reached')
    expect(report.limitReached).toBe(true)
    expect(report.pagesPlanned).toBe(1)
    expect(report.pagesFetched).toBe(1)
    expect(calls).toBe(1)
  })

  it('fails cleanly when page 1 cannot be fetched', async () => {
    const { report, symbols } = await collectScreenerResults(SOURCE, fetchFrom({ 1: null }))
    expect(report.status).toBe('failed')
    expect(report.pagesFetched).toBe(0)
    expect(symbols).toHaveLength(0)
  })
})
