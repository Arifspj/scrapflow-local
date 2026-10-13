'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ClipboardCheck, Loader2 } from 'lucide-react'
import { appendPromptToMarkdown, type CopyPromptTemplate } from '@/lib/copy-prompts'

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

/** Built-in fallback so the menu always works even if the prompt list cannot be fetched. */
const NORMAL_DATA: CopyPromptTemplate = {
  id: 'normal-data',
  key: 'normal-data',
  title: 'Normal Data',
  description: 'Copy stock data only',
  instruction: '',
  builtin: true,
}

type Toast = { tone: 'good' | 'bad'; message: string } | null

export function CopyDataMenu({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const [prompts, setPrompts] = useState<CopyPromptTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadPrompts = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/copy-prompts', { cache: 'no-store' })
      const json = await response.json().catch(() => null)
      if (response.ok && Array.isArray(json?.prompts)) setPrompts(json.prompts as CopyPromptTemplate[])
    } catch {
      // Keep the previously loaded list (or the built-in fallback).
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPrompts()
  }, [loadPrompts])

  useEffect(() => {
    if (!open) return
    void loadPrompts()
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, loadPrompts])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const options = prompts.length ? prompts : [NORMAL_DATA]

  async function select(prompt: CopyPromptTemplate) {
    setBusy(prompt.id)
    setOpen(false)
    const payload = appendPromptToMarkdown(text, prompt)
    const ok = await writeClipboard(payload)
    setBusy(null)
    if (timer.current) clearTimeout(timer.current)
    setToast(
      ok
        ? { tone: 'good', message: `Copied stock data with “${prompt.title}”.` }
        : { tone: 'bad', message: 'Clipboard blocked. Allow clipboard access for this site and try again.' },
    )
    timer.current = setTimeout(() => setToast(null), 3000)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Copy this company's data as Markdown, optionally with an AI research prompt"
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-2xs font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${
          open ? 'border-cyan-500 bg-[#12305a] text-white' : 'border-cyan-700/60 bg-[#0e1e38] text-cyan-300 hover:border-cyan-500 hover:bg-[#12305a] hover:text-white'
        }`}
      >
        <ClipboardCheck className="size-3.5" aria-hidden="true" />
        Copy Data
        <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-72 overflow-hidden rounded-lg border border-[#1e3350] bg-[#0b1420] shadow-2xl"
        >
          <div className="border-b border-[#17293f] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Copy data + prompt
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {options.map((prompt) => (
              <li key={prompt.id}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => select(prompt)}
                  disabled={busy === prompt.id}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-white/5 focus:bg-white/5 focus:outline-none disabled:opacity-60"
                >
                  <span className="flex w-full items-center gap-2 text-xs font-semibold text-slate-100">
                    {busy === prompt.id ? <Loader2 className="size-3.5 animate-spin text-cyan-300" /> : null}
                    {prompt.title}
                    {prompt.builtin && (
                      <span className="ml-auto rounded-full border border-cyan-700/50 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400">built-in</span>
                    )}
                  </span>
                  {prompt.description && <span className="text-[11px] leading-snug text-slate-400">{prompt.description}</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-[#17293f] px-3 py-1.5 text-[11px] text-slate-600">
            <span>Paste into ChatGPT / any AI</span>
            {loading && <span className="flex items-center gap-1 text-slate-500"><Loader2 className="size-3 animate-spin" /> refreshing</span>}
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 max-w-xs rounded-lg border px-3.5 py-2.5 text-xs font-medium shadow-2xl ${
            toast.tone === 'good'
              ? 'border-emerald-500/50 bg-emerald-950/90 text-emerald-200'
              : 'border-rose-500/50 bg-rose-950/90 text-rose-200'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
