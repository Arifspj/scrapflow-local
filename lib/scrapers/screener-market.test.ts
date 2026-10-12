import { describe, expect, it } from 'vitest'
import { discoverPageNumbers, marketPageUrl, parseMarketPage, parsePageInfo } from './screener-market'
import { collectMarketCategory } from '../market-collect'

type Row = {
  symbol: string
  name: string
  href?: string
  id?: string
  cmp?: string
  pe?: string
  marcap?: string
  divyld?: string
  np?: string
  npvar?: string
  sales?: string
  salesvar?: string
  roce?: string
  serial?: string
}

function page(options: {
  title: string
  page: number
  totalPages: number
  totalResults: number
  rows: Row[]
  omitStatus?: boolean
  addBadRow?: boolean
}): string {
  const { title, page: current, totalPages, totalResults, rows } = options
  const body = rows
    .map(
      (row, index) => `
    <tr data-row-company-id="${row.id ?? 1000 + index}">
      <td class="text">${row.serial ?? `${index + 1}.`}</td>
      <td class="text"><a href="${row.href ?? `/company/${row.symbol}/`}" target="_blank">${row.name}</a></td>
      <td>${row.cmp ?? '100.00'}</td>
      <td>${row.pe ?? '20.00'}</td>
      <td>${row.marcap ?? '5000.00'}</td>
      <td>${row.divyld ?? '0.50'}</td>
      <td>${row.np ?? '10.00'}</td>
      <td>${row.npvar ?? '5.00'}</td>
      <td>${row.sales ?? '100.00'}</td>
      <td>${row.salesvar ?? '8.00'}</td>
      <td>${row.roce ?? '22.00'}</td>
    </tr>`,
    )
    .join('')
  const bad = options.addBadRow
    ? `<tr><td class="text">99.</td><td class="text">no link here</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td><td>8</td><td>9</td></tr>`
    : ''
  const status = options.omitStatus ? '' : `<div data-page-info>${totalResults} results found: Showing page ${current} of ${totalPages}</div>`
  const pagination = `<nav>${Array.from({ length: totalPages }, (_, i) => `<a href="?page=${i + 1}">${i + 1}</a>`).join('')}</nav>`

  return `<!doctype html><html><head><title>${title}</title></head><body>
  <div class="breadcrumb"><ul>
    <li><i class="icon-table"></i><a href="/market/">Industries</a></li>
    <li><i class="icon-globe"></i><a href="/market/IN05/">Financial Services</a></li>
    <li><i class="icon-chart-pie"></i><a href="/market/IN05/IN0501/">Financial Services</a></li>
    <li><i class="icon-industry"></i>Capital Markets</li>
  </ul></div>
  <div class="dropdown-content">
    <a href="/market/IN05/IN0501/IN050103/IN050103006/">Stockbroking &amp; Allied - 49</a>
    <a href="/market/IN05/IN0501/IN050103/IN050103001/">Asset Management Company - 10</a>
  </div>
  <h1>${title}</h1>
  ${status}
  ${pagination}
  <table class="data-table text-nowrap">
    <tbody>
      <tr>
        <th class="text" scope="colgroup">S.No.</th>
        <th>Company</th><th>CMP Rs.</th><th>P/E</th><th>Mar Cap Rs.Cr.</th><th>Div Yld %</th>
        <th>NP Qtr Rs.Cr.</th><th>Qtr Profit Var %</th><th>Sales Qtr Rs.Cr.</th><th>Qtr Sales Var %</th><th>ROCE %</th>
      </tr>
      ${body}
      ${bad}
    </tbody>
  </table>
  </body></html>`
}

describe('parsePageInfo', () => {
  it('reads total results and page position', () => {
    expect(parsePageInfo('74 results found: Showing page 1 of 3')).toEqual({ totalResults: 74, page: 1, totalPages: 3 })
  })
  it('returns nulls when the status line is absent', () => {
    expect(parsePageInfo('no status here')).toEqual({ totalResults: null, page: null, totalPages: null })
  })
})

