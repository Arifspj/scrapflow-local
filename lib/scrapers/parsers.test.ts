import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { extractChartinkScan, parseChartinkProcess, parseChartinkScreen } from './chartink'
import { parseSource, sourceKindFromLabel } from './index'
import {
  cleanSymbol,
  parseNumber,
  parseScreenerCompany,
  parseScreenerScreen,
  parseScreenerSearchResults,
  pickCompanyFromSearchResults,
  typoCandidates,
} from './screener'

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
      currentPrice: 2900,
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

  it('prefers the URL symbol over an unrelated numeric company link', () => {
    const result = parseScreenerCompany(
      '<html><body><h1>Reliance Industries Ltd</h1><a href="/company/2726/">Peer</a><ul id="top-ratios"></ul></body></html>',
      'https://www.screener.in/company/RELIANCE/',
    )
    expect(result.symbols).toEqual([{ symbol: 'RELIANCE', companyName: 'Reliance Industries Ltd' }])
  })
})

describe('parseScreenerSearchResults', () => {
  it('keeps only valid name/url pairs', () => {
    const results = parseScreenerSearchResults([
      { id: 1, name: 'Reliance Industries Ltd', url: '/company/RELIANCE/consolidated/' },
      { name: '', url: '/company/X/' },
      'nope',
    ])
    expect(results).toEqual([
      { id: 1, name: 'Reliance Industries Ltd', url: '/company/RELIANCE/consolidated/' },
    ])
  })
})

describe('pickCompanyFromSearchResults', () => {
  const results = [
    { name: 'Reliance Industries Ltd', url: '/company/RELIANCE/consolidated/' },
    { name: 'Reliance Home Finance Ltd', url: '/company/RHFL/consolidated/' },
  ]

  it('prefers an exact symbol match', () => {
    expect(pickCompanyFromSearchResults(results, 'rhfl')?.name).toBe('Reliance Home Finance Ltd')
  })

  it('prefers an exact name match', () => {
    expect(pickCompanyFromSearchResults(results, 'Reliance Industries Ltd')?.url).toBe(
      '/company/RELIANCE/consolidated/',
    )
  })

  it('falls back to the first result', () => {
    expect(pickCompanyFromSearchResults(results, 'reliance')?.name).toBe('Reliance Industries Ltd')
  })

  it('returns null when there are no results', () => {
    expect(pickCompanyFromSearchResults([], 'x')).toBeNull()
  })
})

describe('typoCandidates', () => {
  it('includes the transposition that fixes "reilance"', () => {
    expect(typoCandidates('reilance')).toContain('reliance')
  })

  it('returns nothing for very short queries', () => {
    expect(typoCandidates('re')).toEqual([])
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

describe('extractChartinkScan', () => {
  const PAGE = `<html><head><meta name="csrf-token" content="tok-123"></head><body>
    <hidden-overlays-selects :custom-indicators-json="[]" :scan-json="{&quot;name&quot;:&quot;IPO Breakout&quot;,&quot;atlas_query&quot;:&quot;daily close &gt; 10 and close &#039;ok&#039;&quot;}"></hidden-overlays-selects>
  </body></html>`

  it('reads the csrf token, name and scan clause from the Vue-bound JSON attribute', () => {
    const meta = extractChartinkScan(PAGE)
    expect(meta.csrfToken).toBe('tok-123')
    expect(meta.name).toBe('IPO Breakout')
    expect(meta.scanClause).toBe("daily close > 10 and close 'ok'")
  })

  it('returns nulls instead of throwing on an unparseable/absent scan', () => {
    expect(extractChartinkScan('<html></html>')).toEqual({ name: null, scanClause: null, csrfToken: null })
  })
})

describe('parseChartinkProcess', () => {
  it('maps endpoint rows to deduplicated symbols with their snapshot', () => {
    const payload = JSON.stringify({
      draw: 1,
      recordsTotal: 3,
      recordsFiltered: 3,
      data: [
        { sr: 1, nsecode: 'CPPLUS', name: 'Aditya Infotech Ltd', bsecode: '544466', close: 4474.6, per_chg: 2.24, volume: 542207 },
        { sr: 2, nsecode: 'CPPLUS', name: 'Duplicate', close: 4474.6, per_chg: 2.24, volume: 1 },
      ],
    })
    const result = parseChartinkProcess(payload)
    expect(result.rows).toHaveLength(1)
    expect(result.total).toBe(3)
    expect(result.rows[0]).toEqual({ symbol: 'CPPLUS', companyName: 'Aditya Infotech Ltd', close: 4474.6, changePct: 2.24, volume: 542207, bseCode: '544466' })
    expect(result.warnings.some((warning) => /reported 3/.test(warning))).toBe(true)
  })

  it('warns and returns nothing for a non-JSON body', () => {
    const result = parseChartinkProcess('<html>blocked</html>')
    expect(result.rows).toEqual([])
    expect(result.warnings.length).toBe(1)
  })

  it('warns when the response has no data array', () => {
    const result = parseChartinkProcess({ foo: 'bar' })
    expect(result.rows).toEqual([])
    expect(result.warnings.some((warning) => /data array/.test(warning))).toBe(true)
  })

  it('accepts an already-decoded object', () => {
    const result = parseChartinkProcess({ data: [{ nsecode: 'TCS', name: 'TCS Ltd' }] })
    expect(result.rows.map((row) => row.symbol)).toEqual(['TCS'])
  })
})

describe('parseSource', () => {
  it('dispatches by source kind', () => {
    expect(parseSource(fixture('screener-screen.html'), 'screener-screen', 'https://x').symbols).toHaveLength(3)
    expect(parseSource(fixture('chartink-screen.html'), 'chartink-scan', 'https://x').symbols).toHaveLength(2)
  })
})
