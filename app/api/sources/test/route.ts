import { NextResponse } from 'next/server'

const hostsByType: Record<string, string[]> = {
  'Chartink technical scan': ['chartink.com', 'www.chartink.com'],
  'Screener public screen': ['screener.in', 'www.screener.in'],
  'Screener company page': ['screener.in', 'www.screener.in'],
}

function extractSymbols(html: string, type: string) {
  const symbols = new Set<string>()
  if (type.startsWith('Chartink')) {
    for (const match of html.matchAll(/\b[A-Z][A-Z0-9&.-]{1,14}\b/g)) symbols.add(match[0])
  } else {
    for (const match of html.matchAll(/(?:company\/|NSE:\s*)([A-Z][A-Z0-9&.-]{1,14})/g)) symbols.add(match[1])
  }
  return [...symbols].slice(0, 25)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const url = new URL(String(body.url ?? ''))
    const type = String(body.type ?? '')
    const allowedHosts = hostsByType[type]
    if (url.protocol !== 'https:' || !allowedHosts?.includes(url.hostname)) {
      return NextResponse.json({ error: 'URL host does not match the selected source type.' }, { status: 400 })
    }
    const response = await fetch(url, { headers: { 'user-agent': 'Q-Scan source preview/1.0' }, cache: 'no-store', signal: AbortSignal.timeout(10000) })
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok) return NextResponse.json({ error: `Source returned HTTP ${response.status}.` }, { status: 502 })
    if (!contentType.includes('text/html')) return NextResponse.json({ error: 'Source did not return HTML.' }, { status: 502 })
    const symbols = extractSymbols(await response.text(), type)
    return NextResponse.json({ status: response.status, symbolCount: symbols.length, symbols })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Source preview failed.' }, { status: 502 })
  }
}
