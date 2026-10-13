'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Phase = 'idle' | 'loading' | 'success' | 'error'

type RefreshResponse = { ok: boolean; updatedAt: string | null; staleAt: string | null; message: string }

function formatIst(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
}

/**
 * Header "Refresh stock data" control. Posts to the protected server endpoint
 * (fetch -> validate -> upsert -> revalidate) and only then refreshes the page.
 * Repeated clicks are disabled while a job is in flight and the button never
 * claims success unless the server persisted fresh data.
 */
export function RefreshButton({ symbol }: { symbol: string }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState('')
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current)
  }, [])

  function scheduleReset() {
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => setPhase('idle'), 5000)
  }

  async function refresh() {
    if (phase === 'loading') return
    if (resetTimer.current) clearTimeout(resetTimer.current)
    setPhase('loading')
    setMessage('Fetching fresh data from the source…')
    try {
      const response = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/refresh`, { method: 'POST' })
      const data = (await response.json().catch(() => null)) as RefreshResponse | null
      if (response.ok && data?.ok) {
        setPhase('success')
        setMessage(`Refreshed · updated ${formatIst(data.updatedAt ?? new Date().toISOString())} IST`)
        router.refresh()
      } else {
        setPhase('error')
        const stale = data?.staleAt ? ` Existing data from ${formatIst(data.staleAt)} IST kept.` : ''
        setMessage(`${data?.message ?? `Refresh failed (HTTP ${response.status}).`}${stale}`)
      }
    } catch {
      setPhase('error')
      setMessage('Refresh request failed; existing data was kept.')
    } finally {
      scheduleReset()
    }
  }

  const tone =
    phase === 'success'
      ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-300'
      : phase === 'error'
        ? 'border-rose-500/60 bg-rose-950/40 text-rose-300'
        : 'border-[#1e293b] bg-[#0a0f1b] text-slate-300 hover:border-cyan-500 hover:text-cyan-300'

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={refresh}
        disabled={phase === 'loading'}
        aria-label="Refresh stock data"
        title="Refresh stock data (fetch → validate → save → reload)"
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-70 ${tone}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`size-3.5 ${phase === 'loading' ? 'animate-spin' : ''}`}
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
        <span>{phase === 'loading' ? 'Refreshing…' : 'Refresh'}</span>
      </button>

      {message && (
        <span
          role="status"
          aria-live="polite"
          className={`absolute right-0 top-full z-50 mt-1 max-w-xs rounded border px-2 py-1 text-[12px] leading-snug shadow-lg ${
            phase === 'error' ? 'border-rose-500/50 bg-rose-950/90 text-rose-200' : 'border-[#1d2b45] bg-[#0b1220] text-slate-300'
          }`}
        >
          {message}
        </span>
      )}
    </div>
  )
}