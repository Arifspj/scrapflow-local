'use client'

import { useEffect, useMemo, useState } from 'react'
import { clampPage, pageCount as calcPageCount, pageSlice, pageNumbers, PAGE_SIZES } from '@/lib/paging'

/**
 * Client pagination over a fully-sorted, fully-filtered row array. The caller
 * owns sorting/filtering so the page always reflects the *whole* result set,
 * not just the rows that happened to be loaded.
 */
export function usePagination<T>(rows: T[], pageSize: number) {
  const [page, setPage] = useState(1)
  const count = calcPageCount(rows.length, pageSize)
  const current = clampPage(page, rows.length, pageSize)

  useEffect(() => {
    if (page !== current) setPage(current)
  }, [page, current])

  const view = useMemo(() => pageSlice(rows, current, pageSize), [rows, current, pageSize])

  return { page: current, setPage, pageCount: count, start: view.start, pageRows: view.rows }
}

type Props = {
  page: number
  pageCount: number
  onPage: (page: number) => void
  /** Number of rows shown on the current page. */
  shown: number
  /** Zero-based index of the first shown row. */
  start: number
  /** Total number of rows being paginated (after filters). */
  total: number
  pageSize: number
  onPageSize?: (size: number) => void
  noun?: string
}

const navButton =
  'rounded border border-[#1c3350] px-2.5 py-1 text-[12px] text-slate-300 transition-colors hover:border-sky-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#1c3350] disabled:hover:text-slate-300'

export function Pagination({ page, pageCount, onPage, shown, start, total, pageSize, onPageSize, noun = 'companies' }: Props) {
  if (total <= 0) return null

  const from = start + 1
  const to = start + shown

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#12233c] px-1 pt-3">
      <span className="text-xs text-slate-400">
        Showing <span className="font-semibold text-slate-200">{from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')}</span> of{' '}
        <span className="font-semibold text-slate-200">{total.toLocaleString('en-IN')}</span> {noun}
      </span>

      <div className="flex flex-wrap items-center gap-2">
        {onPageSize && (
          <label className="flex items-center gap-1 text-[12px] text-slate-500">
            <span className="sr-only">Rows per page</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSize(Number(event.target.value))}
              aria-label="Rows per page"
              className="rounded border border-[#1c3350] bg-[#0b182b] px-1.5 py-1 text-[12px] text-slate-300 outline-none focus:border-sky-500"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1">
          <button type="button" className={navButton} onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
            ‹ Prev
          </button>
          {pageNumbers(page, pageCount).map((item, index) =>
            item === '…' ? (
              <span key={`gap-${index}`} className="px-1 text-[12px] text-slate-600">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPage(item)}
                aria-current={item === page ? 'page' : undefined}
                className={`min-w-[2rem] rounded border px-2 py-1 text-[12px] transition-colors ${
                  item === page ? 'border-sky-500 bg-sky-600/20 text-white' : 'border-[#1c3350] text-slate-300 hover:border-sky-500 hover:text-white'
                }`}
              >
                {item}
              </button>
            ),
          )}
          <button type="button" className={navButton} onClick={() => onPage(page + 1)} disabled={page >= pageCount} aria-label="Next page">
            Next ›
          </button>
        </div>
      </div>
    </div>
  )
}
