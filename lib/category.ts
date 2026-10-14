import type { IndustryLink, IndustryLevelName } from './scrapers/screener-detail'

/**
 * Helpers for the DB-backed market/category pages.
 *
 * screener.in exposes a four-level industry hierarchy and links every company
 * to it as `/market/<code>/<code>/.../`. We do not mirror screener's taxonomy in
 * our own tables; instead a category page is derived from the saved
 * `rawData.industry` arrays of the companies already in the database. A path is
 * accepted when it has the right shape (1–4 alphanumeric segments); whether any
 * saved company actually belongs to it decides between an empty state and a
 * populated table.
 */

export const MARKET_LEVELS = ['broadSector', 'sector', 'broadIndustry', 'industry'] as const

export type MarketLevel = (typeof MARKET_LEVELS)[number]

export const LEVEL_LABEL: Record<MarketLevel, string> = {
  broadSector: 'Broad Sector',
  sector: 'Sector',
  broadIndustry: 'Broad Industry',
  industry: 'Industry',
}

const SEGMENT_PATTERN = /^[A-Z0-9]+$/

/**
 * Validate a `/market/[...slug]` path. Returns the upper-cased segments when the
 * shape is plausible, or null when it is structurally invalid (which should
 * surface as a 404 rather than an empty page).
 */
export function normalizeMarketSegments(slug: readonly string[] | undefined | null): string[] | null {
  if (!slug || slug.length === 0 || slug.length > MARKET_LEVELS.length) return null
  const segments = slug.map((segment) => segment.trim().toUpperCase())
  if (segments.some((segment) => !SEGMENT_PATTERN.test(segment))) return null
  return segments
}

/** The canonical screener.in URL for a category path, with trailing slash. */
export function categorySourceUrl(segments: readonly string[]): string {
  return `/market/${segments.join('/')}/`
}

function withTrailingSlash(url: string | null): string | null {
  if (!url) return null
  return `${url.replace(/\/+$/, '')}/`
}

/** The screener.in level a path depth maps to. */
export function categoryLevel(segments: readonly string[]): MarketLevel {
  return MARKET_LEVELS[Math.min(segments.length, MARKET_LEVELS.length) - 1]
}

/** Local (Next.js) href for a category path, without a trailing slash. */
export function categoryHref(segments: readonly string[]): string {
  return `/market/${segments.join('/')}`
}

/** True when a company's industry array contains exactly this category path. */
export function isInCategory(industry: readonly IndustryLink[], segments: readonly string[]): boolean {
  const target = categorySourceUrl(segments)
  return industry.some((link) => withTrailingSlash(link.url) === target)
}

/** The industry links up to and including the matched category path (breadcrumb). */
export function industryTrail(industry: readonly IndustryLink[], segments: readonly string[]): IndustryLink[] {
  const target = categorySourceUrl(segments)
  const index = industry.findIndex((link) => withTrailingSlash(link.url) === target)
  return index >= 0 ? industry.slice(0, index + 1) : []
}

export type CategoryCrumb = {
  level: IndustryLevelName
  name: string | null
  url: string | null
}

export type CategoryStockRow = {
  symbol: string
  companyName: string | null
  price: number | null
  marketCap: number | null
  pe: number | null
  roce: number | null
  roe: number | null
  debtToEquity: number | null
  salesYoy: number | null
  operatingProfitYoy: number | null
  profitYoy: number | null
  score: number | null
  scoreCoverage: number
  badge: string
  badgeTone: 'good' | 'neutral'
  risks: string[]
}

export type CategoryImportMeta = {
  status: string
  totalResults: number | null
  uniqueCompanies: number
  pagesFetched: number
  pagesFailed: number
  finishedAt: string | null
}

export type CategoryData = {
  rows: CategoryStockRow[]
  /** Breadcrumb trail harvested from the first matching company. */
  trail: CategoryCrumb[]
  /** Latest import report, present once the category has been imported from source. */
  imported: CategoryImportMeta | null
}
