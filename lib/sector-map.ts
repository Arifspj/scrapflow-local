import type { GrowthReading } from './growth-quality'

/**
 * Sector-level opportunity aggregation.
 *
 * A sector is only summarised when a minimum number of its companies have enough
 * data for the figure to mean anything; otherwise it is omitted rather than shown
 * with a misleading average. Financial sectors get a note because industrial
 * leverage / cash-flow rules do not apply to them.
 */

export const SECTOR_MIN_SAMPLE = 5
export const SECTOR_MIN_COVERAGE = 60

export type SectorInput = {
  sector: string | null
  sectorHref: string | null
  coveragePct: number
  opportunity: number | null
  roce: number | null
  pe: number | null
  profitGrowth: GrowthReading | null
  salesGrowth: GrowthReading | null
}

export type SectorSummary = {
  name: string
  href: string | null
  total: number
  covered: number
  medianRoce: number | null
  medianPe: number | null
  avgOpportunity: number | null
  risingCount: number
  improvingAboveMedian: number
  financial: boolean
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function medianOrNull(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function isFinancialSector(name: string): boolean {
  return /bank|financ|nbfc|insur|housing finance|capital market|asset management|broking|exchange|microfinanc/.test(
    name.toLowerCase(),
  )
}

function comparablePositive(reading: GrowthReading | null): boolean {
  return !!reading && reading.comparable && reading.pct != null && reading.pct > 0
}

export function summarizeSectors(
  inputs: SectorInput[],
  options?: { minSample?: number; minCoverage?: number },
): SectorSummary[] {
  const minSample = options?.minSample ?? SECTOR_MIN_SAMPLE
  const minCoverage = options?.minCoverage ?? SECTOR_MIN_COVERAGE

  const groups = new Map<string, SectorInput[]>()
  for (const input of inputs) {
    if (!input.sector) continue
    const list = groups.get(input.sector) ?? []
    list.push(input)
    groups.set(input.sector, list)
  }

  const summaries: SectorSummary[] = []
  for (const [name, list] of groups) {
    const covered = list.filter((input) => input.coveragePct >= minCoverage)
    if (covered.length < minSample) continue

    const roce = covered.map((input) => input.roce).filter((value): value is number => value != null)
    const pe = covered.map((input) => input.pe).filter((value): value is number => value != null && value > 0)
    const opportunities = covered.map((input) => input.opportunity).filter((value): value is number => value != null)
    const avgOpportunity = opportunities.length
      ? round1(opportunities.reduce((sum, value) => sum + value, 0) / opportunities.length)
      : null

    const risingCount = covered.filter(
      (input) => comparablePositive(input.profitGrowth) || comparablePositive(input.salesGrowth),
    ).length
    const improvingAboveMedian =
      avgOpportunity == null
        ? 0
        : covered.filter((input) => input.opportunity != null && input.opportunity > avgOpportunity).length

    const medianRoce = medianOrNull(roce)
    const medianPe = medianOrNull(pe)

    summaries.push({
      name,
      href: covered.find((input) => input.sectorHref)?.sectorHref ?? list.find((input) => input.sectorHref)?.sectorHref ?? null,
      total: list.length,
      covered: covered.length,
      medianRoce: medianRoce == null ? null : round1(medianRoce),
      medianPe: medianPe == null ? null : round1(medianPe),
      avgOpportunity,
      risingCount,
      improvingAboveMedian,
      financial: isFinancialSector(name),
    })
  }

  summaries.sort((a, b) => (b.avgOpportunity ?? -1) - (a.avgOpportunity ?? -1))
  return summaries
}
