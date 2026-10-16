import { Prisma, type FetchRunStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { parseSource } from '@/lib/scrapers'
import { KIND_TO_LABEL, kindFromUrl, type ParsedSymbol, type SourceKind } from '@/lib/scrapers/types'
import { collectMarketCategory, type MarketImportReport } from '@/lib/market-collect'
import { collectScreenerScreen, type ScreenImportStatus } from '@/lib/screen-collect'
import { collectScreenerIpo, type IpoImportStatus } from '@/lib/ipo-collect'
import { collectScreenerResults, type ResultsImportStatus } from '@/lib/results-collect'
import { segmentsFromMarketUrl, type MarketCompanyRow } from '@/lib/scrapers/screener-market'
import type { IpoMetrics } from '@/lib/scrapers/screener-ipo'
import { SCREENER_RESULTS_PARSER_VERSION } from '@/lib/scrapers/screener-results'
import { SCREENER_RAW_PARSER_VERSION } from '@/lib/scrapers/screener-raw'
import { hasScreenerCredentials, screenerFetchPolite } from '@/lib/scrapers/screener-auth'
import { symbolFromCompanyHref } from '@/lib/scrapers/screener'
import { rateLimited, resolveSymbolFromName, scrapeScreenerSymbol, scrapeScreenerSymbolLite } from '@/lib/scrapers/resolve'
import { CHARTINK_PARSER_VERSION, fetchChartinkScan } from '@/lib/scrapers/chartink'
import { isNumericCode, pendingEnrichmentSymbols } from '@/lib/enrich-queue'
import { upsertStockFromScrape } from '@/lib/stocks'
import { buildViewSummary } from '@/lib/view-summary'
import { invalidateOpportunityCache } from '@/lib/opportunity-cache'

/**
 * The generic Admin -> DB ingestion adapter.
 *
 * Every source URL is mapped to a concrete adapter through `kindFromUrl`, so a
 * link can never be fetched/parsed by the wrong parser. Fetches are sequential
 * and rate limited, `429`/`403` are honoured (a block stops the run instead of
 * being worked around) and every attempt is recorded on a `FetchRun` with an
 * honest status — a run that fetched nothing is never reported as a success.
 */

export type IngestItem = {
  symbol: string
  companyName: string | null
  metrics?: MarketCompanyRow['metrics']
  /** Listing-time IPO metrics (from a screener.in IPO listing). */
  ipoMetrics?: IpoMetrics
  sourceUrl?: string
}

export type SourcePreview = {
  ok: boolean
  kind: SourceKind | null
  kindLabel: string | null
  status: number
  stopped: boolean
  symbolCount: number
  rows: { symbol: string; companyName: string | null }[]
  warnings: string[]
  message: string
}

export type ImportSummary = {
  ok: boolean
  status: FetchRunStatus
  kind: SourceKind | null
  found: number
  created: number
  updated: number
  memberships: number
  enriched: number
  warnings: string[]
  message: string
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Page budget for the paginated *list* sources (screener screens and IPO
 * listings). These only read a symbol table, so they are cheap per page; the
 * cap exists purely to bound one serverless invocation. A large listing (e.g.
 * the recent-IPOs list at ~43 pages / 1069 companies) is covered in a single
 * run by default, and the value can be tuned with `INGEST_MAX_PAGES` without a
 * code change.
 */
export const DEFAULT_LIST_MAX_PAGES = 60

function listPageLimit(): number {
  const raw = Number(process.env.INGEST_MAX_PAGES)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_LIST_MAX_PAGES
}

function decimal(value: number | null | undefined): Prisma.Decimal | null {
  return value == null || !Number.isFinite(value) ? null : new Prisma.Decimal(value)
}

async function fetchSourceHtml(url: string): Promise<{ html: string | null; status: number; stopped: boolean; reason?: string }> {
  return screenerFetchPolite(url)
}

/** Human preview message that is honest about the discovered vs fetched page count. */
function previewMessage(
  prefix: string,
  count: number,
  noun: string,
  report: { pagesFetched: number; pagesDiscovered: number | null; limitReached: boolean },
): string {
  if (!count) return report.pagesFetched > 0 ? 'No rows parsed from this source.' : 'Source returned no parseable HTML.'
  const pagePart =
    report.pagesDiscovered && report.pagesDiscovered !== report.pagesFetched
      ? `${report.pagesFetched} of ${report.pagesDiscovered} page(s)`
      : `${report.pagesFetched} page(s)`
  const limitPart = report.limitReached ? ` (page limit ${listPageLimit()} reached — raise INGEST_MAX_PAGES to fetch more)` : ''
  return `${prefix} ${count} ${noun}(s) across ${pagePart}${limitPart}; nothing was saved.`
}

/** Fetch + parse a source without writing anything. Used by the admin preview. */
export async function previewSource(rawUrl: string): Promise<SourcePreview> {
  const kind = kindFromUrl(rawUrl)
  if (!kind) {
    return { ok: false, kind: null, kindLabel: null, status: 0, stopped: false, symbolCount: 0, rows: [], warnings: [], message: 'Unsupported source URL. Use a screener.in /screens, /screen, /ipo, /market, /results or /company page, or a chartink.com scan.' }
  }

  // Public screens are paginated, so preview every page (bounded) the same way
  // the import will, otherwise the preview under-reports the real row count.
  // Raw queries (`/screen/raw/`) share the same DOM/collector but are login-gated.
  if (kind === 'screener-screen' || kind === 'screener-raw-screen') {
    const { symbols, report } = await collectScreenerScreen(rawUrl, async (url) => (await screenerFetchPolite(url)).html, { maxPages: listPageLimit(), delayMs: 120 })
    const rows = symbols.slice(0, 50).map((row) => ({ symbol: row.symbol, companyName: row.companyName }))
    if (report.authRequired) {
      return {
        ok: false,
        kind,
        kindLabel: KIND_TO_LABEL[kind],
        status: 200,
        stopped: false,
        symbolCount: 0,
        rows: [],
        warnings: report.warnings,
        message: hasScreenerCredentials()
          ? 'Screener.in returned its sign-in page — the saved session was rejected. Confirm SCREENER_EMAIL / SCREENER_PASSWORD still sign in, then redeploy.'
          : 'This source needs a screener.in login. Set SCREENER_EMAIL and SCREENER_PASSWORD (Production), then redeploy.',
      }
    }
    return {
      ok: symbols.length > 0,
      kind,
      kindLabel: KIND_TO_LABEL[kind],
      status: report.pagesFetched > 0 ? 200 : 0,
      stopped: false,
      symbolCount: symbols.length,
      rows,
      warnings: report.warnings,
      message: previewMessage('Parsed', symbols.length, 'symbol', report),
    }
  }

  // IPO listings are paginated too, so preview every page (bounded) exactly
  // like the import will, otherwise the preview under-reports the row count.
  if (kind === 'screener-ipo') {
    const { rows: ipoRows, report } = await collectScreenerIpo(rawUrl, async (url) => (await screenerFetchPolite(url)).html, { maxPages: listPageLimit(), delayMs: 120 })
    const rows = ipoRows.slice(0, 50).map((row) => ({ symbol: row.symbol, companyName: row.companyName }))
    return {
      ok: ipoRows.length > 0,
      kind,
      kindLabel: KIND_TO_LABEL[kind],
      status: report.pagesFetched > 0 ? 200 : 0,
      stopped: false,
      symbolCount: ipoRows.length,
      rows,
      warnings: report.warnings,
      message: previewMessage('Parsed', ipoRows.length, 'IPO symbol', report),
    }
  }

  // Latest-results listings are paginated and login-gated; preview every page
  // (bounded) exactly like the import will, keeping only all-green companies.
  if (kind === 'screener-results') {
    const { symbols, report } = await collectScreenerResults(rawUrl, async (url) => (await screenerFetchPolite(url)).html, { maxPages: listPageLimit(), delayMs: 120 })
    const rows = symbols.slice(0, 50).map((row) => ({ symbol: row.symbol, companyName: row.companyName }))
    const scanned = report.rowsParsed
    if (report.authRequired) {
      return {
        ok: false,
        kind,
        kindLabel: KIND_TO_LABEL[kind],
        status: 200,
        stopped: false,
        symbolCount: 0,
        rows: [],
        warnings: report.warnings,
        message: hasScreenerCredentials()
          ? 'Screener.in returned its sign-in page — the saved session was rejected. Confirm SCREENER_EMAIL / SCREENER_PASSWORD still sign in, then redeploy.'
          : 'This source needs a screener.in login. Set SCREENER_EMAIL and SCREENER_PASSWORD (Production), then redeploy.',
      }
    }
    return {
      ok: symbols.length > 0,
      kind,
      kindLabel: KIND_TO_LABEL[kind],
      status: report.pagesFetched > 0 ? 200 : 0,
      stopped: false,
      symbolCount: symbols.length,
      rows,
      warnings: report.warnings,
      message: symbols.length
        ? `Parsed ${symbols.length} all-green QoQ symbol(s) of ${scanned} scanned across ${report.pagesFetched} page(s); nothing was saved.`
        : report.pagesFetched > 0
          ? `No all-green quarterly results found in ${scanned} scanned row(s).`
          : 'Source returned no parseable HTML.',
    }
  }

  // Chartink scans are not in the page HTML: the live rows come from the
  // process endpoint, so preview them through the same fetch the import uses.
  if (kind === 'chartink-scan') {
    const result = await fetchChartinkScan(rawUrl)
    const rows = result.rows.slice(0, 50).map((row) => ({ symbol: row.symbol, companyName: row.companyName }))
    return {
      ok: result.rows.length > 0,
      kind,
      kindLabel: KIND_TO_LABEL[kind],
      status: result.status,
      stopped: result.status === 429 || result.status === 403,
      symbolCount: result.rows.length,
      rows,
      warnings: result.warnings,
      message: result.rows.length ? `Parsed ${result.rows.length} symbol(s); nothing was saved.` : result.warnings[0] ?? 'No rows parsed from this source.',
    }
  }

  const fetched = await fetchSourceHtml(rawUrl)
  if (!fetched.html) {
    return {
      ok: false,
      kind,
      kindLabel: KIND_TO_LABEL[kind],
      status: fetched.status,
      stopped: fetched.stopped,
      symbolCount: 0,
      rows: [],
      warnings: fetched.reason ? [fetched.reason] : [],
      message: fetched.stopped ? `Source blocked the request (HTTP ${fetched.status}); stopping without a bypass.` : `Source returned HTTP ${fetched.status || 'error'}.`,
    }
  }

  const result = parseSource(fetched.html, kind, rawUrl)
  const rows = result.symbols.slice(0, 50).map((row) => ({ symbol: row.symbol, companyName: row.companyName }))
  return {
    ok: result.symbols.length > 0,
    kind,
    kindLabel: KIND_TO_LABEL[kind],
    status: fetched.status,
    stopped: false,
    symbolCount: result.symbols.length,
    rows,
    warnings: result.warnings,
    message: result.symbols.length ? `Parsed ${result.symbols.length} symbol(s); nothing was saved.` : 'No rows parsed from this source.',
  }
}

/**
 * Persist a batch of discovered items.
 *
 * This used to run four sequential queries per row (stock lookup + upsert,
 * snapshot lookup + create, membership upsert), which for a large listing is
 * thousands of round-trips and dominated the whole import. Everything here is
 * now a fixed handful of set-based statements: one read to see what already
 * exists, one bulk create for the missing rows, then bulk snapshot and
 * membership writes. Created/updated counters and the "never overwrite an
 * existing snapshot" rule are unchanged.
 */
async function persistItems(scannerId: string, sourceId: string, items: IngestItem[]): Promise<{ created: number; updated: number; memberships: number }> {
  if (!items.length) return { created: 0, updated: 0, memberships: 0 }

  const symbols = items.map((item) => item.symbol)
  const known = await prisma.stock.findMany({
    where: { symbol: { in: symbols } },
    select: { id: true, symbol: true, companyName: true },
  })
  const knownSymbols = new Set(known.map((row) => row.symbol))
  const missing = items.filter((item) => !knownSymbols.has(item.symbol))
  const created = missing.length
  const updated = items.length - created

  if (missing.length) {
    await prisma.stock.createMany({
      data: missing.map((item) => ({ symbol: item.symbol, companyName: item.companyName })),
      skipDuplicates: true,
    })
  }

  // Re-read so every item resolves to a real id even if a concurrent import
  // inserted some of the rows the create above skipped.
  const stockRows = await prisma.stock.findMany({
    where: { symbol: { in: symbols } },
    select: { id: true, symbol: true, companyName: true },
  })
  const stockIdBySymbol = new Map(stockRows.map((row) => [row.symbol, row.id]))
  const itemBySymbol = new Map(items.map((item) => [item.symbol, item]))

  for (const row of stockRows) {
    const name = itemBySymbol.get(row.symbol)?.companyName
    if (name && name !== row.companyName) {
      await prisma.stock.update({ where: { id: row.id }, data: { companyName: name } })
    }
  }

  const snapshotItems = items.filter((item) => item.metrics || item.ipoMetrics)
  if (snapshotItems.length) {
    const snapshotStockIds = snapshotItems
      .map((item) => stockIdBySymbol.get(item.symbol))
      .filter((id): id is string => typeof id === 'string')
    const taken = new Set(
      (
        await prisma.stockFundamentalSnapshot.findMany({
          where: { stockId: { in: snapshotStockIds } },
          select: { stockId: true },
        })
      ).map((row) => row.stockId),
    )

    const capturedAt = new Date()
    const snapshots: Prisma.StockFundamentalSnapshotCreateManyInput[] = []
    for (const item of snapshotItems) {
      const stockId = stockIdBySymbol.get(item.symbol)
      if (!stockId || taken.has(stockId)) continue

      if (item.metrics) {
        const data = {
          stockId,
          capturedAt,
          marketCap: decimal(item.metrics.marketCap),
          peRatio: decimal(item.metrics.pe),
          dividendYield: decimal(item.metrics.dividendYield),
          roce: decimal(item.metrics.roce),
          sourceUrl: item.sourceUrl,
          parserVersion: 'screener-market@1.0.0',
          rawData: { source: 'screener-market', sourceUrl: item.sourceUrl, metrics: { ...item.metrics } } as Prisma.InputJsonValue,
        }
        snapshots.push({ ...data, viewSummary: buildViewSummary(item, data) } as Prisma.StockFundamentalSnapshotCreateManyInput)
      } else if (item.ipoMetrics) {
        // Listing-time IPO figures are stored as raw data only; the detail page
        // (fetched by enrichment) replaces this snapshot with real fundamentals.
        const data = {
          stockId,
          capturedAt,
          sourceUrl: item.sourceUrl,
          parserVersion: 'screener-ipo@1.0.0',
          rawData: { source: 'screener-ipo', sourceUrl: item.sourceUrl, metrics: { ...item.ipoMetrics } } as Prisma.InputJsonValue,
        }
        snapshots.push({ ...data, viewSummary: buildViewSummary(item, data) } as Prisma.StockFundamentalSnapshotCreateManyInput)
      }
    }
    if (snapshots.length) {
      await prisma.stockFundamentalSnapshot.createMany({ data: snapshots })
    }
  }

  const stockIds = items
    .map((item) => stockIdBySymbol.get(item.symbol))
    .filter((id): id is string => typeof id === 'string')
  const memberships = stockIds.length
  if (memberships) {
    const linked = new Set(
      (
        await prisma.scannerStock.findMany({
          where: { scannerId, stockId: { in: stockIds } },
          select: { stockId: true },
        })
      ).map((row) => row.stockId),
    )
    const fresh = stockIds.filter((id) => !linked.has(id))
    if (fresh.length) {
      await prisma.scannerStock.createMany({
        data: fresh.map((stockId) => ({ scannerId, stockId, sourceId })),
        skipDuplicates: true,
      })
    }
    await prisma.scannerStock.updateMany({
      where: { scannerId, stockId: { in: stockIds } },
      data: { lastSeenAt: new Date(), sourceId },
    })
    // New stocks / snapshots / memberships were written, so the dashboard memo
    // is stale. Invalidate locally; other instances notice via the DB signature.
    invalidateOpportunityCache()
  }
  return { created, updated, memberships }
}

function reportStatusToFetchRun(status: MarketImportReport['status'] | ScreenImportStatus | IpoImportStatus | ResultsImportStatus): FetchRunStatus {
  if (status === 'complete') return 'SUCCEEDED'
  if (status === 'failed') return 'FAILED'
  return 'PARTIAL'
}

const MAX_NUMERIC_LOOKUPS = 8

/**
 * Upgrade numeric warehouse codes to their canonical ticker when the company
 * name resolves to one; otherwise keep the member under its numeric code so a
 * BSE/SME row is never silently lost. Lookups are bounded so a listing full of
 * codes cannot exhaust the invocation budget, and an invented ticker is never
 * persisted (a code is kept verbatim, never fabricated).
 */
async function resolveNumericMembers<T extends { symbol: string; companyName: string | null }>(
  items: T[],
  warnings: string[],
  maxLookups: number,
): Promise<T[]> {
  const resolvedItems: T[] = []
  let lookups = 0
  let keptAsCode = 0
  for (const item of items) {
    if (!isNumericCode(item.symbol)) {
      resolvedItems.push(item)
      continue
    }
    const name = item.companyName
    if (name && lookups < maxLookups) {
      lookups += 1
      const resolved = await resolveSymbolFromName(name).catch(() => null)
      if (resolved) {
        resolvedItems.push({ ...item, symbol: resolved })
        continue
      }
    }
    // No listed ticker could be established; keep the member under its numeric
    // source code (flagged as unresolved in the UI) instead of dropping it.
    resolvedItems.push(item)
    keptAsCode += 1
  }
  if (keptAsCode) {
    warnings.push(`Kept ${keptAsCode} member(s) under their numeric source code (no listed ticker was found).`)
  }
  return resolvedItems
}

/**
 * Progressively attach fundamentals to list members. Only symbols without a
 * screener detail snapshot are fetched, so repeated imports and cron runs advance
 * instead of re-enriching the same leading symbols. Returns how many remain.
 */
async function enrichMembers(allSymbols: string[], max: number, delayMs: number): Promise<{ enriched: number; skipped: number; pending: number }> {
  if (max <= 0 || !allSymbols.length) return { enriched: 0, skipped: 0, pending: 0 }

  const unique = Array.from(new Set(allSymbols))
  const already = await prisma.stock.findMany({
    where: { symbol: { in: unique }, fundamentals: { some: { parserVersion: { startsWith: 'screener@' } } } },
    select: { symbol: true },
  })
  const pending = pendingEnrichmentSymbols(unique, already.map((row) => row.symbol))

  let enriched = 0
  let skipped = 0
  for (const symbol of pending.slice(0, max)) {
    if (rateLimited(`ingest:${symbol}`, 2, 60_000)) {
      skipped += 1
      continue
    }
    try {
      const company = await scrapeScreenerSymbolLite(symbol)
      if (company) {
        await upsertStockFromScrape(company)
        enriched += 1
      } else {
        skipped += 1
      }
    } catch {
      skipped += 1
    }
    if (delayMs) await delay(delayMs)
  }
  return { enriched, skipped, pending: Math.max(0, pending.length - enriched) }
}

async function finishRun(
  runId: string,
  status: FetchRunStatus,
  counts: { found: number; created: number; updated: number },
  parserVersion: string | null,
  diagnostics: Prisma.InputJsonValue,
  errorSummary: string | null,
): Promise<void> {
  await prisma.fetchRun.update({
    where: { id: runId },
    data: {
      status,
      endedAt: new Date(),
      itemsFound: counts.found,
      itemsCreated: counts.created,
      itemsUpdated: counts.updated,
      parserVersion,
      diagnostics,
      errorSummary,
    },
  })
}

/** Run (or re-run) a single configured source and persist the outcome. */
export async function runSourceImport(sourceId: string, options: { maxPages?: number; maxEnrich?: number; delayMs?: number } = {}): Promise<ImportSummary> {
  const source = await prisma.scannerSource.findUnique({ where: { id: sourceId }, include: { scanner: { select: { id: true } } } })
  if (!source) throw new Error('Source not found.')

  const kind = kindFromUrl(source.url)

  // Overlap guard: never start a second run for a source that is already being
  // imported (manual click during cron, or a retried request).
  const inFlight = await prisma.fetchRun.findFirst({
    where: { sourceId: source.id, status: 'RUNNING', startedAt: { gte: new Date(Date.now() - 120_000) } },
    select: { id: true },
  })
  if (inFlight) {
    return { ok: true, status: 'PARTIAL', kind, found: 0, created: 0, updated: 0, memberships: 0, enriched: 0, warnings: [], message: 'A run for this source is already in progress; skipped to avoid overlap.' }
  }

  const run = await prisma.fetchRun.create({
    data: { sourceId: source.id, status: 'RUNNING', sourceUrl: source.url },
    select: { id: true },
  })

  if (!kind) {
    await finishRun(run.id, 'FAILED', { found: 0, created: 0, updated: 0 }, null, { reason: 'unsupported-url' }, 'Unsupported source URL.')
    return { ok: false, status: 'FAILED', kind: null, found: 0, created: 0, updated: 0, memberships: 0, enriched: 0, warnings: [], message: 'Unsupported source URL.' }
  }

  const scannerId = source.scanner.id
  // Keep one serverless invocation bounded. Market categories enrich a member
  // per row, so they stay on a smaller budget; symbol-list sources (screens and
  // IPO listings) are cheap per page and may cover a whole listing in one run.
  const marketMaxPages = options.maxPages ?? 10
  const listMaxPages = options.maxPages ?? listPageLimit()
  const warnings: string[] = []
  let status: FetchRunStatus = 'FAILED'
  let found = 0
  let created = 0
  let updated = 0
  let memberships = 0
  let enriched = 0
  let parserVersion: string | null = null
  let errorSummary: string | null = null
  const diagnostics: Record<string, unknown> = { kind }

  try {
    if (kind === 'screener-market') {
      const segments = segmentsFromMarketUrl(source.url)
      if (!segments) throw new Error('Could not read a market category path from the URL.')
      const { report, rows } = await collectMarketCategory(segments, async (url) => (await screenerFetchPolite(url)).html, {
        maxPages: marketMaxPages,
        delayMs: 300,
      })
      Object.assign(diagnostics, { report })
      warnings.push(...report.warnings)
      const marketItems = await resolveNumericMembers(
        rows.map((row) => ({ symbol: row.symbol, companyName: row.companyName, metrics: row.metrics, sourceUrl: row.sourceUrl })),
        warnings,
        MAX_NUMERIC_LOOKUPS,
      )
      found = marketItems.length
      const persisted = await persistItems(scannerId, source.id, marketItems)
      created = persisted.created
      updated = persisted.updated
      memberships = persisted.memberships
      status = reportStatusToFetchRun(report.status)
      parserVersion = 'screener-market@1.0.0'
      if (status === 'FAILED') errorSummary = 'No pages could be fetched from the category listing.'

      if (persisted.memberships) {
        const enrichResult = await enrichMembers(marketItems.map((item) => item.symbol), Math.max(0, options.maxEnrich ?? Number(process.env.INGEST_MAX_ENRICH ?? '25')), options.delayMs ?? 250)
        enriched = enrichResult.enriched
        diagnostics.enrichSkipped = enrichResult.skipped
        diagnostics.enrichPending = enrichResult.pending
      }
    } else if (kind === 'screener-screen' || kind === 'screener-raw-screen') {
      const { symbols, report } = await collectScreenerScreen(source.url, async (url) => (await screenerFetchPolite(url)).html, {
        maxPages: listMaxPages,
        delayMs: 150,
      })
      Object.assign(diagnostics, { report })
      warnings.push(...report.warnings)
      found = symbols.length

      if (symbols.length) {
        const screenItems = await resolveNumericMembers(
          symbols.map((symbol) => ({ symbol: symbol.symbol, companyName: symbol.companyName })),
          warnings,
          MAX_NUMERIC_LOOKUPS,
        )
        const persisted = await persistItems(scannerId, source.id, screenItems)
        created = persisted.created
        updated = persisted.updated
        memberships = persisted.memberships
        status = reportStatusToFetchRun(report.status)
        parserVersion = kind === 'screener-raw-screen' ? SCREENER_RAW_PARSER_VERSION : 'screener-screen@1.0.0'
        if (status === 'FAILED') errorSummary = 'No pages could be fetched from the screen.'

        if (persisted.memberships) {
          const enrichResult = await enrichMembers(screenItems.map((item) => item.symbol), Math.max(0, options.maxEnrich ?? Number(process.env.INGEST_MAX_ENRICH ?? '25')), options.delayMs ?? 250)
          enriched = enrichResult.enriched
          diagnostics.enrichSkipped = enrichResult.skipped
          diagnostics.enrichPending = enrichResult.pending
        }
      } else {
        status = 'FAILED'
        errorSummary = report.authRequired
          ? 'Screener.in returned its sign-in page — this raw query needs a signed-in session (SCREENER_EMAIL / SCREENER_PASSWORD).'
          : report.pagesFetched > 0 ? 'No rows were parsed from this source.' : 'No pages could be fetched from the screen.'
      }
    } else if (kind === 'screener-ipo') {
      const { report, rows } = await collectScreenerIpo(source.url, async (url) => (await screenerFetchPolite(url)).html, {
        maxPages: listMaxPages,
        delayMs: 150,
      })
      Object.assign(diagnostics, { report })
      warnings.push(...report.warnings)
      const ipoItems: IngestItem[] = rows.map((row) => ({ symbol: row.symbol, companyName: row.companyName, ipoMetrics: row.metrics, sourceUrl: row.sourceUrl }))
      found = ipoItems.length

      if (ipoItems.length) {
        const persisted = await persistItems(scannerId, source.id, ipoItems)
        created = persisted.created
        updated = persisted.updated
        memberships = persisted.memberships
        status = reportStatusToFetchRun(report.status)
        parserVersion = 'screener-ipo@1.0.0'
        if (status === 'FAILED') errorSummary = 'No pages could be fetched from the IPO listing.'

        if (persisted.memberships) {
          const enrichResult = await enrichMembers(ipoItems.map((item) => item.symbol), Math.max(0, options.maxEnrich ?? Number(process.env.INGEST_MAX_ENRICH ?? '25')), options.delayMs ?? 250)
          enriched = enrichResult.enriched
          diagnostics.enrichSkipped = enrichResult.skipped
          diagnostics.enrichPending = enrichResult.pending
        }
      } else {
        status = 'FAILED'
        errorSummary = report.pagesFetched > 0 ? 'No rows were parsed from this source.' : 'No pages could be fetched from the IPO listing.'
      }
    } else if (kind === 'screener-results') {
      const { symbols, report } = await collectScreenerResults(source.url, async (url) => (await screenerFetchPolite(url)).html, {
        maxPages: listMaxPages,
        delayMs: 150,
      })
      Object.assign(diagnostics, { report })
      warnings.push(...report.warnings)
      found = symbols.length

      if (symbols.length) {
        const resultItems = await resolveNumericMembers(
          symbols.map((symbol) => ({ symbol: symbol.symbol, companyName: symbol.companyName })),
          warnings,
          MAX_NUMERIC_LOOKUPS,
        )
        const persisted = await persistItems(scannerId, source.id, resultItems)
        created = persisted.created
        updated = persisted.updated
        memberships = persisted.memberships
        status = reportStatusToFetchRun(report.status)
        parserVersion = SCREENER_RESULTS_PARSER_VERSION
        if (status === 'FAILED') errorSummary = 'No pages could be fetched from the results listing.'

        if (persisted.memberships) {
          const enrichResult = await enrichMembers(resultItems.map((item) => item.symbol), Math.max(0, options.maxEnrich ?? Number(process.env.INGEST_MAX_ENRICH ?? '25')), options.delayMs ?? 250)
          enriched = enrichResult.enriched
          diagnostics.enrichSkipped = enrichResult.skipped
          diagnostics.enrichPending = enrichResult.pending
        }
      } else {
        status = 'FAILED'
        errorSummary = report.authRequired
          ? 'Screener.in returned its sign-in page — the latest-results listing needs a signed-in session (SCREENER_EMAIL / SCREENER_PASSWORD).'
          : report.pagesFetched > 0 ? 'No all-green quarterly results were parsed from this source.' : 'No pages could be fetched from the results listing.'
      }
    } else if (kind === 'chartink-scan') {
      const result = await fetchChartinkScan(source.url)
      warnings.push(...result.warnings)
      parserVersion = CHARTINK_PARSER_VERSION
      diagnostics.chartinkStatus = result.status
      found = result.rows.length

      if (result.rows.length) {
        const items: IngestItem[] = result.rows.map((row) => ({ symbol: row.symbol, companyName: row.companyName }))
        const persisted = await persistItems(scannerId, source.id, items)
        created = persisted.created
        updated = persisted.updated
        memberships = persisted.memberships
        status = 'SUCCEEDED'

        const enrichResult = await enrichMembers(items.map((item) => item.symbol), Math.max(0, options.maxEnrich ?? Number(process.env.INGEST_MAX_ENRICH ?? '25')), options.delayMs ?? 250)
        enriched = enrichResult.enriched
        diagnostics.enrichSkipped = enrichResult.skipped
        diagnostics.enrichPending = enrichResult.pending
      } else {
        status = 'FAILED'
        errorSummary = result.warnings[0] ?? 'No rows were parsed from the Chartink scan.'
      }
    } else {
      const fetched = await fetchSourceHtml(source.url)
      if (!fetched.html) {
        errorSummary = fetched.stopped ? `Source blocked the request (HTTP ${fetched.status}); stopping without a bypass.` : `Source returned HTTP ${fetched.status || 'error'}.`
        if (fetched.reason) warnings.push(fetched.reason)
        diagnostics.stopped = fetched.stopped
      } else {
        const result = parseSource(fetched.html, kind, source.url)
        parserVersion = result.parserVersion
        warnings.push(...result.warnings)

        if (kind === 'screener-company') {
          const symbol = symbolFromCompanyHref(source.url)
          if (!symbol) {
            errorSummary = 'Could not determine the company symbol from the URL.'
          } else {
            const company = await scrapeScreenerSymbol(symbol)
            if (company) {
              await upsertStockFromScrape(company)
              const persisted = await persistItems(scannerId, source.id, [{ symbol: company.symbol, companyName: company.companyName }])
              found = 1
              created = persisted.created
              updated = persisted.updated
              memberships = persisted.memberships
              status = 'SUCCEEDED'
            } else {
              errorSummary = `Company not found on the source for ${symbol}.`
            }
          }
        } else {
          const items: IngestItem[] = result.symbols.map((row) => ({ symbol: row.symbol, companyName: row.companyName }))
          found = items.length
          if (items.length) {
            const persisted = await persistItems(scannerId, source.id, items)
            created = persisted.created
            updated = persisted.updated
            memberships = persisted.memberships
            status = 'SUCCEEDED'

            const enrichResult = await enrichMembers(items.map((item) => item.symbol), Math.max(0, options.maxEnrich ?? Number(process.env.INGEST_MAX_ENRICH ?? '25')), options.delayMs ?? 250)
            enriched = enrichResult.enriched
            diagnostics.enrichSkipped = enrichResult.skipped
            diagnostics.enrichPending = enrichResult.pending
          } else {
            errorSummary = 'No rows were parsed from this source.'
          }
        }
      }
    }
  } catch (error) {
    errorSummary = error instanceof Error ? error.message : 'Import failed.'
    console.error(`[ingest] source ${sourceId} failed`, error)
  }

  if (status === 'SUCCEEDED' && errorSummary) status = 'PARTIAL'

  await finishRun(run.id, status, { found, created, updated }, parserVersion, diagnostics as Prisma.InputJsonValue, errorSummary)

  const enrichNote = enriched ? ` and enriched ${enriched} fundamental row(s)` : ''
  const message = status === 'SUCCEEDED'
    ? `Imported ${memberships} member(s) from ${kind}${enrichNote}.`
    : status === 'PARTIAL'
      ? `Partially imported ${memberships} member(s)${enrichNote}; see warnings.`
      : errorSummary ?? 'Import produced no rows.'

  return { ok: status !== 'FAILED', status, kind, found, created, updated, memberships, enriched, warnings, message }
}

/** Run every enabled source whose last run is older than its fetch interval. */
export async function runDueSources(options: { limit?: number; delayMs?: number } = {}): Promise<{ ran: number; results: ImportSummary[] }> {
  const limit = Math.max(1, options.limit ?? 25)
  const sources = await prisma.scannerSource.findMany({
    where: { enabled: true, scanner: { enabled: true } },
    include: { fetchRuns: { orderBy: { startedAt: 'desc' }, take: 1 } },
    take: limit,
  })

  const results: ImportSummary[] = []
  for (const source of sources) {
    const last = source.fetchRuns[0]
    const due = !last?.endedAt || Date.now() - last.endedAt.getTime() >= source.fetchInterval * 1000
    if (!due) continue
    results.push(await runSourceImport(source.id))
    if (options.delayMs !== 0) await delay(options.delayMs ?? 1500)
  }
  return { ran: results.length, results }
}

export type { ParsedSymbol }
