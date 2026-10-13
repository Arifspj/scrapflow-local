export type SourceKind = 'chartink-scan' | 'screener-screen' | 'screener-market' | 'screener-company'

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
  'Screener market category': 'screener-market',
  'Screener company page': 'screener-company',
}

export const KIND_TO_LABEL: Record<SourceKind, string> = {
  'chartink-scan': 'Chartink technical scan',
  'screener-screen': 'Screener public screen',
  'screener-market': 'Screener market category',
  'screener-company': 'Screener company page',
}

export function sourceKindFromLabel(label: string): SourceKind | null {
  return LABEL_TO_KIND[label] ?? null
}

/**
 * Infer the adapter for a source URL from its host and path. This is the single
 * source of truth used both by the admin form (client) and the server when
 * validating a link, so a URL can never be silently attached under the wrong
 * parser.
 */
export function kindFromUrl(rawUrl: string): SourceKind | null {
  const trimmed = rawUrl.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./i, '').toLowerCase()
  if (host === 'chartink.com') return 'chartink-scan'
  if (host === 'screener.in') {
    const path = url.pathname
    if (/^\/market(\/|$)/i.test(path)) return 'screener-market'
    if (/^\/screens\//i.test(path)) return 'screener-screen'
    if (/^\/company\//i.test(path)) return 'screener-company'
  }
  return null
}
