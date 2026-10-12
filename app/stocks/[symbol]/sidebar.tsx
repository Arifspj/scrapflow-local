'use client'

import { useMemo, useState } from 'react'
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

export function Sidebar({ items, activeSymbol }: { items: SidebarItem[]; activeSymbol: string }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction }>({ key: 'rank', direction: 'asc' })

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
    <aside className="sticky top-[53px] flex h-[calc(100vh-53px)] w-[280px] shrink-0 flex-col border-r border-[#1a2539] bg-[#090f1a]">
      <div className="border-b border-[#182338] bg-[#0c1322] p-2">
        <div className="relative">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search saved stocks..."
            aria-label="Search saved stocks"
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

      <div className="grid grid-cols-12 border-b border-[#182338] bg-[#0c1322] px-2 py-1.5 text-center text-[10px] font-bold uppercase text-slate-400">
        {HEADERS.map((header) => {
          const isActive = sort.key === header.key
          return (
            <button
              type="button"
              key={header.key}
              onClick={() => toggleSort(header.key)}
              className={`${header.span} ${header.align} flex items-center gap-0.5 rounded px-0.5 transition-colors hover:text-cyan-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500 ${isActive ? 'text-cyan-300' : ''} ${header.align === 'text-right' ? 'justify-end' : 'justify-start'}`}
            >
              {header.label}
              <span className={`text-[8px] ${isActive ? 'opacity-100' : 'opacity-0'}`}>{isActive && sort.direction === 'desc' ? '▼' : '▲'}</span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 divide-y divide-[#131d2e] overflow-y-auto">
        {sorted.length === 0 && <p className="px-3 py-6 text-center text-[11px] text-slate-500">No saved stock matches “{query}”.</p>}
        {sorted.map((item, index) => {
          const active = item.symbol === activeSymbol
          return (
            <Link
              key={item.id}
              href={`/stocks/${encodeURIComponent(item.symbol)}`}
              className={`flex items-center justify-between border-l-2 px-2.5 py-2 transition-colors ${active ? 'border-cyan-400 bg-[#12284c]' : 'border-transparent hover:bg-[#121c30]'}`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className={`w-4 shrink-0 text-center font-mono text-[10px] ${active ? 'font-bold text-cyan-300' : 'text-slate-500'}`}>{index + 1}</span>
                <div className="min-w-0">
                  <div className={`truncate text-xs leading-snug ${active ? 'font-bold text-white' : 'font-medium text-slate-200'}`}>{item.companyName || item.symbol}</div>
                  <div className={`truncate font-mono text-[9px] tracking-wider ${active ? 'text-cyan-200' : 'text-slate-400'}`}>{item.symbol}</div>
                </div>
              </div>
              <div className="mr-2.5 shrink-0 text-right">
                <div className={`font-mono text-xs tabular-nums ${active ? 'font-bold text-white' : 'text-slate-100'}`}>{formatNum(item.price)}</div>
                <div className="font-mono text-[10px] tabular-nums text-slate-400">IV {formatNum(item.iv, 0)}</div>
              </div>
              <span className={`inline-flex h-5 w-7 shrink-0 items-center justify-center rounded font-mono text-[11px] font-bold ${scoreTone(item.score)}`}>{item.score ?? '—'}</span>
            </Link>
          )
        })}
      </div>

      <div className="border-t border-[#1a2539] bg-[#080d17] p-2 text-[11px] text-slate-400">
        Showing {sorted.length} of {items.length} saved stock{items.length === 1 ? '' : 's'}
      </div>
    </aside>
  )
}
