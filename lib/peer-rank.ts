import type { PeerRow } from './scrapers/screener-detail'

export type PeerRanking = {
  /** Highest-ROCE row in the comparison (null when no peer reports ROCE). */
  bestRoce: PeerRow | null
  /** Best blended row — a different metric to Best ROCE by design. */
  topPick: PeerRow | null
  topPickScore: number | null
  /** Human-readable contributions behind the top-pick score, for a tooltip. */
  topPickReasons: string[]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Transparent rule-based blend so "Top Pick" is not just whichever company has
 * the highest ROCE. ROCE is the anchor (50), profit growth (25) and sales growth
 * (15) add momentum, and a sane P/E adds up to 10. Peers must report ROCE to
 * qualify, so a row with no quality signal is never crowned.
 */
function scoreOf(peer: PeerRow): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0

  if (peer.roce != null && Number.isFinite(peer.roce)) {
    score += clamp(peer.roce, 0, 60) * 0.5
    reasons.push(`ROCE ${peer.roce.toFixed(1)}%`)
  }
  if (peer.profitGrowth != null && Number.isFinite(peer.profitGrowth)) {
    score += clamp(peer.profitGrowth, -50, 100) * 0.25
    reasons.push(`Profit ${peer.profitGrowth >= 0 ? '+' : ''}${peer.profitGrowth.toFixed(1)}%`)
  }
  if (peer.salesGrowth != null && Number.isFinite(peer.salesGrowth)) {
    score += clamp(peer.salesGrowth, -50, 100) * 0.15
    reasons.push(`Sales ${peer.salesGrowth >= 0 ? '+' : ''}${peer.salesGrowth.toFixed(1)}%`)
  }
  if (peer.pe != null && Number.isFinite(peer.pe) && peer.pe > 0) {
    score += clamp((30 - peer.pe) / 30, 0, 1) * 10
    reasons.push(`P/E ${peer.pe.toFixed(1)}`)
  }

  return { score, reasons }
}

export function rankPeers(peers: PeerRow[]): PeerRanking {
  const eligible = peers.filter((peer) => peer.roce != null && Number.isFinite(peer.roce))
  if (!eligible.length) return { bestRoce: null, topPick: null, topPickScore: null, topPickReasons: [] }

  const bestRoce = eligible.reduce((best, peer) => ((peer.roce as number) > (best.roce as number) ? peer : best))

  let topPick = eligible[0]
  let topPickScore = -Infinity
  let topPickReasons: string[] = []
  for (const peer of eligible) {
    const { score, reasons } = scoreOf(peer)
    if (score > topPickScore) {
      topPick = peer
      topPickScore = score
      topPickReasons = reasons
    }
  }

  return { bestRoce, topPick, topPickScore, topPickReasons }
}
