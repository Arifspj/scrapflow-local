import type { GrowthKey, GrowthPeriod } from '@/lib/growth'
import { findDetailRow, toNumber } from '@/lib/stock-detail'
import type { DetailTable } from '@/lib/scrapers/screener-detail'

const C = {
  promoter: '#22d3ee',
  fii: '#34d399',
  dii: '#a78bfa',
  public: '#f59e0b',
  graham: '#22d3ee',
  growth: '#34d399',
  intrinsic: '#a78bfa',
  price: '#f59e0b',
  cfo: '#34d399',
  profit: '#f87171',
}

function deltaTone(delta: number | null): string {
  if (delta == null) return 'text-slate-500'
  if (delta > 0.01) return 'text-emerald-400'
  if (delta < -0.01) return 'text-rose-400'
  return 'text-slate-500'
}

type OwnershipSlice = { label: string; color: string; latest: number; delta: number | null }

function ownershipSlices(table: DetailTable): OwnershipSlice[] {
  const specs: { label: string; match: string; color: string }[] = [
    { label: 'Promoter', match: 'promoters', color: C.promoter },
    { label: 'FII', match: 'fiis', color: C.fii },
    { label: 'DII', match: 'diis', color: C.dii },
    { label: 'Public', match: 'public', color: C.public },
  ]
  const slices: OwnershipSlice[] = []
  for (const spec of specs) {
    const row = findDetailRow(table, spec.match)
    if (!row) continue
    const nums = row.values.map((value) => toNumber(value)).filter((value): value is number => value != null)
    if (!nums.length) continue
    const latest = nums[nums.length - 1]
    const previous = nums.length > 1 ? nums[nums.length - 2] : null
    slices.push({ label: spec.label, color: spec.color, latest, delta: previous != null ? latest - previous : null })
  }
  return slices
}

/**
 * Latest-quarter ownership split as a single stacked bar plus a QoQ change
 * legend. It summarises the table above instead of repeating every number, and
 * is skipped entirely when screener.in returned no usable shareholding rows.
 */
