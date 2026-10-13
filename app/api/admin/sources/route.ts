import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { sourceTypeFromKind } from '@/lib/scanners'
import { KIND_TO_LABEL, kindFromUrl } from '@/lib/scrapers/types'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied

  const body = await request.json().catch(() => null)
  const scannerId = typeof body?.scannerId === 'string' ? body.scannerId : ''
  const url = typeof body?.url === 'string' ? body.url.trim() : ''
  if (!scannerId || !url) return NextResponse.json({ ok: false, error: 'scannerId and url are required.' }, { status: 400 })

  const kind = kindFromUrl(url)
  if (!kind) {
    return NextResponse.json({ ok: false, error: 'Unsupported URL. Use a screener.in /screens, /ipo, /market or /company page, or a chartink.com scan.' }, { status: 400 })
  }

  const scanner = await prisma.scanner.findUnique({ where: { id: scannerId }, select: { id: true } })
  if (!scanner) return NextResponse.json({ ok: false, error: 'Scanner not found.' }, { status: 404 })

  const pipelineMode = body?.pipelineMode === 'LIST_AND_FUNDAMENTALS' ? 'LIST_AND_FUNDAMENTALS' : 'LIST_ONLY'
  const fetchInterval = Number.isFinite(Number(body?.fetchInterval)) ? Math.max(300, Number(body.fetchInterval)) : 3600

  const duplicate = await prisma.scannerSource.findFirst({ where: { scannerId, url }, select: { id: true } })
  if (duplicate) return NextResponse.json({ ok: false, error: 'That source URL is already attached to this scanner.' }, { status: 409 })

  const source = await prisma.scannerSource.create({
    data: { scannerId, url, type: sourceTypeFromKind(kind), pipelineMode, fetchInterval, enabled: true },
    select: { id: true, url: true, type: true, pipelineMode: true, fetchInterval: true, enabled: true },
  })

  return NextResponse.json({ ok: true, source: { ...source, kind, kindLabel: KIND_TO_LABEL[kind] } })
}
