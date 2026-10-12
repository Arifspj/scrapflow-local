'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { scoreBand, scoreColor } from '@/lib/score'
import type { CategoryStockRow } from '@/lib/category'

type SortKey = 'companyName' | 'price' | 'pe' | 'roce' | 'roe' | 'debtToEquity' | 'salesYoy' | 'marketCap' | 'score'

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

export function CategoryTable({ rows }: { rows: CategoryStockRow[] }) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('marketCap')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const base = needle
      ? rows.filter((row) => `${row.companyName ?? ''} ${row.symbol}`.toLowerCase().includes(needle))
      : rows
    const sorted = [...base].sort((a, b) => {
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
    return sorted
  }, [rows, query, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(COLUMNS.find((column) => column.key === key)?.numeric ? 'desc' : 'asc')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="relative w-full max-w-xs">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by company or symbol..."
            className="w-full rounded-md border border-[#162740] bg-[#0b1626] px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500"
          />
        </label>
        <span className="text-2xs text-slate-500">
          {filtered.length} of {rows.length} companies
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#152742]">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-[#0a1424] text-[10px] uppercase tracking-wide text-slate-400">
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
          </thead>
          <tbody className="divide-y divide-[#142036]">
            {filtered.map((row) => {
              const band = scoreBand(row.score)
              return (
                <tr key={row.symbol} className="bg-[#0b1524] transition-colors hover:bg-[#0e1a2e]">
                  <td className="px-3 py-2">
                    <Link href={`/stocks/${encodeURIComponent(row.symbol)}`} className="block">
                      <span className="block font-semibold text-slate-100 hover:text-sky-300">{row.companyName || row.symbol}</span>
                      <span className="font-mono text-[10px] text-slate-500">{row.symbol}</span>
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
                      <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${BADGE_TONE[row.badgeTone]}`}>
                        {row.badge}
                      </span>
                      {row.risks.map((risk) => (
                        <span key={risk} className="rounded border border-rose-500/50 bg-rose-950/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-300">
                          ⚠ {risk}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-3 py-8 text-center text-xs text-slate-500">
                  No companies match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
