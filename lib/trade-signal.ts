/**
 * Shared BUY / SELL / HOLD verdict used by the stock-page price chart and the
 * homepage "BUY Signals" screener, so both speak the exact same language.
 *
 * The verdict is a small points model over two fundamentals that are always
 * available from a saved snapshot — the classic Q-Scan score and the valuation
 * (margin of safety / upside vs the forensic intrinsic value) — plus an optional
 * volume-confirmation term that only the chart can supply from price history.
 *
 * Each input contributes points; the totals roll up to a label:
 *   total ≥  2  → BUY
 *   total ≤ -2  → SELL
 *   otherwise   → HOLD
 *
 * Missing inputs add nothing (they are never treated as positive or negative),
 * which is why an unknown score/valuation simply can't produce a BUY.
 */

export type SignalLabel = 'BUY' | 'SELL' | 'HOLD'

/** Volume confirmation relative to a rolling average: direction, or none. */
export type VolumeSurge = 'up' | 'down' | null

export const SIGNAL_BUY_POINTS = 2
export const SIGNAL_SELL_POINTS = -2

/** Rolling window (bars) and multiple that flag an elevated-volume bar. */
export const VOLUME_LOOKBACK = 20
export const VOLUME_SURGE_RATIO = 1.5

/** Classic quality score (0–100): strong ≥70, middling 50–69, weak <50. */
export function scorePoints(score: number | null): number {
  if (score == null || !Number.isFinite(score)) return 0
  if (score >= 70) return 2
  if (score >= 50) return 1
  return -1
}

/** Valuation upside % = (intrinsic − price) / price × 100. */
export function upsidePoints(upside: number | null): number {
  if (upside == null || !Number.isFinite(upside)) return 0
  if (upside >= 15) return 2
  if (upside >= 0) return 1
  if (upside <= -15) return -2
  return -1
}

/**
 * Volume confirmation for the bar at `index`: the bar's volume is at least
 * `ratio`× the average of the preceding `lookback` bars, signed by whether the
 * close rose or fell on the day. Returns null inside the warm-up window, when the
 * average is unusable, or when volume is not elevated.
 */
export function volumeSurgeAt(
  bars: ReadonlyArray<{ close: number; volume: number }>,
  index: number,
  lookback = VOLUME_LOOKBACK,
  ratio = VOLUME_SURGE_RATIO,
): VolumeSurge {
  if (index < lookback || index < 1 || index >= bars.length) return null
  let sum = 0
  for (let cursor = index - lookback; cursor < index; cursor++) sum += bars[cursor].volume
  const average = sum / lookback
  if (average <= 0) return null
  if (bars[index].volume / average < ratio) return null
  return bars[index].close >= bars[index - 1].close ? 'up' : 'down'
}

export function classifySignal(score: number | null, upside: number | null, surge: VolumeSurge = null): SignalLabel {
  const hasScore = score != null && Number.isFinite(score)
  const hasUpside = upside != null && Number.isFinite(upside)
  // A verdict needs both halves of the call: the quality score and the valuation.
  // With only one of them the model can't judge whether a signal is real, so it
  // stays HOLD rather than inventing a BUY from half the evidence.
  if (!hasScore || !hasUpside) return 'HOLD'

  let points = scorePoints(score) + upsidePoints(upside)
  if (surge === 'up') points += 1
  else if (surge === 'down') points -= 1
  return points >= SIGNAL_BUY_POINTS ? 'BUY' : points <= SIGNAL_SELL_POINTS ? 'SELL' : 'HOLD'
}
