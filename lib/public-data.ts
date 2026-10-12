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

export function decimal(value: unknown) {
  return value == null ? null : Number(value)
}

export function display(value: unknown, suffix = '') {
  return value == null ? '—' : `${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}${suffix}`
}

export async function getPublicSnapshot(scannerId?: string, search = '') {
  const scanner = scannerId
    ? await prisma.scanner.findFirst({ where: { OR: [{ id: scannerId }, { name: scannerId }], enabled: true }, select: { id: true, name: true, category: true, description: true } })
    : await prisma.scanner.findFirst({ where: { enabled: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, category: true, description: true } })
  if (!scanner) return { scanner: null, rows: [], total: 0, stockCount: 0, latest: null }
  const where = { scannerId: scanner.id, ...(search ? { stock: { OR: [{ symbol: { contains: search.toUpperCase() } }, { companyName: { contains: search, mode: 'insensitive' as const } }] } } : {}) }
  const [members, total, stockCount, latest] = await Promise.all([
    prisma.scannerStock.findMany({ where, include: { stock: { include: { fundamentals: { orderBy: { capturedAt: 'desc' }, take: 1 } } } }, orderBy: { lastSeenAt: 'desc' }, take: 100 }),
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
