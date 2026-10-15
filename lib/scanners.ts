import { ScannerSourceType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { kindFromUrl, type SourceKind } from '@/lib/scrapers/types'

/**
 * Coarse provenance stored on `ScannerSource.type`. The enum predates the
 * market-category adapter, so both screener list adapters map to the same enum
 * value; the exact adapter is always re-derived from the URL via `kindFromUrl`,
 * which keeps a wrong enum from ever selecting the wrong parser.
 */
export function sourceTypeFromKind(kind: SourceKind): ScannerSourceType {
  switch (kind) {
    case 'chartink-scan':
      return ScannerSourceType.CHARTINK_SCAN
    case 'screener-market':
    case 'screener-ipo':
    case 'screener-results':
    case 'screener-raw-screen':
    case 'screener-screen':
      return ScannerSourceType.SCREENER_SCREEN
    case 'screener-company':
      return ScannerSourceType.SCREENER_COMPANY
  }
}

/**
 * The nine canonical public scanners. The public site resolves a scanner by its
 * exact `name` (see `getPublicSnapshot`), so these strings are the contract
 * between the admin, the scheduler and the public pages.
 */
export type CanonicalDefault = {
  url: string
  /** True when the link is a genuine topic match; false when it is a starting point. */
  semantic: boolean
}

export type CanonicalScannerDef = {
  name: string
  category: string
  description: string
  defaults: string[]
}

/**
 * Default source links verified to return parseable company rows from
 * screener.in (checked against the live pages). Screen ids are stable public
 * screens; the last entry is a market-category listing.
 */
export const CANONICAL_SCANNERS: CanonicalScannerDef[] = [
  {
    name: 'Undervalued Scanner',
    category: 'Valuation',
    description: 'Value-oriented screens and fundamental checks.',
    defaults: ['https://www.screener.in/screens/184/value-stocks/'],
  },
  {
    name: 'IPO Scanner',
    category: 'Listings',
    description: 'New listings and recent momentum names.',
    defaults: ['https://www.screener.in/screens/214283/companies-creating-new-high/'],
  },
  {
    name: 'Multibagger Scanner',
    category: 'Growth',
    description: 'Long-term growth candidates.',
    defaults: ['https://www.screener.in/screens/60880/multibagger-stocks/'],
  },
  {
    name: 'Split Scanner',
    category: 'Corporate actions',
    description: 'Corporate-action and dilution-aware screens.',
    defaults: ['https://www.screener.in/screens/226712/growth-without-dilution/'],
  },
  {
    name: 'Penny Stocks Scanner',
    category: 'Small-cap',
    description: 'Small-cap discovery screens.',
    defaults: ['https://www.screener.in/screens/985942/rsi-oversold-stocks/'],
  },
  {
    name: 'Business Group Scanner',
    category: 'Groups',
    description: 'Quality group and mega-cap scans.',
    defaults: ['https://www.screener.in/screens/234/bluest-of-the-blue-chips/'],
  },
  {
    name: 'Upper Circuit Scan',
    category: 'Momentum',
    description: 'Momentum and breakout monitoring.',
    defaults: ['https://www.screener.in/screens/209239/breakout-stocks/'],
  },
  {
    name: 'Sector Scanner',
    category: 'Sector',
    description: 'Sector rotation and relative strength.',
    defaults: ['https://www.screener.in/market/IN05/IN0501/IN050103/'],
  },
  {
    name: 'Watchlist',
    category: 'Manual',
    description: 'Curated symbols for manual review.',
    defaults: ['https://www.screener.in/screens/4928/darvas-scan/'],
  },
]

/** Verified public screener screens offered as one-click suggestions in admin. */
export const SUGGESTED_SOURCES: { name: string; url: string }[] = [
  { name: 'Recent IPOs', url: 'https://www.screener.in/ipo/recent/' },
  { name: 'Value stocks', url: 'https://www.screener.in/screens/184/value-stocks/' },
  { name: 'Piotroski scan', url: 'https://www.screener.in/screens/2/piotroski-scan/' },
  { name: 'Multibagger stocks', url: 'https://www.screener.in/screens/60880/multibagger-stocks/' },
  { name: 'Breakout stocks', url: 'https://www.screener.in/screens/209239/breakout-stocks/' },
  { name: 'Darvas scan', url: 'https://www.screener.in/screens/4928/darvas-scan/' },
  { name: 'Coffee can portfolio', url: 'https://www.screener.in/screens/57601/coffee-can-portfolio/' },
  { name: 'High dividend yield', url: 'https://www.screener.in/screens/3/highest-dividend-yield-shares/' },
  { name: 'Golden crossover', url: 'https://www.screener.in/screens/336509/golden-crossover/' },
  { name: 'Debt reduction', url: 'https://www.screener.in/screens/126864/debt-reduction/' },
  { name: 'Capacity expansion', url: 'https://www.screener.in/screens/97687/capacity-expansion/' },
]

/**
 * Create any missing canonical scanner. Existing scanners are left untouched so
 * a manual edit (rename, disable, extra source) is never overwritten; defaults
 * are only attached when a scanner is first created.
 */
export async function ensureCanonicalScanners(): Promise<{ created: string[]; total: number }> {
  const created: string[] = []
  for (const def of CANONICAL_SCANNERS) {
    const existing = await prisma.scanner.findFirst({ where: { name: def.name }, select: { id: true } })
    if (existing) continue

    const scanner = await prisma.scanner.create({
      data: { name: def.name, category: def.category, description: def.description, enabled: true },
      select: { id: true },
    })
    created.push(def.name)

    for (const url of def.defaults) {
      const kind = kindFromUrl(url)
      if (!kind) continue
      await prisma.scannerSource.create({
        data: { scannerId: scanner.id, type: sourceTypeFromKind(kind), url, pipelineMode: 'LIST_ONLY', enabled: true },
      })
    }
  }
  return { created, total: CANONICAL_SCANNERS.length }
}
