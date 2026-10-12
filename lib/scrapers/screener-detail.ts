import * as cheerio from 'cheerio'
import { parseNumber, symbolFromCompanyHref } from './screener'

type CheerioSelection = ReturnType<cheerio.CheerioAPI>

export type DetailRow = { label: string; values: string[] }
export type DetailTable = { columns: string[]; rows: DetailRow[] }

export type PeerRow = {
  companyId: string | null
  name: string
  symbol: string | null
  href: string | null
  cmp: number | null
  pe: number | null
  marketCap: number | null
  dividendYield: number | null
  netProfitQtr: number | null
  profitGrowth: number | null
  salesQtr: number | null
  salesGrowth: number | null
  roce: number | null
  isSelf: boolean
}

export type ScreenerTopRatios = {
  marketCap?: number
  currentPrice?: number
  high?: number
  low?: number
  peRatio?: number
  bookValue?: number
  dividendYield?: number
  roce?: number
  roe?: number
  faceValue?: number
}

export type ScreenerDetail = {
  sourceUrl: string
  companyId: string | null
  warehouseId: string | null
  topRatios: ScreenerTopRatios
  profitLoss: DetailTable | null
  quarters: DetailTable | null
  balanceSheet: DetailTable | null
  cashFlow: DetailTable | null
  ratios: DetailTable | null
  shareholding: { quarterly: DetailTable | null; yearly: DetailTable | null }
  /** null = never fetched, [] = fetched but empty/unavailable. */
  peers: PeerRow[] | null
  peersError: string | null
}

function cleanLabel(raw: string): string {
  return raw
    .replace(/\s*\+\s*$/, '')
    .replace(/\s+in Rs\s*$/i, ' (₹)')
    .replace(/\s+/g, ' ')
    .trim()
}

function textOf(element: CheerioSelection): string {
  return element.text().replace(/\s+/g, ' ').trim()
}

function parseDetailTable($: cheerio.CheerioAPI, table: CheerioSelection): DetailTable | null {
  const headerCells = table
    .find('thead th')
    .map((_, th) => textOf($(th)))
    .get()
  const columns = headerCells.length > 1 ? headerCells.slice(1) : headerCells

  const rows: DetailRow[] = []
  table.find('tbody tr').each((_, tr) => {
    const cells = $(tr).find('td, th')
    if (cells.length < 2) return
    const label = cleanLabel(textOf(cells.first()))
    if (!label) return
    const values = cells
      .slice(1)
      .map((_, cell) => textOf($(cell)))
      .get()
    rows.push({ label, values })
  })

  if (!rows.length) return null
  return { columns, rows }
}

function firstTable($: cheerio.CheerioAPI, selector: string): DetailTable | null {
  const table = $(selector).find('table').first()
  return table.length ? parseDetailTable($, table) : null
}

function parseTopRatios($: cheerio.CheerioAPI): ScreenerTopRatios {
  const ratios: ScreenerTopRatios = {}
  $('#top-ratios li').each((_, li) => {
    const label = textOf($(li).find('.name').first())
    const value = textOf($(li).find('.value').first())
    switch (label.toLowerCase()) {
      case 'market cap':
        ratios.marketCap = parseNumber(value) ?? undefined
        break
      case 'current price':
        ratios.currentPrice = parseNumber(value) ?? undefined
        break
      case 'high / low': {
        const numbers = value.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? []
        ratios.high = parseNumber(numbers[0]) ?? undefined
        ratios.low = parseNumber(numbers[1]) ?? undefined
        break
      }
      case 'stock p/e':
        ratios.peRatio = parseNumber(value) ?? undefined
        break
      case 'book value':
        ratios.bookValue = parseNumber(value) ?? undefined
        break
      case 'dividend yield':
        ratios.dividendYield = parseNumber(value) ?? undefined
        break
      case 'roce':
        ratios.roce = parseNumber(value) ?? undefined
        break
      case 'roe':
        ratios.roe = parseNumber(value) ?? undefined
        break
      case 'face value':
        ratios.faceValue = parseNumber(value) ?? undefined
        break
      default:
        break
    }
  })
  return ratios
}

function parseShareholding($: cheerio.CheerioAPI): { quarterly: DetailTable | null; yearly: DetailTable | null } {
  const tables = $('#shareholding table')
  const quarterly = tables.eq(0).length ? parseDetailTable($, tables.eq(0)) : null
  const yearly = tables.eq(1).length ? parseDetailTable($, tables.eq(1)) : null
  return { quarterly, yearly }
}

