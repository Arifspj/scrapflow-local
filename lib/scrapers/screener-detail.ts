import * as cheerio from 'cheerio'
import { parseNumber } from './screener'

type CheerioSelection = ReturnType<cheerio.CheerioAPI>

export type DetailRow = { label: string; values: string[] }
export type DetailTable = { columns: string[]; rows: DetailRow[] }

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
  topRatios: ScreenerTopRatios
  profitLoss: DetailTable | null
  quarters: DetailTable | null
  balanceSheet: DetailTable | null
  cashFlow: DetailTable | null
  ratios: DetailTable | null
  shareholding: { quarterly: DetailTable | null; yearly: DetailTable | null }
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
  return {
    sourceUrl,
    topRatios: parseTopRatios($),
    profitLoss: firstTable($, '#profit-loss'),
    quarters: firstTable($, '#quarters'),
    balanceSheet: firstTable($, '#balance-sheet'),
    cashFlow: firstTable($, '#cash-flow'),
    ratios: firstTable($, '#ratios'),
    shareholding: parseShareholding($),
  }
}
