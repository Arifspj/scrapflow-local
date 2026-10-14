'use client'

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'

type Suggestion = {
  symbol: string
  companyName: string
  exchange: string | null
}

const DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 2

type Props = {
  variant?: 'default' | 'compact'
}

const INPUT_CLASS: Record<NonNullable<Props['variant']>, string> = {
  default:
    'w-full rounded-lg border border-[#162740] bg-[#0b1626] px-3 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500',
  compact:
    'w-full rounded-md border border-[#1e293b] bg-[#0a0f1b] py-1.5 pl-3 pr-3 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none',
}

const WRAP_CLASS: Record<NonNullable<Props['variant']>, string> = {
  default: 'relative hidden w-72 sm:block',
  compact: 'relative min-w-0 flex-1 sm:w-80 sm:flex-none',
}

/**
 * Database-driven stock autocomplete for the header.
 *
 * Suggestions come from the persisted stock table (via the read-only
 * `/api/stocks/search` route) and navigate to the existing `/stocks/[symbol]`
 * details page. It never scrapes, and never invents a symbol: any symbol that
 * cannot be typed as a real ticker (e.g. unresolved numeric ids) is filtered
 * out by the API.
 */
export function StockSearch({ variant = 'default' }: Props) {
  const router = useRouter()
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const trimmed = query.trim()
  const tooShort = trimmed.length < MIN_QUERY_LENGTH

  useEffect(() => {
    abortRef.current?.abort()

    if (tooShort) {
      setItems([])
      setLoading(false)
      setFailed(false)
      setOpen(false)
      setActive(-1)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setFailed(false)

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/stocks/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        const payload = (await response.json().catch(() => null)) as { results?: Suggestion[] } | null
        if (controller.signal.aborted) return
        setItems(Array.isArray(payload?.results) ? payload.results : [])
        setFailed(!response.ok)
        setActive(-1)
        setOpen(true)
      } catch (error) {
        if (controller.signal.aborted || (error as { name?: string })?.name === 'AbortError') return
        setItems([])
        setFailed(true)
        setOpen(true)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, tooShort])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  function selectSuggestion(symbol: string) {
    setOpen(false)
    setItems([])
    setActive(-1)
    setQuery('')
    inputRef.current?.blur()
    router.push(`/stocks/${encodeURIComponent(symbol)}`)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (active >= 0 && items[active]) {
      selectSuggestion(items[active].symbol)
      return
    }
    if (tooShort) return
    const exact = items.find((item) => item.symbol.toLowerCase() === trimmed.toLowerCase())
    if (exact) {
      selectSuggestion(exact.symbol)
      return
    }
    // No highlighted/exact match: fall back to the existing server search.
    setOpen(false)
    router.push(`/?q=${encodeURIComponent(trimmed)}`)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      if (!items.length) return
      event.preventDefault()
      setOpen(true)
      setActive((current) => (current + 1 >= items.length ? 0 : current + 1))
    } else if (event.key === 'ArrowUp') {
      if (!items.length) return
      event.preventDefault()
      setActive((current) => (current - 1 < 0 ? items.length - 1 : current - 1))
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
      setActive(-1)
    }
  }

  const showPanel = open && !tooShort
  const showList = showPanel && !loading && !failed && items.length > 0

  return (
    <div ref={rootRef} className={WRAP_CLASS[variant]}>
      <form action="/" method="get" role="search" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          name="q"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (!tooShort && items.length) setOpen(true)
          }}
          placeholder={variant === 'compact' ? 'Search company name or symbol...' : 'Search company or symbol...'}
          role="combobox"
          aria-label="Search stocks"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-activedescendant={active >= 0 ? `${listId}-option-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          className={INPUT_CLASS[variant]}
        />
      </form>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-[#1e3a5f] bg-[#0b1626] shadow-xl shadow-black/40">
          {loading ? (
            <p className="px-3 py-3 text-xs text-slate-500">Searching…</p>
          ) : failed ? (
            <p className="px-3 py-3 text-xs text-rose-300">Search unavailable. Please try again.</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-500">No matching stocks found.</p>
          ) : (
            <ul id={listId} role="listbox" aria-label="Stock suggestions" className="max-h-80 overflow-y-auto py-1">
              {items.map((item, index) => (
                <li key={item.symbol} role="option" id={`${listId}-option-${index}`} aria-selected={index === active}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => selectSuggestion(item.symbol)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                      index === active ? 'bg-sky-600/20' : 'hover:bg-white/5'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-white">{item.companyName}</span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {item.symbol}
                        {item.exchange ? ` · ${item.exchange}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(showList || loading) && (
            <p className="border-t border-[#162844] px-3 py-1.5 text-[10px] uppercase tracking-wide text-slate-600">
              ↑ ↓ Navigate · Enter Select · Esc Close
            </p>
          )}
        </div>
      )}
    </div>
  )
}
