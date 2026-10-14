import { describe, expect, it } from 'vitest'
import {
  discoverResultsPages,
  parseResultsCount,
  parseScreenerResultsPage,
  parseScreenerResultsSource,
  resultsPageUrl,
  symbolFromResultsHref,
} from './screener-results'

type Trends = { sales: string; ebidt: string; netProfit: string; eps: string }

const ALL_UP: Trends = { sales: 'up', ebidt: 'up', netProfit: 'up', eps: 'up' }

function trendCell(trend: string): string {
  if (trend === 'up') return '<span class="change up">\u21e1 10%</span>'
  if (trend === 'down') return '<span class="change down">\u21e3 10%</span>'
  return ''
}

function card(symbol: string, name: string, trends: Trends, opts: { standalone?: boolean } = {}): string {
  const path = opts.standalone ? `/company/${symbol}/consolidated/#quarters` : `/company/${symbol}/#quarters`
  const row = (attr: string, label: string, trend: string) =>
    `<tr data-${attr}><td class="text">${label}</td><td>${trendCell(trend)}</td><td data-${attr}-latest-quarter>10</td><td>9</td><td>8</td></tr>`
  return (
    `<div class="mark-visited">` +
    `<div class="flex-row flex-space-between flex-align-center"><a href="${path}" class="font-weight-500"><span class="hover-link ink-900">${name}</span></a></div>` +
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

describe('symbolFromResultsHref', () => {
  it('extracts the ticker from the plain and consolidated forms', () => {
    expect(symbolFromResultsHref('/company/MRPL/consolidated/#quarters')).toBe('MRPL')
    expect(symbolFromResultsHref('/company/VIJIFIN/#quarters')).toBe('VIJIFIN')
  })

  it('keeps numeric warehouse codes but drops the ticker-less /company/id/ form', () => {
    expect(symbolFromResultsHref('/company/517230/#quarters')).toBe('517230')
    expect(symbolFromResultsHref('/company/id/1274317/consolidated/#quarters')).toBeNull()
  })
})

describe('parseScreenerResultsSource', () => {
  it('keeps only companies whose four metrics are all green', () => {
    const html = page(
      [
        card('AAA', 'Aaa Ltd', ALL_UP),
        card('BBB', 'Bbb Ltd', { ...ALL_UP, ebidt: 'down' }),
        card('CCC', 'Ccc Ltd', ALL_UP),
      ],
      3,
    )
    const result = parseScreenerResultsSource(html)
    expect(result.kind).toBe('screener-results')
    expect(result.symbols.map((row) => row.symbol)).toEqual(['AAA', 'CCC'])
    expect(result.symbols[0].companyName).toBe('Aaa Ltd')
  })

  it('excludes a company when a metric cell is blank (no comparison)', () => {
    const html = page([card('AAA', 'Aaa Ltd', { ...ALL_UP, sales: 'flat' })], 1)
    const result = parseScreenerResultsSource(html)
    expect(result.symbols).toHaveLength(0)
    expect(result.warnings.join(' ')).toMatch(/all-green/i)
  })

  it('skips the ticker-less /company/id/ row with a warning', () => {
    const html = page([card('id', 'ICICI Securities', ALL_UP)], 1)
    const result = parseScreenerResultsPage(html)
    expect(result.rows).toHaveLength(0)
    expect(result.warnings.join(' ')).toMatch(/resolvable company symbol/i)
  })

  it('reports the total and derives the page count from "N results"', () => {
    const html = page([card('AAA', 'Aaa Ltd', ALL_UP)], 89, 4)
    const result = parseScreenerResultsPage(html)
    expect(result.totalResults).toBe(89)
    expect(result.totalPages).toBe(4)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].trends).toEqual({ sales: 'up', ebidt: 'up', netProfit: 'up', eps: 'up' })
  })
})

describe('pagination helpers', () => {
  it('discovers ?p= pages and decodes entity-escaped links', () => {
    expect(discoverResultsPages('<a href="?p=2">2</a><a href="?sort=x&amp;p=5">5</a>')).toEqual([1, 2, 5])
  })

  it('reads the "N results" count', () => {
    expect(parseResultsCount('<p>89 results</p>')).toBe(89)
    expect(parseResultsCount('<p>1,204 results</p>')).toBe(1204)
    expect(parseResultsCount('<p>nothing</p>')).toBeNull()
  })

  it('builds a ?p= page URL from the base', () => {
    expect(resultsPageUrl('https://www.screener.in/results/latest/', 2)).toBe('https://www.screener.in/results/latest/?p=2')
  })
})
