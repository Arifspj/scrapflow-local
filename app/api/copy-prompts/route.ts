import { NextResponse } from 'next/server'
import { listPublicCopyPrompts } from '@/lib/copy-prompts-store'

export const dynamic = 'force-dynamic'

/**
 * Public list of enabled Copy-Data prompts for the stock-detail dropdown.
 * Never cached indefinitely (no-store) so admin edits appear on the next open.
 */
export async function GET() {
  try {
    const prompts = await listPublicCopyPrompts()
    return NextResponse.json({ ok: true, prompts }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('[copy-prompts] failed', error)
    return NextResponse.json({ ok: false, error: 'Could not load copy prompts.' }, { status: 500 })
  }
}
