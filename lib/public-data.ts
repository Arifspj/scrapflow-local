import { prisma } from '@/lib/prisma'
import { buildStockView } from '@/lib/stock-detail'

export const scannerCategories = [
  ['Undervalued Scanner', 'Value-oriented screens and fundamental checks.'],
  ['IPO Scanner', 'New listings and upcoming public offerings.'],
  ['Multibagger Scanner', 'Long-term growth candidates.'],
  ['Split Scanner', 'Corporate actions and split activity.'],
  ['Penny Stocks Scanner', 'Small-cap discovery screens.'],
  ['Business Group Scanner', 'Business and sector group scans.'],
  ['Upper Circuit Scan', 'Upper circuit movement monitoring.'],
  ['Sector Scanner', 'Sector rotation and relative strength.'],
  ['Watchlist', 'Curated symbols for manual review.'],
] as const

const CANONICAL_DESCRIPTIONS = new Map<string, string>(scannerCategories.map(([name, text]) => [name, text]))
const CANONICAL_ORDER = new Map<string, number>(scannerCategories.map(([name], index) => [name, index]))

export type PublicScannerOption = { name: string; description: string }

/**
 * Every enabled scanner, straight from the DB, so a scanner created or renamed
 * in the admin panel shows up on the public site without a code change. The nine
 * canonical scanners keep their curated order at the front; anything custom
 * (e.g. a results adapter) is appended after them. Falls back to the static list
 * only when no scanner row exists yet.
 */
export async function listPublicScanners(): Promise<PublicScannerOption[]> {
  const scanners = await prisma.scanner.findMany({
    where: { enabled: true },
    select: { name: true, description: true },
  })
  if (scanners.length === 0) return scannerCategories.map(([name, text]) => ({ name, description: text }))

  return scanners
    .map((scanner) => ({
      name: scanner.name,
      description: scanner.description?.trim() || CANONICAL_DESCRIPTIONS.get(scanner.name) || 'Source-backed screen.',
    }))
    .sort((a, b) => {
      const ai = CANONICAL_ORDER.get(a.name)
      const bi = CANONICAL_ORDER.get(b.name)
      if (ai != null && bi != null) return ai - bi
      if (ai != null) return -1
      if (bi != null) return 1
      return a.name.localeCompare(b.name)
    })
}

export function decimal(value: unknown) {
  return value == null ? null : Number(value)
}

export function display(value: unknown, suffix = '') {
  return value == null ? '—' : `${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}${suffix}`
}

/**
 * Upper bound on rows returned to a table so a single request can never fan out
 * unbounded. The tables paginate client-side over the full set (their metrics
 * are derived from raw snapshots, so they cannot be sorted in SQL), which is why
 * the cap is high enough to hold a whole scanner rather than a single page.
 * `total` is still the true membership count, so if the cap were ever hit the UI
 * would show the real total instead of silently truncating.
 */
export const PUBLIC_TABLE_ROW_CAP = 5000

export async function getPublicSnapshot(scannerId?: string, search = '', limit: number = PUBLIC_TABLE_ROW_CAP) {
  const scanner = scannerId
    ? await prisma.scanner.findFirst({ where: { OR: [{ id: scannerId }, { name: scannerId }], enabled: true }, select: { id: true, name: true, category: true, description: true } })
    : await prisma.scanner.findFirst({ where: { enabled: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, category: true, description: true } })
  if (!scanner) return { scanner: null, rows: [], total: 0, stockCount: 0, latest: null }
  const where = { scannerId: scanner.id, ...(search ? { stock: { OR: [{ symbol: { contains: search.toUpperCase() } }, { companyName: { contains: search, mode: 'insensitive' as const } }] } } : {}) }
  const [members, total, stockCount, latest] = await Promise.all([
    prisma.scannerStock.findMany({ where, include: { stock: { include: { fundamentals: { orderBy: { capturedAt: 'desc' }, take: 1 } } } }, orderBy: { lastSeenAt: 'desc' }, take: limit }),
    prisma.scannerStock.count({ where }),
    prisma.stock.count(),
    prisma.stock.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
  ])
  return { scanner, rows: members, total, stockCount, latest }
}

type Snapshot = Awaited<ReturnType<typeof getPublicSnapshot>>
export type PublicRow = Snapshot['rows'][number]

export function score(row: PublicRow) {
  const f = row.stock.fundamentals[0]
  if (!f) return null
  // Same validated scoring model that the sidebar and detail page use, so the
  // search table never disagrees with the stock screen.
  return buildStockView(row.stock, f).score
}

export function toCsv(rows: PublicRow[]) {
  const header = ['Company', 'Symbol', 'Market Cap', 'P/E', 'ROCE', 'ROE', 'Debt/Equity', 'Captured At']
  const lines = rows.map(({ stock }) => { const f = stock.fundamentals[0]; return [stock.companyName || stock.symbol, stock.symbol, f?.marketCap, f?.peRatio, f?.roce, f?.roe, f?.debtToEquity, f?.capturedAt.toISOString()].map((value) => JSON.stringify(value ?? '')).join(',') })
  return [header.join(','), ...lines].join('\n')
}
