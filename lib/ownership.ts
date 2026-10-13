import type { DetailTable } from './scrapers/screener-detail'

/**
 * Smart-money / ownership change detection.
 *
 * screener.in saves a shareholding table (quarterly and/or yearly) with one row
 * per holder group. We only compare *dated* values that are actually present —
 * never infer institutional buying from price action — and we prefer the more
 * granular quarterly table when it has at least two reported periods. When no
 * comparable periods exist the caller reports the limitation instead of a trend.
 */

export type OwnershipBasis = 'quarterly' | 'yearly'

export type OwnershipHolding = {
  key: 'promoter' | 'fii' | 'dii'
  label: string
  /** Latest reported holding (%). */
  latest: number
  /** Prior reported holding (%), null when only one period exists. */
  previous: number | null
  /** Change in percentage points, null when not comparable. */
  changePp: number | null
  latestPeriod: string
  previousPeriod: string | null
}

export type OwnershipTrend = {
  basis: OwnershipBasis
  period: string
  holdings: OwnershipHolding[]
  signals: string[]
}

const GROUPS = [
  { key: 'promoter', label: 'Promoters', match: /^promoters?/i },
  { key: 'fii', label: 'FIIs', match: /^fiis?/i },
  { key: 'dii', label: 'DIIs', match: /^diis?/i },
] as const

const SIGNAL_THRESHOLD_PP = 0.25

function toNumber(value: unknown): number | null {
  if (value == null) return null
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const numeric = Number(match[0])
  return Number.isFinite(numeric) ? numeric : null
}

function seriesFor(table: DetailTable, match: RegExp): { value: number; label: string }[] {
  const row = table.rows.find((entry) => match.test(entry.label.trim()))
  if (!row) return []
  const out: { value: number; label: string }[] = []
  table.columns.forEach((column, index) => {
    const value = toNumber(row.values[index])
    if (value != null) out.push({ value, label: column })
  })
  return out
}

function usable(table: DetailTable | null | undefined): boolean {
  if (!table || table.columns.length < 2) return false
  return GROUPS.some((group) => seriesFor(table, group.match).length >= 2)
}

export function ownershipTrend(
  shareholding: { quarterly: DetailTable | null; yearly: DetailTable | null } | null | undefined,
): OwnershipTrend | null {
  if (!shareholding) return null
  const basis: OwnershipBasis | null = usable(shareholding.quarterly)
    ? 'quarterly'
    : usable(shareholding.yearly)
      ? 'yearly'
      : null
  if (!basis) return null
  const table = basis === 'quarterly' ? shareholding.quarterly! : shareholding.yearly!

  const holdings: OwnershipHolding[] = []
  const signals: string[] = []
  for (const group of GROUPS) {
    const series = seriesFor(table, group.match)
    if (!series.length) continue
    const latest = series[series.length - 1]
    const prior = series.length >= 2 ? series[series.length - 2] : null
    const changePp = prior ? Number((latest.value - prior.value).toFixed(2)) : null
    holdings.push({
      key: group.key,
      label: group.label,
      latest: latest.value,
      previous: prior ? prior.value : null,
      changePp,
      latestPeriod: latest.label,
      previousPeriod: prior ? prior.label : null,
    })
    if (changePp != null && Math.abs(changePp) >= SIGNAL_THRESHOLD_PP) {
      signals.push(
        `${group.label} ${changePp > 0 ? 'rising' : 'falling'} ${changePp > 0 ? '+' : ''}${changePp.toFixed(2)} pp (${prior!.label} → ${latest.label})`,
      )
    }
  }

  if (!holdings.length) return null
  return { basis, period: holdings[0].latestPeriod, holdings, signals }
}
