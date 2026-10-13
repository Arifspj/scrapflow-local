'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatNum } from '@/lib/stock-detail'

export type SidebarItem = {
  id: string
  symbol: string
  companyName: string | null
  price: number | null
  iv: number | null
  score: number | null
}

type SortKey = 'rank' | 'company' | 'price' | 'iv' | 'score'
type Direction = 'asc' | 'desc'

const HEADERS: { key: SortKey; label: string; align: string; span: string }[] = [
  { key: 'rank', label: '#', align: 'text-left', span: 'col-span-1' },
  { key: 'company', label: 'Company', align: 'text-left', span: 'col-span-5' },
  { key: 'price', label: 'LTP', align: 'text-right', span: 'col-span-2' },
  { key: 'iv', label: 'IV', align: 'text-right', span: 'col-span-2' },
  { key: 'score', label: 'Score', align: 'text-right', span: 'col-span-2' },
]

function scoreTone(score: number | null): string {
  if (score == null) return 'bg-slate-800 text-slate-300'
  if (score >= 70) return 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/50'
  if (score >= 50) return 'bg-amber-950/80 text-amber-400 border border-amber-500/50'
  return 'bg-red-950/80 text-red-400 border border-red-600/50'
}

/** Compare numbers keeping missing values last regardless of direction. */
function compareNumber(a: number | null, b: number | null, direction: Direction): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return (a - b) * (direction === 'asc' ? 1 : -1)
}

function Chevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d={collapsed ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6'} />
    </svg>
  )
}

