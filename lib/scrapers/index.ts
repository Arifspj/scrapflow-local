import { parseChartinkScreen } from './chartink'
import { parseScreenerCompany, parseScreenerScreen } from './screener'
import { parseScreenerMarketSource } from './screener-market'
import { parseScreenerIpoSource } from './screener-ipo'
import { parseScreenerResultsSource } from './screener-results'
import type { ParseResult, SourceKind } from './types'

export function parseSource(html: string, kind: SourceKind, sourceUrl: string): ParseResult {
  switch (kind) {
    case 'chartink-scan':
      return parseChartinkScreen(html)
    case 'screener-screen':
      return parseScreenerScreen(html)
    case 'screener-market':
      return parseScreenerMarketSource(html, sourceUrl)
    case 'screener-ipo':
      return parseScreenerIpoSource(html)
    case 'screener-results':
      return parseScreenerResultsSource(html)
    case 'screener-company':
      return parseScreenerCompany(html, sourceUrl)
    default: {
      const exhaustive: never = kind
      throw new Error(`Unsupported source kind: ${String(exhaustive)}`)
    }
  }
}

export type { ParseResult, ParsedFundamental, ParsedSymbol, SourceKind } from './types'
export { KIND_TO_LABEL, sourceKindFromLabel } from './types'
