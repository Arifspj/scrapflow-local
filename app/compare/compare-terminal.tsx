'use client'

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  MAX_STOCKS,
  METRIC_CATEGORIES,
  TOTAL_METRICS,
  formatMetric,
  type MetricDef,
  type MetricFormat,
  type UniverseRow,
} from './kpi-taxonomy'
import { ComparisonVisualizations } from './comparison-visuals'

type ViewMode = 'table' | 'radar' | 'matrix'

type Toast = { id: number; message: string }

type SelectedStock = { symbol: string; name: string; ltp: number | null; values: Record<string, number | null> }

type PeerSuggestion = { symbol: string; companyName: string; exchange: string | null }

const VIEWS: { id: ViewMode; label: string; ready: boolean }[] = [
  { id: 'table', label: 'Detailed Table', ready: true },
  { id: 'radar', label: 'Spider Radar', ready: true },
  { id: 'matrix', label: 'Valuation Matrix', ready: true },
]

function ViewIcon({ id }: { id: ViewMode }) {
  if (id === 'table') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="1.5" />
        <path d="M3 9h18M9 9v11" />
      </svg>
    )
  }
  if (id === 'radar') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
        <path d="M12 3 21 9l-3.4 10H6.4L3 9z" />
        <path d="M12 7.5 17 10.7l-1.9 5.5H8.9L7 10.7z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1" />
    </svg>
  )
}

const ICON_BTN =
  'inline-flex items-center justify-center rounded-md border border-[#1e3352] bg-[#0b1626] p-1.5 text-slate-400 transition hover:border-sky-500/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50'

type CompareTerminalProps = {
  universe: UniverseRow[]
  scanners: string[]
  activeScanner: string
  initialSelection: string[]
}

