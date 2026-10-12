'use client'

import { useRef, useState } from 'react'

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path below
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    textarea.remove()
    return ok
  } catch {
    return false
  }
}

export function CopyDataButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function copy() {
    const ok = await writeClipboard(text)
    if (timer.current) clearTimeout(timer.current)
    setState(ok ? 'copied' : 'error')
    timer.current = setTimeout(() => setState('idle'), 2200)
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy this company's financial data as Markdown for an AI assistant"
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-2xs font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${
        state === 'copied'
          ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-300'
          : state === 'error'
            ? 'border-rose-500/60 bg-rose-950/40 text-rose-300'
            : 'border-cyan-700/60 bg-[#0e1e38] text-cyan-300 hover:border-cyan-500 hover:bg-[#12305a] hover:text-white'
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      {state === 'copied' ? 'Copied financial data' : state === 'error' ? 'Copy failed' : 'Copy Data'}
    </button>
  )
}