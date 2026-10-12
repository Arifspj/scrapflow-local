import * as cheerio from 'cheerio'
import { cleanSymbol } from './screener'
import type { ParseResult, ParsedSymbol } from './types'

export const CHARTINK_PARSER_VERSION = 'chartink@1.0.0'

const SYMBOL_HREF_PATTERNS = [/\/stocks\/([^/?#.]+)/i, /\/company\/([^/?#]+)/i]

function symbolFromHref(href: string | undefined | null): string | null {
  if (!href) return null
  for (const pattern of SYMBOL_HREF_PATTERNS) {
    const match = href.match(pattern)
    if (match) {
      const symbol = cleanSymbol(decodeURIComponent(match[1]))
      if (symbol) return symbol
    }
  }
  return null
}

/**
 * Chartink renders scan output on the client, so a plain GET rarely contains the
 * result rows. This parser extracts any result table that is present in the
 * returned HTML and reports a warning when the payload looks client-rendered.
 */
export function parseChartinkScreen(html: string): ParseResult {
  const $ = cheerio.load(html)
  const found = new Map<string, ParsedSymbol>()
  const warnings: string[] = []

  $('table a[href]').each((_, element) => {
    const symbol = symbolFromHref($(element).attr('href'))
    if (!symbol || found.has(symbol)) return
    found.set(symbol, { symbol, companyName: null })
  })

  if (!found.size) {
    warnings.push(
      'Chartink serves scan results through its process API/JavaScript, so no rows were present in the returned HTML. Use the Chartink process endpoint to fetch live results.',
    )
  }

  return {
    kind: 'chartink-scan',
    parserVersion: CHARTINK_PARSER_VERSION,
    symbols: [...found.values()],
    fundamentals: null,
    warnings,
  }
}
