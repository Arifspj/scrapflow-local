import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { listSnapshotSelect } from '@/lib/list-views'
import { buildViewSummary } from '@/lib/view-summary'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DEFAULT_BATCH = 200
const MAX_BATCH = 500

/**
 * Idempotent backfill for snapshots written before `viewSummary` existed.
 *
 * Processes the first `limit` rows that still have a NULL summary and returns
 * how many were written. Call it repeatedly (same URL) until `done` is true —
 * each call removes the rows it handled from the filter, so progress is
 * monotonic and a re-run is always safe (new snapshots already carry a summary).
 */
export async function POST(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied

  const limitParam = Number(new URL(request.url).searchParams.get('limit'))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), MAX_BATCH) : DEFAULT_BATCH

  try {
    const snapshots = await prisma.stockFundamentalSnapshot.findMany({
      where: { viewSummary: { equals: Prisma.DbNull } },
      orderBy: { id: 'asc' },
      take: limit,
      select: {
        id: true,
        ...listSnapshotSelect,
        stock: { select: { symbol: true, companyName: true } },
      },
    })

    let updated = 0
    let failed = 0
    for (const snapshot of snapshots) {
      try {
        await prisma.stockFundamentalSnapshot.update({
          where: { id: snapshot.id },
          data: { viewSummary: buildViewSummary(snapshot.stock, snapshot) },
        })
        updated += 1
      } catch (error) {
        failed += 1
        console.error(`[admin/backfill-view-summary] failed for snapshot ${snapshot.id}`, error)
      }
    }

    return NextResponse.json({
      ok: true,
      processed: snapshots.length,
      updated,
      failed,
      done: snapshots.length < limit,
    })
  } catch (error) {
    console.error('[admin/backfill-view-summary] failed', error)
    return NextResponse.json({ ok: false, error: 'Database unavailable.' }, { status: 503 })
  }
}
