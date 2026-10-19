/**
 * Normalizes an absolute metric to a 0–100 scale for radar charts.
 *
 * Lower values can be made "better" with `inverse` (e.g. cheap P/E scores
 * higher). The result is clamped to 0–100; when a metric is missing or the
 * range collapses, `null`/a neutral fallback is returned so a chart never
 * fabricates a perfect score.
 */
export function normalizeMetric(
  value: number | null | undefined,
  min: number,
  max: number,
  inverse = false,
): number | null {
  if (value == null || !Number.isFinite(value)) return null
  if (max <= min + 1e-9) return 50
  let pct = (value - min) / (max - min)
  if (inverse) pct = 1 - pct
  const clamped = Math.max(0, Math.min(1, pct))
  return Math.round(clamped * 1000) / 10
}
