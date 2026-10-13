import {
  getOpportunityDashboard,
  type OpportunityDashboard as Dashboard,
  type OpportunityRow,
} from '@/lib/opportunity-data'
import type { GrowthReading } from '@/lib/growth-quality'
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

/**
 * A growth cell shows the percentage only when it is comparable, and otherwise
 * states *why* (loss base / zero base / low base) instead of printing an
 * impressive-looking number. The absolute values and periods go in the tooltip.
 */
function growthCell(reading: GrowthReading | null): OppCell {
  if (!reading) return { text: DASH, tone: 'neutral' }
  const range =
    reading.current != null && reading.previous != null
      ? `${fmt(reading.previous, 1)} → ${fmt(reading.current, 1)} Cr (${reading.previousPeriod ?? 'prior'} → ${reading.currentPeriod ?? 'latest'})`
      : reading.current != null
        ? `Latest ${fmt(reading.current, 1)} Cr (${reading.currentPeriod ?? 'latest'})`
        : 'Not available'
  const title = `${reading.metric}. ${range}.${reading.note ? ` ${reading.note}` : ''}`
  switch (reading.status) {
    case 'ok':
      return { text: `${reading.pct! > 0 ? '+' : ''}${reading.pct!.toFixed(1)}%`, tone: reading.pct! > 0 ? 'good' : 'bad', title }
    case 'extreme':
      return { text: `${reading.pct! > 0 ? '+' : ''}${reading.pct!.toFixed(0)}%`, tone: 'warn', title: `${title} Very low base — treat as not comparable.`, sub: 'low base' }
    case 'loss-to-profit':
      return { text: 'loss → profit', tone: 'neutral', title, sub: 'not comparable' }
    case 'loss-to-loss':
      return { text: 'loss → loss', tone: 'neutral', title, sub: 'not comparable' }
    case 'zero-base':
      return { text: '0 base', tone: 'neutral', title, sub: 'not comparable' }
    default:
      return { text: DASH, tone: 'neutral', title }
  }
}

function opportunityCell(row: OpportunityRow): OppCell {
  if (row.opportunity == null || row.coveragePct < 40) {
    return { text: DASH, tone: 'neutral', title: `Insufficient evidence (${row.coveragePct}% of inputs available).` }
  }
  const tone: OppTone = row.provisional ? 'warn' : row.opportunity >= 70 ? 'good' : row.opportunity >= 50 ? 'warn' : 'bad'
  return {
    text: `${row.opportunity}`,
    tone,
    title: `Normalised over available evidence: ${row.opportunityPoints}/${row.opportunityMax} points, ${row.coveragePct}% of the model available. Scores with different evidence are not directly comparable.`,
  }
}

function evidenceCell(row: OpportunityRow): OppCell {
  return {
    text: `${row.coveragePct}%`,
    tone: row.coveragePct >= 60 ? 'neutral' : 'warn',
    title: `${row.opportunityPoints}/${row.opportunityMax} points evaluable. Business triggers and price/volume are not evaluated (no data source).`,
  }
}

function moveCell(row: OpportunityRow): OppCell {
  if (!row.movement) return { text: 'new', tone: 'neutral', title: 'No earlier saved reading yet — movement is unknown, not necessarily positive.' }
  const delta = row.movement.delta
  const title = `Change in normalised opportunity vs the first reading in the last ${row.movement.days} day(s).`
  if (delta === 0) return { text: '→ 0', tone: 'neutral', title }
  return { text: `${delta > 0 ? '+' : ''}${delta}`, tone: delta > 0 ? 'good' : 'bad', title }
}

/** Short "why this appears" summary built only from evaluated components. */
function whyText(row: OpportunityRow): string {
  const parts = row.components
    .filter((component) => component.evaluated && component.ratio != null)
    .sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))
    .slice(0, 3)
    .map((component) => `${component.label} ${component.ratio}%`)
  return parts.length ? `Driven by: ${parts.join(', ')}. Evidence ${row.coveragePct}%.` : `Evidence ${row.coveragePct}%.`
}

function base(row: OpportunityRow): Pick<OppRow, 'symbol' | 'company' | 'href' | 'symbolNote'> {
  return {
    symbol: row.identity.label,
    company: row.company,
    href: row.href,
    symbolNote: row.identity.note,
  }
}

