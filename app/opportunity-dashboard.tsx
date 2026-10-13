import {
  getOpportunityDashboard,
  type OpportunityDashboard as Dashboard,
  type OpportunityRow,
} from '@/lib/opportunity-data'
import { OppTable, type OppCell, type OppColumn, type OppRow, type OppTone } from './opp-table'

const DASH = '—'

function fmt(value: number | null | undefined, digits = 2, suffix = ''): string {
  return value == null || !Number.isFinite(value) ? DASH : `${value.toLocaleString('en-IN', { maximumFractionDigits: digits })}${suffix}`
}

function pctCell(value: number | null, digits = 1): OppCell {
  const tone: OppTone = value == null ? 'neutral' : value > 0 ? 'good' : value < 0 ? 'bad' : 'neutral'
  return { text: value == null ? DASH : `${value > 0 ? '+' : ''}${value.toLocaleString('en-IN', { maximumFractionDigits: digits })}%`, tone }
}

function roceCell(value: number | null): OppCell {
  const tone: OppTone = value == null ? 'neutral' : value >= 15 ? 'good' : value >= 10 ? 'neutral' : value < 0 ? 'bad' : 'warn'
  return { text: value == null ? DASH : `${value.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`, tone }
}

function opportunityCell(row: OpportunityRow): OppCell {
  if (row.opportunity == null || row.coveragePct < 40) return { text: DASH, tone: 'neutral' }
  const tone: OppTone = row.provisional ? 'warn' : row.opportunity >= 70 ? 'good' : row.opportunity >= 50 ? 'warn' : 'bad'
  return { text: `${row.opportunity}${row.provisional ? '·' : ''}`, tone }
}

function evidenceCell(row: OpportunityRow): OppCell {
  return { text: `${row.coveragePct}%`, tone: row.coveragePct >= 60 ? 'neutral' : 'warn' }
}

function moveCell(row: OpportunityRow): OppCell {
  if (!row.movement) return { text: 'new', tone: 'neutral' }
  const delta = row.movement.delta
  if (delta === 0) return { text: '→ 0', tone: 'neutral' }
  return { text: `${delta > 0 ? '+' : ''}${delta}`, tone: delta > 0 ? 'good' : 'bad' }
}

function name(row: OpportunityRow): OppRow['symbol'] {
  return row.symbol
}

function base(row: OpportunityRow): Pick<OppRow, 'symbol' | 'company' | 'href'> {
  return { symbol: name(row), company: row.company, href: row.href }
}

const radarColumns: OppColumn[] = [
  { label: 'Opp.', align: 'right' },
  { label: 'Evidence', align: 'right' },
  { label: 'Move', align: 'right' },
  { label: 'Sector', text: true },
  { label: 'ROCE', align: 'right' },
  { label: 'Profit YoY', align: 'right' },
  { label: 'MOS %', align: 'right' },
  { label: 'Score', align: 'right' },
]

function radarRows(rows: OpportunityRow[]): OppRow[] {
  return rows.map((row) => ({
    ...base(row),
    cells: [
      opportunityCell(row),
      evidenceCell(row),
      moveCell(row),
      { text: row.industry || row.sector || DASH },
      roceCell(row.roce),
      pctCell(row.profitYoy),
      pctCell(row.mos),
      { text: row.score == null ? DASH : `${row.score}` },
    ],
  }))
}

const earningsColumns: OppColumn[] = [
  { label: 'QoQ Profit', align: 'right' },
  { label: 'Profit YoY', align: 'right' },
  { label: 'Sales YoY', align: 'right' },
  { label: 'ROCE', align: 'right' },
  { label: 'Opp.', align: 'right' },
  { label: 'Evidence', align: 'right' },
]

function earningsRows(rows: OpportunityRow[]): OppRow[] {
  return rows.map((row) => ({
    ...base(row),
    cells: [
      pctCell(row.qoqProfitPct),
      pctCell(row.profitYoy),
      pctCell(row.salesYoy),
      roceCell(row.roce),
      opportunityCell(row),
      evidenceCell(row),
    ],
  }))
}

const undervaluedColumns: OppColumn[] = [
  { label: 'MOS %', align: 'right' },
  { label: 'ROCE', align: 'right' },
  { label: 'ROE', align: 'right' },
  { label: 'P/E', align: 'right' },
  { label: 'Opp.', align: 'right' },
  { label: 'Score', align: 'right' },
]

function undervaluedRows(rows: OpportunityRow[]): OppRow[] {
  return rows.map((row) => ({
    ...base(row),
    cells: [
      pctCell(row.mos),
      roceCell(row.roce),
      roceCell(row.roe),
      { text: row.pe == null ? DASH : row.pe.toLocaleString('en-IN', { maximumFractionDigits: 1 }) },
      opportunityCell(row),
      { text: row.score == null ? DASH : `${row.score}` },
    ],
  }))
}

