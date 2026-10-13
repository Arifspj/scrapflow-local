import { parseNumber } from './screener'

/**
 * Shared pagination helpers for screener.in listing pages (`/screens/…` and
 * `/market/…`). Both adapters expose the same "N results found: Showing page X
 * of Y" status line and `?page=N` links, so page discovery lives here and is
 * reused by both collectors instead of being duplicated per adapter.
 */

/** Parse the "74 results found: Showing page 1 of 3" status line. */
export function parsePageInfo(value: string): { totalResults: number | null; page: number | null; totalPages: number | null } {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  const results = cleaned.match(/([\d,]+)\s+results?\s+found/i)
  const showing = cleaned.match(/showing\s+page\s+(\d+)\s+of\s+(\d+)/i)
  return {
    totalResults: results ? parseNumber(results[1]) : null,
    page: showing ? Number(showing[1]) : null,
    totalPages: showing ? Number(showing[2]) : null,
  }
}

/**
 * Every page number referenced by pagination links in the HTML (plus page 1).
 *
 * Pagination hrefs are serialized in the raw HTML, so a link that already has a
 * query string (e.g. `?sort=…&order=desc&page=2`) arrives entity-escaped as
 * `&amp;page=2`. Without decoding that, the `&page=` never matches and only page
 * 1 is ever discovered — which silently turns a 43-page listing into one page.
 */
export function discoverPageNumbers(html: string): number[] {
  const decoded = html.replace(/&amp;/gi, '&').replace(/&#0*38;/g, '&')
  const numbers = new Set<number>([1])
  const matches = decoded.matchAll(/[?&]page=(\d+)/g)
  for (const match of matches) {
    const value = Number(match[1])
    if (Number.isInteger(value) && value > 0) numbers.add(value)
  }
  return [...numbers].sort((a, b) => a - b)
}

/** Append (or replace) the `?page=` query parameter on a listing URL. */
export function pageUrl(baseUrl: string, page: number): string {
  const url = new URL(baseUrl, 'https://www.screener.in')
  url.searchParams.set('page', String(page))
  return url.toString()
}
