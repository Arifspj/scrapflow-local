import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { previewSource } from '@/lib/ingest'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Params = { params: Promise<{ id: string }> }

/** Preview a source (fetch + parse only) without writing any rows. */
export async function POST(request: Request, { params }: Params) {
  const denied = requireAdmin(request)
  if (denied) return denied
  const { id } = await params

  const source = await prisma.scannerSource.findUnique({ where: { id }, select: { url: true } })
  if (!source) return NextResponse.json({ ok: false, error: 'Source not found.' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const override = typeof body?.url === 'string' && body.url.trim() ? body.url.trim() : null
  const preview = await previewSource(override ?? source.url)
  return NextResponse.json(preview)
}
