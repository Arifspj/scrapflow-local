import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function formatDate(value: Date | null | undefined) {
  return value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(value) : 'Not available'
}

export default async function HomePage() {
  const [scanners, stockCount, latestStock] = await Promise.all([
    prisma.scanner.findMany({ where: { enabled: true }, include: { _count: { select: { stocks: true } } }, orderBy: { name: 'asc' } }),
    prisma.stock.count(),
    prisma.stock.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
  ])

  return (
    <main className="min-h-screen bg-[#080c15] text-slate-300">
      <header className="border-b border-white/[0.08] bg-[#0b101b]/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
          <Link href="/" className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">Q</span><span><strong className="block tracking-tight text-white">Q-Scan</strong><small className="text-[11px] text-slate-500">Stock research, grounded in saved data</small></span></Link>
          <Link href="/admin" className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.05]">Admin panel</Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-20">
        <section className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-400">Public research workspace</p><h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-6xl">Find the signal. Verify the fundamentals.</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400">Browse scanner results and company fundamentals imported into Q-Scan. Public pages read saved records only; source fetching happens separately.</p></section>
        <section className="mt-12 grid gap-3 sm:grid-cols-3"><Metric label="Active scanners" value={String(scanners.length)} /><Metric label="Saved stocks" value={String(stockCount)} /><Metric label="Latest data" value={latestStock ? formatDate(latestStock.updatedAt) : 'Not loaded'} /></section>
        <section className="mt-14"><div className="flex items-end justify-between gap-4"><div><h2 className="text-xl font-semibold text-white">Scanner categories</h2><p className="mt-1 text-xs text-slate-500">Choose a saved scanner to inspect its current membership.</p></div></div>{scanners.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{scanners.map((scanner) => <Link key={scanner.id} href={`/scanners/${scanner.id}`} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 transition hover:border-sky-400/40 hover:bg-sky-400/[0.05]"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-sky-400">{scanner.category}</span><span className="text-xs text-slate-500">{scanner._count.stocks} stocks</span></div><h3 className="mt-6 text-base font-semibold text-white">{scanner.name}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{scanner.description || 'Saved scanner results and source-backed research.'}</p></Link>)}</div> : <EmptyState />}</section>
      </div>
    </main>
  )
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><p className="text-xs text-slate-500">{label}</p><p className="mt-3 truncate text-2xl font-semibold text-white">{value}</p></div> }
function EmptyState() { return <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-10 text-center"><h3 className="text-sm font-semibold text-white">No saved scanner data yet</h3><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">Configure a source in the admin panel, preview it, then confirm an import to make records available here.</p></div> }

export const metadata = { title: 'Q-Scan | Stock research', description: 'Browse source-backed stock scanner results and saved company fundamentals.' }

