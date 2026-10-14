import Link from 'next/link'
import { Suspense } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPublicSnapshot, scannerCategories } from '@/lib/public-data'
import { buildStockView } from '@/lib/stock-detail'
import { findStocksByQuery, upsertStockFromScrape } from '@/lib/stocks'
import { rateLimited, scrapeScreenerCompany } from '@/lib/scrapers/resolve'
import { AutoRefresh } from './auto-refresh'
import { ScannerSelect } from './scanner-select'
import { ScannerTable } from './scanner-table'
import { OpportunityDashboard } from './opportunity-dashboard'
import { ScrollToTop } from './scroll-to-top'
import { StockSearch } from './stock-search'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ scanner?: string; q?: string }> }

export default async function HomePage({ searchParams }: Props) {
  const params = await searchParams
  const query = params.q?.trim() || ''
  const hasScanner = Boolean(params.scanner)

  if (query) {
    const saved = await findStocksByQuery(query)
    const exact = saved.find((stock) => stock.symbol.toUpperCase() === query.toUpperCase())
    if (exact) redirect(`/stocks/${encodeURIComponent(exact.symbol)}`)
    if (saved.length === 1) redirect(`/stocks/${encodeURIComponent(saved[0].symbol)}`)

    if (saved.length === 0) {
      const requestHeaders = await headers()
      const clientKey = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous'
      if (!rateLimited(clientKey)) {
        const scraped = await scrapeScreenerCompany(query)
        if (scraped) {
          await upsertStockFromScrape(scraped)
          redirect(`/stocks/${encodeURIComponent(scraped.symbol)}`)
        }
      }
    }
  }

  const data = await getPublicSnapshot(params.scanner, query)
  const scanner = data.scanner
  const rows = data.rows.map((row) => {
    const view = buildStockView(row.stock, row.stock.fundamentals[0])
    return {
      id: row.stock.id,
      symbol: row.stock.symbol,
      company: row.stock.companyName || row.stock.symbol,
      ltp: view.price,
      iv: view.valuation.intrinsic,
      mos: view.valuation.marginOfSafety,
      pe: view.pe,
      marketCap: view.marketCap,
      roce: view.roce,
      de: view.debtToEquity,
      score: view.score,
      updated: row.lastSeenAt.toISOString(),
    }
  })

  return (
    <main className="min-h-screen bg-[#050b14] text-slate-300 antialiased">
      <AutoRefresh />
      <ScrollToTop />
      <header className="sticky top-0 z-20 border-b border-[#122238] bg-[#071120]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1720px] items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-tr from-sky-600 to-emerald-500 text-lg font-bold text-white">Q</span>
            <span>
              <b className="block text-base tracking-tight text-white">Q-Scan</b>
              <small className="text-[12px] text-slate-400">Fundamental Stock Scanner</small>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 text-xs font-medium md:flex">
            <Link className="rounded-md bg-[#0b386b] px-3.5 py-1.5 text-white" href="/">Scanner</Link>
            <Link className="rounded-md px-3.5 py-1.5 text-slate-400 hover:bg-white/5 hover:text-white" href="/admin">Admin</Link>
          </nav>
          <StockSearch />
        </div>
      </header>

      <div className="mx-auto max-w-[1720px] space-y-4 px-4 py-4">
        {!hasScanner ? (
          <>
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-white">Choose your scanner</h2>
                  <p className="mt-1 text-xs text-slate-500">Pick a market idea to open its scanner page.</p>
                </div>
                <span className="text-[13px] text-slate-500">{scannerCategories.length} scanners</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {scannerCategories.map(([name, text]) => (
                  <Link key={name} href={`/?scanner=${encodeURIComponent(name)}`} className="group flex flex-col justify-between rounded-xl border border-[#162844] bg-[#091527] p-4 transition hover:border-sky-500/60 hover:bg-[#0d1a2e]">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold uppercase tracking-wider text-sky-400">Scanner</span>
                      <span className="flex size-7 items-center justify-center rounded-full border border-[#23354E] text-slate-400 transition group-hover:border-sky-400 group-hover:text-sky-300" aria-hidden>→</span>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-white group-hover:text-sky-300">{name}</h3>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">{text}</p>
                  </Link>
                ))}
              </div>
            </section>
            <Suspense fallback={<DashboardSkeleton />}>
              <OpportunityDashboard />
            </Suspense>
          </>
        ) : (
          <>
            <section className="grid items-end gap-4 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <p className="text-xs font-semibold uppercase tracking-[.2em] text-sky-400">{scanner?.category || 'Public scanner'}</p>
                <ScannerSelect scanners={scannerCategories} value={scanner?.name ?? scannerCategories[0][0]} variant="hero" />
                <p className="mt-1 text-xs text-slate-500">{scanner?.description || 'Import source-backed records from the admin panel to populate this view.'}</p>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:col-span-8">
                <Metric label="Stocks in DB" value={data.stockCount.toLocaleString()} />
                <Metric label="Current results" value={data.total.toLocaleString()} />
                <Metric label="High score" value={rows.filter((row) => (row.score ?? 0) >= 70).length.toString()} />
                <Metric label="Last updated" value={data.latest ? data.latest.updatedAt.toLocaleDateString('en-IN') : 'Not available'} />
              </div>
            </section>
            <section className="overflow-hidden rounded-xl border border-[#162844] bg-[#091527]">
              {rows.length ? (
                <ScannerTable key={scanner?.id ?? 'default'} rows={rows} scannerId={scanner?.id} />
              ) : (
                <div className="p-14 text-center">
                  <h2 className="text-sm font-semibold text-white">No saved records yet</h2>
                  <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">This public page only reads persisted scanner memberships. Test and confirm an import in the admin panel to see source-backed results here.</p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#152742] bg-[#091527] p-3">
      <p className="text-[13px] text-slate-500">{label}</p>
      <p className="mt-2 truncate text-base font-bold text-white">{value}</p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <section className="space-y-3">
      <div className="h-6 w-56 animate-pulse rounded bg-white/5" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-16 animate-pulse rounded-xl border border-[#152742] bg-[#091527]" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-[#162844] bg-[#091527]" />
    </section>
  )
}

export const metadata = { title: 'Q-Scan | Fundamental stock scanner', description: 'Browse source-backed stock scanner results and saved fundamentals.' }
