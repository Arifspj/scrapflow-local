import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { buildListStockView, readViewSummary, type ListStockView } from '@/lib/view-summary'

/**
 * Every scalar `buildStockView` reads from a snapshot. Kept in one place so the
 * summary-backed reads and the rawData fallback always agree.
 */
export const listSnapshotSelect = {
  capturedAt: true,
  sourceUrl: true,
  rawData: true,
  marketCap: true,
  peRatio: true,
  bookValue: true,
  dividendYield: true,
  roce: true,
  roe: true,
  debtToEquity: true,
  revenue: true,
  netProfit: true,
} satisfies Prisma.StockFundamentalSnapshotSelect

export type ListStockRef = { id: string; symbol: string; companyName: string | null }

export type ListStockEntry = ListStockRef & { summary: unknown }

/**
 * Resolve a list view for each stock, preferring the persisted `viewSummary` so
 * the large `rawData` JSON never has to leave the database. Stocks without a
 * summary (written before the column existed) fall back to a second, narrow
 * query that reads rawData for just those rows — so nothing silently disappears
 * and behaviour is unchanged until the backfill catches up.
 */
export async function resolveListViews(entries: ListStockEntry[]): Promise<Map<string, ListStockView>> {
  const result = new Map<string, ListStockView>()
  if (!entries.length) return result

  const missing: ListStockEntry[] = []
  for (const entry of entries) {
    const list = readViewSummary(entry.summary)
    if (list) result.set(entry.id, list)
    else missing.push(entry)
  }

  if (!missing.length) return result

  const rows = await prisma.stockFundamentalSnapshot.findMany({
    where: { stockId: { in: missing.map((entry) => entry.id) } },
    orderBy: { capturedAt: 'asc' },
    select: { stockId: true, ...listSnapshotSelect },
  })
  const latestRow = new Map<string, (typeof rows)[number]>()
  for (const row of rows) latestRow.set(row.stockId, row)

  for (const entry of missing) {
    const row = latestRow.get(entry.id)
    result.set(
      entry.id,
      row
        ? buildListStockView({ symbol: entry.symbol, companyName: entry.companyName }, row)
        : buildListStockView({ symbol: entry.symbol, companyName: entry.companyName }, null),
    )
  }

  return result
}
