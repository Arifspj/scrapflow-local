import { NextResponse } from 'next/server'

/**
 * Lightweight shared-secret protection for the admin write/import endpoints and
 * the cron trigger. The secret is supplied by the caller as either an
 * `x-admin-secret` header, an `Authorization: Bearer <secret>` header, or a
 * `?secret=` query parameter (handy for manual cron pings).
 */
function secretFrom(request: Request, headerNames: string[]): string | null {
  for (const name of headerNames) {
    const value = request.headers.get(name)
    if (value) return value.replace(/^Bearer\s+/i, '').trim()
  }
  try {
    return new URL(request.url).searchParams.get('secret')?.trim() ?? null
  } catch {
    return null
  }
}

function equals(expected: string | undefined, provided: string | null): boolean {
  if (!expected || !provided) return false
  if (expected.length !== provided.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i)
  return diff === 0
}

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_SECRET?.trim())
}

export function cronConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET?.trim())
}

export function isAdminRequest(request: Request): boolean {
  return equals(process.env.ADMIN_SECRET?.trim(), secretFrom(request, ['x-admin-secret', 'authorization']))
}

export function isCronRequest(request: Request): boolean {
  return equals(process.env.CRON_SECRET?.trim(), secretFrom(request, ['authorization', 'x-cron-secret']))
}

/** Returns a 401/503 response when the request may not run admin actions. */
export function requireAdmin(request: Request): NextResponse | null {
  if (!adminConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Admin API is disabled: set ADMIN_SECRET on the server to enable it.' },
      { status: 503 },
    )
  }
  if (!isAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  }
  return null
}

/** Returns a 401/503 response when the request may not trigger the scheduler. */
export function requireCron(request: Request): NextResponse | null {
  if (!cronConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Scheduler is disabled: set CRON_SECRET on the server to enable it.' },
      { status: 503 },
    )
  }
  if (!isCronRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  }
  return null
}
