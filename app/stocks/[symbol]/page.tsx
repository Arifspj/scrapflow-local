import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ symbol: string }> }

export default async function StockPage({ params }: Props) {
  const { symbol } = await params
  const stock = await prisma.stock.findUnique({ where: { symbol: decodeURIComponent(symbol).toUpperCase() }, include: { scanners: { include: { scanner: true } }, fundamentals: { orderBy: { capturedAt: 'desc' }, take: 10 } } })
  if (!stock) notFound()
  const latest = stock.fundamentals[0]
  const fields = [['Market cap', latest?.marketCap], ['P/E ratio', latest?.peRatio], ['Book value', latest?.bookValue], ['Dividend yield', latest?.dividendYield], ['ROCE', latest?.roce], ['ROE', latest?.roe], ['Debt / equity', latest?.debtToEquity], ['Revenue', latest?.revenue], ['Net profit', latest?.netProfit]] as const
  return <main className="min-h-screen bg-[#080c15] text-slate-300"><div className="mx-auto max-w-5xl px-5 py-8 lg:px-8"><Link href="/" className="text-xs text-sky-400 hover:text-sky-300">← Q-Scan home</Link><header className="mt-12"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">Company analysis</p><h1 className="mt-3 text-4xl font-semibold text-white">{stock.companyName || stock.symbol}</h1><p className="mt-2 text-sm text-slate-500">{stock.symbol}{stock.exchange ? ` · ${stock.exchange}` : ''}{stock.isin ? ` · ${stock.isin}` : ''}</p></header><section className="mt-10 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><div className="flex flex-col justify-between gap-2 border-b border-white/[0.07] pb-5 sm:flex-row"><div><h2 className="font-semibold text-white">Latest fundamentals</h2><p className="mt-1 text-xs text-slate-500">{latest ? `Captured ${latest.capturedAt.toLocaleString('en-IN')}` : 'No fundamental snapshot has been saved.'}</p></div><span className="text-xs text-slate-600">Source-backed fields only</span></div>{latest ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fields.map(([label, value]) => <div key={label} className="rounded-xl border border-white/[0.06] bg-black/10 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-white">{value?.toString() || '—'}</p></div>)}</div> : <p className="pt-5 text-sm text-slate-500">Fundamental values will appear after a fundamentals-capable source has been imported.</p>}</section><section className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><h2 className="font-semibold text-white">Scanner memberships</h2><div className="mt-4 flex flex-wrap gap-2">{stock.scanners.length ? stock.scanners.map(({ scanner }) => <Link key={scanner.id} href={`/scanners/${scanner.id}`} className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-xs text-sky-300">{scanner.name}</Link>) : <span className="text-xs text-slate-500">Not assigned to a scanner.</span>}</div></section></div></main>
}