describe('discoverPageNumbers / marketPageUrl', () => {
  it('collects page numbers from links', () => {
    expect(discoverPageNumbers('<a href="?page=2">2</a><a href="?page=3">3</a>')).toEqual([1, 2, 3])
  })
  it('builds a paginated source url', () => {
    expect(marketPageUrl(['IN05', 'IN0501'], 2)).toBe('https://www.screener.in/market/IN05/IN0501/?page=2')
    expect(marketPageUrl(['IN05'], 1, 50)).toBe('https://www.screener.in/market/IN05/?limit=50&page=1')
  })
})

describe('parseMarketPage', () => {
  const html = page({
    title: 'Capital Markets Companies',
    page: 1,
    totalPages: 3,
    totalResults: 74,
    rows: [
      { symbol: 'ICICIAMC', name: 'ICICI AMC', roce: '115.10' },
      { symbol: 'BSE', name: 'BSE', href: '/company/BSE/consolidated/', roce: '59.99' },
    ],
    addBadRow: true,
  })

  it('parses title, pagination and company rows', () => {
    const parsed = parseMarketPage(page({ title: 'Capital Markets Companies', page: 1, totalPages: 3, totalResults: 74, rows: [{ symbol: 'ICICIAMC', name: 'ICICI AMC' }] }), ['IN05', 'IN0501', 'IN050103'])
    expect(parsed.title).toBe('Capital Markets Companies')
    expect(parsed.page).toBe(1)
    expect(parsed.totalPages).toBe(3)
    expect(parsed.totalResults).toBe(74)
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]).toMatchObject({ symbol: 'ICICIAMC', companyName: 'ICICI AMC' })
    expect(parsed.rows[0].metrics.roce).toBe(22)
  })

  it('maps the column headers to metrics positionally', () => {
    const parsed = parseMarketPage(
      page({ title: 'T', page: 1, totalPages: 1, totalResults: 1, rows: [{ symbol: 'BSE', href: '/company/BSE/consolidated/', name: 'BSE', cmp: '3330.20', pe: '47.97', marcap: '135833.55', divyld: '0.30', roce: '59.99' }] }),
      ['IN05'],
    )
    expect(parsed.rows[0].metrics).toMatchObject({ cmp: 3330.2, pe: 47.97, marketCap: 135833.55, dividendYield: 0.3, roce: 59.99 })
  })

  it('parses the breadcrumb hierarchy in source order', () => {
    const parsed = parseMarketPage(html, ['IN05', 'IN0501', 'IN050103'])
    expect(parsed.breadcrumb.map((item) => item.level)).toEqual(['root', 'broadSector', 'sector', 'broadIndustry'])
    expect(parsed.breadcrumb[3].current).toBe(true)
  })

  it('parses sub-category links with counts', () => {
    const parsed = parseMarketPage(html, ['IN05', 'IN0501', 'IN050103'])
    expect(parsed.subCategories.map((item) => item.name)).toContain('Stockbroking & Allied')
    expect(parsed.subCategories[0].count).toBe(49)
  })

  it('falls back to the visible label when a row links by numeric id', () => {
    const parsed = parseMarketPage(
      page({ title: 'T', page: 1, totalPages: 1, totalResults: 1, rows: [{ symbol: 'NSE', href: '/company/544937/consolidated/', name: 'NSE' }] }),
      ['IN05'],
    )
    expect(parsed.rows[0].symbol).toBe('NSE')
  })

  it('skips malformed rows and warns', () => {
    const parsed = parseMarketPage(html, ['IN05', 'IN0501', 'IN050103'])
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.warnings.some((warning) => /Skipped/i.test(warning))).toBe(true)
  })

  it('infers pagination from links when the status line is absent', () => {
    const parsed = parseMarketPage(page({ title: 'T', page: 1, totalPages: 3, totalResults: 60, rows: [], omitStatus: true }), ['IN05'])
    expect(parsed.totalPages).toBe(3)
  })
})

describe('discoverPageNumbers', () => {
  it('finds every page reference in a paginated page', () => {
    expect(discoverPageNumbers(page({ title: 'T', page: 1, totalPages: 3, totalResults: 74, rows: [] }))).toEqual([1, 2, 3])
  })
})

const SEGMENTS = ['IN05', 'IN0501', 'IN050103']

function fetchFrom(pages: Record<number, string | null>): (url: string) => Promise<string | null> {
  return async (url: string) => {
    const match = url.match(/[?&]page=(\d+)/)
    const page = match ? Number(match[1]) : 1
    return pages[page] ?? null
  }
}

