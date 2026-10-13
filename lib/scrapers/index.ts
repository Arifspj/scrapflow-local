import { parseChartinkScreen } from './chartink'
import { parseScreenerCompany, parseScreenerScreen } from './screener'
import { parseScreenerMarketSource } from './screener-market'
import type { ParseResult, SourceKind } from './types'

export function parseSource(html: string, kind: SourceKind, sourceUrl: string): ParseResult {
  switch (kind) {
    case 'chartink-scan':
      return parseChartinkScreen(html)
    case 'screener-screen':
      return parseScreenerScreen(html)
    case 'screener-market':
      return parseScreenerMarketSource(html, sourceUrl)
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
