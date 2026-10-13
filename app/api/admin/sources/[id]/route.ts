import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { sourceTypeFromKind } from '@/lib/scanners'
import { kindFromUrl } from '@/lib/scrapers/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const denied = requireAdmin(request)
  if (denied) return denied
  const { id } = await params

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'A JSON body is required.' }, { status: 400 })

  const data: { enabled?: boolean; pipelineMode?: 'LIST_ONLY' | 'LIST_AND_FUNDAMENTALS'; fetchInterval?: number; url?: string; type?: ReturnType<typeof sourceTypeFromKind> } = {}
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled
  if (body.pipelineMode === 'LIST_AND_FUNDAMENTALS' || body.pipelineMode === 'LIST_ONLY') data.pipelineMode = body.pipelineMode
  if (Number.isFinite(Number(body.fetchInterval))) data.fetchInterval = Math.max(300, Number(body.fetchInterval))
  if (typeof body.url === 'string' && body.url.trim()) {
    const kind = kindFromUrl(body.url.trim())
    if (!kind) return NextResponse.json({ ok: false, error: 'Unsupported URL.' }, { status: 400 })
    data.url = body.url.trim()
    data.type = sourceTypeFromKind(kind)
  }

  if (!Object.keys(data).length) return NextResponse.json({ ok: false, error: 'Nothing to update.' }, { status: 400 })

  const existing = await prisma.scannerSource.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ ok: false, error: 'Source not found.' }, { status: 404 })

  const source = await prisma.scannerSource.update({ where: { id }, data, select: { id: true, enabled: true, pipelineMode: true, fetchInterval: true, url: true } })
  return NextResponse.json({ ok: true, source })
}

export async function DELETE(request: Request, { params }: Params) {
  const denied = requireAdmin(request)
  if (denied) return denied
  const { id } = await params
  const existing = await prisma.scannerSource.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ ok: false, error: 'Source not found.' }, { status: 404 })
  await prisma.scannerSource.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
