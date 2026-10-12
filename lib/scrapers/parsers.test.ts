import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { parseChartinkScreen } from './chartink'
import { parseSource, sourceKindFromLabel } from './index'
import { cleanSymbol, parseNumber, parseScreenerCompany, parseScreenerScreen } from './screener'

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8')
}

describe('parseNumber', () => {
  it('parses Indian currency, percentage and negative values', () => {
    expect(parseNumber('₹ 1,963,123 Cr.')).toBe(1963123)
    expect(parseNumber('0.35 %')).toBe(0.35)
    expect(parseNumber('-1,234.5')).toBe(-1234.5)
    expect(parseNumber('—')).toBeNull()
    expect(parseNumber(null)).toBeNull()
  })
})

describe('cleanSymbol', () => {
  it('accepts market symbols and rejects prose', () => {
    expect(cleanSymbol(' reliance ')).toBe('RELIANCE')
    expect(cleanSymbol('M&M')).toBe('M&M')
    expect(cleanSymbol('not a symbol')).toBeNull()
  })
})

describe('sourceKindFromLabel', () => {
  it('maps admin labels to source kinds', () => {
    expect(sourceKindFromLabel('Chartink technical scan')).toBe('chartink-scan')
    expect(sourceKindFromLabel('Screener public screen')).toBe('screener-screen')
    expect(sourceKindFromLabel('Screener company page')).toBe('screener-company')
    expect(sourceKindFromLabel('unknown')).toBeNull()
  })
})

describe('parseScreenerScreen', () => {
  it('extracts every company row from a public screen table', () => {
    const result = parseScreenerScreen(fixture('screener-screen.html'))
    expect(result.symbols.map((row) => row.symbol)).toEqual(['RELIANCE', 'TCS', 'INFY'])
    expect(result.symbols[0]?.companyName).toBe('Reliance Industries Ltd')
    expect(result.warnings).toEqual([])
  })

  it('warns when the screen has no company rows', () => {
    const result = parseScreenerScreen('<html><body><p>empty</p></body></html>')
    expect(result.symbols).toEqual([])
    expect(result.warnings.length).toBe(1)
  })
})

describe('parseScreenerCompany', () => {
  it('extracts the symbol, name and fundamentals', () => {
    const result = parseScreenerCompany(
      fixture('screener-company.html'),
      'https://www.screener.in/company/RELIANCE/',
    )
    expect(result.symbols).toEqual([{ symbol: 'RELIANCE', companyName: 'Reliance Industries Ltd' }])
    expect(result.fundamentals).toEqual({
      marketCap: 1963123,
      peRatio: 28.5,
      bookValue: 1245,
      dividendYield: 0.35,
      roce: 9.8,
      roe: 8.9,
      debtToEquity: 0.42,
      revenue: 901064,
      netProfit: 69621,
    })
  })

  it('falls back to the URL when no company link is present', () => {
    const result = parseScreenerCompany(
      '<html><body><h1>Acme Ltd</h1><ul id="top-ratios"></ul></body></html>',
      'https://www.screener.in/company/ACME/',
    )
    expect(result.symbols).toEqual([{ symbol: 'ACME', companyName: 'Acme Ltd' }])
  })
})

describe('parseChartinkScreen', () => {
  it('extracts symbols from a server-rendered result table', () => {
    const result = parseChartinkScreen(fixture('chartink-screen.html'))
    expect(result.symbols.map((row) => row.symbol)).toEqual(['RELIANCE', 'TCS'])
    expect(result.warnings).toEqual([])
  })

  it('reports a warning when the scan output is client-rendered', () => {
    const result = parseChartinkScreen('<html><body><div id="app"></div></body></html>')
    expect(result.symbols).toEqual([])
    expect(result.warnings.length).toBe(1)
  })
})

describe('parseSource', () => {
  it('dispatches by source kind', () => {
    expect(parseSource(fixture('screener-screen.html'), 'screener-screen', 'https://x').symbols).toHaveLength(3)
    expect(parseSource(fixture('chartink-screen.html'), 'chartink-scan', 'https://x').symbols).toHaveLength(2)
  })
})