export function CompareTerminal({ universe, scanners, activeScanner, initialSelection }: CompareTerminalProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>(initialSelection)
  const [filter, setFilter] = useState('')
  const [scanner, setScanner] = useState(activeScanner)
  const [openCats, setOpenCats] = useState<string[]>(METRIC_CATEGORIES.map((category) => category.id))
  const [highlight, setHighlight] = useState(true)
  const [view, setView] = useState<ViewMode>('table')
  const [peerQuery, setPeerQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<number | null>(null)
  const [returns, setReturns] = useState<Record<string, number | null>>({})
  const returnsRef = useRef<Record<string, number | null>>({})
  const [extraRows, setExtraRows] = useState<Record<string, UniverseRow>>({})
  const [peerResults, setPeerResults] = useState<PeerSuggestion[]>([])
  const [peerOpen, setPeerOpen] = useState(false)
  const [peerActive, setPeerActive] = useState(-1)
  const [peerLoading, setPeerLoading] = useState(false)
  const [peerFailed, setPeerFailed] = useState(false)
  const [addingSymbol, setAddingSymbol] = useState<string | null>(null)
  const peerListId = useId()
  const searchRef = useRef<HTMLDivElement>(null)

  const bySymbol = useMemo(() => {
    const map = new Map(universe.map((stock) => [stock.symbol, stock]))
    for (const [symbol, row] of Object.entries(extraRows)) map.set(symbol, row)
    return map
  }, [universe, extraRows])

  // 1-year return isn't part of the persisted summary, so derive it from the
  // same 1Y close-to-close history the detail-page chart plots. Fetched lazily
  // per selected symbol; unavailable tickers stay `null` and render as "—".
  useEffect(() => {
    const controller = new AbortController()
    const pending = selected.filter((symbol) => !(symbol in returnsRef.current))
    if (pending.length === 0) return

    void (async () => {
      for (const symbol of pending) {
        let value: number | null = null
        try {
          const response = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/history?interval=1d&range=1y`, {
            signal: controller.signal,
          })
          const body = (await response.json()) as { ok?: boolean; points?: { close: number }[] }
          const points = body.points ?? []
          const first = points[0]?.close
          const last = points[points.length - 1]?.close
          if (response.ok && body.ok && points.length >= 2 && Number.isFinite(first) && Number.isFinite(last) && first > 0) {
            value = Math.round(((last - first) / first) * 1000) / 10
          }
        } catch (error) {
          if ((error as { name?: string })?.name === 'AbortError') return
          value = null
        }
        if (controller.signal.aborted) return
        returnsRef.current[symbol] = value
        setReturns({ ...returnsRef.current })
      }
    })()

    return () => controller.abort()
  }, [selected])

  const valuesFor = useMemo(
    () =>
      (symbol: string): Record<string, number | null> => {
        const base = bySymbol.get(symbol)?.values ?? {}
        return symbol in returns ? { ...base, return1y: returns[symbol] } : base
      },
    [bySymbol, returns],
  )

  // Header search mirrors the detail-page search: it hits the same read-only
  // `/api/stocks/search` (the whole stock table, not just this scanner) so any
  // listed company can be pulled into the comparison.
  useEffect(() => {
    const query = peerQuery.trim()
    if (query.length < 2) {
      setPeerResults([])
      setPeerLoading(false)
      setPeerFailed(false)
      setPeerOpen(false)
      setPeerActive(-1)
      return
    }

    const controller = new AbortController()
    setPeerLoading(true)
    setPeerFailed(false)

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        const body = (await response.json().catch(() => null)) as { results?: PeerSuggestion[] } | null
        if (controller.signal.aborted) return
        setPeerResults(Array.isArray(body?.results) ? body.results : [])
        setPeerFailed(!response.ok)
        setPeerActive(-1)
        setPeerOpen(true)
      } catch (error) {
        if (controller.signal.aborted || (error as { name?: string })?.name === 'AbortError') return
        setPeerResults([])
        setPeerFailed(true)
        setPeerOpen(true)
      } finally {
        if (!controller.signal.aborted) setPeerLoading(false)
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [peerQuery])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!searchRef.current?.contains(event.target as Node)) {
        setPeerOpen(false)
        setPeerActive(-1)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  function notify(message: string) {
    const id = Date.now()
    setToast({ id, message })
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2400)
  }

  function changeScanner(value: string) {
    if (!value || value === scanner) return
    setScanner(value)
    router.push(`/compare?scanner=${encodeURIComponent(value)}`)
  }

  const selectedStocks = useMemo<SelectedStock[]>(
    () =>
      selected
        .map((symbol) => bySymbol.get(symbol))
        .filter((stock): stock is UniverseRow => stock != null)
        .map((stock) => ({ symbol: stock.symbol, name: stock.name, ltp: stock.ltp, values: valuesFor(stock.symbol) })),
    [selected, bySymbol, valuesFor],
  )

  const filteredUniverse = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return universe
    return universe.filter((stock) => stock.symbol.toLowerCase().includes(query) || stock.name.toLowerCase().includes(query))
  }, [filter, universe])

  const peerSuggestions = useMemo(
    () => peerResults.filter((item) => !selected.includes(item.symbol)).slice(0, 8),
    [peerResults, selected],
  )

  async function ensureRow(symbol: string): Promise<boolean> {
    if (bySymbol.has(symbol)) return true
    setAddingSymbol(symbol)
    try {
      const response = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/compare`)
      const body = (await response.json().catch(() => null)) as { ok?: boolean; row?: UniverseRow } | null
      if (response.ok && body?.ok && body.row) {
        const row = body.row
        setExtraRows((current) => ({ ...current, [symbol]: row }))
        return true
      }
      notify(`No metrics available for ${symbol}.`)
      return false
    } catch {
      notify('Could not load that stock right now.')
      return false
    } finally {
      setAddingSymbol(null)
    }
  }

  async function addStock(rawSymbol: string) {
    const symbol = rawSymbol.trim().toUpperCase()
    if (selected.includes(symbol)) {
      notify(`${symbol} is already in the comparison.`)
      return
    }
    if (selected.length >= MAX_STOCKS) {
      notify(`Maximum ${MAX_STOCKS} stocks — remove one first.`)
      return
    }
    const ready = await ensureRow(symbol)
    if (!ready) return
    setSelected((current) => (current.includes(symbol) ? current : [...current, symbol]))
    setPeerQuery('')
    setPeerResults([])
    setPeerOpen(false)
    setPeerActive(-1)
  }

  function handlePeerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      if (!peerSuggestions.length) return
      event.preventDefault()
      setPeerOpen(true)
      setPeerActive((current) => (current + 1 >= peerSuggestions.length ? 0 : current + 1))
    } else if (event.key === 'ArrowUp') {
      if (!peerSuggestions.length) return
      event.preventDefault()
      setPeerActive((current) => (current - 1 < 0 ? peerSuggestions.length - 1 : current - 1))
    } else if (event.key === 'Enter') {
      const pick = peerActive >= 0 ? peerSuggestions[peerActive] : undefined
      if (pick) {
        event.preventDefault()
        void addStock(pick.symbol)
      }
    } else if (event.key === 'Escape') {
      setPeerOpen(false)
      setPeerActive(-1)
    }
  }

  function toggleStock(symbol: string) {
    if (!selected.includes(symbol)) {
      void addStock(symbol)
      return
    }
    if (symbol === selected[0]) {
      notify('The anchor stock cannot be removed.')
      return
    }
    if (selected.length <= 1) {
      notify('Keep at least one stock in the comparison.')
      return
    }
    setSelected((current) => current.filter((item) => item !== symbol))
  }

  function setAnchor(symbol: string) {
    setSelected((current) => {
      if (!current.includes(symbol)) return [symbol, ...current].slice(0, MAX_STOCKS)
      return [symbol, ...current.filter((item) => item !== symbol)]
    })
    notify(`${symbol} is now the anchor column.`)
  }

  function resetAll() {
    setSelected(initialSelection)
    setOpenCats(METRIC_CATEGORIES.map((category) => category.id))
    setHighlight(true)
    setView('table')
    setFilter('')
    setPeerQuery('')
    notify('Reset to the top-ranked defaults.')
  }

  function toggleCat(id: string) {
    setOpenCats((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  async function share() {
    const url = `${window.location.origin}/compare?scanner=${encodeURIComponent(scanner)}&symbols=${selected.join(',')}`
    try {
      await navigator.clipboard.writeText(url)
      notify('Permalink copied to clipboard.')
    } catch {
      notify('Copy failed.')
    }
  }

  function exportCsv() {
    const escape = (cell: string) => `"${cell.replace(/"/g, '""')}"`
    const rows: string[][] = [['Category', 'Metric', 'Direction', ...selected]]
    for (const category of METRIC_CATEGORIES) {
      for (const metric of category.metrics) {
        rows.push([
          `${category.code} · ${category.title}`,
          metric.label,
          metric.direction,
          ...selected.map((symbol) => formatMetric(valuesFor(symbol)[metric.id] ?? null, metric.format)),
        ])
      }
    }
    const csv = [`# ${scanner} — Q-Scan compare export`, ...rows.map((row) => row.map(escape).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `q-scan-compare-${selected.join('-')}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
    notify('Exported the comparison as CSV.')
  }

  function extremes(metric: MetricDef): { best: number | null; worst: number | null } {
    if (metric.direction === 'none') return { best: null, worst: null }
    const values = selectedStocks
      .map((stock) => stock.values[metric.id] ?? null)
      .filter((value): value is number => value != null && Number.isFinite(value))
    if (values.length < 2) return { best: null, worst: null }
    const best = metric.direction === 'higher' ? Math.max(...values) : Math.min(...values)
    const worst = metric.direction === 'higher' ? Math.min(...values) : Math.max(...values)
    if (best === worst) return { best: null, worst: null }
    return { best, worst }
  }

  const columns = selectedStocks.length
  const hasAddColumn = columns < MAX_STOCKS
  const gridTemplate = `minmax(190px, 1.5fr) repeat(${columns}, minmax(92px, 1fr))${hasAddColumn ? ' minmax(92px, 1fr)' : ''}`

  return (
    <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="rounded-lg border border-[#1e3a5f] bg-[#0b1626] px-4 py-2 text-xs font-medium text-slate-200 shadow-xl shadow-black/50">
            {toast.message}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[288px_1fr] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen((current) => !current)}
          aria-expanded={sidebarOpen}
          className="flex items-center justify-between rounded-xl border border-[#162844] bg-[#091527] px-4 py-3 text-xs font-semibold text-slate-200 lg:hidden"
        >
          <span>Stock universe &amp; filters</span>
          <span className="flex items-center gap-2 text-slate-500">
            {columns} selected
            <span className={`transition ${sidebarOpen ? 'rotate-180' : ''}`} aria-hidden>
              ▾
            </span>
          </span>
        </button>

        <div className={`${sidebarOpen ? 'block' : 'hidden'} lg:block`}>
          <UniverseSidebar
            scanner={scanner}
            scanners={scanners}
            onScanner={changeScanner}
            filter={filter}
            onFilter={setFilter}
            stocks={filteredUniverse}
            selected={selected}
            onToggle={toggleStock}
          />
        </div>

        <div className="min-w-0 space-y-4 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-4 lg:space-y-0">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-slate-400 lg:shrink-0">
            <Link href="/" className="rounded px-1 py-0.5 uppercase tracking-wide hover:text-sky-300">
              Scanners
            </Link>
            <span aria-hidden="true" className="text-slate-600">
              ›
            </span>
            <span className="rounded px-1 py-0.5 uppercase tracking-wide text-slate-500">Undervalued</span>
            <span aria-hidden="true" className="text-slate-600">
              ›
            </span>
            <span className="rounded px-1 py-0.5 font-semibold uppercase tracking-wide text-slate-200">
              Multi-Stock Spread Terminal
            </span>
          </nav>

          <section className="rounded-xl border border-[#162844] bg-[#091527] p-3 lg:shrink-0">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#1b273e] bg-[#0d1424] p-2.5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-sky-700/40 bg-[#10233e] text-sky-300">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
                    <path d="M12 3v18" />
                    <path d="m3 9 4-3 5 3 5-3 4 3" />
                    <path d="m3 15 4 3 5-3 5 3 4-3" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <h1 className="flex flex-wrap items-center gap-2 text-[15px] font-bold tracking-tight text-white">
                    Institutional Peer Comparison Engine
                    <span className="rounded border border-sky-800/40 bg-[#1c2940] px-1.5 py-0.5 font-mono text-[9px] font-medium text-sky-300">
                      {activeScanner} · NSE
                    </span>
                  </h1>
                  <p className="text-[11px] text-slate-400">
                    Cross-sectional multi-factor fundamental valuation &amp; forensic risk spread matrix
                    <span className="text-slate-500"> · {TOTAL_METRICS} KPIs</span>
                  </p>
                </div>
              </div>

              <div className="ml-auto flex rounded-md border border-[#1a263c] bg-[#090e1a] p-0.5">
                {VIEWS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setView(item.id)}
                    aria-pressed={view === item.id}
                    title={item.ready ? undefined : 'Preview only in this phase'}
                    className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition ${
                      view === item.id ? 'bg-[#0b386b] text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <ViewIcon id={item.id} />
                    {item.label}
                    {!item.ready && <span className="ml-1 text-[9px] uppercase text-amber-300/80">soon</span>}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <button type="button" className={ICON_BTN} onClick={share} title="Copy shareable link" aria-label="Copy shareable link">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
                  </svg>
                </button>
                <button type="button" className={ICON_BTN} onClick={exportCsv} title="Export as CSV" aria-label="Export as CSV">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                    <path d="M12 3v12" />
                    <path d="m7 10 5 5 5-5" />
                    <path d="M4 21h16" />
                  </svg>
                </button>
                <button type="button" className={ICON_BTN} onClick={resetAll} title="Reset to defaults" aria-label="Reset to defaults">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                    <path d="M3 12a9 9 0 1 0 2.64-6.36" />
                    <path d="M3 4v5h5" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <div ref={searchRef} className="relative w-full sm:max-w-xs">
                <input
                  type="text"
                  value={peerQuery}
                  onChange={(event) => setPeerQuery(event.target.value)}
                  onFocus={() => {
                    if (peerQuery.trim().length >= 2 && peerSuggestions.length > 0) setPeerOpen(true)
                  }}
                  onKeyDown={handlePeerKeyDown}
                  placeholder="+ Add peer to compare (e.g. SENCO, PCJEWELLER)…"
                  aria-label="Search stocks to add to the comparison"
                  role="combobox"
                  aria-expanded={peerOpen}
                  aria-controls={peerListId}
                  aria-autocomplete="list"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-md border border-[#1e3352] bg-[#0b1626] px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500"
                />
                {peerOpen && peerQuery.trim().length >= 2 && (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-[#1e3a5f] bg-[#0b1626] shadow-xl shadow-black/40">
                    {peerLoading ? (
                      <p className="px-3 py-3 text-xs text-slate-500">Searching…</p>
                    ) : peerFailed ? (
                      <p className="px-3 py-3 text-xs text-rose-300">Search unavailable. Please try again.</p>
                    ) : peerSuggestions.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-slate-500">No matching stocks found.</p>
                    ) : (
                      <ul id={peerListId} role="listbox" aria-label="Stock suggestions" className="max-h-72 overflow-y-auto py-1">
                        {peerSuggestions.map((item, index) => (
                          <li key={item.symbol} role="option" aria-selected={index === peerActive}>
                            <button
                              type="button"
                              tabIndex={-1}
                              onMouseDown={(event) => event.preventDefault()}
                              onMouseEnter={() => setPeerActive(index)}
                              onClick={() => void addStock(item.symbol)}
                              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition ${
                                index === peerActive ? 'bg-sky-600/20' : 'hover:bg-white/5'
                              }`}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-semibold text-white">{item.companyName}</span>
                                <span className="block truncate text-[11px] text-slate-500">
                                  {item.symbol}
                                  {item.exchange ? ` · ${item.exchange}` : ''}
                                </span>
                              </span>
                              <span className="shrink-0 text-[11px] font-semibold text-sky-400">
                                {addingSymbol === item.symbol ? 'Adding…' : 'Add'}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <span className="text-[11px] uppercase tracking-wide text-slate-600">Quick add</span>
              {['DPABHUSHAN', 'RAYMOND', 'TFCILTD']
                .filter((symbol) => !selected.includes(symbol))
                .map((symbol) => (
                  <button
                    key={symbol}
                    type="button"
                    onClick={() => void addStock(symbol)}
                    className="rounded-full border border-[#1e3352] bg-[#0b1626] px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-sky-500/60 hover:text-white"
                  >
                    + {symbol}
                  </button>
                ))}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[11px] text-slate-500">
                  {columns} of {MAX_STOCKS} selected
                </span>
                <button
                  type="button"
                  onClick={() => setHighlight((current) => !current)}
                  aria-pressed={highlight}
                  title="Toggle best/worst highlighting"
                  aria-label="Toggle best/worst highlighting"
                  className={`${ICON_BTN} ${highlight ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : ''}`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                    <path d="M4 20V11" />
                    <path d="M11 20V4" />
                    <path d="M18 20v-6" />
                  </svg>
                </button>
              </div>
            </div>
          </section>

          <div className="overflow-x-auto lg:shrink-0">
            <div className="min-w-[680px]">
          <StockCardsHeader
            stocks={selectedStocks}
            gridTemplate={gridTemplate}
            hasAddColumn={hasAddColumn}
            onRemove={toggleStock}
            onSetAnchor={setAnchor}
            onAdd={() => notify('Use the search above to add a peer.')}
          />
            </div>
          </div>

          {view === 'table' ? (
            <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2 lg:shrink-0">
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="uppercase tracking-wide">
                    {openCats.length} of {METRIC_CATEGORIES.length} categories open
                  </span>
                  {highlight && (
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-400" /> best
                      <span className="ml-1 size-2 rounded-full bg-rose-400" /> worst
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenCats(METRIC_CATEGORIES.map((category) => category.id))}
                    className="text-[11px] font-semibold text-slate-400 hover:text-white"
                  >
                    Expand all
                  </button>
                  <span className="text-slate-700">·</span>
                  <button type="button" onClick={() => setOpenCats([])} className="text-[11px] font-semibold text-slate-400 hover:text-white">
                    Collapse all
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto pb-20 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                <div className="min-w-[680px] space-y-4">
              {selectedStocks.length < 2 && (
                <div className="rounded-xl border border-dashed border-[#243b5c] bg-[#091527] px-4 py-3 text-xs text-slate-400">
                  Add at least one peer to see spread comparisons. Single-column values are shown below as a preview.
                </div>
              )}

              {METRIC_CATEGORIES.map((category) => {
                const open = openCats.includes(category.id)
                return (
                  <section key={category.id} className="overflow-hidden rounded-xl border border-[#162844] bg-[#091527]">
                    <button
                      type="button"
                      onClick={() => toggleCat(category.id)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.02]"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-[#243b5c] bg-[#0b1626] text-xs font-bold text-sky-300">
                        {category.code}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-white">{category.title}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-500">{category.description}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-500">{category.metrics.length} KPIs</span>
                      <span className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden>
                        ▾
                      </span>
                    </button>

                    {open && (
                      <div className="border-t border-[#122238]">
                        {category.metrics.map((metric, index) => {
                          const { best, worst } = highlight ? extremes(metric) : { best: null, worst: null }
                          return (
                            <div
                              key={metric.id}
                              className={`grid items-center ${index % 2 === 1 ? 'bg-white/[0.015]' : ''} hover:bg-white/[0.03]`}
                              style={{ gridTemplateColumns: gridTemplate }}
                            >
                              <div className="min-w-0 px-4 py-2">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate text-xs font-medium text-slate-200">{metric.label}</span>
                                  {metric.format === 'pending' && (
                                    <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 text-[9px] font-semibold uppercase text-amber-300">
                                      pending
                                    </span>
                                  )}
                                  {(metric.about || metric.benchmark) && (
                                    <span
                                      className="inline-flex size-4 items-center justify-center rounded-full border border-[#243b5c] bg-[#0b1626] text-[9px] font-bold text-slate-400 transition hover:border-sky-500/60 hover:text-sky-300"
                                      title={`${metric.about ?? ''}${metric.about && metric.benchmark ? '\n\n' : ''}${metric.benchmark ?? ''}`}
                                      aria-label="Metric info"
                                    >
                                      ?
                                    </span>
                                  )}
                                </span>
                                {metric.hint && <span className="mt-0.5 block truncate text-[10px] text-slate-600">{metric.hint}</span>}
                              </div>

                              {selectedStocks.map((stock) => {
                                const value = stock.values[metric.id] ?? null
                                const tone =
                                  value != null && value === best ? 'best' : value != null && value === worst ? 'worst' : 'none'
                                return (
                                  <div key={stock.symbol} className="flex justify-end px-2 py-2">
                                    <MetricPill value={value} format={metric.format} tone={tone} />
                                  </div>
                                )
                              })}

                              {hasAddColumn && <div aria-hidden />}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </section>
                )
              })}
                </div>
              </div>
            </div>
          ) : (
            <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-20 lg:pr-1">
              <div className="space-y-4">
                <ComparisonVisualizations activeView={view} stocks={selectedStocks} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MetricPill({ value, format, tone }: { value: number | null; format: MetricFormat; tone: 'best' | 'worst' | 'none' }) {
  const toneClass =
    tone === 'best'
      ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30'
      : tone === 'worst'
        ? 'bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30'
        : value == null
          ? 'text-slate-600'
          : 'text-slate-300'
  return (
    <span className={`inline-flex min-w-[64px] justify-end rounded-md px-2 py-0.5 font-mono text-xs tabular-nums ${toneClass}`}>
      {formatMetric(value, format)}
    </span>
  )
}

type UniverseSidebarProps = {
  scanner: string
  scanners: string[]
  onScanner: (value: string) => void
  filter: string
  onFilter: (value: string) => void
  stocks: UniverseRow[]
  selected: string[]
  onToggle: (symbol: string) => void
}

type SortKey = 'rank' | 'company' | 'ltp' | 'iv' | 'score'

const SIDEBAR_HEADERS: { key: SortKey; label: string; align: string; span: string }[] = [
  { key: 'rank', label: '#', align: 'text-left', span: 'col-span-1' },
  { key: 'company', label: 'Company', align: 'text-left', span: 'col-span-4' },
  { key: 'ltp', label: 'LTP', align: 'text-right', span: 'col-span-2' },
  { key: 'iv', label: 'IV', align: 'text-right', span: 'col-span-2' },
  { key: 'score', label: 'Score', align: 'text-right', span: 'col-span-3' },
]

function scoreTone(score: number | null): string {
  if (score == null) return 'bg-slate-800 text-slate-300'
  if (score >= 70) return 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/50'
  if (score >= 50) return 'bg-amber-950/80 text-amber-400 border border-amber-500/50'
  return 'bg-rose-950/80 text-rose-400 border border-rose-500/50'
}

function compareNum(a: number | null, b: number | null, direction: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return (a - b) * (direction === 'asc' ? 1 : -1)
}

function UniverseSidebar({ scanner, scanners, onScanner, filter, onFilter, stocks, selected, onToggle }: UniverseSidebarProps) {
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'rank', direction: 'asc' })

  const rankOf = useMemo(() => {
    const map = new Map<string, number>()
    stocks.forEach((stock, index) => map.set(stock.symbol, index))
    return map
  }, [stocks])

  const sorted = useMemo(() => {
    const factor = sort.direction === 'asc' ? 1 : -1
    return [...stocks].sort((a, b) => {
      switch (sort.key) {
        case 'company':
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase()) * factor
        case 'ltp':
          return compareNum(a.ltp, b.ltp, sort.direction)
        case 'iv':
          return compareNum(a.iv, b.iv, sort.direction)
        case 'score':
          return compareNum(a.score, b.score, sort.direction)
        case 'rank':
        default:
          return ((rankOf.get(a.symbol) ?? 0) - (rankOf.get(b.symbol) ?? 0)) * factor
      }
    })
  }, [stocks, sort, rankOf])

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' },
    )
  }

  return (
    <aside className="min-w-0 lg:h-full lg:min-h-0">
      <div className="overflow-hidden rounded-xl border border-[#162844] bg-[#091527] lg:flex lg:h-full lg:min-h-0 lg:flex-col">
        <div className="space-y-3 border-b border-[#122238] bg-[#0c1322] p-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Scanner</span>
            <select
              value={scanner}
              onChange={(event) => onScanner(event.target.value)}
              className="w-full rounded-md border border-[#1e3352] bg-[#0b1626] px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500"
            >
              {scanners.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <input
            type="text"
            value={filter}
            onChange={(event) => onFilter(event.target.value)}
            placeholder="Search stocks..."
            aria-label="Filter the stock universe"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-md border border-[#1e293b] bg-[#0a0f1b] px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-500"
          />
        </div>

        <div className="grid grid-cols-12 border-b border-[#182338] bg-[#0c1322] px-2">
          {SIDEBAR_HEADERS.map((header) => (
            <button
              type="button"
              key={header.key}
              onClick={() => toggleSort(header.key)}
              className={`flex items-center gap-0.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 transition-colors hover:text-cyan-300 ${header.span} ${
                header.align === 'text-right' ? 'justify-end' : 'justify-start'
              } ${sort.key === header.key ? 'text-cyan-300' : ''}`}
            >
              {header.label}
              {sort.key === header.key && <span className="text-[9px]">{sort.direction === 'asc' ? '▲' : '▼'}</span>}
            </button>
          ))}
        </div>

        <div className="max-h-[560px] overflow-y-auto lg:min-h-0 lg:max-h-none lg:flex-1">
          {sorted.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-500">No stocks match “{filter.trim()}”.</p>
          ) : (
            <div className="divide-y divide-[#131d2e]">
              {sorted.map((stock, index) => {
                const isSelected = selected.includes(stock.symbol)
                return (
                  <button
                    type="button"
                    key={stock.symbol}
                    onClick={() => onToggle(stock.symbol)}
                    aria-pressed={isSelected}
                    title={`${isSelected ? 'Remove' : 'Add'} ${stock.symbol}`}
                    className={`grid w-full grid-cols-12 items-center border-l-2 px-2 py-2 text-left transition-colors ${
                      isSelected ? 'border-cyan-400 bg-[#12284c]' : 'border-transparent hover:bg-[#121c30]'
                    }`}
                  >
                    <span className={`col-span-1 text-center font-mono text-[12px] ${isSelected ? 'text-cyan-300' : 'text-slate-500'}`}>
                      {index + 1}
                    </span>
                    <span className="col-span-4 min-w-0 pr-1">
                      <span className={`block truncate text-[13px] font-semibold ${isSelected ? 'text-cyan-200' : 'text-slate-200'}`}>
                        {stock.name}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-slate-500">{stock.symbol}</span>
                    </span>
                    <span className="col-span-2 text-right font-mono text-[12px] tabular-nums text-slate-300">
                      {stock.ltp == null ? '—' : stock.ltp.toLocaleString('en-IN')}
                    </span>
                    <span className="col-span-2 text-right font-mono text-[12px] tabular-nums text-slate-400">
                      {stock.iv == null ? '—' : stock.iv.toLocaleString('en-IN')}
                    </span>
                    <span className="col-span-3 flex justify-end pr-1">
                      <span className={`inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded px-1 font-mono text-[12px] font-bold ${scoreTone(stock.score)}`}>
                        {stock.score ?? '—'}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-t border-[#1a2539] bg-[#080d17] px-3 py-2 text-[11px] text-slate-500">
          {selected.length} selected · click a row to add or remove · pin a card to set the anchor
        </div>
      </div>
    </aside>
  )
}

type StockCardsHeaderProps = {
  stocks: SelectedStock[]
  gridTemplate: string
  hasAddColumn: boolean
  onRemove: (symbol: string) => void
  onSetAnchor: (symbol: string) => void
  onAdd: () => void
}

function StockCardsHeader({ stocks, gridTemplate, hasAddColumn, onRemove, onSetAnchor, onAdd }: StockCardsHeaderProps) {
  return (
    <div
      className="grid items-stretch gap-px overflow-hidden rounded-xl border border-[#162844] bg-[#162844]"
      style={{ gridTemplateColumns: gridTemplate }}
    >
      <div className="flex items-center bg-[#0b1626] px-4 py-3.5">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Compared stocks</span>
      </div>

      {stocks.map((stock, index) => {
        const isAnchor = index === 0
        return (
          <div key={stock.symbol} className="min-w-0 bg-[#0b1626] px-3.5 py-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold text-white">
                  {stock.symbol}
                  {isAnchor && (
                    <span className="rounded bg-sky-500/15 px-2 text-[11px] font-semibold uppercase text-sky-300">anchor</span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-slate-500">{stock.name}</p>
              </div>
              <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-white">
                {stock.ltp == null ? '—' : `₹${stock.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-end gap-1.5">
              <Link
                href={`/stocks/${encodeURIComponent(stock.symbol)}`}
                target="_blank"
                rel="noreferrer"
                title={`Open ${stock.symbol} details`}
                className="text-[12px] font-semibold text-sky-400 transition hover:text-sky-300"
              >
                Details ↗
              </Link>
              {!isAnchor && (
                <button
                  type="button"
                  onClick={() => onSetAnchor(stock.symbol)}
                  title={`Make ${stock.symbol} the anchor column`}
                  aria-label={`Make ${stock.symbol} the anchor column`}
                  className="rounded p-0.5 text-slate-500 transition hover:text-sky-300"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                    <path d="M12 17v5" />
                    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 12 10.76V6a2 2 0 1 1 4 0v4.76" />
                  </svg>
                </button>
              )}
              {!isAnchor && (
                <button
                  type="button"
                  onClick={() => onRemove(stock.symbol)}
                  title={`Remove ${stock.symbol}`}
                  aria-label={`Remove ${stock.symbol}`}
                  className="rounded px-1.5 text-[15px] leading-none text-slate-500 transition hover:text-rose-300"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        )
      })}

      {hasAddColumn && (
        <button
          type="button"
          onClick={onAdd}
          className="flex flex-col items-center justify-center gap-1 bg-[#0b1626] px-3 py-3 text-slate-500 transition hover:bg-[#0d1a2e] hover:text-sky-300"
        >
          <span className="text-lg leading-none">+</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide">Add peer</span>
        </button>
      )}
    </div>
  )
}

