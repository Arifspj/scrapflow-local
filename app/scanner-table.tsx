'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

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

const columns: { key: Key; label: string }[] = [
  { key: 'company', label: 'Company' },
  { key: 'ltp', label: 'LTP' },
  { key: 'iv', label: 'IV' },
  { key: 'mos', label: 'MOS%' },
  { key: 'pe', label: 'P/E' },
  { key: 'marketCap', label: 'Market Cap' },
  { key: 'roce', label: 'ROCE' },
  { key: 'de', label: 'D/E' },
  { key: 'score', label: 'Score' },
  { key: 'updated', label: 'Updated' },
]

function fmt(value: number | null, suffix = ''): string {
  return value == null || Number.isNaN(value) ? '—' : `${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}${suffix}`
}

function sortValue(row: ScannerRow, key: (typeof columns)[number]['key']): string | number | null {
  if (key === 'company') return row.company.toLowerCase()
  if (key === 'updated') return row.updated
  return row[key]
}

export function ScannerTable({ rows }: { rows: ScannerRow[] }) {
  const [sortKey, setSortKey] = useState<(typeof columns)[number]['key']>('score')
  const [asc, setAsc] = useState(false)

  function toggle(key: (typeof columns)[number]['key']) {
    if (key === sortKey) {
      setAsc((value) => !value)
    } else {
      setSortKey(key)
      setAsc(key === 'company' || key === 'updated')
    }
  }

  const sorted = useMemo(() => {
    const factor = asc ? 1 : -1
    return [...rows].sort((a, b) => {
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
  }, [rows, sortKey, asc])

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-xs">
        <thead className="border-b border-[#162844] text-[10px] uppercase tracking-wider text-slate-500">
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
        </thead>
        <tbody className="divide-y divide-[#12233c]">
          {sorted.map((row) => (
            <tr key={row.id} className="hover:bg-sky-400/[.04]">
              <td className="px-4 py-3">
                <Link href={`/stocks/${encodeURIComponent(row.symbol)}`} className="font-semibold text-white hover:text-sky-300">{row.company}</Link>
                <span className="ml-2 text-[10px] text-slate-500">{row.symbol}</span>
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
        </tbody>
      </table>
    </div>
  )
}
