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
