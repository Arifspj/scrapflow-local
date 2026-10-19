import Link from 'next/link'
import type { Metadata } from 'next'
import { getPublicSnapshot, listPublicScanners } from '@/lib/public-data'
import { buildCompareUniverse, defaultSelection } from '@/lib/compare-data'
import { CompareTerminal } from './compare-terminal'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Multi-Stock Spread Terminal | Q-Scan',
  description: 'Compare up to five companies side by side across Q-Scan valuation, quality, growth and forensic KPIs.',
}

type Props = { searchParams: Promise<{ scanner?: string }> }

export default async function ComparePage({ searchParams }: Props) {
  const params = await searchParams
  const scanners = await listPublicScanners()
  const requested = params.scanner?.trim() || scanners[0]?.name || ''
  const snapshot = await getPublicSnapshot(requested)

  const universe = buildCompareUniverse(snapshot.rows)
  const initialSelection = defaultSelection(universe)
  const scannerNames = scanners.map((scanner) => scanner.name)
  const activeScanner = snapshot.scanner?.name ?? scannerNames[0] ?? ''

  return (
    <main className="min-h-screen bg-[#050b14] text-slate-300 antialiased lg:flex lg:h-[100dvh] lg:min-h-0 lg:flex-col lg:overflow-hidden">
      <header className="sticky top-0 z-20 shrink-0 border-b border-[#122238] bg-[#071120]/95 backdrop-blur">
        <div className="flex w-full items-center justify-between gap-4 px-3 py-3 sm:px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-tr from-sky-600 to-emerald-500 text-lg font-bold text-white">
              Q
            </span>
            <span>
              <b className="block text-base tracking-tight text-white">Q-Scan</b>
              <small className="text-[12px] text-slate-400">Fundamental Stock Scanner</small>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 text-xs font-medium md:flex">
            <Link className="rounded-md px-3.5 py-1.5 text-slate-400 hover:bg-white/5 hover:text-white" href="/">
              Scanner
            </Link>
            <span className="rounded-md bg-[#0b386b] px-3.5 py-1.5 text-white">Compare</span>
            <Link className="rounded-md px-3.5 py-1.5 text-slate-400 hover:bg-white/5 hover:text-white" href="/admin">
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <div className="w-full space-y-4 px-3 py-4 sm:px-4 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-4 lg:space-y-0 lg:overflow-hidden">
        <CompareTerminal
          key={activeScanner}
          universe={universe}
          scanners={scannerNames}
          activeScanner={activeScanner}
          initialSelection={initialSelection}
        />
      </div>
    </main>
  )
}
