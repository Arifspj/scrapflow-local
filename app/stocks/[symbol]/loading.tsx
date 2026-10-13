import type { ReactNode } from 'react'

function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#16223a] ${className}`} />
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-[#1d2b45] bg-[#0e1626] p-3 ${className}`}>{children}</div>
}

export default function Loading() {
  return (
    <div className="flex flex-col bg-[#070b14] text-xs text-slate-200 antialiased" aria-busy="true" aria-live="polite">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-[#1b263b] bg-[#0b1220] px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex items-end gap-0.5 rounded-lg border border-cyan-800/40 bg-[#0e1e38] p-1.5">
            <div className="h-3 w-1.5 rounded-sm bg-cyan-400" />
            <div className="h-4 w-1.5 rounded-sm bg-emerald-400" />
            <div className="h-6 w-1.5 rounded-sm bg-cyan-300" />
          </div>
          <div>
            <span className="block text-lg font-black leading-none tracking-tight text-white">Q-Scan</span>
            <span className="block text-[12px] leading-none tracking-wider text-slate-400">Fundamental Stock Scanner</span>
          </div>
        </div>
        <Bar className="h-8 w-80" />
      </header>

      <div className="flex items-start">
        <aside className="sticky top-[53px] w-[280px] shrink-0 self-start border-r border-[#1a2539] bg-[#090f1a]">
          <div className="border-b border-[#182338] bg-[#0c1322] p-2">
            <Bar className="h-8 w-full" />
          </div>
          <div className="divide-y divide-[#131d2e]">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="flex items-center gap-2 px-2.5 py-2.5">
                <Bar className="h-4 w-4" />
                <div className="flex-1 space-y-1.5">
                  <Bar className="h-3 w-2/3" />
                  <Bar className="h-2.5 w-1/3" />
                </div>
                <Bar className="h-5 w-7" />
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-3 bg-[#080c16] px-4 py-3">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1b273d] pb-3">
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-[#16223a]" />
                <div className="space-y-2">
                  <Bar className="h-5 w-48" />
                  <Bar className="h-3 w-32" />
                </div>
              </div>
              <Bar className="h-8 w-40" />
            </div>
            <div className="mt-3 flex items-center gap-2 text-slate-400">
              <span className="size-3.5 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
              <span>Fetching latest company data....</span>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10">
            {Array.from({ length: 10 }).map((_, index) => (
              <Bar key={index} className="h-14 w-full" />
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <Bar className="h-4 w-40" />
              <Bar className="mt-3 h-52 w-full" />
            </Card>
            <Card>
              <Bar className="h-4 w-32" />
              <Bar className="mt-3 h-52 w-full" />
            </Card>
          </div>

          <Card>
            <Bar className="h-4 w-40" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Bar key={index} className="h-5 w-full" />
              ))}
            </div>
          </Card>
        </main>
      </div>
    </div>
  )
}
