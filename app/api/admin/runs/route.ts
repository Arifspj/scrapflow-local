import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/** Recent fetch runs (the honest scheduler/import log). */
export async function GET(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied

  const runs = await prisma.fetchRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 100,
    include: { source: { select: { url: true, scanner: { select: { name: true } } } } },
  })

  return NextResponse.json({
    ok: true,
    runs: runs.map((run) => ({
      id: run.id,
      scanner: run.source.scanner.name,
      sourceUrl: run.sourceUrl,
      status: run.status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      itemsFound: run.itemsFound,
      itemsCreated: run.itemsCreated,
      itemsUpdated: run.itemsUpdated,
      parserVersion: run.parserVersion,
      errorSummary: run.errorSummary,
    })),
  })
}
