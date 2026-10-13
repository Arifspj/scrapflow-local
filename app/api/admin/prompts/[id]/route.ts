import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { validateCopyPromptInput } from '@/lib/copy-prompts'
import { deleteCopyPrompt, updateCopyPrompt } from '@/lib/copy-prompts-store'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Edit a prompt (title/description/instruction/enabled). */
export async function PATCH(request: Request, { params }: Params) {
  const denied = requireAdmin(request)
  if (denied) return denied
  const { id } = await params

  const body = await request.json().catch(() => null)
  const parsed = validateCopyPromptInput(body, { partial: true })
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 })

  try {
    const result = await updateCopyPrompt(id, parsed.value)
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true, prompt: result.prompt })
  } catch (error) {
    console.error('[admin/prompts] update failed', error)
    return NextResponse.json({ ok: false, error: 'Could not update the prompt.' }, { status: 500 })
  }
}

/** Delete a custom prompt (built-in options are protected). */
export async function DELETE(request: Request, { params }: Params) {
  const denied = requireAdmin(request)
  if (denied) return denied
  const { id } = await params

  try {
    const result = await deleteCopyPrompt(id)
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[admin/prompts] delete failed', error)
    return NextResponse.json({ ok: false, error: 'Could not delete the prompt.' }, { status: 500 })
  }
}
