import * as cheerio from 'cheerio'
import { cleanSymbol } from './screener'
import type { ParseResult, ParsedSymbol } from './types'

export const CHARTINK_PARSER_VERSION = 'chartink@1.1.0'
export const CHARTINK_ORIGIN = 'https://chartink.com'
const CHARTINK_PROCESS_URL = `${CHARTINK_ORIGIN}/screener/process`

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const SYMBOL_HREF_PATTERNS = [/\/stocks\/([^/?#.]+)/i, /\/company\/([^/?#]+)/i]

/** One result row as returned by the Chartink `screener/process` endpoint. */
export type ChartinkRow = {
  symbol: string
  companyName: string | null
  /** Snapshot at scan time; not a substitute for historical price/volume. */
  close: number | null
  changePct: number | null
  volume: number | null
  bseCode: string | null
}

export type ChartinkScanMeta = {
  name: string | null
  scanClause: string | null
  csrfToken: string | null
}

export type ChartinkProcessResult = {
  rows: ChartinkRow[]
  /** Rows the scan reports as matching, which can exceed `rows` for huge scans. */
  total: number | null
  warnings: string[]
}

export type ChartinkFetchResult = {
  rows: ChartinkRow[]
  status: number
  warnings: string[]
}

function symbolFromHref(href: string | undefined | null): string | null {
  if (!href) return null
  for (const pattern of SYMBOL_HREF_PATTERNS) {
    const match = href.match(pattern)
    if (match) {
      const symbol = cleanSymbol(decodeURIComponent(match[1]))
      if (symbol) return symbol
    }
  }
  return null
}

/**
 * Chartink renders scan output on the client, so a plain GET rarely contains the
 * result rows. This parser extracts any result table that is present in the
 * returned HTML and reports a warning when the payload looks client-rendered.
 * Live scans are fetched through `fetchChartinkScan` instead.
 */
export function parseChartinkScreen(html: string): ParseResult {
  const $ = cheerio.load(html)
  const found = new Map<string, ParsedSymbol>()
  const warnings: string[] = []

  $('table a[href]').each((_, element) => {
    const symbol = symbolFromHref($(element).attr('href'))
    if (!symbol || found.has(symbol)) return
    found.set(symbol, { symbol, companyName: null })
  })

  if (!found.size) {
    warnings.push(
      'Chartink serves scan results through its process API/JavaScript, so no rows were present in the returned HTML. Use the Chartink process endpoint to fetch live results.',
    )
  }

  return {
    kind: 'chartink-scan',
    parserVersion: CHARTINK_PARSER_VERSION,
    symbols: [...found.values()],
    fundamentals: null,
    warnings,
  }
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|amp|quot|lt|gt|apos);/gi, (entity, code: string) => {
    const lower = code.toLowerCase()
    if (lower === 'amp') return '&'
    if (lower === 'quot') return '"'
    if (lower === 'lt') return '<'
    if (lower === 'gt') return '>'
    if (lower === 'apos') return "'"
    const point = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : lower.startsWith('#') ? parseInt(lower.slice(1), 10) : NaN
    return Number.isFinite(point) ? String.fromCodePoint(point) : entity
  })
}

/**
 * Read the scan definition a Chartink screener page is built around. The page
 * embeds the definition as an HTML-escaped JSON attribute whose name is the
 * Vue-bound `:scan-json` (so it cannot be selected by a plain attribute
 * selector). Its `atlas_query` is the `scan_clause` the process endpoint
 * expects, and the `csrf-token` meta authorises the POST.
 */
export function extractChartinkScan(html: string): ChartinkScanMeta {
  const csrfToken = cheerio.load(html)('meta[name="csrf-token"]').attr('content')?.trim() || null
  const match = html.match(/scan-json="([^"]*)"/)
  if (!match) return { name: null, scanClause: null, csrfToken }
  try {
    const parsed = JSON.parse(decodeEntities(match[1])) as { name?: unknown; atlas_query?: unknown }
    const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : null
    const clause = typeof parsed.atlas_query === 'string' && parsed.atlas_query.trim() ? parsed.atlas_query.trim() : null
    return { name, scanClause: clause, csrfToken }
  } catch {
    return { name: null, scanClause: null, csrfToken }
  }
}

function finiteNumber(value: unknown): number | null {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(num) ? num : null
}

function rowFromRecord(record: Record<string, unknown>): ChartinkRow | null {
  const symbol = cleanSymbol(typeof record.nsecode === 'string' ? record.nsecode : null)
  if (!symbol) return null
  const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : null
  const bseCode = typeof record.bsecode === 'string' && record.bsecode.trim() ? record.bsecode.trim() : null
  return {
    symbol,
    companyName: name,
    close: finiteNumber(record.close),
    changePct: finiteNumber(record.per_chg),
    volume: finiteNumber(record.volume),
    bseCode,
  }
}

