'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { scoreBand, scoreColor } from '@/lib/score'
import type { CategoryStockRow } from '@/lib/category'
import { DEFAULT_PAGE_SIZE } from '@/lib/paging'
import { Pagination, usePagination } from '@/app/pagination'

type SortKey = 'companyName' | 'price' | 'pe' | 'roce' | 'roe' | 'debtToEquity' | 'salesYoy' | 'marketCap' | 'score'
type FilterKey = SortKey | 'badge'

const BADGE_TONE: Record<'good' | 'neutral', string> = {
  good: 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300',
  neutral: 'border-slate-600/50 bg-slate-800/40 text-slate-300',
}

function fmtNum(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

function fmtCr(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `₹ ${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`
}

function fmtPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function valueClass(value: number | null, invert = false): string {
  if (value == null || !Number.isFinite(value)) return 'text-slate-500'
  const positive = invert ? value <= 0 : value >= 0
  if (value === 0) return 'text-slate-300'
  return positive ? 'text-emerald-400' : 'text-rose-400'
}

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'companyName', label: 'Company', numeric: false },
  { key: 'price', label: 'Price', numeric: true },
  { key: 'pe', label: 'P/E', numeric: true },
  { key: 'roce', label: 'ROCE', numeric: true },
  { key: 'roe', label: 'ROE', numeric: true },
  { key: 'debtToEquity', label: 'Debt/Equity', numeric: true },
  { key: 'salesYoy', label: 'Sales YoY', numeric: true },
  { key: 'marketCap', label: 'Market Cap', numeric: true },
  { key: 'score', label: 'Score', numeric: true },
]

function parseNumericQuery(raw: string): ((value: number | null) => boolean) | null {
  const query = raw.trim()
  if (!query) return null

  const comparison = query.match(/^(>=|<=|>|<|=)\s*(-?\d+(?:\.\d+)?)$/)
  if (comparison) {
    const limit = Number(comparison[2])
    if (!Number.isFinite(limit)) return null
    switch (comparison[1]) {
      case '>':
        return (value) => value != null && value > limit
      case '>=':
        return (value) => value != null && value >= limit
      case '<':
        return (value) => value != null && value < limit
      case '<=':
        return (value) => value != null && value <= limit
      default:
        return (value) => value != null && Math.abs(value - limit) < 1e-6
    }
  }

  const range = query.match(/^(-?\d+(?:\.\d+)?)\s*(?:-|–|\.\.|to)\s*(-?\d+(?:\.\d+)?)$/i)
  if (range) {
    const low = Number(range[1])
    const high = Number(range[2])
    if (!Number.isFinite(low) || !Number.isFinite(high)) return null
    const min = Math.min(low, high)
    const max = Math.max(low, high)
    return (value) => value != null && value >= min && value <= max
  }

  const exact = query.match(/^-?\d+(?:\.\d+)?$/)
  if (exact) {
    const target = Number(query)
    return (value) => value != null && Math.abs(value - target) < 1e-6
  }

  return null
}