export function OwnershipTrend({ table }: { table: DetailTable | null }) {
  if (!table) return null
  const slices = ownershipSlices(table)
  const total = slices.reduce((sum, slice) => sum + Math.max(slice.latest, 0), 0)
  if (!slices.length || total <= 0) return null

  return (
    <div className="mt-auto pt-3">
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500">
        <span className="font-semibold uppercase tracking-wider">Latest split</span>
        <span>QoQ Δ (pp)</span>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-[#1b263d] bg-[#0a1220]">
        {slices.map((slice) => (
          <div
            key={slice.label}
            className="h-full"
            style={{ width: `${(Math.max(slice.latest, 0) / total) * 100}%`, background: slice.color }}
            title={`${slice.label} ${slice.latest.toFixed(2)}%`}
          />
        ))}
      </div>
      <ul className="mt-2 space-y-1">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center justify-between text-[12px]">
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: slice.color }} />
              {slice.label}
            </span>
            <span className="inline-flex items-center gap-2 font-mono">
              <span className="text-white">{slice.latest.toFixed(2)}%</span>
              <span className={`w-14 text-right ${deltaTone(slice.delta)}`}>
                {slice.delta == null ? '—' : `${slice.delta >= 0 ? '+' : ''}${slice.delta.toFixed(2)}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const GROWTH_META: { key: GrowthKey; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'operatingProfit', label: 'Op. Profit' },
  { key: 'netProfit', label: 'Net Profit' },
]

/**
 * Previous-vs-latest comparison bars for the three headline lines, sharing one
 * scale so the taller of the two always reads at a glance. Latest bars are
 * tinted by sign, and the block hides itself when neither side has a value.
 */
export function GrowthCompareBars({ growth }: { growth: Record<GrowthKey, GrowthPeriod> | null }) {
  if (!growth) return null
  const rows = GROWTH_META.map((meta) => ({ ...meta, period: growth[meta.key] }))
  const values = rows.flatMap((row) => [row.period.previous, row.period.current]).filter((value): value is number => value != null)
  if (!values.length) return null
  const max = Math.max(...values.map((value) => Math.abs(value)), 1)

  return (
    <div className="mt-auto pt-3">
      <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
        <span className="font-semibold uppercase tracking-wider">Previous vs latest</span>
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-500" />Prev</span>
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />Latest</span>
        </span>
      </div>
      <ul className="space-y-2">
        {rows.map((row) => {
          const tone = row.period.pct == null ? 'text-slate-500' : row.period.pct >= 0 ? 'text-emerald-400' : 'text-rose-400'
          const previousWidth = row.period.previous == null ? 0 : (Math.abs(row.period.previous) / max) * 100
          const currentWidth = row.period.current == null ? 0 : (Math.abs(row.period.current) / max) * 100
          return (
            <li key={row.key}>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-slate-300">{row.label}</span>
                <span className={`font-mono font-semibold ${tone}`}>
                  {row.period.pct == null ? 'N/A' : `${row.period.pct >= 0 ? '+' : ''}${row.period.pct.toFixed(1)}%`}
                </span>
              </div>
              <div className="mt-1 space-y-1">
                <span className="block h-1.5 rounded-full bg-slate-600/70" style={{ width: `${previousWidth}%` }} />
                <span className={`block h-1.5 rounded-full ${(row.period.current ?? 0) < 0 ? 'bg-rose-500' : 'bg-cyan-400'}`} style={{ width: `${currentWidth}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

type BridgeBar = { label: string; value: number; color: string }

/**
 * Fair-value bridge: draws Graham number, growth fair value, intrinsic value and
 * the live price on one shared scale so the valuation gap is visible at a
 * glance. Bars with no finite value are dropped, and fewer than two usable
 * values hides the whole block.
 */
export function ValuationBridge({
  graham,
  growth,
  intrinsic,
  price,
}: {
  graham: number | null
  growth: number | null
  intrinsic: number | null
  price: number | null
}) {
  const candidates: BridgeBar[] = [
    { label: 'Graham No.', value: graham ?? NaN, color: C.graham },
    { label: 'Fair (Growth)', value: growth ?? NaN, color: C.growth },
    { label: 'Intrinsic', value: intrinsic ?? NaN, color: C.intrinsic },
    { label: 'Current Price', value: price ?? NaN, color: C.price },
  ]
  const bars = candidates.filter((bar) => Number.isFinite(bar.value) && bar.value > 0)
  if (bars.length < 2) return null
  const max = Math.max(...bars.map((bar) => bar.value))

  return (
    <div className="mt-auto pt-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Fair-value bridge</div>
      <ul className="space-y-1.5">
        {bars.map((bar) => (
          <li key={bar.label} className="flex items-center gap-2 text-[12px]">
            <span className="w-24 shrink-0 text-slate-400">{bar.label}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#0a1220]">
              <span className="block h-full rounded-full" style={{ width: `${(bar.value / max) * 100}%`, background: bar.color }} />
            </span>
            <span className="w-20 shrink-0 text-right font-mono text-white">₹ {bar.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

type AnnualRow = { columns: string[]; values: number[] }

function annualRow(table: DetailTable | null | undefined, label: string): AnnualRow {
  const columns: string[] = []
  const values: number[] = []
  const row = findDetailRow(table, label)
  if (!table || !row) return { columns, values }
  table.columns.forEach((column, index) => {
    if (/ttm/i.test(column)) return
    const value = toNumber(row.values[index])
    if (value == null) return
    columns.push(column)
    values.push(value)
  })
  return { columns, values }
}

/**
 * Profit vs operating-cash-flow grouped bars over the last few annual periods.
 * Columns are matched by header so the two statements stay aligned; periods the
 * cash-flow statement does not cover are skipped rather than zero-filled.
 */
export function CashFlowTrend({
  profitLoss,
  cashFlow,
  limit = 5,
}: {
  profitLoss: DetailTable | null | undefined
  cashFlow: DetailTable | null | undefined
  limit?: number
}) {
  const profit = annualRow(profitLoss, 'net profit')
  const cash = annualRow(cashFlow, 'cash from operating')
  const cashByColumn = new Map(cash.columns.map((column, index) => [column, cash.values[index]]))
  const rows = profit.columns
    .map((column, index) => ({ column, profit: profit.values[index], cash: cashByColumn.get(column) }))
    .filter((row): row is { column: string; profit: number; cash: number } => row.cash != null)
    .slice(-limit)
  if (!rows.length) return null

  const all = rows.flatMap((row) => [row.profit, row.cash])
  const max = Math.max(...all, 1)
  const min = Math.min(...all, 0)
  const span = max - min || 1
  const height = 72

  return (
    <div className="mt-auto pt-3">
      <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
        <span className="font-semibold uppercase tracking-wider">Profit vs operating cash</span>
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: C.profit }} />Profit</span>
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: C.cfo }} />CFO</span>
        </span>
      </div>
      <div className="flex items-end justify-between gap-3" style={{ height }}>
        {rows.map((row) => (
          <div key={row.column} className="flex h-full flex-1 items-end justify-center gap-1">
            {[{ value: row.profit, color: C.profit }, { value: row.cash, color: C.cfo }].map((entry, index) => {
              const h = Math.max((entry.value - min) / span * 100, entry.value !== 0 ? 2 : 0)
              return <span key={index} className="w-3 rounded-t-sm" style={{ height: `${h}%`, background: entry.color }} title={`₹ ${entry.value.toLocaleString('en-IN')} Cr`} />
            })}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between gap-3 border-t border-[#172236] pt-1 font-mono text-[11px] text-slate-400">
        {rows.map((row) => (
          <span key={row.column} className="flex-1 text-center">{row.column.replace(/^Mar\s+/, '')}</span>
        ))}
      </div>
    </div>
  )
}
