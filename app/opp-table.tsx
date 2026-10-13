'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

export type OppTone = 'good' | 'warn' | 'bad' | 'neutral'

export type OppCell = { text: string; tone?: OppTone; title?: string; sub?: string }

export type OppRow = {
  symbol: string
  company: string
  href: string
  /** Optional note shown under the ticker (e.g. unresolved numeric code). */
  symbolNote?: string | null
  cells: OppCell[]
}

export type OppColumn = {
  label: string
  align?: 'left' | 'right'
  /** Column is text-only, so it is not offered as a numeric sort target. */
  text?: boolean
}

const TONE: Record<OppTone, string> = {
  good: 'text-emerald-400',
  warn: 'text-amber-400',
  bad: 'text-red-400',
  neutral: 'text-slate-300',
}

function numeric(text: string): number | null {
  const cleaned = text.replace(/[^0-9.-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/**
 * Small, dependency-free sortable table used by every dashboard section.
 * Clicking a header sorts by that column (numeric when the cell parses as a
 * number, otherwise alphabetical); clicking again toggles the direction.
 */
export function OppTable({
  columns,
  rows,
  initialSort,
  initialDir = 'desc',
  emptyLabel = 'Nothing to show yet.',
}: {
  columns: OppColumn[]
  rows: OppRow[]
  initialSort?: number
  initialDir?: 'asc' | 'desc'
  emptyLabel?: string
}) {
  const [sortIndex, setSortIndex] = useState<number | null>(initialSort ?? null)
  const [dir, setDir] = useState<'asc' | 'desc'>(initialDir)

  const sorted = useMemo(() => {
    if (sortIndex == null) return rows
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = a.cells[sortIndex]
      const bv = b.cells[sortIndex]
      const an = numeric(av?.text ?? '')
      const bn = numeric(bv?.text ?? '')
      let cmp: number
      if (an != null && bn != null) cmp = an - bn
      else cmp = (av?.text ?? '').localeCompare(bv?.text ?? '')
      return dir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, sortIndex, dir])

  function toggle(index: number, isText?: boolean) {
    if (isText) return
    if (sortIndex === index) {
      setDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortIndex(index)
      setDir('desc')
    }
  }

  if (!rows.length) {
    return <p className="px-4 py-6 text-xs text-slate-500">{emptyLabel}</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#152742] text-[11px] uppercase tracking-wider text-slate-500">
            <th className="px-3 py-2 text-left font-semibold">Company</th>
            {columns.map((column, index) => (
              <th
                key={column.label}
                onClick={() => toggle(index, column.text)}
                className={`px-3 py-2 font-semibold ${column.align === 'right' ? 'text-right' : 'text-left'} ${column.text ? '' : 'cursor-pointer select-none hover:text-sky-300'}`}
              >
                {column.label}
                {sortIndex === index ? <span className="ml-1 text-sky-400">{dir === 'asc' ? '▲' : '▼'}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.symbol} className="border-b border-[#0f1f33] last:border-0 hover:bg-white/[0.03]">
              <td className="px-3 py-2">
                <Link href={row.href} className="block">
                  <span className="block font-semibold text-white hover:text-sky-300">{row.symbol}</span>
                  <span className="block max-w-[220px] truncate text-[11px] text-slate-500">{row.company}</span>
                  {row.symbolNote ? <span className="mt-0.5 block text-[10px] text-amber-500/80">{row.symbolNote}</span> : null}
                </Link>
              </td>
              {row.cells.map((cell, index) => (
                <td
                  key={`${row.symbol}-${index}`}
                  title={cell.title}
                  className={`px-3 py-2 align-top ${columns[index]?.align === 'right' ? 'text-right' : 'text-left'} ${cell.tone ? TONE[cell.tone] : 'text-slate-300'}`}
                >
                  <span className="block">{cell.text}</span>
                  {cell.sub ? <span className="mt-0.5 block text-[10px] font-normal text-slate-500">{cell.sub}</span> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