export function CategoryTable({ rows, contextSlug }: { rows: CategoryStockRow[]; contextSlug?: string }) {
  const [sortKey, setSortKey] = useState<SortKey>('marketCap')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filters, setFilters] = useState<Partial<Record<FilterKey, string>>>({})
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const badgeOptions = useMemo(() => {
    const set = new Set<string>()
    for (const row of rows) {
      if (row.badge) set.add(row.badge)
      for (const risk of row.risks) set.add(risk)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  const activeCount = Object.values(filters).filter((value) => value && value.trim()).length

  const filtered = useMemo(() => {
    const companyNeedle = (filters.companyName ?? '').trim().toLowerCase()
    const badgeNeedle = (filters.badge ?? '').trim()

    const numericFilters = COLUMNS.filter((column) => column.numeric)
      .map((column) => ({ key: column.key, test: parseNumericQuery(filters[column.key] ?? '') }))
      .filter((entry): entry is { key: SortKey; test: (value: number | null) => boolean } => entry.test != null)

    const base = rows.filter((row) => {
      if (companyNeedle && !`${row.companyName ?? ''} ${row.symbol}`.toLowerCase().includes(companyNeedle)) return false
      if (badgeNeedle && row.badge !== badgeNeedle && !row.risks.includes(badgeNeedle)) return false
      for (const { key, test } of numericFilters) {
        if (!test(row[key] as number | null)) return false
      }
      return true
    })

    return [...base].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string' || typeof bv === 'string') {
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''))
        return sortDir === 'asc' ? cmp : -cmp
      }
      const an = av == null || !Number.isFinite(av) ? -Infinity : (av as number)
      const bn = bv == null || !Number.isFinite(bv) ? -Infinity : (bv as number)
      return sortDir === 'asc' ? an - bn : bn - an
    })
  }, [rows, filters, sortKey, sortDir])

  const { page, setPage, pageCount, start, pageRows } = usePagination(filtered, pageSize)

  // Any change to the filters or ordering returns the viewer to page 1.
  useEffect(() => {
    setPage(1)
  }, [filters, sortKey, sortDir, pageSize, setPage])

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(COLUMNS.find((column) => column.key === key)?.numeric ? 'desc' : 'asc')
    }
  }

  function updateFilter(key: FilterKey, value: string) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const inputClass =
    'w-full min-w-0 rounded border border-[#162740] bg-[#0b1626] px-1.5 py-1 text-[11px] font-normal normal-case tracking-normal text-slate-200 placeholder-slate-600 outline-none focus:border-sky-500'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-2xs text-slate-500">
          {filtered.length} of {rows.length} companies
        </span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => setFilters({})}
            className="rounded border border-[#162740] px-2 py-0.5 text-[11px] text-slate-300 transition-colors hover:border-sky-500 hover:text-white"
          >
            Clear filters ({activeCount})
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#152742]">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-[#0a1424] text-[12px] uppercase tracking-wide text-slate-400">
              {COLUMNS.map((column) => (
                <th key={column.key} className={`whitespace-nowrap px-3 py-2 font-semibold ${column.numeric ? 'text-right' : 'text-left'}`}>
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={`inline-flex items-center gap-1 transition-colors hover:text-white ${sortKey === column.key ? 'text-sky-300' : ''}`}
                  >
                    {column.label}
                    {sortKey === column.key && <span aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </button>
                </th>
              ))}
              <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Badge</th>
            </tr>
            <tr className="bg-[#0a1424] align-top">
              {COLUMNS.map((column) => (
                <th key={column.key} className="px-3 py-1.5 font-normal">
                  <input
                    value={filters[column.key] ?? ''}
                    onChange={(event) => updateFilter(column.key, event.target.value)}
                    spellCheck={false}
                    inputMode={column.numeric ? 'decimal' : 'text'}
                    placeholder={column.key === 'companyName' ? 'Company / symbol' : 'e.g. >10, 5-20'}
                    aria-label={`Filter by ${column.label}`}
                    className={`${inputClass} ${column.numeric ? 'text-right' : 'text-left'} ${
                      column.key === 'companyName' ? 'min-w-[9rem]' : 'min-w-[5rem]'
                    }`}
                  />
                </th>
              ))}
              <th className="px-3 py-1.5 font-normal">
                <select
                  value={filters.badge ?? ''}
                  onChange={(event) => updateFilter('badge', event.target.value)}
                  aria-label="Filter by badge"
                  className={`${inputClass} min-w-[6.5rem] cursor-pointer`}
                >
                  <option value="">All badges</option>
                  {badgeOptions.map((badge) => (
                    <option key={badge} value={badge}>
                      {badge}
                    </option>
                  ))}
                </select>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#142036]">
            {pageRows.map((row) => {
              const band = scoreBand(row.score)
              return (
                <tr key={row.symbol} className="bg-[#0b1524] transition-colors hover:bg-[#0e1a2e]">
                  <td className="px-3 py-2">
                    <Link href={`/stocks/${encodeURIComponent(row.symbol)}${contextSlug ? `?market=${encodeURIComponent(contextSlug)}` : ''}`} className="block">
                      <span className="block font-semibold text-slate-100 hover:text-sky-300">{row.companyName || row.symbol}</span>
                      <span className="font-mono text-[12px] text-slate-500">{row.symbol}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-200">{fmtNum(row.price, 2)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-200">{fmtNum(row.pe, 1)}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums ${valueClass(row.roce)}`}>{fmtNum(row.roce, 1)}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums ${valueClass(row.roe)}`}>{fmtNum(row.roe, 1)}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums ${valueClass(row.debtToEquity, true)}`}>{fmtNum(row.debtToEquity, 2)}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums ${valueClass(row.salesYoy)}`}>{fmtPct(row.salesYoy)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-200">{fmtCr(row.marketCap)}</td>
                  <td
                    className={`px-3 py-2 text-right font-mono font-bold tabular-nums ${scoreColor(band)}`}
                    title={`Data coverage ${row.scoreCoverage}%`}
                  >
                    {row.score != null ? `${row.score}/100` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={`rounded border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${BADGE_TONE[row.badgeTone]}`}>
                        {row.badge}
                      </span>
                      {row.risks.map((risk) => (
                        <span key={risk} className="rounded border border-rose-500/50 bg-rose-950/40 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-rose-300">
                          ⚠ {risk}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              )
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-3 py-8 text-center text-xs text-slate-500">
                  No companies match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageCount={pageCount}
        onPage={setPage}
        shown={pageRows.length}
        start={start}
        total={filtered.length}
        pageSize={pageSize}
        onPageSize={setPageSize}
      />
    </div>
  )
}
