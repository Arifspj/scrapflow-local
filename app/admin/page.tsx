'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Beaker,
  Check,
  Clock3,
  Database,
  Eye,
  FileText,
  Globe2,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { appendPromptToMarkdown } from '@/lib/copy-prompts'

const SECRET_KEY = 'qscan:admin-secret'

type SourceRun = { status: string; endedAt: string | null; itemsFound: number; errorSummary: string | null } | null
type Source = {
  id: string
  type: string
  kind: string | null
  kindLabel: string
  url: string
  pipelineMode: 'LIST_ONLY' | 'LIST_AND_FUNDAMENTALS'
  enabled: boolean
  fetchInterval: number
  lastRun: SourceRun
}
type Scanner = {
  id: string
  name: string
  category: string
  description: string | null
  enabled: boolean
  memberCount: number
  sources: Source[]
}
type Summary = { scanners: number; stocks: number; lastRun: { status: string; startedAt: string; endedAt: string | null } | null }
type StockRow = {
  symbol: string
  companyName: string | null
  marketCap: number | null
  pe: number | null
  roce: number | null
  roe: number | null
  capturedAt: string | null
  scanners: string[]
}
type RunRow = {
  id: string
  scanner: string
  sourceUrl: string
  status: string
  startedAt: string
  endedAt: string | null
  itemsFound: number
  itemsCreated: number
  itemsUpdated: number
  parserVersion: string | null
  errorSummary: string | null
}
type Preview = { ok: boolean; kindLabel?: string; status: number; stopped: boolean; symbolCount: number; rows: { symbol: string; companyName: string | null }[]; warnings: string[]; message: string }
type PromptRow = {
  id: string
  key: string
  title: string
  description: string | null
  instruction: string
  builtin: boolean
  enabled: boolean
  sortOrder: number
}

const PROMPT_PREVIEW_SAMPLE = `# Stock — Sample

Company: Example Ltd · LTP: ₹100 · ROCE: 20%`

const SUGGESTIONS = [
  ['Value stocks', 'https://www.screener.in/screens/184/value-stocks/'],
  ['Piotroski scan', 'https://www.screener.in/screens/2/piotroski-scan/'],
  ['Multibagger stocks', 'https://www.screener.in/screens/60880/multibagger-stocks/'],
  ['Breakout stocks', 'https://www.screener.in/screens/209239/breakout-stocks/'],
  ['Coffee can portfolio', 'https://www.screener.in/screens/57601/coffee-can-portfolio/'],
  ['High dividend yield', 'https://www.screener.in/screens/3/highest-dividend-yield-shares/'],
] as const

const navItems = [
  { label: 'Scanner Management', icon: Globe2 },
  { label: 'Copy Data Prompts', icon: MessageSquareText },
  { label: 'View Stocks (DB)', icon: BarChart3 },
  { label: 'Fetch Logs', icon: FileText },
  { label: 'System Settings', icon: Settings },
]

function n(value: number | null, suffix = ''): string {
  return value == null ? '—' : `${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}${suffix}`
}

