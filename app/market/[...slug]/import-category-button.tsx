'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

type ImportReport = {
  status: string
  totalResults: number | null
  uniqueCompanies: number
  pagesFetched: number
  pagesFailed: unknown[]
}

const STATUS_TEXT: Record<string, string> = {
  complete: 'Import complete',
  'limit-reached': 'Import hit the page limit',
  partial: 'Partial import (some pages failed)',
  failed: 'Import failed',
}

/**
 * Button that runs a full paginated import of the current screener.in category
 * into the database, then refreshes the page to show the persisted companies.
 */
export function ImportCategoryButton({ segments }: { segments: readonly string[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch('/api/market/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ segments }),
      })
      const data = (await response.json().catch(() => null)) as
        | { ok: boolean; report?: ImportReport; error?: string }
        | null
      if (!response.ok || !data?.ok || !data.report) {
        setError(data?.error ?? 'Import could not be completed.')
        return
      }
      const report = data.report
      const base = STATUS_TEXT[report.status] ?? `Import ${report.status}`
      setMessage(`${base} — ${report.uniqueCompanies} companies from ${report.pagesFetched} page(s).`)
      router.refresh()
    } catch {
      setError('Import request failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md border border-sky-500/50 bg-[#0b294e] px-3 py-1.5 text-xs font-semibold text-sky-200 transition-colors hover:bg-[#0e3560] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
        {busy ? 'Importing…' : 'Import full category'}
      </button>
      {message && <span className="text-[10px] text-emerald-400">{message}</span>}
      {error && <span className="text-[10px] text-rose-400">{error}</span>}
    </div>
  )
}