const radarColumns: OppColumn[] = [
  { label: 'Opp /100', align: 'right' },
  { label: 'Points', align: 'right' },
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
      { text: `${row.opportunityPoints}/${row.opportunityMax}`, tone: 'neutral', title: 'Raw points earned vs maximum points the available evidence could award.' },
      evidenceCell(row),
      moveCell(row),
      { text: row.industry || row.sector || DASH, title: whyText(row) },
      roceCell(row.roce),
      growthCell(row.profitGrowth),
      pctCell(row.mos),
      { text: row.score == null ? DASH : `${row.score}`, title: 'Classic quality score (0–100), unchanged by the opportunity model.' },
    ],
  }))
}

const earningsColumns: OppColumn[] = [
  { label: 'Profit ₹Cr', align: 'right' },
  { label: 'Prior ₹Cr', align: 'right' },
  { label: 'Profit YoY', align: 'right' },
  { label: 'QoQ Profit', align: 'right' },
  { label: 'Sales YoY', align: 'right' },
  { label: 'ROCE', align: 'right' },
  { label: 'Opp /100', align: 'right' },
]

function earningsRows(rows: OpportunityRow[]): OppRow[] {
  return rows.map((row) => ({
    ...base(row),
    cells: [
      { text: row.profitGrowth?.current == null ? DASH : fmt(row.profitGrowth.current, 0), tone: 'neutral' },
      { text: row.profitGrowth?.previous == null ? DASH : fmt(row.profitGrowth.previous, 0), tone: 'neutral' },
      growthCell(row.profitGrowth),
      growthCell(row.qoqProfitGrowth),
      growthCell(row.salesGrowth),
      roceCell(row.roce),
      opportunityCell(row),
    ],
  }))
}

const undervaluedColumns: OppColumn[] = [
  { label: 'MOS %', align: 'right' },
  { label: 'Price ₹', align: 'right' },
  { label: 'Fair value ₹', align: 'right' },
  { label: 'ROCE', align: 'right' },
  { label: 'ROE', align: 'right' },
  { label: 'P/E', align: 'right' },
  { label: 'D/E', align: 'right' },
  { label: 'Data as of', align: 'right' },
]

function dateOnly(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : DASH
}

function undervaluedRows(rows: OpportunityRow[]): OppRow[] {
  return rows.map((row) => ({
    ...base(row),
    cells: [
      { text: row.mos == null ? DASH : `+${row.mos.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`, tone: 'good', title: 'Margin of safety = discount of price to the forensic fair value (0% when price is above fair value).' },
      { text: fmt(row.price, 2), tone: 'neutral' },
      { text: fmt(row.intrinsic, 2), tone: 'neutral' },
      roceCell(row.roce),
      roceCell(row.roe),
      { text: row.pe == null ? DASH : row.pe.toLocaleString('en-IN', { maximumFractionDigits: 1 }), tone: 'neutral', title: 'Trailing P/E.' },
      { text: row.debtToEquity == null ? DASH : row.debtToEquity.toFixed(2), tone: 'neutral', title: 'Debt / Equity. Interpret with care for financial businesses.' },
      { text: dateOnly(row.updatedAt), tone: 'neutral', title: `Financial data snapshot: ${row.dataPeriod ?? 'period not stated'}` },
    ],
  }))
}

const flagColumns: OppColumn[] = [
  { label: 'Flag', text: true },
  { label: 'Why', text: true },
  { label: 'Profit YoY', align: 'right' },
  { label: 'CFO / PAT', align: 'right' },
  { label: 'D/E', align: 'right' },
  { label: 'Data as of', align: 'right' },
]

function flagRows(rows: OpportunityRow[]): OppRow[] {
  return rows.map((row) => ({
    ...base(row),
    cells: [
      { text: row.flags.map((flag) => flag.label).join(' · '), tone: row.flags.some((flag) => flag.severity === 'bad') ? 'bad' : 'warn' },
      { text: row.flags.map((flag) => flag.detail).join(' '), tone: 'neutral' },
      growthCell(row.profitGrowth),
      { text: row.cfoPat == null ? DASH : row.cfoPat.toFixed(2), tone: row.cfoPat == null ? 'neutral' : row.cfoPat >= 1 ? 'good' : 'bad', title: 'Operating cash flow ÷ net profit (latest annual).' },
      { text: row.debtToEquity == null ? DASH : row.debtToEquity.toFixed(2), tone: row.debtToEquity != null && !row.isFinancial && row.debtToEquity > 2 ? 'bad' : 'neutral' },
      { text: dateOnly(row.updatedAt), tone: 'neutral' },
    ],
  }))
}

