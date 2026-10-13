import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Update a scanner's editable fields (name, category, description, enabled). */
export async function PATCH(request: Request, { params }: Params) {
  const denied = requireAdmin(request)
  if (denied) return denied
  const { id } = await params

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'A JSON body is required.' }, { status: 400 })

  const existing = await prisma.scanner.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ ok: false, error: 'Scanner not found.' }, { status: 404 })

  const data: { name?: string; category?: string; description?: string | null; enabled?: boolean } = {}

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ ok: false, error: 'A scanner name is required.' }, { status: 400 })
    if (name.length > 80) return NextResponse.json({ ok: false, error: 'Scanner name is too long.' }, { status: 400 })
    const clash = await prisma.scanner.findFirst({ where: { name, id: { not: id } }, select: { id: true } })
    if (clash) return NextResponse.json({ ok: false, error: 'A scanner with that name already exists.' }, { status: 409 })
    data.name = name
  }
  if (typeof body.category === 'string') data.category = body.category.trim() || 'Custom'
  if (typeof body.description === 'string') data.description = body.description.trim() || null
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled

  if (!Object.keys(data).length) return NextResponse.json({ ok: false, error: 'Nothing to update.' }, { status: 400 })

  const scanner = await prisma.scanner.update({ where: { id }, data, select: { id: true, name: true, category: true, description: true, enabled: true } })
  return NextResponse.json({ ok: true, scanner })
}

/** Delete a scanner. Its sources and memberships cascade via the schema. */
export async function DELETE(request: Request, { params }: Params) {
  const denied = requireAdmin(request)
  if (denied) return denied
  const { id } = await params
  const existing = await prisma.scanner.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ ok: false, error: 'Scanner not found.' }, { status: 404 })
  await prisma.scanner.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
