import { NextResponse } from 'next/server'
import { parseSource, sourceKindFromLabel } from '@/lib/scrapers'

const hostsByKind: Record<string, string[]> = {
  'chartink-scan': ['chartink.com', 'www.chartink.com'],
  'screener-screen': ['screener.in', 'www.screener.in'],
  'screener-company': ['screener.in', 'www.screener.in'],
}

const PREVIEW_LIMIT = 50

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'A JSON body with url and type is required.' }, { status: 400 })
    }

    const kind = sourceKindFromLabel(String((body as { type?: unknown }).type ?? ''))
    if (!kind) {
      return NextResponse.json({ error: 'URL host does not match the selected source type.' }, { status: 400 })
    }

    let url: URL
    try {
      url = new URL(String((body as { url?: unknown }).url ?? ''))
    } catch {
      return NextResponse.json({ error: 'A valid source URL is required.' }, { status: 400 })
    }

    const allowedHosts = hostsByKind[kind]
    if (url.protocol !== 'https:' || !allowedHosts.includes(url.hostname)) {
      return NextResponse.json({ error: 'URL host does not match the selected source type.' }, { status: 400 })
    }

    const response = await fetch(url, {
      headers: { 'user-agent': 'Q-Scan source preview/1.0 (+https://screener.in)' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      return NextResponse.json({ error: `Source returned HTTP ${response.status}.` }, { status: 502 })
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) {
      return NextResponse.json({ error: 'Source did not return HTML.' }, { status: 502 })
    }

    const html = await response.text()
    const result = parseSource(html, kind, url.toString())
    const preview = result.symbols.slice(0, PREVIEW_LIMIT)

    return NextResponse.json({
      status: response.status,
      kind: result.kind,
      parserVersion: result.parserVersion,
      symbolCount: result.symbols.length,
      symbols: preview.map((row) => row.symbol),
      rows: preview,
      fundamentals: result.fundamentals,
      warnings: result.warnings,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Source preview failed.' },
      { status: 502 },
    )
  }
}
