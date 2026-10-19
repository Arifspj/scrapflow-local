import type { ListStockView } from './view-summary'
import type { MetricValues, UniverseRow } from '@/app/compare/kpi-taxonomy'

/**
 * Maps the persisted `ViewSummary` view onto the `/compare` KPI taxonomy.
 *
 * Only fields that actually exist in the summary are mapped — every metric that
 * needs `rawData` (Asset Turnover, 3Y CAGR, FCF Yield, EV/EBITDA, Pledged %,
 * 200-DMA) is returned as `null` so the UI shows "—" with its "awaiting rule"
 * note instead of a fabricated number. `direction` in the taxonomy is never
 * consulted here; a value is either reported or null.
 *
 * `offHigh` is derived from the reported price and 52-week high (the same two
 * numbers the detail page shows). `return1y` still needs price history and is
 * filled client-side on `/compare`; it stays null here.
 */

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null) return null
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null
  if (Math.abs(denominator) < 1e-9) return null
  return numerator / denominator
}

function percent(numerator: number | null, denominator: number | null): number | null {
  const value = ratio(numerator, denominator)
  return value == null ? null : value * 100
}

function round(value: number | null, digits = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function holding(list: ListStockView, key: 'promoter' | 'fii' | 'dii'): number | null {
  return list.ownership?.holdings.find((entry) => entry.key === key)?.latest ?? null
}

/** The list view carries a nullable `detail`; the summary path never has it. */
export function compareValuesForView(list: ListStockView): MetricValues {
  const view = list.view
  const price = view.price
  const high = view.high
  const graham = view.valuation.graham
  const bookValue = view.bookValue

  const fii = holding(list, 'fii')
  const dii = holding(list, 'dii')
  const instStake = fii == null && dii == null ? null : (fii ?? 0) + (dii ?? 0)

  return {
    fundScore: view.score,
    iv: view.valuation.intrinsic,
    mos: view.valuation.marginOfSafety,
    grahamSpread: round(percent(graham != null && price != null ? graham - price : null, price)),
    piotroski: view.piotroski,
    riskReward: null,
    marketCap: view.marketCap,
    pe: view.pe,
    pb: round(ratio(price, bookValue)),
    ps: round(ratio(view.marketCap, view.revenue)),
    evEbitda: null,
    divYield: view.dividendYield,
    roce: view.roce,
    roe: view.roe,
    opm: view.opm,
    patMargin: round(percent(view.netProfit, view.revenue)),
    assetTurnover: null,
    salesYoy: view.salesYoy,
    profitYoy: view.profitYoy,
    salesCagr3: null,
    profitCagr3: null,
    debtEquity: view.debtToEquity,
    cfoPat: view.cfoPat,
    fcfYield: null,
    workingCapitalDays: view.workingCapitalDays,
    promoter: holding(list, 'promoter'),
    pledged: null,
    instStake: instStake == null ? null : round(instStake),
    offHigh: round(percent(price != null && high != null ? price - high : null, high)),
    vs200dma: null,
    return1y: null,
  }
}

type SnapshotRow = {
  stock: { symbol: string; companyName: string | null; list: ListStockView | null }
}

function toRow(row: SnapshotRow): UniverseRow {
  const list = row.stock.list
  const view = list?.view
  return {
    symbol: row.stock.symbol,
    name: row.stock.companyName || row.stock.symbol,
    ltp: view?.price ?? null,
    iv: view?.valuation.intrinsic ?? null,
    upside: view?.valuation.upside ?? null,
    score: view?.score ?? null,
    values: list ? compareValuesForView(list) : {},
  }
}

/** Builds the `/compare` universe from a public snapshot, highest score first. */
export function buildCompareUniverse(rows: SnapshotRow[]): UniverseRow[] {
  return rows.map(toRow).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
}

/** Default selection: the best-scoring members, capped at `max`. */
export function defaultSelection(universe: UniverseRow[], max = 5): string[] {
  return universe.slice(0, max).map((stock) => stock.symbol)
}
