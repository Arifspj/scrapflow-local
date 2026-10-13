import { describe, expect, it } from 'vitest'
import { summarizeSectors, type SectorInput } from './sector-map'
import { assessGrowth } from './growth-quality'

function input(overrides: Partial<SectorInput>): SectorInput {
  return {
    sector: 'Technology',
    sectorHref: '/market/IN01',
    coveragePct: 80,
    opportunity: 60,
    roce: 20,
    pe: 25,
    profitGrowth: null,
    salesGrowth: null,
    ...overrides,
  }
}

const rising = assessGrowth({ metric: 'Net profit', current: 120, previous: 100 })
const falling = assessGrowth({ metric: 'Net profit', current: 80, previous: 100 })

describe('summarizeSectors', () => {
  it('omits sectors below the minimum sample size', () => {
    const inputs: SectorInput[] = [
      ...Array.from({ length: 5 }, () => input({ sector: 'Technology' })),
      ...Array.from({ length: 4 }, () => input({ sector: 'Healthcare' })),
    ]
    const result = summarizeSectors(inputs)
    expect(result.map((sector) => sector.name)).toEqual(['Technology'])
  })

  it('computes medians, rising count and above-median count', () => {
    const inputs: SectorInput[] = [
      input({ opportunity: 80, roce: 30, pe: 40, profitGrowth: rising }),
      input({ opportunity: 60, roce: 20, pe: 30, profitGrowth: falling }),
      input({ opportunity: 40, roce: 10, pe: 20, salesGrowth: rising }),
      input({ opportunity: 20, roce: 5, pe: 10 }),
      input({ opportunity: 10, roce: 0, pe: 5 }),
    ]
    const [sector] = summarizeSectors(inputs)
    expect(sector.covered).toBe(5)
    expect(sector.medianRoce).toBe(10)
    expect(sector.medianPe).toBe(20)
    expect(sector.avgOpportunity).toBe(42)
    expect(sector.risingCount).toBe(2)
    expect(sector.improvingAboveMedian).toBe(2)
  })

  it('excludes companies with insufficient coverage from the aggregate', () => {
    const inputs: SectorInput[] = [
      ...Array.from({ length: 5 }, () => input({ sector: 'Technology', coveragePct: 80 })),
      input({ sector: 'Technology', coveragePct: 20, opportunity: 99 }),
    ]
    const [sector] = summarizeSectors(inputs)
    expect(sector.total).toBe(6)
    expect(sector.covered).toBe(5)
  })

  it('marks financial sectors and ignores null sectors', () => {
    const inputs: SectorInput[] = [
      ...Array.from({ length: 5 }, () => input({ sector: 'Banks' })),
      ...Array.from({ length: 5 }, () => input({ sector: null })),
    ]
    const result = summarizeSectors(inputs)
    expect(result).toHaveLength(1)
    expect(result[0].financial).toBe(true)
  })
})
