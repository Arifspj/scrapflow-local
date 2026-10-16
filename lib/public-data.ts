import { prisma } from '@/lib/prisma'
import { resolveListViews } from '@/lib/list-views'

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
  const canonical = () => scannerCategories.map(([name, text]) => ({ name, description: text }))
  try {
    const scanners = await prisma.scanner.findMany({
      where: { enabled: true },
      select: { name: true, description: true },
    })
    if (scanners.length === 0) return canonical()

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
  } catch (error) {
    // The scanner list is persisted in the DB; when it is unreachable fall back
    // to the canonical nine so the homepage still renders instead of 500ing.
    console.error('[public-data] scanner list read failed; showing the canonical scanner list', error)
    return canonical()
  }
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
  try {
    const scanner = scannerId
      ? await prisma.scanner.findFirst({ where: { OR: [{ id: scannerId }, { name: scannerId }], enabled: true }, select: { id: true, name: true, category: true, description: true } })
      : await prisma.scanner.findFirst({ where: { enabled: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, category: true, description: true } })
    if (!scanner) return { scanner: null, rows: [], total: 0, stockCount: 0, latest: null }
    const where = { scannerId: scanner.id, ...(search ? { stock: { OR: [{ symbol: { contains: search.toUpperCase() } }, { companyName: { contains: search, mode: 'insensitive' as const } }] } } : {}) }
    const [members, total, stockCount, latest] = await Promise.all([
      prisma.scannerStock.findMany({
        where,
        orderBy: { lastSeenAt: 'desc' },
        take: limit,
        select: {
          id: true,
          lastSeenAt: true,
          stock: {
            select: {
              id: true,
              symbol: true,
              companyName: true,
              fundamentals: {
                orderBy: { capturedAt: 'desc' as const },
                take: 1,
                select: { viewSummary: true },
              },
            },
          },
        },
      }),
      prisma.scannerStock.count({ where }),
      prisma.stock.count(),
      prisma.stock.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    ])

    // Prefer the persisted summary so the giant rawData blob never leaves the
    // database; only snapshots written before the column existed fall back.
    const lists = await resolveListViews(
      members.map((member) => ({
        id: member.stock.id,
        symbol: member.stock.symbol,
        companyName: member.stock.companyName,
        summary: member.stock.fundamentals[0]?.viewSummary,
      })),
    )

    const rows = members.map((member) => ({
      id: member.id,
      lastSeenAt: member.lastSeenAt,
      stock: {
        id: member.stock.id,
        symbol: member.stock.symbol,
        companyName: member.stock.companyName,
        list: lists.get(member.stock.id) ?? null,
      },
    }))
    return { scanner, rows, total, stockCount, latest }
  } catch (error) {
    // A database outage must not crash the server-rendered homepage; render the
    // empty-state UI instead of a 500.
    console.error('[public-data] public snapshot read failed; rendering the empty state', error)
    return { scanner: null, rows: [], total: 0, stockCount: 0, latest: null }
  }
}

type Snapshot = Awaited<ReturnType<typeof getPublicSnapshot>>
export type PublicRow = Snapshot['rows'][number]

export function score(row: PublicRow) {
  return row.stock.list?.view.score ?? null
}

export function toCsv(rows: PublicRow[]) {
  const header = ['Company', 'Symbol', 'Market Cap', 'P/E', 'ROCE', 'ROE', 'Debt/Equity', 'Captured At']
  const lines = rows.map(({ stock }) => {
    const view = stock.list?.view
    return [stock.companyName || stock.symbol, stock.symbol, view?.marketCap, view?.pe, view?.roce, view?.roe, view?.debtToEquity, view?.capturedAt ? view.capturedAt.toISOString() : null].map((value) => JSON.stringify(value ?? '')).join(',')
  })
  return [header.join(','), ...lines].join('\n')
}
