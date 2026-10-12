import * as cheerio from 'cheerio'
import type { ParseResult, ParsedFundamental, ParsedSymbol } from './types'

export const SCREENER_PARSER_VERSION = 'screener@1.0.0'

const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9&.-]{0,19}$/

export function cleanSymbol(raw: string | undefined | null): string | null {
  if (!raw) return null
  const symbol = raw.trim().toUpperCase()
  return SYMBOL_PATTERN.test(symbol) ? symbol : null
}

export function symbolFromCompanyHref(href: string | undefined | null): string | null {
  if (!href) return null
  const match = href.match(/\/company\/([^/?#]+)/i)
  if (!match) return null
  try {
    return cleanSymbol(decodeURIComponent(match[1]))
  } catch {
    return cleanSymbol(match[1])
  }
}

export function parseNumber(raw: string | undefined | null): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/,/g, '').replace(/[^0-9.\-]/g, '')
  const match = cleaned.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const value = Number(match[0])
  return Number.isFinite(value) ? value : null
}

const RATIO_FIELD_BY_LABEL: Record<string, keyof ParsedFundamental> = {
  'market cap': 'marketCap',
  'stock p/e': 'peRatio',
  'book value': 'bookValue',
  'dividend yield': 'dividendYield',
  roce: 'roce',
  roe: 'roe',
  'debt to equity': 'debtToEquity',
  sales: 'revenue',
  'net profit': 'netProfit',
}

function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function parseScreenerScreen(html: string): ParseResult {
  const $ = cheerio.load(html)
  const found = new Map<string, ParsedSymbol>()
  const warnings: string[] = []

  const anchors = $('table a[href*="/company/"]')
  const scoped = anchors.length ? anchors : $('a[href*="/company/"]')

  scoped.each((_, element) => {
    const symbol = symbolFromCompanyHref($(element).attr('href'))
    if (!symbol || found.has(symbol)) return
    const companyName = $(element).text().replace(/\s+/g, ' ').trim() || null
    found.set(symbol, { symbol, companyName })
  })

  if (!found.size) warnings.push('No company rows were found in the screen HTML.')

  return {
    kind: 'screener-screen',
    parserVersion: SCREENER_PARSER_VERSION,
    symbols: [...found.values()],
    fundamentals: null,
    warnings,
  }
}

export function parseScreenerCompany(html: string, sourceUrl: string): ParseResult {
  const $ = cheerio.load(html)
  const warnings: string[] = []

  const companyName = $('h1').first().text().replace(/\s+/g, ' ').trim() || null

  // Prefer the symbol from the canonical company URL: the first /company/ link on
  // the page is often an unrelated numeric id (e.g. /company/2726/), not the symbol.
  let symbol = symbolFromCompanyHref(sourceUrl)
  if (!symbol) symbol = symbolFromCompanyHref($('a[href*="/company/"]').first().attr('href'))

  const fundamentals: ParsedFundamental = {}

  $('#top-ratios li').each((_, element) => {
    const label = normalizeLabel($(element).find('.name').first().text())
    const field = RATIO_FIELD_BY_LABEL[label]
    if (!field || fundamentals[field] != null) return
    const valueText = $(element).find('.number').first().text() || $(element).find('.value').first().text()
    const value = parseNumber(valueText)
    if (value != null) fundamentals[field] = value
  })

  $('table.data-table').each((_, table) => {
    $(table)
      .find('tbody tr')
      .each((_, row) => {
        const label = normalizeLabel($(row).find('td').first().text())
        const field = RATIO_FIELD_BY_LABEL[label]
        if (!field || fundamentals[field] != null) return
        const cells = $(row).find('td')
        for (let index = cells.length - 1; index > 0; index -= 1) {
          const value = parseNumber($(cells[index]).text())
          if (value != null) {
            fundamentals[field] = value
            return
          }
        }
      })
  })

  const symbols: ParsedSymbol[] = symbol ? [{ symbol, companyName }] : []
  if (!symbol) warnings.push('Could not determine the company symbol from the page or URL.')
  if (!Object.keys(fundamentals).length) warnings.push('No fundamentals were found in the company page HTML.')

  return {
    kind: 'screener-company',
    parserVersion: SCREENER_PARSER_VERSION,
    symbols,
    fundamentals: Object.keys(fundamentals).length ? fundamentals : null,
    warnings,
  }
}
