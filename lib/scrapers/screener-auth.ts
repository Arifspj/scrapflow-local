const SCREENER_BASE = 'https://www.screener.in'

export const SCREENER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

type CookieJar = Record<string, string>

function parseSetCookies(response: Response): CookieJar {
  const jar: CookieJar = {}
  const raw = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
  for (const cookie of raw) {
    const [pair] = cookie.split(';')
    const index = pair.indexOf('=')
    if (index > 0) jar[pair.slice(0, index).trim()] = pair.slice(index + 1)
  }
  return jar
}

function cookieHeader(jar: CookieJar): string {
  return Object.entries(jar)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ')
}

export function hasScreenerCredentials(): boolean {
  return Boolean(process.env.SCREENER_EMAIL && process.env.SCREENER_PASSWORD)
}

/**
 * Sign in to screener.in using the credentials in the environment and return a
 * session cookie string. Returns null when credentials are missing or the login
 * form/flow changed. The session is reused across requests (see getScreenerCookie).
 */
export async function loginScreener(): Promise<string | null> {
  const username = process.env.SCREENER_EMAIL
  const password = process.env.SCREENER_PASSWORD
  if (!username || !password) return null

  try {
    const loginPage = await fetch(`${SCREENER_BASE}/login/`, {
      headers: { 'user-agent': SCREENER_UA },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    const jar = parseSetCookies(loginPage)
    const html = await loginPage.text()
    const token = html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)?.[1]
    if (!token) return null

    const body = new URLSearchParams({
      csrfmiddlewaretoken: token,
      next: '',
      username,
      password,
    })
    const response = await fetch(`${SCREENER_BASE}/login/`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'user-agent': SCREENER_UA,
        'content-type': 'application/x-www-form-urlencoded',
        referer: `${SCREENER_BASE}/login/`,
        origin: SCREENER_BASE,
        cookie: cookieHeader(jar),
      },
      body,
      signal: AbortSignal.timeout(15000),
    })

    const merged: CookieJar = { ...jar, ...parseSetCookies(response) }
    if (!merged.sessionid) return null
    return cookieHeader(merged)
  } catch {
    return null
  }
}

let cached: { cookie: string; expiresAt: number } | null = null

/** Return a cached screener.in session cookie, logging in again when expired. */
export async function getScreenerCookie(): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now()) return cached.cookie
  const cookie = await loginScreener()
  if (cookie) cached = { cookie, expiresAt: Date.now() + 25 * 60 * 1000 }
  return cookie
}

/**
 * Fetch a screener.in URL with the authenticated session when available and
 * transparently fall back to an anonymous request otherwise.
 */
export async function screenerFetchText(url: string, timeoutMs = 15000): Promise<string | null> {
  const headers: Record<string, string> = {
    'user-agent': SCREENER_UA,
    accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
  }
  const cookie = await getScreenerCookie().catch(() => null)
  if (cookie) headers.cookie = cookie

  try {
    const response = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  }
}

export type PoliteFetchResult = {
  html: string | null
  status: number
  /** True when the source asked us to back off / blocked us and we stopped. */
  stopped: boolean
  reason?: string
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after')
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.min(Math.max(seconds, 0) * 1000, 30_000)
  const date = Date.parse(header)
  if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 30_000)
  return null
}

/**
 * Fetch a screener.in page while respecting the source:
 *  - `429` waits for `Retry-After` (capped) and retries a bounded number of times,
 *    then stops;
 *  - `403` stops immediately (no bypass, no spoofing);
 *  - any other failure is reported to the caller which records it honestly.
 * The same rate limiter and session cookie as `screenerFetchText` are reused.
 */
export async function screenerFetchPolite(
  url: string,
  options: { maxRetries?: number; timeoutMs?: number } = {},
): Promise<PoliteFetchResult> {
  const maxRetries = Math.max(0, options.maxRetries ?? 2)
  const timeoutMs = options.timeoutMs ?? 15000

  const cookie = await getScreenerCookie().catch(() => null)
  const requestHeaders: Record<string, string> = { 'user-agent': SCREENER_UA }
  if (cookie) requestHeaders.cookie = cookie

  let attempt = 0
  while (true) {
    let response: Response
    try {
      response = await fetch(url, { headers: requestHeaders, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      return { html: null, status: 0, stopped: false, reason: error instanceof Error ? error.message : 'Fetch failed.' }
    }

    if (response.status === 403) {
      return { html: null, status: 403, stopped: true, reason: 'Source returned 403 (forbidden); stopping without attempting a bypass.' }
    }
    if (response.status === 429) {
      if (attempt >= maxRetries) {
        return { html: null, status: 429, stopped: true, reason: 'Source is rate limiting (429) and the retry budget is exhausted.' }
      }
      const wait = retryAfterMs(response) ?? 2000 * (attempt + 1)
      await new Promise((resolve) => setTimeout(resolve, wait))
      attempt += 1
      continue
    }
    if (!response.ok) {
      return { html: null, status: response.status, stopped: false }
    }
    return { html: await response.text(), status: response.status, stopped: false }
  }
}