function when(value: string | null): string {
  if (!value) return 'never'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'never' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

const statusTone: Record<string, string> = {
  SUCCEEDED: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20',
  PARTIAL: 'text-amber-300 bg-amber-400/10 border-amber-400/20',
  FAILED: 'text-rose-300 bg-rose-400/10 border-rose-400/20',
  RUNNING: 'text-sky-300 bg-sky-400/10 border-sky-400/20',
  PENDING: 'text-slate-300 bg-white/5 border-white/10',
}

export default function AdminPage() {
  const [secret, setSecret] = useState('')
  const [authorized, setAuthorized] = useState(false)
  const [authError, setAuthError] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [scanners, setScanners] = useState<Scanner[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [runs, setRuns] = useState<RunRow[]>([])
  const [prompts, setPrompts] = useState<PromptRow[]>([])

  const [activeNav, setActiveNav] = useState('Scanner Management')
  const [activeScannerId, setActiveScannerId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [stockQuery, setStockQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addUrl, setAddUrl] = useState('')
  const [addMode, setAddMode] = useState<'LIST_ONLY' | 'LIST_AND_FUNDAMENTALS'>('LIST_ONLY')
  const [scannerModal, setScannerModal] = useState<{ mode: 'add' } | { mode: 'edit'; id: string } | null>(null)
  const [scannerForm, setScannerForm] = useState({ name: '', category: 'Custom', description: '', urls: '', enabled: true })
  const [promptModal, setPromptModal] = useState<{ mode: 'add' } | { mode: 'edit'; id: string } | null>(null)
  const [promptForm, setPromptForm] = useState({ title: '', description: '', instruction: '', enabled: true })
  const [promptPreview, setPromptPreview] = useState<PromptRow | null>(null)

  const selected = scanners.find((scanner) => scanner.id === activeScannerId) ?? scanners[0] ?? null
  const filteredScanners = useMemo(() => scanners.filter((scanner) => scanner.name.toLowerCase().includes(query.toLowerCase())), [scanners, query])

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const response = await fetch(path, {
        ...init,
        headers: { 'content-type': 'application/json', 'x-admin-secret': secret, ...(init?.headers ?? {}) },
      })
      if (response.status === 401) throw new Error('unauthorized')
      return response
    },
    [secret],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [scannersRes, stocksRes, runsRes, promptsRes] = await Promise.all([
        api('/api/admin/scanners'),
        api('/api/admin/stocks'),
        api('/api/admin/runs'),
        api('/api/admin/prompts'),
      ])
      if (!scannersRes.ok) throw new Error((await scannersRes.json().catch(() => ({}))).error || 'Could not load scanners.')
      const scannersJson = await scannersRes.json()
      setScanners(scannersJson.scanners ?? [])
      setSummary(scannersJson.summary ?? null)
      setStocks((await stocksRes.json()).stocks ?? [])
      setRuns((await runsRes.json()).runs ?? [])
      setPrompts((await promptsRes.json().catch(() => ({}))).prompts ?? [])
      setAuthorized(true)
      setAuthError('')
    } catch (caught) {
      if (caught instanceof Error && caught.message === 'unauthorized') {
        setAuthorized(false)
        setAuthError('Incorrect admin secret.')
      } else {
        setError(caught instanceof Error ? caught.message : 'Failed to load admin data.')
      }
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SECRET_KEY)
      if (saved) setSecret(saved)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (secret && !authorized && !authError) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret])

  useEffect(() => {
    if (!selected && scanners.length) setActiveScannerId(scanners[0].id)
  }, [scanners, selected])

  function connect() {
    if (!secret.trim()) {
      setAuthError('Enter the ADMIN_SECRET value configured on the server.')
      return
    }
    try {
      window.localStorage.setItem(SECRET_KEY, secret)
    } catch {
      /* ignore */
    }
    void load()
  }

  async function addSource() {
    if (!selected || !addUrl.trim()) return
    setBusy('add')
    setNotice('')
    try {
      const response = await api('/api/admin/sources', {
        method: 'POST',
        body: JSON.stringify({ scannerId: selected.id, url: addUrl.trim(), pipelineMode: addMode }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Could not add source.')
      setShowAdd(false)
      setAddUrl('')
      setNotice(`Added ${preview?.kindLabel ?? 'source'} to ${selected.name}.`)
      await load()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Failed to add source.')
    }
  }

  async function testSource(source: Source) {
    setBusy(`test:${source.id}`)
    setPreview(null)
    setNotice('')
    try {
      const response = await api(`/api/admin/sources/${source.id}/test`, { method: 'POST' })
      setPreview(await response.json())
    } catch {
      setNotice('Preview request failed.')
    } finally {
      setBusy(null)
    }
  }

  async function importSource(source: Source) {
    setBusy(`import:${source.id}`)
    setNotice('')
    try {
      const response = await api(`/api/admin/sources/${source.id}/import`, { method: 'POST' })
      const json = await response.json()
      setNotice(`${source.kindLabel}: ${json.status} — ${json.message} [found ${json.found}, new ${json.created}, updated ${json.updated}, members ${json.memberships}, enriched ${json.enriched}]`)
      await load()
    } catch {
      setNotice('Import request failed.')
    } finally {
      setBusy(null)
    }
  }

  async function toggleSource(source: Source) {
    setBusy(`toggle:${source.id}`)
    try {
      await api(`/api/admin/sources/${source.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !source.enabled }) })
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function deleteSource(source: Source) {
    setBusy(`delete:${source.id}`)
    try {
      await api(`/api/admin/sources/${source.id}`, { method: 'DELETE' })
      await load()
    } finally {
      setBusy(null)
    }
  }

  function openAddScanner() {
    setScannerForm({ name: '', category: 'Custom', description: '', urls: '', enabled: true })
    setScannerModal({ mode: 'add' })
  }

  function openEditScanner(scanner: Scanner) {
    setScannerForm({ name: scanner.name, category: scanner.category, description: scanner.description ?? '', urls: '', enabled: scanner.enabled })
    setScannerModal({ mode: 'edit', id: scanner.id })
  }

  async function saveScanner() {
    if (!scannerModal) return
    const name = scannerForm.name.trim()
    if (!name) {
      setNotice('A scanner name is required.')
      return
    }
    setBusy('scanner')
    setNotice('')
    try {
      if (scannerModal.mode === 'add') {
        const urls = scannerForm.urls.split('\n').map((line) => line.trim()).filter(Boolean)
        const response = await api('/api/admin/scanners', {
          method: 'POST',
          body: JSON.stringify({ name, category: scannerForm.category.trim() || 'Custom', description: scannerForm.description.trim(), enabled: scannerForm.enabled, urls }),
        })
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || 'Could not create scanner.')
        setNotice(`Created scanner “${name}”${urls.length ? ` with ${urls.length} source URL(s)` : ''}.`)
      } else {
        const response = await api(`/api/admin/scanners/${scannerModal.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name, category: scannerForm.category.trim() || 'Custom', description: scannerForm.description.trim(), enabled: scannerForm.enabled }),
        })
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || 'Could not update scanner.')
        setNotice(`Updated scanner “${name}”.`)
      }
      setScannerModal(null)
      await load()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Failed to save scanner.')
    } finally {
      setBusy(null)
    }
  }

  async function toggleScanner(scanner: Scanner) {
    setBusy(`scanner:${scanner.id}`)
    setNotice('')
    try {
      const response = await api(`/api/admin/scanners/${scanner.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !scanner.enabled }) })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Could not update scanner.')
      await load()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Failed to update scanner.')
    } finally {
      setBusy(null)
    }
  }

  async function removeScanner(scanner: Scanner) {
    if (!window.confirm(`Delete scanner “${scanner.name}” and all of its sources and memberships? This cannot be undone.`)) return
    setBusy(`scanner:${scanner.id}`)
    setNotice('')
    try {
      const response = await api(`/api/admin/scanners/${scanner.id}`, { method: 'DELETE' })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json.error || 'Could not delete scanner.')
      setNotice(`Deleted scanner “${scanner.name}”.`)
      if (activeScannerId === scanner.id) setActiveScannerId(null)
      await load()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Failed to delete scanner.')
    } finally {
      setBusy(null)
    }
  }

  function openAddPrompt() {
    setPromptForm({ title: '', description: '', instruction: '', enabled: true })
    setPromptModal({ mode: 'add' })
  }

  function openEditPrompt(prompt: PromptRow) {
    setPromptForm({ title: prompt.title, description: prompt.description ?? '', instruction: prompt.instruction, enabled: prompt.enabled })
    setPromptModal({ mode: 'edit', id: prompt.id })
  }

  async function savePrompt() {
    if (!promptModal) return
    const title = promptForm.title.trim()
    if (!title) {
      setNotice('A prompt title is required.')
      return
    }
    setBusy('prompt')
    setNotice('')
    try {
      const payload = { title, description: promptForm.description.trim(), instruction: promptForm.instruction.trim(), enabled: promptForm.enabled }
      const path = promptModal.mode === 'add' ? '/api/admin/prompts' : `/api/admin/prompts/${promptModal.id}`
      const response = await api(path, { method: promptModal.mode === 'add' ? 'POST' : 'PATCH', body: JSON.stringify(payload) })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Could not save the prompt.')
      setNotice(`${promptModal.mode === 'add' ? 'Created' : 'Updated'} prompt “${title}”.`)
      setPromptModal(null)
      await load()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Failed to save the prompt.')
    } finally {
      setBusy(null)
    }
  }

  async function togglePrompt(prompt: PromptRow) {
    setBusy(`prompt:${prompt.id}`)
    setNotice('')
    try {
      const response = await api(`/api/admin/prompts/${prompt.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !prompt.enabled }) })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Could not update the prompt.')
      await load()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Failed to update the prompt.')
    } finally {
      setBusy(null)
    }
  }

  async function removePrompt(prompt: PromptRow) {
    if (prompt.builtin) return
    if (!window.confirm(`Delete prompt “${prompt.title}”? This cannot be undone.`)) return
    setBusy(`prompt:${prompt.id}`)
    setNotice('')
    try {
      const response = await api(`/api/admin/prompts/${prompt.id}`, { method: 'DELETE' })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json.error || 'Could not delete the prompt.')
      setNotice(`Deleted prompt “${prompt.title}”.`)
      await load()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Failed to delete the prompt.')
    } finally {
      setBusy(null)
    }
  }

  async function movePrompt(prompt: PromptRow, direction: -1 | 1) {
    const index = prompts.findIndex((item) => item.id === prompt.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= prompts.length) return
    const next = [...prompts]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    setPrompts(next)
    setBusy('prompt:reorder')
    setNotice('')
    try {
      const response = await api('/api/admin/prompts/reorder', { method: 'POST', body: JSON.stringify({ ids: next.map((item) => item.id) }) })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Could not reorder prompts.')
      setPrompts(json.prompts ?? next)
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Failed to reorder prompts.')
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050b14] px-4 text-slate-300">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-center gap-2 text-white">
            <ShieldAlert className="size-5 text-sky-400" />
            <h1 className="text-base font-semibold">Admin access</h1>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Enter the <code className="text-slate-300">ADMIN_SECRET</code> configured on the server. It is stored only in this browser.
          </p>
          <form
            className="mt-5 space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              window.localStorage.setItem(SECRET_KEY, secret)
              void load()
            }}
          >
            <input
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="ADMIN_SECRET"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-500"
            />
            {authError && <p className="text-xs text-rose-300">{authError}</p>}
            <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Unlock
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#050b14] text-slate-300">
      <header className="sticky top-0 z-20 border-b border-[#122238] bg-[#071120]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1720px] items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-tr from-sky-600 to-emerald-500 text-lg font-bold text-white">Q</span>
            <span>
              <b className="block text-base tracking-tight text-white">Q-Scan Admin</b>
              <small className="text-[12px] text-slate-400">Scanner ingestion & scheduler</small>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a href="/" className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5 hover:text-white">Public site</a>
            <button onClick={() => load()} className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5">
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1720px] gap-4 px-4 py-4 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = activeNav === item.label
            return (
              <button
                key={item.label}
                onClick={() => setActiveNav(item.label)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${active ? 'bg-sky-500/15 text-white' : 'text-slate-400 hover:bg-white/5'}`}
              >
                <Icon className="size-4" /> {item.label}
              </button>
            )
          })}
        </aside>

        <section className="min-w-0 space-y-4">
          {error && <div className="rounded-lg border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200">{error}</div>}

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Scanners" value={String(summary?.scanners ?? scanners.length)} detail="canonical + custom" tone="text-sky-400" />
            <Stat label="Stocks in database" value={String(summary?.stocks ?? stocks.length)} detail="persisted Stock rows" tone="text-emerald-300" />
            <Stat label="Last run" value={summary?.lastRun ? summary.lastRun.status : 'never'} detail={when(summary?.lastRun?.startedAt ?? null)} tone="text-amber-300" />
          </div>

          {notice && <div className="rounded-lg border border-sky-400/20 bg-sky-400/10 p-3 text-xs text-sky-200">{notice}</div>}

          {activeNav === 'Scanner Management' && (
            <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
              <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
                <button onClick={openAddScanner} className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-300 hover:bg-sky-500/20">
                  <Plus className="size-3.5" /> Add New Scanner
                </button>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-600" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search scanners" className="w-full rounded-lg border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-xs text-slate-200 outline-none" />
                </div>
                <div className="space-y-1">
                  {filteredScanners.map((scanner) => (
                    <button
                      key={scanner.id}
                      onClick={() => { setActiveScannerId(scanner.id); setPreview(null) }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs ${selected?.id === scanner.id ? 'bg-sky-500/15 text-white' : 'text-slate-400 hover:bg-white/5'}`}
                    >
                      <span className="min-w-0 truncate">{scanner.name}</span>
                      <span className="ml-2 shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[12px]">{scanner.memberCount} / {scanner.sources.length}</span>
                    </button>
                  ))}
                  {!filteredScanners.length && <p className="px-3 py-4 text-xs text-slate-600">No scanners yet.</p>}
                </div>
              </section>

              <section className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                {!selected ? (
                  <p className="p-6 text-xs text-slate-600">Select a scanner.</p>
                ) : (
                  <>
                    <div className="flex flex-col justify-between gap-3 border-b border-white/[0.07] p-5 sm:flex-row sm:items-start">
                      <div>
                        <h2 className="text-lg font-semibold text-white">{selected.name}</h2>
                        <p className="mt-1 text-xs text-slate-500">{selected.description}</p>
                        <p className="mt-2 text-[13px] text-slate-600">{selected.category} · {selected.memberCount} persisted member(s) · {selected.sources.length} source(s)</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {!selected.enabled && <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[12px] text-amber-300">disabled</span>}
                        <button onClick={() => openEditScanner(selected)} disabled={busy === 'scanner'} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
                          <Pencil className="size-3.5" /> Edit
                        </button>
                        <button onClick={() => toggleScanner(selected)} disabled={busy === `scanner:${selected.id}`} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
                          {busy === `scanner:${selected.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />} {selected.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button onClick={() => removeScanner(selected)} disabled={busy === `scanner:${selected.id}`} className="flex items-center gap-1.5 rounded-lg border border-rose-400/20 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10">
                          <Trash2 className="size-3.5" /> Delete
                        </button>
                        <button onClick={() => { setShowAdd(true); setAddUrl('') }} className="flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-300">
                          <Plus className="size-3.5" /> Add source link
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto p-4">
                      {selected.sources.length ? (
                        <table className="w-full min-w-[865px] text-left text-xs">
                          <thead className="text-[12px] uppercase tracking-wider text-slate-600">
                            <tr>
                              <th className="pb-3">Source</th>
                              <th className="pb-3">Type</th>
                              <th className="pb-3">Last run</th>
                              <th className="pb-3">Members</th>
                              <th className="pb-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.06]">
                            {selected.sources.map((source) => (
                              <tr key={source.id} className="align-top">
                                <td className="max-w-[280px] py-3">
                                  <a href={source.url} target="_blank" rel="noreferrer" className="block truncate text-sky-300 hover:underline" title={source.url}>{source.url}</a>
                                  <span className="text-[12px] text-slate-600">{source.pipelineMode === 'LIST_AND_FUNDAMENTALS' ? 'List + fundamentals' : 'List only'}{source.enabled ? '' : ' · disabled'}</span>
                                </td>
                                <td className="py-3 text-slate-400">{source.kindLabel}</td>
                                <td className="py-3">
                                  {source.lastRun ? (
                                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[12px] ${statusTone[source.lastRun.status] ?? ''}`}>{source.lastRun.status}</span>
                                  ) : (
                                    <span className="text-[12px] text-slate-600">never run</span>
                                  )}
                                </td>
                                <td className="py-3 text-slate-300">{source.lastRun?.itemsFound ?? '—'}</td>
                                <td className="py-3">
                                  <div className="flex justify-end gap-1.5">
                                    <button onClick={() => testSource(source)} disabled={busy === `test:${source.id}`} className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[13px] text-slate-300 hover:bg-white/5">
                                      {busy === `test:${source.id}` ? <Loader2 className="size-3 animate-spin" /> : <Beaker className="size-3" />} Test
                                    </button>
                                    <button onClick={() => importSource(source)} disabled={busy === `import:${source.id}`} className="flex items-center gap-1 rounded-md border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[13px] text-sky-300">
                                      {busy === `import:${source.id}` ? <Loader2 className="size-3 animate-spin" /> : <Database className="size-3" />} Import
                                    </button>
                                    <button onClick={() => toggleSource(source)} disabled={busy === `toggle:${source.id}`} className="rounded-md border border-white/10 px-2 py-1 text-[13px] text-slate-300 hover:bg-white/5">
                                      {source.enabled ? 'Disable' : 'Enable'}
                                    </button>
                                    <button onClick={() => deleteSource(source)} disabled={busy === `delete:${source.id}`} className="rounded-md border border-rose-400/20 px-2 py-1 text-[13px] text-rose-300 hover:bg-rose-500/10">
                                      <Trash2 className="size-3" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="py-4 text-xs text-slate-600">No source links yet. Add a screener.in screen/market link or a Chartink scan.</p>
                      )}
                    </div>

                    {preview && (
                      <div className="mx-4 mb-4 rounded-xl border border-white/[0.08] bg-black/20 p-4">
                        <div className="flex items-center justify-between">
                          <h3 className="flex items-center gap-2 text-xs font-semibold text-white"><Beaker className="size-3.5 text-sky-400" /> Preview {preview.kindLabel ? `· ${preview.kindLabel}` : ''}</h3>
                          <button onClick={() => setPreview(null)} className="text-slate-500 hover:text-white"><X className="size-3.5" /></button>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">{preview.message}</p>
                        {preview.warnings.map((warning) => (
                          <p key={warning} className="mt-1 text-[13px] text-amber-300">⚠ {warning}</p>
                        ))}
                        {preview.rows.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {preview.rows.slice(0, 40).map((row) => (
                              <span key={row.symbol} className="rounded border border-white/10 bg-black/30 px-2 py-0.5 text-[12px] text-slate-300" title={row.companyName ?? ''}>{row.symbol}</span>
                            ))}
                            {preview.symbolCount > 40 && <span className="text-[12px] text-slate-600">+{preview.symbolCount - 40} more</span>}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          )}

          {activeNav === 'Copy Data Prompts' && (
            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
              <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <h2 className="text-sm font-semibold text-white">Copy Data Prompts ({prompts.length})</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Controls the “Copy Data” dropdown on public stock pages. Enabled prompts appear in the order below; edits go live without a redeploy.
                  </p>
                </div>
                <button onClick={openAddPrompt} className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-300 hover:bg-sky-500/20">
                  <Plus className="size-3.5" /> Add Prompt
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-xs">
                  <thead className="text-[12px] uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="pb-3">Title</th>
                      <th className="pb-3">Description</th>
                      <th className="pb-3">Instruction</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {prompts.map((prompt, index) => (
                      <tr key={prompt.id} className="align-top">
                        <td className="max-w-[240px] py-3">
                          <span className="flex items-center gap-2 font-medium text-slate-100">
                            {prompt.title}
                            {prompt.builtin && <span className="rounded-full border border-cyan-700/50 px-1.5 py-0.5 text-[10px] text-cyan-400">built-in</span>}
                          </span>
                          <span className="text-[12px] text-slate-600">{prompt.key}</span>
                        </td>
                        <td className="max-w-[220px] py-3 text-slate-400">{prompt.description ?? '—'}</td>
                        <td className="max-w-[260px] py-3 text-[12px] text-slate-500">
                          {prompt.instruction ? <span className="line-clamp-2">{prompt.instruction}</span> : <span className="italic text-slate-600">data only (no instruction)</span>}
                        </td>
                        <td className="py-3">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[12px] ${prompt.enabled ? 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20' : 'text-slate-400 bg-white/5 border-white/10'}`}>
                            {prompt.enabled ? 'enabled' : 'disabled'}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => movePrompt(prompt, -1)} disabled={index === 0 || busy === 'prompt:reorder'} title="Move up" className="rounded-md border border-white/10 p-1.5 text-slate-400 hover:bg-white/5 disabled:opacity-30">
                              <ArrowUp className="size-3" />
                            </button>
                            <button onClick={() => movePrompt(prompt, 1)} disabled={index === prompts.length - 1 || busy === 'prompt:reorder'} title="Move down" className="rounded-md border border-white/10 p-1.5 text-slate-400 hover:bg-white/5 disabled:opacity-30">
                              <ArrowDown className="size-3" />
                            </button>
                            <button onClick={() => setPromptPreview(prompt)} title="Preview" className="rounded-md border border-white/10 p-1.5 text-slate-400 hover:bg-white/5">
                              <Eye className="size-3" />
                            </button>
                            <button onClick={() => openEditPrompt(prompt)} className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[13px] text-slate-300 hover:bg-white/5">
                              <Pencil className="size-3" /> Edit
                            </button>
                            <button onClick={() => togglePrompt(prompt)} disabled={busy === `prompt:${prompt.id}`} className="rounded-md border border-white/10 px-2 py-1 text-[13px] text-slate-300 hover:bg-white/5">
                              {busy === `prompt:${prompt.id}` ? <Loader2 className="size-3 animate-spin" /> : prompt.enabled ? 'Disable' : 'Enable'}
                            </button>
                            <button onClick={() => removePrompt(prompt)} disabled={prompt.builtin || busy === `prompt:${prompt.id}`} title={prompt.builtin ? 'Built-in prompts cannot be deleted' : 'Delete'} className="rounded-md border border-rose-400/20 px-2 py-1 text-[13px] text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-30">
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!prompts.length && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-600">No prompts yet. They are seeded automatically on first load.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeNav === 'View Stocks (DB)' && (
            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
              <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <h2 className="text-sm font-semibold text-white">Persisted stocks ({stocks.length})</h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-600" />
                  <input value={stockQuery} onChange={(event) => setStockQuery(event.target.value)} placeholder="Filter symbol or name" className="w-full rounded-lg border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-xs text-slate-200 outline-none sm:w-64" />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[910px] text-left text-xs">
                  <thead className="text-[12px] uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="pb-3">Symbol</th>
                      <th className="pb-3">Company</th>
                      <th className="pb-3">Mkt Cap</th>
                      <th className="pb-3">P/E</th>
                      <th className="pb-3">ROCE</th>
                      <th className="pb-3">ROE</th>
                      <th className="pb-3">Captured</th>
                      <th className="pb-3">Scanners</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {stocks
                      .filter((stock) => {
                        const q = stockQuery.trim().toLowerCase()
                        if (!q) return true
                        return stock.symbol.toLowerCase().includes(q) || (stock.companyName ?? '').toLowerCase().includes(q)
                      })
                      .map((stock) => (
                        <tr key={stock.symbol}>
                          <td className="py-2.5"><a href={`/stocks/${encodeURIComponent(stock.symbol)}`} className="text-sky-300 hover:underline">{stock.symbol}</a></td>
                          <td className="py-2.5 text-slate-400">{stock.companyName ?? '—'}</td>
                          <td className="py-2.5 text-slate-300">{n(stock.marketCap)}</td>
                          <td className="py-2.5 text-slate-300">{n(stock.pe)}</td>
                          <td className="py-2.5 text-slate-300">{n(stock.roce, '%')}</td>
                          <td className="py-2.5 text-slate-300">{n(stock.roe, '%')}</td>
                          <td className="py-2.5 text-[12px] text-slate-500">{when(stock.capturedAt)}</td>
                          <td className="py-2.5 text-[12px] text-slate-500">{stock.scanners.join(', ') || '—'}</td>
                        </tr>
                      ))}
                    {!stocks.length && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-600">No stocks persisted yet. Import a source to populate the database.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeNav === 'Fetch Logs' && (
            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
              <h2 className="mb-3 text-sm font-semibold text-white">Fetch runs ({runs.length})</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[985px] text-left text-xs">
                  <thead className="text-[12px] uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="pb-3">Started</th>
                      <th className="pb-3">Scanner</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Found</th>
                      <th className="pb-3">New</th>
                      <th className="pb-3">Updated</th>
                      <th className="pb-3">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {runs.map((run) => (
                      <tr key={run.id}>
                        <td className="py-2.5 text-[12px] text-slate-500">{when(run.startedAt)}</td>
                        <td className="py-2.5 text-slate-300">{run.scanner}</td>
                        <td className="py-2.5"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[12px] ${statusTone[run.status] ?? ''}`}>{run.status}</span></td>
                        <td className="py-2.5 text-slate-300">{run.itemsFound}</td>
                        <td className="py-2.5 text-slate-300">{run.itemsCreated}</td>
                        <td className="py-2.5 text-slate-300">{run.itemsUpdated}</td>
                        <td className="max-w-[320px] truncate py-2.5 text-[12px] text-slate-500" title={run.errorSummary ?? ''}>{run.errorSummary ?? '—'}</td>
                      </tr>
                    ))}
                    {!runs.length && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-600">No fetch runs recorded yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeNav === 'System Settings' && (
            <section className="space-y-4">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Activity className="size-4 text-emerald-400" /> Environment</h2>
                <div className="mt-3 grid gap-2 text-xs text-slate-400">
                  <p>Admin API: <span className="text-emerald-300">protected by ADMIN_SECRET</span> — this browser is authorized.</p>
                  <p>Scheduler: <code className="text-slate-300">GET /api/cron/fetch</code> protected by CRON_SECRET (Vercel Cron every 6h, see vercel.json).</p>
                  <p>Screener credentials: set <code className="text-slate-300">SCREENER_EMAIL</code> / <code className="text-slate-300">SCREENER_PASSWORD</code> to fetch login-gated screens.</p>
                </div>
                <button
                  onClick={() => { window.localStorage.removeItem(SECRET_KEY); setSecret(''); setAuthorized(false) }}
                  className="mt-4 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
                >
                  Forget saved secret
                </button>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Star className="size-4 text-amber-300" /> Suggested public screens</h2>
                <p className="mt-1 text-xs text-slate-500">Verified screener.in screens, ready to attach to any scanner via “Add source link”.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTIONS.map(([label, url]) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-[13px] text-slate-300 hover:border-sky-400/30 hover:text-white">{label}</a>
                  ))}
                </div>
              </div>
            </section>
          )}

          <p className="flex items-center gap-1.5 text-[13px] text-slate-600"><Clock3 className="size-3" /> Data is read from the database; nothing on this page is fabricated.</p>
        </section>
      </div>

      {showAdd && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b1420] p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-white">Add source link</h2>
                <p className="mt-1 text-xs text-slate-500">Attach a screener.in or Chartink URL to “{selected.name}”.</p>
              </div>
              <button onClick={() => setShowAdd(false)} className="rounded-lg p-1 text-slate-500" aria-label="Close"><X className="size-4" /></button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block text-xs text-slate-300">
                Source URL
                <input value={addUrl} onChange={(event) => setAddUrl(event.target.value)} placeholder="https://www.screener.in/screens/..." className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none" />
              </label>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map(([label, url]) => (
                  <button key={url} onClick={() => setAddUrl(url)} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1 text-[13px] text-slate-400 hover:text-white">{label}</button>
                ))}
              </div>
              <label className="block text-xs text-slate-300">
                Pipeline mode
                <select value={addMode} onChange={(event) => setAddMode(event.target.value as typeof addMode)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none">
                  <option value="LIST_ONLY">Stock list only (fast)</option>
                  <option value="LIST_AND_FUNDAMENTALS">Stock list + fundamentals (slower)</option>
                </select>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">Cancel</button>
              <button onClick={addSource} disabled={!addUrl.trim() || busy === 'add'} className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                {busy === 'add' ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add source
              </button>
            </div>
          </div>
        </div>
      )}

      {scannerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b1420] p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-white">{scannerModal.mode === 'add' ? 'Add new scanner' : 'Edit scanner'}</h2>
                <p className="mt-1 text-xs text-slate-500">{scannerModal.mode === 'add' ? 'Create a scanner, then attach source URLs to it.' : 'Update this scanner\u2019s details and status.'}</p>
              </div>
              <button onClick={() => setScannerModal(null)} className="rounded-lg p-1 text-slate-500" aria-label="Close"><X className="size-4" /></button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block text-xs text-slate-300">
                Scanner name
                <input value={scannerForm.name} onChange={(event) => setScannerForm((form) => ({ ...form, name: event.target.value }))} placeholder="e.g. Momentum Leaders" className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none" />
              </label>
              <label className="block text-xs text-slate-300">
                Category
                <input value={scannerForm.category} onChange={(event) => setScannerForm((form) => ({ ...form, category: event.target.value }))} placeholder="Custom" className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none" />
              </label>
              <label className="block text-xs text-slate-300">
                Description
                <textarea value={scannerForm.description} onChange={(event) => setScannerForm((form) => ({ ...form, description: event.target.value }))} rows={2} placeholder="What this scanner tracks" className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none" />
              </label>
              {scannerModal.mode === 'add' && (
                <label className="block text-xs text-slate-300">
                  Source URLs <span className="text-slate-600">(optional, one per line)</span>
                  <textarea value={scannerForm.urls} onChange={(event) => setScannerForm((form) => ({ ...form, urls: event.target.value }))} rows={3} placeholder="https://www.screener.in/screens/..." className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-xs text-white outline-none" />
                </label>
              )}
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={scannerForm.enabled} onChange={(event) => setScannerForm((form) => ({ ...form, enabled: event.target.checked }))} className="size-4 rounded border-white/20 bg-black/20" />
                Enabled
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setScannerModal(null)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">Cancel</button>
              <button onClick={saveScanner} disabled={!scannerForm.name.trim() || busy === 'scanner'} className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                {busy === 'scanner' ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} {scannerModal.mode === 'add' ? 'Create scanner' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {promptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b1420] p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-white"><MessageSquareText className="size-4 text-sky-400" /> {promptModal.mode === 'add' ? 'Add prompt' : 'Edit prompt'}</h2>
                <p className="mt-1 text-xs text-slate-500">This instruction is appended below the copied stock data so one paste gives an AI the full context.</p>
              </div>
              <button onClick={() => setPromptModal(null)} className="rounded-lg p-1 text-slate-500" aria-label="Close"><X className="size-4" /></button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block text-xs text-slate-300">
                Title
                <input value={promptForm.title} onChange={(event) => setPromptForm((form) => ({ ...form, title: event.target.value }))} maxLength={80} placeholder="e.g. Multibagger Research" className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none" />
              </label>
              <label className="block text-xs text-slate-300">
                Description <span className="text-slate-600">(shown under the option)</span>
                <input value={promptForm.description} onChange={(event) => setPromptForm((form) => ({ ...form, description: event.target.value }))} maxLength={200} placeholder="Long-term growth potential and triggers" className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none" />
              </label>
              <label className="block text-xs text-slate-300">
                Instruction <span className="text-slate-600">({promptForm.instruction.length}/8000)</span>
                <textarea value={promptForm.instruction} onChange={(event) => setPromptForm((form) => ({ ...form, instruction: event.target.value }))} maxLength={8000} rows={9} placeholder="Ask the AI to analyse the pasted data…" className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 font-mono text-xs text-white outline-none" />
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={promptForm.enabled} onChange={(event) => setPromptForm((form) => ({ ...form, enabled: event.target.checked }))} className="size-4 rounded border-white/20 bg-black/20" />
                Enabled (visible in the public dropdown)
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setPromptModal(null)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">Cancel</button>
              <button onClick={savePrompt} disabled={!promptForm.title.trim() || busy === 'prompt'} className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                {busy === 'prompt' ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} {promptModal.mode === 'add' ? 'Create prompt' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {promptPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b1420] p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-white"><Eye className="size-4 text-sky-400" /> Preview · {promptPreview.title}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {promptPreview.instruction ? 'The selected option copies the stock data plus this prompt:' : 'This option copies stock data only — no prompt is appended.'}
                </p>
              </div>
              <button onClick={() => setPromptPreview(null)} className="rounded-lg p-1 text-slate-500" aria-label="Close"><X className="size-4" /></button>
            </div>
            <pre className="mt-4 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-4 text-[12px] leading-relaxed text-slate-300">
              {appendPromptToMarkdown(PROMPT_PREVIEW_SAMPLE, promptPreview)}
            </pre>
          </div>
        </div>
      )}
    </main>
  )
}

function Stat({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className={`mt-1 text-[13px] ${tone}`}>{detail}</p>
    </div>
  )
}