describe('collectMarketCategory', () => {
  const p1 = page({ title: 'Capital Markets Companies', page: 1, totalPages: 3, totalResults: 74, rows: [{ symbol: 'ICICIAMC', name: 'ICICI AMC' }, { symbol: 'BSE', name: 'BSE' }] })
  const p2 = page({ title: 'Capital Markets Companies', page: 2, totalPages: 3, totalResults: 74, rows: [{ symbol: 'MCX', name: 'MCX' }, { symbol: 'BSE', name: 'BSE' }] })
  const p3 = page({ title: 'Capital Markets Companies', page: 3, totalPages: 3, totalResults: 74, rows: [{ symbol: 'HDFCAMC', name: 'HDFC AMC' }] })

  it('fetches every page, deduplicates and reports complete', async () => {
    const { report, rows } = await collectMarketCategory(SEGMENTS, fetchFrom({ 1: p1, 2: p2, 3: p3 }), { maxPages: 50 })
    expect(report.status).toBe('complete')
    expect(report.pagesDiscovered).toBe(3)
    expect(report.pagesFetched).toBe(3)
    expect(report.pagesFailed).toHaveLength(0)
    expect(report.rowsParsed).toBe(5)
    expect(report.uniqueCompanies).toBe(4)
    expect(report.duplicatesSkipped).toBe(1)
    expect(rows.map((row) => row.symbol).sort()).toEqual(['BSE', 'HDFCAMC', 'ICICIAMC', 'MCX'])
  })

  it('is partial (never complete) when a page fails, and keeps the pages that succeeded', async () => {
    const { report, rows } = await collectMarketCategory(SEGMENTS, fetchFrom({ 1: p1, 3: p3 }), { maxPages: 50 })
    expect(report.status).toBe('partial')
    expect(report.pagesFailed.map((item) => item.page)).toEqual([2])
    expect(report.pagesFetched).toBe(2)
    expect(rows.map((row) => row.symbol).sort()).toEqual(['BSE', 'HDFCAMC', 'ICICIAMC'])
  })

  it('fills the missing page on retry', async () => {
    const partial = await collectMarketCategory(SEGMENTS, fetchFrom({ 1: p1, 3: p3 }), { maxPages: 50 })
    expect(partial.report.status).toBe('partial')
    const retry = await collectMarketCategory(SEGMENTS, fetchFrom({ 1: p1, 2: p2, 3: p3 }), { maxPages: 50 })
    expect(retry.report.status).toBe('complete')
    expect(retry.report.uniqueCompanies).toBe(4)
  })

  it('reports failed when page 1 cannot be fetched', async () => {
    const { report, rows } = await collectMarketCategory(SEGMENTS, async () => null)
    expect(report.status).toBe('failed')
    expect(report.pagesFetched).toBe(0)
    expect(rows).toHaveLength(0)
  })

  it('stops at the page limit and reports limit-reached', async () => {
    const { report } = await collectMarketCategory(SEGMENTS, fetchFrom({ 1: p1, 2: p2, 3: p3, 4: p3, 5: p3 }), { maxPages: 2 })
    expect(report.status).toBe('limit-reached')
    expect(report.limitReached).toBe(true)
    expect(report.pagesFetched).toBe(2)
  })

  it('treats a thrown fetch as a failed page rather than crashing the import', async () => {
    const { report } = await collectMarketCategory(
      SEGMENTS,
      async (url) => {
        if (url.includes('page=2')) throw new Error('boom')
        return url.includes('page=3') ? p3 : p1
      },
      { maxPages: 50 },
    )
    expect(report.status).toBe('partial')
    expect(report.pagesFailed[0]).toMatchObject({ page: 2, error: 'boom' })
  })
})

describe('marketPageUrl', () => {
  it('always requests an explicit page', () => {
    expect(marketPageUrl(SEGMENTS, 1)).toBe('https://www.screener.in/market/IN05/IN0501/IN050103/?page=1')
  })
})

describe('parsePageInfo edge cases', () => {
  it('handles thousands separators', () => {
    expect(parsePageInfo('1,234 results found: Showing page 2 of 50').totalResults).toBe(1234)
  })
})
