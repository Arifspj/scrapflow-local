'use client'

import { useState } from 'react'
import { scoreBand, scoreColor, type ScoreBreakdown, type ScoreSubMetric } from '@/lib/score'

const BADGE_CLASS: Record<ReturnType<typeof scoreBand>, string> = {
  good: 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300',
  warn: 'border-amber-500/50 bg-amber-950/40 text-amber-300',
  bad: 'border-red-500/50 bg-red-950/40 text-red-300',
  neutral: 'border-slate-600/50 bg-slate-800/40 text-slate-300',
}

function formatValue(sub: ScoreSubMetric): string {
  if (sub.value == null) return 'N/A'
  if (/margin|roce|roe|yoy|upside/i.test(sub.label)) return `${sub.value.toFixed(1)}%`
  return sub.value.toFixed(2)
}

export function ScoreBadge({ breakdown }: { breakdown: ScoreBreakdown | null }) {
  const [open, setOpen] = useState(false)

  if (!breakdown || breakdown.score == null) {
    return (
      <span className="rounded border border-slate-700/60 bg-slate-800/40 px-2 py-0.5 text-2xs font-semibold text-slate-400" title="Not enough data to compute a weighted score yet.">
        Score —
      </span>
    )
  }

  const band = scoreBand(breakdown.score)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title="Weighted screening score (not the same as the quality badge). Click for the breakdown."
        className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-2xs font-bold uppercase tracking-wider ${BADGE_CLASS[band]}`}
      >
        <span className="font-mono">Score {breakdown.score}/100</span>
        <span className="font-medium normal-case tracking-normal text-slate-400">· {breakdown.coveragePct}% data</span>
        {breakdown.provisional && <span className="font-medium normal-case text-amber-300">provisional</span>}
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-80 rounded-lg border border-[#1d2b45] bg-[#0b1220] p-3 text-left shadow-2xl">
          <div className="mb-2 flex items-center justify-between text-[10px]">
            <span className="font-semibold uppercase tracking-wider text-slate-300">Score breakdown</span>
            <span className="text-slate-500">model v{breakdown.version}</span>
          </div>
          <div className="space-y-2.5">
            {breakdown.parts.map((part) => {
              const pct = part.weight > 0 ? (part.earned / part.weight) * 100 : 0
              return (
                <div key={part.key}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-200">{part.label}</span>
                    <span className="font-mono text-slate-300">
                      {part.earned}
                      <span className="text-slate-500">/{part.weight}</span>
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded bg-[#1b263d]">
                    <div className="h-full bg-cyan-500" style={{ width: `${pct}%` }} />
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {part.sub.map((sub) => (
                      <li key={sub.label} className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>
                          {sub.label}: <span className="text-slate-400">{formatValue(sub)}</span>
                        </span>
                        <span className="font-mono text-slate-400">{sub.value == null ? '—' : Math.round(sub.score)}</span>
                      </li>
                    ))}
                  </ul>
                  {part.note && <p className="mt-0.5 text-[10px] text-amber-400/80">{part.note}</p>}
                </div>
              )
            })}
          </div>
          <p className="mt-2 border-t border-[#1b263d] pt-2 text-[10px] leading-snug text-slate-500">
            Coverage {breakdown.coveragePct}% · calculated {new Date(breakdown.calculatedAt).toLocaleString('en-IN')}
            {breakdown.provisional ? ' · provisional (not enough data for a complete score)' : ''}
          </p>
        </div>
      )}
    </div>
  )
}