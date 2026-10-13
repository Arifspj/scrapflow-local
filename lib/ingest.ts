import { Prisma, type FetchRunStatus, type PipelineMode } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { parseSource } from '@/lib/scrapers'
import { KIND_TO_LABEL, kindFromUrl, type ParsedSymbol, type SourceKind } from '@/lib/scrapers/types'
import { collectMarketCategory, type MarketImportReport } from '@/lib/market-collect'
import { segmentsFromMarketUrl, type MarketCompanyRow } from '@/lib/scrapers/screener-market'
import { screenerFetchPolite } from '@/lib/scrapers/screener-auth'
import { symbolFromCompanyHref } from '@/lib/scrapers/screener'
import { rateLimited, scrapeScreenerSymbol } from '@/lib/scrapers/resolve'
import { upsertStockFromScrape } from '@/lib/stocks'

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

const CHARTINK_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function decimal(value: number | null | undefined): Prisma.Decimal | null {
  return value == null || !Number.isFinite(value) ? null : new Prisma.Decimal(value)
}

/** Fetch a non-screener page (Chartink) with a browser UA and a hard timeout. */
async function plainFetchHtml(url: string): Promise<{ html: string | null; status: number }> {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': CHARTINK_UA },
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    })
    if (!response.ok) return { html: null, status: response.status }
    return { html: await response.text(), status: response.status }
  } catch {
    return { html: null, status: 0 }
  }
}

async function fetchSourceHtml(url: string, kind: SourceKind): Promise<{ html: string | null; status: number; stopped: boolean; reason?: string }> {
  if (kind === 'chartink-scan') {
    const { html, status } = await plainFetchHtml(url)
    return { html, status, stopped: false }
  }
  return screenerFetchPolite(url)
}

/** Fetch + parse a source without writing anything. Used by the admin preview. */
export async function previewSource(rawUrl: string): Promise<SourcePreview> {
  const kind = kindFromUrl(rawUrl)
  if (!kind) {
    return { ok: false, kind: null, kindLabel: null, status: 0, stopped: false, symbolCount: 0, rows: [], warnings: [], message: 'Unsupported source URL. Use a screener.in /screens, /market or /company page, or a chartink.com scan.' }
  }

  const fetched = await fetchSourceHtml(rawUrl, kind)
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
    }

    await prisma.scannerStock.upsert({
      where: { scannerId_stockId: { scannerId, stockId: stock.id } },
      create: { scannerId, stockId: stock.id, sourceId },
      update: { lastSeenAt: new Date(), sourceId },
    })
    memberships += 1
  }
  return { created, updated, memberships }
}

function marketReportToStatus(report: MarketImportReport): FetchRunStatus {
  if (report.status === 'complete') return 'SUCCEEDED'
  if (report.status === 'failed') return 'FAILED'
  return 'PARTIAL'
}

async function enrichSymbols(symbols: string[], max: number, delayMs: number): Promise<{ enriched: number; skipped: number }> {
  let enriched = 0
  let skipped = 0
  for (const symbol of symbols.slice(0, max)) {
    if (rateLimited(`ingest:${symbol}`, 2, 60_000)) {
      skipped += 1
      continue
    }
    try {
      const company = await scrapeScreenerSymbol(symbol)
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
  skipped += Math.max(0, symbols.length - max)
  return { enriched, skipped }
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
  const run = await prisma.fetchRun.create({
    data: { sourceId: source.id, status: 'RUNNING', sourceUrl: source.url },
    select: { id: true },
  })

  if (!kind) {
    await finishRun(run.id, 'FAILED', { found: 0, created: 0, updated: 0 }, null, { reason: 'unsupported-url' }, 'Unsupported source URL.')
    return { ok: false, status: 'FAILED', kind: null, found: 0, created: 0, updated: 0, memberships: 0, enriched: 0, warnings: [], message: 'Unsupported source URL.' }
  }

  const scannerId = source.scanner.id
  // Keep one serverless invocation bounded; a category with more pages is
  // reported as PARTIAL and a later run continues from where it stopped.
  const maxPages = options.maxPages ?? 5
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
        maxPages,
        delayMs: 300,
      })
      Object.assign(diagnostics, { report })
      warnings.push(...report.warnings)
      found = rows.length
      const persisted = await persistItems(scannerId, source.id, rows.map((row) => ({ symbol: row.symbol, companyName: row.companyName, metrics: row.metrics, sourceUrl: row.sourceUrl })))
      created = persisted.created
      updated = persisted.updated
      memberships = persisted.memberships
      status = marketReportToStatus(report)
      parserVersion = 'screener-market@1.0.0'
      if (status === 'FAILED') errorSummary = 'No pages could be fetched from the category listing.'
    } else {
      const fetched = await fetchSourceHtml(source.url, kind)
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

            if (source.pipelineMode === ('LIST_AND_FUNDAMENTALS' satisfies PipelineMode)) {
              const maxEnrich = options.maxEnrich ?? Number(process.env.INGEST_MAX_ENRICH ?? '5')
              const enrichResult = await enrichSymbols(items.map((item) => item.symbol), Math.max(0, maxEnrich), options.delayMs ?? 800)
              enriched = enrichResult.enriched
              diagnostics.enrichSkipped = enrichResult.skipped
            }
          } else {
            errorSummary = kind === 'chartink-scan' ? 'Chartink serves scan rows through its process API, so no rows were present in the HTML.' : 'No rows were parsed from this source.'
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

  const message = status === 'SUCCEEDED'
    ? `Imported ${memberships} member(s) from ${kind}.`
    : status === 'PARTIAL'
      ? `Partially imported ${memberships} member(s); see warnings.`
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
