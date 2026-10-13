'use client'

import Link from 'next/link'
import { useRef } from 'react'

export type TickerItem = {
  symbol: string
  company: string
  price: number | null
  score: number | null
}

function scoreTone(score: number): string {
  if (score >= 70) return 'border-emerald-500/50 bg-emerald-950/70 text-emerald-300'
  if (score >= 50) return 'border-amber-500/50 bg-amber-950/70 text-amber-300'
  return 'border-rose-500/50 bg-rose-950/70 text-rose-300'
}

function formatPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

/**
 * Horizontally scrollable strip of sibling stocks (same scanner/sector/group as
 * the stock being viewed). Clicking a card routes to that stock's detail page,
 * carrying the same context query so the strip persists across navigation.
 */
export function StockTicker({
  items,
  activeSymbol,
  contextQuery,
  viewAllHref,
}: {
  items: TickerItem[]
  activeSymbol: string
  contextQuery: string
  viewAllHref: string
}) {
  const scroller = useRef<HTMLDivElement>(null)

  function scrollBy(direction: number) {
    scroller.current?.scrollBy({ left: direction * 340, behavior: 'smooth' })
  }

  const suffix = contextQuery ? `?${contextQuery}` : ''

  const arrowClass =
    'flex shrink-0 items-center justify-center rounded-md border border-[#192742] bg-[#0a1220] p-1.5 text-slate-400 transition hover:border-cyan-500/50 hover:bg-[#121c30] hover:text-cyan-300'

  return (
    <section
      data-purpose="scanner-context-bar"
      className="rounded-lg border border-[#18233a] bg-[#080d19] p-2 shadow-sm"
    >
      <div className="flex items-center">
        <button type="button" onClick={() => scrollBy(-1)} aria-label="Scroll left" title="Scroll left" className={`${arrowClass} mr-2`}>
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div ref={scroller} className="ticker-scroll flex flex-1 items-center gap-2 overflow-x-auto scroll-smooth py-0.5">
          {items.map((item) => {
            const active = item.symbol === activeSymbol
            return (
              <Link
                key={item.symbol}
                href={`/stocks/${encodeURIComponent(item.symbol)}${suffix}`}
                title={item.company}
                className={`group flex shrink-0 items-center gap-2.5 rounded-md border px-3 py-1.5 shadow-sm transition ${
                  active
                    ? 'border-cyan-500/70 bg-[#14233c]'
                    : 'border-[#1b263d] bg-[#0e1626] hover:border-cyan-500/50 hover:bg-[#14233c]'
                }`}
              >
                <span
                  className={`font-mono text-xs font-semibold tracking-tight transition-colors ${
                    active ? 'text-cyan-300' : 'text-slate-200 group-hover:text-cyan-300'
                  }`}
                >
                  {item.symbol}
                </span>
                <span className="font-mono text-xs font-semibold tabular-nums text-white">{formatPrice(item.price)}</span>
                {item.score != null && (
                  <span className={`inline-flex items-center justify-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${scoreTone(item.score)}`}>
                    {item.score}
                  </span>
                )}
              </Link>
            )
          })}

          <Link
            href={viewAllHref}
            className="group ml-1 flex shrink-0 items-center gap-1.5 rounded-md border border-cyan-800/60 bg-[#0e1e38] px-3 py-1.5 text-xs font-semibold text-cyan-400 shadow-sm transition hover:border-cyan-500 hover:bg-[#14233c] hover:text-white"
          >
            <span>View all {items.length} stocks</span>
            <svg className="h-3.5 w-3.5 text-cyan-300 transition-transform group-hover:translate-x-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>

        <button type="button" onClick={() => scrollBy(1)} aria-label="Scroll right" title="Scroll right" className={`${arrowClass} ml-2`}>
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </section>
  )
}