const flagColumns: OppColumn[] = [
  { label: 'Flags', text: true },
  { label: 'CFO / PAT', align: 'right' },
  { label: 'Debt / Equity', align: 'right' },
  { label: 'Profit YoY', align: 'right' },
  { label: 'ROCE', align: 'right' },
]

function flagRows(rows: OpportunityRow[]): OppRow[] {
  return rows.map((row) => ({
    ...base(row),
    cells: [
      { text: row.flags.join(' · '), tone: 'warn' },
      { text: row.cfoPat == null ? DASH : row.cfoPat.toFixed(2), tone: row.cfoPat == null ? 'neutral' : row.cfoPat >= 1 ? 'good' : 'bad' },
      { text: row.debtToEquity == null ? DASH : row.debtToEquity.toFixed(2), tone: row.debtToEquity != null && row.debtToEquity > 2 ? 'bad' : 'neutral' },
      pctCell(row.profitYoy),
      roceCell(row.roce),
    ],
  }))
}

function dateLabel(iso: string | null): string {
  if (!iso) return 'Not yet'
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#152742] bg-[#091527] p-3">
      <p className="text-[12px] text-slate-500">{label}</p>
      <p className="mt-1.5 truncate text-base font-bold text-white">{value}</p>
    </div>
  )
}

function Section({
  title,
  subtitle,
  count,
  children,
}: {
  title: string
  subtitle: string
  count: string
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#162844] bg-[#091527]">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[#152742] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>
        </div>
        <span className="text-[11px] font-medium text-sky-400">{count}</span>
      </div>
      {children}
      <p className="border-t border-[#0f1f33] px-4 py-2 text-[10px] text-slate-600">
        Best-effort ranking from saved fundamentals. Verify on the stock page before acting.
      </p>
    </section>
  )
}

export async function OpportunityDashboard() {
  const data: Dashboard = await getOpportunityDashboard()
  const { coverage } = data

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-white">Early Opportunity Radar</h2>
          <p className="mt-1 text-xs text-slate-500">
            Fundamental momentum that often shows up <i>before</i> a stock re-rates. Companion view — the scanner tables below are unchanged.
          </p>
        </div>
        <span className="text-[11px] text-slate-500">as of {dateLabel(coverage.generatedAt)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Stocks in DB" value={coverage.stocks.toLocaleString()} />
        <Tile label="Scanned" value={coverage.withFundamentals.toLocaleString()} />
        <Tile label="Evaluable" value={coverage.evaluable.toLocaleString()} />
        <Tile label="Scanners" value={coverage.scanners.toLocaleString()} />
        <Tile label="Last import" value={coverage.lastImportAt ? new Date(coverage.lastImportAt).toLocaleDateString('en-IN') : 'Not yet'} />
        <Tile label="Latest data" value={coverage.latestSnapshotAt ? new Date(coverage.latestSnapshotAt).toLocaleDateString('en-IN') : 'Not yet'} />
      </div>

      <div className="rounded-xl border border-[#162844] bg-[#0a1728] p-3 text-[11px] leading-5 text-slate-500">
        <b className="text-slate-400">How the score works.</b> Opportunity (0–100) blends four evidence-backed components: earnings
        acceleration (25), business quality (20), valuation &amp; margin of safety (20) and cash flow / balance sheet (15). Two
        components — <b className="text-slate-400">business triggers</b> and <b className="text-slate-400">price/volume confirmation</b> —
        have no connected data source yet, so they are shown as <i>not evaluated</i> rather than scored as zero. The maximum evaluable
        total is <b className="text-slate-400">80</b>; the number shown is the percentage of the available evidence, and every row carries
        its own <b className="text-slate-400">evidence %</b>. Lower evidence means a less reliable ranking.
      </div>

      <Section
        title="Early Opportunity Radar"
        subtitle="Best evaluated opportunity scores, with score movement since the first saved reading."
        count={`${data.radar.length} of ${coverage.evaluable} evaluable`}
      >
        <OppTable columns={radarColumns} rows={radarRows(data.radar)} initialSort={0} emptyLabel="No stock has enough saved fundamentals to rank yet." />
      </Section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section title="Earnings Acceleration" subtitle="Sequential and yearly profit/sales growth turning up." count={`${data.earnings.length} names`}>
          <OppTable columns={earningsColumns} rows={earningsRows(data.earnings)} initialSort={0} emptyLabel="No positive earnings momentum found in saved data." />
        </Section>

        <Section title="Undervalued Quality" subtitle="High ROCE with a positive margin of safety." count={`${data.undervalued.length} names`}>
          <OppTable columns={undervaluedColumns} rows={undervaluedRows(data.undervalued)} initialSort={0} emptyLabel="No quality names trading below intrinsic value yet." />
        </Section>
      </div>

      <Section title="Red Flag Monitor" subtitle="Cash-flow, leverage and profitability warnings to review before buying." count={`${data.redFlags.length} names`}>
        <OppTable columns={flagColumns} rows={flagRows(data.redFlags)} emptyLabel="No red flags detected in the current saved data." />
      </Section>
    </section>
  )
}
