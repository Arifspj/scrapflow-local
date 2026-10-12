export type SourceKind = 'chartink-scan' | 'screener-screen' | 'screener-company'

export type ParsedFundamental = {
  currentPrice?: number
  marketCap?: number
  peRatio?: number
  bookValue?: number
  dividendYield?: number
  roce?: number
  roe?: number
  debtToEquity?: number
  revenue?: number
  netProfit?: number
  eps?: number
}

export type ParsedSymbol = {
  symbol: string
  companyName: string | null
}

export type ParseResult = {
  kind: SourceKind
  parserVersion: string
  symbols: ParsedSymbol[]
  fundamentals: ParsedFundamental | null
  warnings: string[]
}

const LABEL_TO_KIND: Record<string, SourceKind> = {
  'Chartink technical scan': 'chartink-scan',
  'Screener public screen': 'screener-screen',
  'Screener company page': 'screener-company',
}

export function sourceKindFromLabel(label: string): SourceKind | null {
  return LABEL_TO_KIND[label] ?? null
}