/** Read the right-most numeric value in a detail row (skips blanks / TTM). */
export function latestRowNumber(row: DetailRow | undefined, columns: string[]): number | null {
  if (!row) return null
  for (let index = row.values.length - 1; index >= 0; index -= 1) {
    const header = columns[index]
    if (header && /ttm/i.test(header)) continue
    const value = parseNumber(row.values[index])
    if (value != null) return value
  }
  return null
}

export function findRow(table: DetailTable | null, label: string): DetailRow | undefined {
  if (!table) return undefined
  const target = label.toLowerCase()
  return table.rows.find((row) => row.label.toLowerCase().startsWith(target))
}

export function parseScreenerDetail(html: string, sourceUrl: string): ScreenerDetail {
  const $ = cheerio.load(html)
  const info = parseCompanyInfo($)
  return {
    sourceUrl,
    companyId: info.companyId,
    warehouseId: info.warehouseId,
    topRatios: parseTopRatios($),
    profitLoss: firstTable($, '#profit-loss'),
    quarters: firstTable($, '#quarters'),
    balanceSheet: firstTable($, '#balance-sheet'),
    cashFlow: firstTable($, '#cash-flow'),
    ratios: firstTable($, '#ratios'),
    shareholding: parseShareholding($),
    peers: null,
    peersError: null,
  }
}

function parseCompanyInfo($: cheerio.CheerioAPI): { companyId: string | null; warehouseId: string | null } {
  const el = $('#company-info').first()
  return {
    companyId: el.attr('data-company-id') ?? null,
    warehouseId: el.attr('data-warehouse-id') ?? null,
  }
}

/** Screener's own peer-table labels (data-tooltip) mapped to our numeric fields. */
type NumericPeerKey = 'cmp' | 'pe' | 'marketCap' | 'dividendYield' | 'netProfitQtr' | 'profitGrowth' | 'salesQtr' | 'salesGrowth' | 'roce'

const PEER_TOOLTIP_FIELDS: Record<string, NumericPeerKey> = {
  'current price': 'cmp',
  'price to earning': 'pe',
  'market capitalization': 'marketCap',
  'dividend yield': 'dividendYield',
  'net profit latest quarter': 'netProfitQtr',
  'yoy quarterly profit growth': 'profitGrowth',
  'sales latest quarter': 'salesQtr',
  'yoy quarterly sales growth': 'salesGrowth',
  'return on capital employed': 'roce',
}

/**
 * Parse the HTML returned by `/api/company/{warehouseId}/peers/`. The table's
 * first data row is the company whose page we requested (marked `isSelf`).
 */
export function parsePeers(html: string, selfCompanyId?: string | null): PeerRow[] {
  const $ = cheerio.load(html)
  const table = $('table').first()
  if (!table.length) return []

  const headerRow = table.find('tr').first().find('th')
  const columns: (NumericPeerKey | 'name' | 'skip')[] = headerRow
    .map((_, th) => {
      const tooltip = ($(th).attr('data-tooltip') ?? '').toLowerCase().trim()
      if (tooltip && PEER_TOOLTIP_FIELDS[tooltip]) return PEER_TOOLTIP_FIELDS[tooltip]
      if (textOf($(th)).toLowerCase().includes('company')) return 'name'
      return 'skip'
    })
    .get()

  const peers: PeerRow[] = []
  table.find('tr[data-row-company-id]').each((_, tr) => {
    const cells = $(tr).find('td')
    if (!cells.length) return
    const companyId = $(tr).attr('data-row-company-id') ?? null
    const row: PeerRow = {
      companyId,
      name: '',
      symbol: null,
      href: null,
      cmp: null,
      pe: null,
      marketCap: null,
      dividendYield: null,
      netProfitQtr: null,
      profitGrowth: null,
      salesQtr: null,
      salesGrowth: null,
      roce: null,
      isSelf: Boolean(selfCompanyId && companyId && companyId === selfCompanyId),
    }

    cells.each((index, cell) => {
      const column = columns[index]
      if (!column || column === 'skip') return
      if (column === 'name') {
        const anchor = $(cell).find('a').first()
        row.name = textOf($(cell))
        const href = anchor.attr('href') ?? null
        row.href = href
        row.symbol = symbolFromCompanyHref(href)
        return
      }
      row[column] = parseNumber(textOf($(cell)))
    })

    if (row.name) peers.push(row)
  })

  // Fall back to "first row is self" when the page did not expose a company id.
  if (!selfCompanyId && peers.length) peers[0].isSelf = true
  return peers
}
