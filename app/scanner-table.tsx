'use client'

import Link from 'next/link'
import { useEffect, useMemo } from 'react'
import { DEFAULT_PAGE_SIZE } from '@/lib/paging'
import { Pagination, usePagination } from './pagination'
import { useSessionState } from './use-session-state'

export type ScannerRow = {
  id: string
  symbol: string
  company: string
  ltp: number | null
  iv: number | null
  mos: number | null
  pe: number | null
  marketCap: number | null
  roce: number | null
  de: number | null
  score: number | null
  updated: string
}

type Key = 'company' | 'ltp' | 'iv' | 'mos' | 'pe' | 'marketCap' | 'roce' | 'de' | 'score' | 'updated'

const columns: { key: Key; label: string; numeric: boolean; filterable: boolean }[] = [
  { key: 'company', label: 'Company', numeric: false, filterable: true },
  { key: 'ltp', label: 'LTP', numeric: true, filterable: true },
  { key: 'iv', label: 'IV', numeric: true, filterable: true },
  { key: 'mos', label: 'MOS%', numeric: true, filterable: true },
  { key: 'pe', label: 'P/E', numeric: true, filterable: true },
  { key: 'marketCap', label: 'Market Cap', numeric: true, filterable: true },
  { key: 'roce', label: 'ROCE', numeric: true, filterable: true },
  { key: 'de', label: 'D/E', numeric: true, filterable: true },
  { key: 'score', label: 'Score', numeric: true, filterable: true },
  { key: 'updated', label: 'Updated', numeric: false, filterable: false },
]

function fmt(value: number | null, suffix = ''): string {
  return value == null || Number.isNaN(value) ? '—' : `${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}${suffix}`
}

function sortValue(row: ScannerRow, key: Key): string | number | null {
  if (key === 'company') return row.company.toLowerCase()
  if (key === 'updated') return row.updated
  return row[key]
}

/** Supports `>10`, `>=10`, `<10`, `<=10`, `=10`, `10-20`, `10..20` and exact `10`. */
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

