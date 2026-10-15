import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { validateCopyPromptInput } from '@/lib/copy-prompts'
import { createCopyPrompt, listAllCopyPrompts } from '@/lib/copy-prompts-store'

export const dynamic = 'force-dynamic'

/** List every prompt (including disabled) for the admin table. */
export async function GET(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const prompts = await listAllCopyPrompts()
    return NextResponse.json({ ok: true, prompts })
  } catch (error) {
    console.error('[admin/prompts] list failed', error)
    return NextResponse.json({ ok: false, error: 'Database unavailable.' }, { status: 503 })
  }
}

/** Create a custom prompt. */
export async function POST(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied

  const body = await request.json().catch(() => null)
  const parsed = validateCopyPromptInput(body)
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 })

  try {
    const prompt = await createCopyPrompt({
      title: parsed.value.title!,
      description: parsed.value.description ?? null,
      instruction: parsed.value.instruction ?? '',
      enabled: parsed.value.enabled ?? true,
    })
    return NextResponse.json({ ok: true, prompt })
  } catch (error) {
    console.error('[admin/prompts] create failed', error)
    return NextResponse.json({ ok: false, error: 'Could not create the prompt.' }, { status: 500 })
  }
}
