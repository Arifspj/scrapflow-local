/**
 * In-process memo for the heavy opportunity dashboard build.
 *
 * Kept in its own dependency-free module so the ingestion writers can invalidate
 * the dashboard without importing the whole data layer (which would drag the
 * model + cheerio graph into every route that persists a stock).
 *
 * The memo is keyed by a cheap database "signature" (row counts + newest
 * timestamps). Because that signature lives in the database, a write made by one
 * serverless instance is seen by every other instance on its next request — a
 * plain in-memory TTL could never do that, since instances cannot share memory.
 */

type Entry = { signature: string; at: number }

let entry: Entry | null = null
let value: unknown = null
let inflight: Promise<unknown> | null = null

/** The cached dashboard when it was built for exactly this signature. */
export function readOpportunityCache(signature: string): unknown | null {
  return entry && entry.signature === signature ? value : null
}

/** The last built dashboard regardless of signature (used as a DB-error fallback). */
export function readLatestOpportunityCache(): unknown | null {
  return value
}

/** Milliseconds since the last build, or null when nothing is cached. */
export function ageOfOpportunityCache(): number | null {
  return entry ? Date.now() - entry.at : null
}

export function writeOpportunityCache(signature: string, data: unknown): void {
  entry = { signature, at: Date.now() }
  value = data
}

export function getInflightOpportunity(): Promise<unknown> | null {
  return inflight
}

export function setInflightOpportunity(next: Promise<unknown> | null): void {
  inflight = next
}

/** Drop the memo so the next read rebuilds, even before the signature is checked. */
export function invalidateOpportunityCache(): void {
  entry = null
  value = null
}
