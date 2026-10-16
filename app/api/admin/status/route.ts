import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * Lightweight live-ingestion status for the admin dashboard: database totals
 * (stocks, scanned) plus whether a fetch run is executing right now. Polled by
 * the admin page so the "Scanning now" tile stays honest and up to date.
 */
export async function GET(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied

  try {
    const [scannerCount, stockCount, scannedCount, lastRun, running] = await Promise.all([
      prisma.scanner.count({ where: { category: { not: 'Industry' } } }),
      prisma.stock.count(),
      prisma.stock.count({ where: { fundamentals: { some: {} } } }),
      prisma.fetchRun.findFirst({ orderBy: { startedAt: 'desc' }, select: { status: true, startedAt: true, endedAt: true } }),
      prisma.fetchRun.findFirst({
        where: { status: 'RUNNING' },
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true, sourceUrl: true, source: { select: { scanner: { select: { name: true } } } } },
      }),
    ])

    return NextResponse.json({
      ok: true,
      summary: {
        scanners: scannerCount,
        stocks: stockCount,
        scanned: scannedCount,
        lastRun,
        running: running
          ? { scanner: running.source.scanner.name, sourceUrl: running.sourceUrl, startedAt: running.startedAt }
          : null,
      },
    })
  } catch (error) {
    console.error('[admin/status] failed', error)
    return NextResponse.json({ ok: false, error: 'Database unavailable.' }, { status: 503 })
  }
}