export function ScannerTable({ rows, scannerId }: { rows: ScannerRow[]; scannerId?: string }) {
  const storagePrefix = `qscan:scanner-table:${scannerId ?? 'default'}`
  const [sortKey, setSortKey] = useSessionState<Key>(`${storagePrefix}:sortKey`, 'score')
  const [asc, setAsc] = useSessionState<boolean>(`${storagePrefix}:asc`, false)
  const [filters, setFilters] = useSessionState<Partial<Record<Key, string>>>(`${storagePrefix}:filters`, {})
  const [pageSize, setPageSize] = useSessionState<number>(`${storagePrefix}:pageSize`, DEFAULT_PAGE_SIZE)

  const stockHref = (symbol: string) =>
    `/stocks/${encodeURIComponent(symbol)}${scannerId ? `?scanner=${encodeURIComponent(scannerId)}` : ''}`

  function toggle(key: Key) {
    if (key === sortKey) {
      setAsc((value) => !value)
    } else {
      setSortKey(key)
      setAsc(key === 'company' || key === 'updated')
    }
  }

  function updateFilter(key: Key, value: string) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const activeCount = Object.values(filters).filter((value) => value && value.trim()).length

  const filtered = useMemo(() => {
    const companyNeedle = (filters.company ?? '').trim().toLowerCase()
    const numericTests = columns
      .filter((column) => column.numeric)
      .map((column) => ({ key: column.key, test: parseNumericQuery(filters[column.key] ?? '') }))
      .filter((entry): entry is { key: Key; test: (value: number | null) => boolean } => entry.test != null)

    return rows.filter((row) => {
      if (companyNeedle && !`${row.company} ${row.symbol}`.toLowerCase().includes(companyNeedle)) return false
      for (const { key, test } of numericTests) {
        if (!test(row[key] as number | null)) return false
      }
      return true
    })
  }, [rows, filters])

  const sorted = useMemo(() => {
    const factor = asc ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey)
      const bv = sortValue(b, sortKey)
      const aNull = av == null || (typeof av === 'number' && Number.isNaN(av))
      const bNull = bv == null || (typeof bv === 'number' && Number.isNaN(bv))
      if (aNull && bNull) return 0
      if (aNull) return 1
      if (bNull) return -1
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * factor
      return ((av as number) - (bv as number)) * factor
    })
  }, [filtered, sortKey, asc])

  const { page, setPage, pageCount, start, pageRows } = usePagination(sorted, pageSize)

  // Any change to the result set or its ordering returns the viewer to page 1.
  useEffect(() => {
    setPage(1)
  }, [filters, sortKey, asc, pageSize, setPage])

  const inputClass =
    'w-full min-w-0 rounded border border-[#182c49] bg-[#0b182b] px-1.5 py-1 text-[11px] font-normal normal-case tracking-normal text-slate-200 placeholder-slate-600 outline-none focus:border-sky-500'

  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-500">
          {filtered.length} of {rows.length} {rows.length === 1 ? 'company' : 'companies'}
        </span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => setFilters({})}
            className="rounded border border-[#162844] px-2 py-0.5 text-[12px] text-slate-300 transition-colors hover:border-sky-500 hover:text-white"
          >
            Clear filters ({activeCount})
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-left text-xs">
          <thead className="border-b border-[#162844] text-[12px] uppercase tracking-wider text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3">
                  <button onClick={() => toggle(column.key)} className="inline-flex items-center gap-1 uppercase tracking-wider transition hover:text-slate-200" title={`Sort by ${column.label}`}>
                    {column.label}
                    <span className={sortKey === column.key ? 'text-sky-400' : 'text-slate-600'}>{sortKey === column.key ? (asc ? '▲' : '▼') : '↕'}</span>
                  </button>
                </th>
              ))}
            </tr>
            <tr className="align-top">
              {columns.map((column) => (
                <th key={column.key} className="px-4 pb-3 pt-0 font-normal">
                  {column.filterable ? (
                    <input
                      value={filters[column.key] ?? ''}
                      onChange={(event) => updateFilter(column.key, event.target.value)}
                      spellCheck={false}
                      inputMode={column.numeric ? 'decimal' : 'text'}
                      placeholder={column.key === 'company' ? 'Company / symbol' : 'e.g. >10, 5-20'}
                      aria-label={`Filter by ${column.label}`}
                      className={`${inputClass} ${column.key === 'company' ? 'min-w-[9rem]' : 'min-w-[5rem]'}`}
                    />
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#12233c]">
            {pageRows.map((row) => (
              <tr key={row.id} className="hover:bg-sky-400/[.04]">
                <td className="px-4 py-3">
                  <Link href={stockHref(row.symbol)} className="font-semibold text-white hover:text-sky-300">{row.company}</Link>
                  <span className="ml-2 text-[12px] text-slate-500">{row.symbol}</span>
                </td>
                <td className="px-4 py-3">{fmt(row.ltp)}</td>
                <td className="px-4 py-3">{fmt(row.iv)}</td>
                <td className="px-4 py-3">{fmt(row.mos, '%')}</td>
                <td className="px-4 py-3">{fmt(row.pe)}</td>
                <td className="px-4 py-3">{fmt(row.marketCap)}</td>
                <td className="px-4 py-3 text-emerald-300">{fmt(row.roce, '%')}</td>
                <td className="px-4 py-3">{fmt(row.de)}</td>
                <td className="px-4 py-3 font-semibold text-amber-300">{row.score ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{row.updated ? new Date(row.updated).toLocaleDateString('en-IN') : '—'}</td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-xs text-slate-500">
                  No companies match these filters.
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
        total={sorted.length}
        pageSize={pageSize}
        onPageSize={setPageSize}
      />
    </div>
  )
}
