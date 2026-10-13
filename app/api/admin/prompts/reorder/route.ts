import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { reorderCopyPrompts } from '@/lib/copy-prompts-store'

export const dynamic = 'force-dynamic'

/** Persist a new prompt order. Body: `{ ids: string[] }` (index = position). */
export async function POST(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied

  const body = await request.json().catch(() => null)
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0) : []
  if (!ids.length) return NextResponse.json({ ok: false, error: 'An ordered list of prompt ids is required.' }, { status: 400 })

  try {
    const prompts = await reorderCopyPrompts(ids)
    return NextResponse.json({ ok: true, prompts })
  } catch (error) {
    console.error('[admin/prompts] reorder failed', error)
    return NextResponse.json({ ok: false, error: 'Could not reorder the prompts.' }, { status: 500 })
  }
}
