/**
 * Pure pagination math shared by the scanner and category tables.
 *
 * The tables sort and filter client-side (their metrics — intrinsic value,
 * margin of safety, score — are derived from raw snapshots, not columns), so
 * pagination is applied *after* sorting and filtering. Keeping the arithmetic
 * here makes "page N of M" and the visible range provably consistent with the
 * rows actually rendered.
 */

export const PAGE_SIZES = [50, 100, 200] as const
export const DEFAULT_PAGE_SIZE = 100

/** Total number of pages for `total` rows at `pageSize` (never below 1). */
export function pageCount(total: number, pageSize: number): number {
  if (!Number.isFinite(pageSize) || pageSize <= 0) return 1
  if (!Number.isFinite(total) || total <= 0) return 1
  return Math.max(1, Math.ceil(total / pageSize))
}

/** Force any incoming page number into the valid 1..pageCount range. */
export function clampPage(page: number, total: number, pageSize: number): number {
  const count = pageCount(total, pageSize)
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(Math.trunc(page), 1), count)
}

/** Zero-based index of the first row on the page, plus that page's rows. */
export function pageSlice<T>(rows: readonly T[], page: number, pageSize: number): { start: number; rows: T[] } {
  const start = (clampPage(page, rows.length, pageSize) - 1) * pageSize
  return { start, rows: rows.slice(start, start + pageSize) }
}

/**
 * Windowed list of page numbers with `'…'` gaps, always including the first and
 * last page so numbered navigation stays compact for large result sets.
 */
export function pageNumbers(page: number, count: number, window = 2): (number | '…')[] {
  // For a small number of pages, show them all rather than a needless gap.
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1)

  const wanted = new Set<number>()
  for (let n = page - window; n <= page + window; n += 1) {
    if (n >= 1 && n <= count) wanted.add(n)
  }
  wanted.add(1)
  wanted.add(count)

  const sorted = [...wanted].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b)
  const out: (number | '…')[] = []
  let prev = 0
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push('…')
    out.push(n)
    prev = n
  }
  return out
}