/**
 * Parse the JSON body returned by the Chartink `screener/process` endpoint into
 * deduplicated rows. Accepts the raw response text or an already-decoded value.
 */
export function parseChartinkProcess(payload: unknown): ChartinkProcessResult {
  const warnings: string[] = []
  let body: unknown = payload
  if (typeof payload === 'string') {
    try {
      body = JSON.parse(payload)
    } catch {
      return { rows: [], total: null, warnings: ['Chartink returned a response that was not valid JSON.'] }
    }
  }
  if (!body || typeof body !== 'object') {
    return { rows: [], total: null, warnings: ['Chartink returned an empty response.'] }
  }

  const record = body as { data?: unknown; recordsFiltered?: unknown; recordsTotal?: unknown }
  const data = Array.isArray(record.data) ? record.data : null
  if (!data) {
    warnings.push('Chartink response did not contain a data array.')
    return { rows: [], total: null, warnings }
  }

  const found = new Map<string, ChartinkRow>()
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue
    const row = rowFromRecord(entry as Record<string, unknown>)
    if (row && !found.has(row.symbol)) found.set(row.symbol, row)
  }

  const total = finiteNumber(record.recordsFiltered) ?? finiteNumber(record.recordsTotal)
  if (found.size && total != null && total > data.length) {
    warnings.push(`Chartink reported ${total} matching symbol(s) but returned ${data.length}; the scan may be truncated.`)
  }
  if (!found.size) warnings.push('Chartink returned no rows for this scan.')

  return { rows: [...found.values()], total, warnings }
}

function readCookieHeader(response: Response): string | null {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  const raw = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []
  const list = raw.length ? raw : headers.get('set-cookie') ? [headers.get('set-cookie') as string] : []
  const pairs = list.map((cookie) => cookie.split(';')[0]?.trim()).filter(Boolean)
  return pairs.length ? pairs.join('; ') : null
}

function isChartinkHost(hostname: string): boolean {
  return hostname.replace(/^www\./i, '').toLowerCase() === 'chartink.com'
}

/**
 * Fetch a live Chartink scan the way the site does: load the screener page to
 * read the `scan_clause` and session cookies, then POST the clause to the
 * `screener/process` endpoint with the page's CSRF token. The endpoint rejects
 * a request without the session cookie (HTTP 419), so the cookie header is
 * carried across both calls.
 */
export async function fetchChartinkScan(rawUrl: string, options: { timeoutMs?: number } = {}): Promise<ChartinkFetchResult> {
  const timeoutMs = options.timeoutMs ?? 15000
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { rows: [], status: 0, warnings: ['The Chartink URL is not valid.'] }
  }
  if (!isChartinkHost(url.hostname)) {
    return { rows: [], status: 0, warnings: ['The URL is not a chartink.com screener link.'] }
  }

  let page: Response
  try {
    page = await fetch(url.toString(), {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    return { rows: [], status: 0, warnings: ['Could not reach Chartink; the request timed out or was blocked.'] }
  }
  if (!page.ok) {
    return { rows: [], status: page.status, warnings: [`Chartink returned HTTP ${page.status} for the screener page.`] }
  }

  const html = await page.text()
  const cookie = readCookieHeader(page)
  const meta = extractChartinkScan(html)
  if (!meta.scanClause) {
    return {
      rows: [],
      status: page.status,
      warnings: ['Could not read the scan definition from the Chartink page; the scan may be private or the page layout changed.'],
    }
  }
  if (!meta.csrfToken) {
    return { rows: [], status: page.status, warnings: ['The Chartink page did not expose a CSRF token, so the scan cannot be requested.'] }
  }

  const headers: Record<string, string> = {
    'user-agent': USER_AGENT,
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json, text/plain, */*',
    referer: url.toString(),
    origin: CHARTINK_ORIGIN,
    'x-csrf-token': meta.csrfToken,
    'x-requested-with': 'XMLHttpRequest',
  }
  if (cookie) headers.cookie = cookie

  let process: Response
  try {
    process = await fetch(CHARTINK_PROCESS_URL, {
      method: 'POST',
      headers,
      body: new URLSearchParams({ scan_clause: meta.scanClause }).toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    return { rows: [], status: 0, warnings: ['Could not reach the Chartink process endpoint; the request timed out or was blocked.'] }
  }

  if (process.status === 419) {
    return { rows: [], status: 419, warnings: ['Chartink rejected the scan request (HTTP 419); the scan may require an authenticated session.'] }
  }
  if (!process.ok) {
    return { rows: [], status: process.status, warnings: [`The Chartink process endpoint returned HTTP ${process.status}.`] }
  }

  const parsed = parseChartinkProcess(await process.text())
  return { rows: parsed.rows, status: process.status, warnings: parsed.warnings }
}