function dateTimeLabel(iso: string | null): string {
  if (!iso) return 'Not yet'
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[#152742] bg-[#091527] p-3" title={hint}>
      <p className="text-[12px] text-slate-500">{label}</p>
      <p className="mt-1.5 truncate text-base font-bold text-white">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[10px] text-slate-600">{hint}</p> : null}
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
        Research warning from saved fundamentals — not an allegation and not a standalone sell signal. Verify on the stock page.
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
            Fundamental momentum that <i>sometimes</i> shows up before a stock re-rates. These are research shortlists — they do not predict rallies. Companion view; the scanner tables below are unchanged.
          </p>
        </div>
        <span className="text-[11px] text-slate-500">Dashboard built {dateTimeLabel(coverage.builtAt)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Stocks in DB" value={coverage.stocks.toLocaleString()} />
        <Tile label="Scanned" value={coverage.withFundamentals.toLocaleString()} hint="Stocks with a saved fundamental snapshot" />
        <Tile label="Evaluable" value={coverage.evaluable.toLocaleString()} hint="≥60% of the model has data" />
        <Tile label="Scanners" value={coverage.scanners.toLocaleString()} />
        <Tile label="Data as of" value={dateOnly(coverage.dataAsOf)} hint="Newest financial snapshot" />
        <Tile label="Last successful import" value={dateOnly(coverage.lastImportAt)} hint={coverage.lastImportSource ?? undefined} />
      </div>

      <div className="rounded-xl border border-[#162844] bg-[#0a1728] p-3 text-[11px] leading-5 text-slate-500">
        <b className="text-slate-400">How the score works.</b> The opportunity model has five weighted components — earnings acceleration (25),
        business quality (20), valuation &amp; margin of safety (20), cash flow / balance sheet (15), and two that have no data source yet:
        business triggers (10) and price/volume confirmation (10). The last two are shown as <i>not evaluated</i>, never as zero. So the maximum
        <b className="text-slate-400"> evidence-covered total is 80 points</b>. “Opp /100” is the normalised share of the <i>available</i> points;
        “Points” is the raw value (e.g. 74/80) and “Evidence” is how much of the model could be scored. <b className="text-slate-400">Scores with
        different evidence are not directly comparable</b>, and a low evidence figure means a less reliable ranking. Profiles with less than 40%
        evidence show no score. Business triggers + price/volume stay unavailable until a reliable source is connected.
      </div>

      <Section
        title="Early Opportunity Radar"
        subtitle="Best evidence-covered opportunity scores, with movement since the first saved reading."
        count={`${data.radar.length} of ${coverage.evaluable} evaluable`}
      >
        <OppTable columns={radarColumns} rows={radarRows(data.radar)} initialSort={0} emptyLabel="No stock has enough saved fundamentals to rank yet." />
      </Section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section title="Earnings Acceleration" subtitle="Current vs comparable prior-period profit and sales, in ₹ Cr." count={`${data.earnings.length} names`}>
          <OppTable columns={earningsColumns} rows={earningsRows(data.earnings)} initialSort={3} emptyLabel="No comparable positive earnings momentum in saved data." />
        </Section>

        <Section title="Undervalued Quality" subtitle="ROCE ≥ 15% with a positive margin of safety vs the fair-value model." count={`${data.undervalued.length} names`}>
          <OppTable columns={undervaluedColumns} rows={undervaluedRows(data.undervalued)} initialSort={0} emptyLabel="No quality names trading below the model's fair value yet." />
        </Section>
      </div>

      <Section title="Red Flag Monitor" subtitle="Cash-flow, leverage and profitability warnings, with the metric and period behind each." count={`${data.redFlags.length} names`}>
        <OppTable columns={flagColumns} rows={flagRows(data.redFlags)} emptyLabel="No red flags detected in the current saved data." />
      </Section>
    </section>
  )
}
