import { Prisma, type FetchRunStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { parseSource } from '@/lib/scrapers'
import { KIND_TO_LABEL, kindFromUrl, type ParsedSymbol, type SourceKind } from '@/lib/scrapers/types'
import { collectMarketCategory, type MarketImportReport } from '@/lib/market-collect'
import { collectScreenerScreen, type ScreenImportStatus } from '@/lib/screen-collect'
import { collectScreenerIpo, type IpoImportStatus } from '@/lib/ipo-collect'
import { segmentsFromMarketUrl, type MarketCompanyRow } from '@/lib/scrapers/screener-market'
import type { IpoMetrics } from '@/lib/scrapers/screener-ipo'
import { screenerFetchPolite } from '@/lib/scrapers/screener-auth'
import { symbolFromCompanyHref } from '@/lib/scrapers/screener'
import { rateLimited, resolveSymbolFromName, scrapeScreenerSymbol, scrapeScreenerSymbolLite } from '@/lib/scrapers/resolve'
import { CHARTINK_PARSER_VERSION, fetchChartinkScan } from '@/lib/scrapers/chartink'
import { isNumericCode, pendingEnrichmentSymbols } from '@/lib/enrich-queue'
import { upsertStockFromScrape } from '@/lib/stocks'
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
    return { ok: false, kind: null, kindLabel: null, status: 0, stopped: false, symbolCount: 0, rows: [], warnings: [], message: 'Unsupported source URL. Use a screener.in /screens, /ipo, /market or /company page, or a chartink.com scan.' }
  }

  // Public screens are paginated, so preview every page (bounded) the same way
  // the import will, otherwise the preview under-reports the real row count.
  if (kind === 'screener-screen') {
    const { symbols, report } = await collectScreenerScreen(rawUrl, async (url) => (await screenerFetchPolite(url)).html, { maxPages: listPageLimit(), delayMs: 120 })
    const rows = symbols.slice(0, 50).map((row) => ({ symbol: row.symbol, companyName: row.companyName }))
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

async function persistItems(scannerId: string, sourceId: string, items: IngestItem[]): Promise<{ created: number; updated: number; memberships: number }> {
  let created = 0
  let updated = 0
  let memberships = 0
  for (const item of items) {
    const existing = await prisma.stock.findUnique({ where: { symbol: item.symbol }, select: { id: true } })
    const stock = await prisma.stock.upsert({
      where: { symbol: item.symbol },
      create: { symbol: item.symbol, companyName: item.companyName },
      update: item.companyName ? { companyName: item.companyName } : {},
      select: { id: true },
    })
    if (existing) updated += 1
    else created += 1

    if (item.metrics) {
      const snapshot = await prisma.stockFundamentalSnapshot.findFirst({ where: { stockId: stock.id }, select: { id: true } })
      if (!snapshot) {
        await prisma.stockFundamentalSnapshot.create({
          data: {
            stockId: stock.id,
            marketCap: decimal(item.metrics.marketCap),
            peRatio: decimal(item.metrics.pe),
            dividendYield: decimal(item.metrics.dividendYield),
            roce: decimal(item.metrics.roce),
            sourceUrl: item.sourceUrl,
            parserVersion: 'screener-market@1.0.0',
            rawData: { source: 'screener-market', sourceUrl: item.sourceUrl, metrics: { ...item.metrics } } as Prisma.InputJsonValue,
          },
        })
      }
    } else if (item.ipoMetrics) {
      const snapshot = await prisma.stockFundamentalSnapshot.findFirst({ where: { stockId: stock.id }, select: { id: true } })
      if (!snapshot) {
        // Listing-time IPO figures are stored as raw data only; the detail page
        // (fetched by enrichment) replaces this snapshot with real fundamentals.
        await prisma.stockFundamentalSnapshot.create({
          data: {
            stockId: stock.id,
            sourceUrl: item.sourceUrl,
            parserVersion: 'screener-ipo@1.0.0',
            rawData: { source: 'screener-ipo', sourceUrl: item.sourceUrl, metrics: { ...item.ipoMetrics } } as Prisma.InputJsonValue,
          },
        })
      }
    }

    await prisma.scannerStock.upsert({
      where: { scannerId_stockId: { scannerId, stockId: stock.id } },
      create: { scannerId, stockId: stock.id, sourceId },
      update: { lastSeenAt: new Date(), sourceId },
    })
    memberships += 1
  }
  // New stocks / snapshots / memberships were written, so the dashboard memo is
  // stale. Invalidate locally; other instances notice via the DB signature.
  if (memberships) invalidateOpportunityCache()
  return { created, updated, memberships }
}

function reportStatusToFetchRun(status: MarketImportReport['status'] | ScreenImportStatus | IpoImportStatus): FetchRunStatus {
  if (status === 'complete') return 'SUCCEEDED'
  if (status === 'failed') return 'FAILED'
  return 'PARTIAL'
}

const MAX_NUMERIC_LOOKUPS = 8

/**
 * Replace numeric warehouse codes with their canonical ticker when the company
 * name resolves to one. Codes that cannot be resolved are dropped with a warning
 * so an invented ticker is never persisted. Lookups are capped so a listing full
 * of BSE codes cannot exhaust the invocation budget.
 */
async function resolveNumericMembers<T extends { symbol: string; companyName: string | null }>(
  items: T[],
  warnings: string[],
  maxLookups: number,
): Promise<T[]> {
  const resolvedItems: T[] = []
  let lookups = 0
  for (const item of items) {
    if (!isNumericCode(item.symbol)) {
      resolvedItems.push(item)
      continue
    }
    const name = item.companyName
    if (name == null || lookups >= maxLookups) {
      warnings.push(`Skipped numeric security code ${item.symbol}${name ? ` (${name})` : ''}: no ticker could be established.`)
      continue
    }
    lookups += 1
    const resolved = await resolveSymbolFromName(name).catch(() => null)
    if (resolved) resolvedItems.push({ ...item, symbol: resolved })
    else warnings.push(`Skipped numeric security code ${item.symbol} (${name}): no ticker could be established.`)
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
    } else if (kind === 'screener-screen') {
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
        parserVersion = 'screener-screen@1.0.0'
        if (status === 'FAILED') errorSummary = 'No pages could be fetched from the screen.'

        if (persisted.memberships) {
          const enrichResult = await enrichMembers(screenItems.map((item) => item.symbol), Math.max(0, options.maxEnrich ?? Number(process.env.INGEST_MAX_ENRICH ?? '25')), options.delayMs ?? 250)
          enriched = enrichResult.enriched
          diagnostics.enrichSkipped = enrichResult.skipped
          diagnostics.enrichPending = enrichResult.pending
        }
      } else {
        status = 'FAILED'
        errorSummary = report.pagesFetched > 0 ? 'No rows were parsed from this source.' : 'No pages could be fetched from the screen.'
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
