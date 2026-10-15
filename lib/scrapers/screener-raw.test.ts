import { describe, expect, it } from 'vitest'
import { parseScreenerRawSource } from './screener-raw'

const RAW_HTML = `
  <!doctype html><html><head><title>Query Results - Screener</title></head><body>
    <div>2 results found: Showing page 1 of 1</div>
    <table class="data-table">
      <thead><tr><th>S.No.</th><th>Company</th><th>CMP</th></tr></thead>
      <tbody>
        <tr data-row-company-id="1285981"><td>1.</td><td><a href="/company/544765/" target="_blank">Vegorama Punjabi</a></td><td>238.00</td></tr>
        <tr data-row-company-id="1285649"><td>2.</td><td><a href="/company/CPEDU/" target="_blank">Career Point Edu</a></td><td>179.90</td></tr>
        <tr data-row-company-id="1285000"><td>3.</td><td><a href="/company/BUILDPRO/consolidated/">Shankara Buildpro</a></td><td>100.00</td></tr>
      </tbody>
    </table>
  </body></html>`

const AUTH_HTML = `
  <!doctype html><html><head><title>Register - Screener</title></head><body>
    <form action="/register/" method="post">You need to sign in. Already have an account?</form>
  </body></html>`

describe('parseScreenerRawSource', () => {
  it('extracts symbols and keeps numeric codes for later resolution', () => {
    const result = parseScreenerRawSource(RAW_HTML)
    expect(result.kind).toBe('screener-raw-screen')
    expect(result.symbols.map((row) => row.symbol)).toEqual(['544765', 'CPEDU', 'BUILDPRO'])
    expect(result.symbols[0].companyName).toBe('Vegorama Punjabi')
  })

  it('flags the sign-in page instead of reporting an empty screen', () => {
    const result = parseScreenerRawSource(AUTH_HTML)
    expect(result.symbols).toHaveLength(0)
    expect(result.warnings.some((warning) => /sign-in page/i.test(warning))).toBe(true)
  })
})
