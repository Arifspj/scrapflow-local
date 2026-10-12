import { scoreBand, type ScoreBreakdown } from '@/lib/score'

const BADGE_CLASS: Record<ReturnType<typeof scoreBand>, string> = {
  good: 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300',
  warn: 'border-amber-500/50 bg-amber-950/40 text-amber-300',
  bad: 'border-red-500/50 bg-red-950/40 text-red-300',
  neutral: 'border-slate-600/50 bg-slate-800/40 text-slate-300',
}

/** Static weighted-score chip. The detailed breakdown is intentionally not
 *  surfaced here — only the score value and band colour. */
export function ScoreBadge({ breakdown }: { breakdown: ScoreBreakdown | null }) {
  if (!breakdown || breakdown.score == null) {
    return (
      <span
        className="rounded border border-slate-700/60 bg-slate-800/40 px-2 py-0.5 text-2xs font-semibold text-slate-400"
        title="Not enough data to compute a weighted score yet."
      >
        Score —
      </span>
    )
  }

  const band = scoreBand(breakdown.score)
  return (
    <span
      className={`rounded border px-2 py-0.5 text-2xs font-bold uppercase tracking-wider ${BADGE_CLASS[band]}`}
      title={`Weighted screening score (not the same as the quality badge). Calculated ${new Date(breakdown.calculatedAt).toLocaleString('en-IN')}.`}
    >
      <span className="font-mono">Score {breakdown.score}/100</span>
    </span>
  )
}
