import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { ensureCanonicalScanners } from '@/lib/scanners'
import { KIND_TO_LABEL, kindFromUrl } from '@/lib/scrapers/types'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  try {
    await ensureCanonicalScanners()
    const scanners = await prisma.scanner.findMany({
      where: { category: { not: 'Industry' } },
      orderBy: { name: 'asc' },
      include: {
        sources: { orderBy: { createdAt: 'asc' }, include: { fetchRuns: { orderBy: { startedAt: 'desc' }, take: 1 } } },
        _count: { select: { stocks: true } },
      },
    })

    const scannersPayload = scanners.map((scanner) => ({
      id: scanner.id,
      name: scanner.name,
      category: scanner.category,
      description: scanner.description,
      enabled: scanner.enabled,
      memberCount: scanner._count.stocks,
      sources: scanner.sources.map((source) => {
        const kind = kindFromUrl(source.url)
        const last = source.fetchRuns[0]
        return {
          id: source.id,
          type: source.type,
          kind,
          kindLabel: kind ? KIND_TO_LABEL[kind] : 'Unsupported URL',
          url: source.url,
          pipelineMode: source.pipelineMode,
          enabled: source.enabled,
          fetchInterval: source.fetchInterval,
          lastRun: last ? { status: last.status, endedAt: last.endedAt, itemsFound: last.itemsFound, errorSummary: last.errorSummary } : null,
        }
      }),
    }))

  const [stockCount, lastRun] = await Promise.all([
    prisma.stock.count(),
    prisma.fetchRun.findFirst({ orderBy: { startedAt: 'desc' }, select: { status: true, endedAt: true, startedAt: true } }),
  ])

  return NextResponse.json({
    ok: true,
    scanners: scanners,
    summary: { scanners: scanners.length, stocks: stockCount, lastRun },
  })
  } catch (error) {
    console.error('[admin/scanners] failed', error)
    return NextResponse.json({ ok: false, error: 'Could not load scanners.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ ok: false, error: 'A scanner name is required.' }, { status: 400 })
  const category = typeof body?.category === 'string' && body.category.trim() ? body.category.trim() : 'Custom'
  const description = typeof body?.description === 'string' ? body.description.trim() : null
  const existing = await prisma.scanner.findFirst({ where: { name }, select: { id: true } })
  if (existing) return NextResponse.json({ ok: false, error: 'A scanner with that name already exists.' }, { status: 409 })
  const scanner = await prisma.scanner.create({ data: { name, category, description }, select: { id: true, name: true } })
  return NextResponse.json({ ok: true, scanner })
}
