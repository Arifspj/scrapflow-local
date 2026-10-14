import { describe, expect, it } from 'vitest'
import { rankPeers } from './peer-rank'
import type { PeerRow } from './scrapers/screener-detail'

function peer(partial: Partial<PeerRow>): PeerRow {
  return {
    companyId: null,
    name: 'X',
    symbol: null,
    href: null,
    cmp: null,
    pe: null,
    marketCap: null,
    dividendYield: null,
    netProfitQtr: null,
    profitGrowth: null,
    salesQtr: null,
    salesGrowth: null,
    roce: null,
    isSelf: false,
    ...partial,
  }
}

describe('rankPeers', () => {
  it('finds the highest ROCE and a distinct blended top pick', () => {
    const peers = [
      peer({ name: 'HighRoce', roce: 48, profitGrowth: 5, salesGrowth: 5, pe: 45 }),
      peer({ name: 'Balanced', roce: 38, profitGrowth: 79, salesGrowth: 35, pe: 18 }),
    ]
    const ranking = rankPeers(peers)
    expect(ranking.bestRoce?.name).toBe('HighRoce')
    expect(ranking.topPick?.name).toBe('Balanced')
    expect(ranking.topPickScore).toBeGreaterThan(0)
    expect(ranking.topPickReasons).toContain('ROCE 38.0%')
  })

  it('ignores peers without ROCE and returns nulls when none qualify', () => {
    const ranking = rankPeers([peer({ name: 'NoRoce', profitGrowth: 90 })])
    expect(ranking.bestRoce).toBeNull()
    expect(ranking.topPick).toBeNull()
    expect(ranking.topPickScore).toBeNull()
    expect(rankPeers([]).bestRoce).toBeNull()
  })
})