export function Sidebar({
  items,
  activeSymbol,
  collapsed = false,
  onToggleCollapse,
  open = false,
  onClose,
}: {
  items: SidebarItem[]
  activeSymbol: string
  collapsed?: boolean
  onToggleCollapse?: () => void
  open?: boolean
  onClose?: () => void
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction }>({ key: 'rank', direction: 'asc' })

  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter(
      (item) => item.symbol.toLowerCase().includes(needle) || (item.companyName ?? '').toLowerCase().includes(needle),
    )
  }, [items, query])

  const sorted = useMemo(() => {
    const rank = new Map(items.map((item, index) => [item.id, index]))
    const withRank = filtered.map((item) => ({ item, rank: rank.get(item.id) ?? 0 }))
    const { key, direction } = sort
    const factor = direction === 'asc' ? 1 : -1

    withRank.sort((a, b) => {
      switch (key) {
        case 'company': {
          const nameA = (a.item.companyName ?? a.item.symbol).toLowerCase()
          const nameB = (b.item.companyName ?? b.item.symbol).toLowerCase()
          return nameA.localeCompare(nameB) * factor
        }
        case 'price':
          return compareNumber(a.item.price, b.item.price, direction)
        case 'iv':
          return compareNumber(a.item.iv, b.item.iv, direction)
        case 'score':
          return compareNumber(a.item.score, b.item.score, direction)
        case 'rank':
        default:
          return (a.rank - b.rank) * factor
      }
    })

    return withRank.map((entry) => entry.item)
  }, [filtered, sort, items])

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    )
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden="true" />}

      <aside
        className={`fixed left-0 top-0 z-50 h-[100dvh] w-[280px] max-w-[85vw] flex-col border-r border-[#1a2539] bg-[#090f1a] lg:sticky lg:top-[53px] lg:z-30 lg:h-auto lg:max-h-[calc(100vh-53px)] lg:self-start lg:shadow-none ${
          open ? 'flex shadow-2xl shadow-black/50' : 'hidden lg:flex'
        } ${collapsed ? 'lg:w-[72px]' : 'lg:w-[280px]'}`}
      >
        <div className="flex items-center justify-between gap-1 border-b border-[#182338] bg-[#0c1322] px-2 py-2">
          {!collapsed && <span className="pl-0.5 text-[12px] font-bold uppercase tracking-wider text-slate-400">Saved stocks</span>}
          <div className={`flex items-center gap-1 ${collapsed ? 'mx-auto' : ''}`}>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close saved stocks"
              className="rounded p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label={collapsed ? 'Expand saved stocks' : 'Collapse saved stocks'}
                aria-expanded={!collapsed}
                title={collapsed ? 'Expand saved stocks' : 'Collapse saved stocks'}
                className="hidden rounded p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-white lg:block"
              >
                <Chevron collapsed={collapsed} />
              </button>
            )}
          </div>
        </div>

        {collapsed ? (
          <div className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto py-2">
            {sorted.length === 0 && <span className="px-1 py-4 text-center text-[11px] text-slate-600">—</span>}
            {sorted.map((item, index) => {
              const active = item.symbol === activeSymbol
              return (
                <Link
                  key={item.id}
                  href={`/stocks/${encodeURIComponent(item.symbol)}`}
                  title={`${item.companyName ?? item.symbol} (${item.symbol})`}
                  aria-label={`${item.companyName ?? item.symbol} (${item.symbol})`}
                  className={`flex w-11 flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 transition-colors ${
                    active ? 'border-cyan-500/60 bg-[#12284c]' : 'border-transparent hover:bg-[#121c30]'
                  }`}
                >
                  <span className={`w-full truncate text-center font-mono text-[12px] font-bold ${active ? 'text-cyan-300' : 'text-slate-300'}`}>
                    {(item.symbol || '?').slice(0, 3)}
                  </span>
                  <span className={`inline-flex h-4 w-8 items-center justify-center rounded font-mono text-[12px] font-bold ${scoreTone(item.score)}`}>
                    {item.score ?? '—'}
                  </span>
                  <span className="text-[10px] text-slate-600">{index + 1}</span>
                </Link>
              )
            })}
          </div>
        ) : (
          <>
            <div className="border-b border-[#182338] bg-[#0c1322] p-2">
              <div className="relative">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search saved stocks..."
                  aria-label="Search saved stocks"
                  autoComplete="off"
                  className="w-full rounded-md border border-[#1e293b] bg-[#0a0f1b] py-1.5 pl-2.5 pr-7 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1 text-slate-400 hover:text-white"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-12 border-b border-[#182338] bg-[#0c1322] px-2">
              {HEADERS.map((header) => (
                <button
                  type="button"
                  key={header.key}
                  onClick={() => toggleSort(header.key)}
                  className={`flex items-center gap-0.5 py-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-400 transition-colors hover:text-cyan-300 ${header.align} ${header.span} ${
                    header.align === 'text-right' ? 'justify-end' : 'justify-start'
                  } ${sort.key === header.key ? 'text-cyan-300' : ''}`}
                >
                  {header.label}
                  {sort.key === header.key && <span className="text-[10px]">{sort.direction === 'asc' ? '▲' : '▼'}</span>}
                </button>
              ))}
            </div>

            <div className="flex-1 divide-y divide-[#131d2e] overflow-y-auto">
              {sorted.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-slate-500">No saved stock matches “{query}”.</p>}
              {sorted.map((item, index) => {
                const active = item.symbol === activeSymbol
                return (
                  <Link
                    key={item.id}
                    href={`/stocks/${encodeURIComponent(item.symbol)}`}
                    onClick={onClose}
                    className={`flex items-center justify-between border-l-2 px-2.5 py-2 transition-colors ${active ? 'border-cyan-400 bg-[#12284c]' : 'border-transparent hover:bg-[#121c30]'}`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className={`w-4 shrink-0 text-center font-mono text-[12px] ${active ? 'text-cyan-300' : 'text-slate-500'}`}>{index + 1}</span>
                      <div className="min-w-0">
                        <div className={`truncate text-[13px] font-semibold ${active ? 'text-cyan-200' : 'text-slate-200'}`}>{item.companyName ?? item.symbol}</div>
                        <div className="truncate font-mono text-[11px] text-slate-500">{item.symbol}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[13px] text-slate-300">{formatNum(item.price)}</span>
                      <span className={`inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded px-1 font-mono text-[12px] font-bold ${scoreTone(item.score)}`}>
                        {item.score ?? '—'}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>

            <div className="border-t border-[#1a2539] bg-[#080d17] p-2 text-[13px] text-slate-400">
              Showing {sorted.length} of {items.length} saved stock{items.length === 1 ? '' : 's'}
            </div>
          </>
        )}
      </aside>
    </>
  )
}
