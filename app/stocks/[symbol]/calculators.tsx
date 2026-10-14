'use client'

import { useId, useState, type ChangeEvent } from 'react'

function toNumber(raw: string): number {
  const cleaned = raw.replace(/[^0-9.\-]/g, '')
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : NaN
}

function inr(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—'
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 })}`
}

function pct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

const HORIZONS = [5, 10, 15, 20]
const RISK_PRESETS = [0.5, 1, 2, 3]

type CurvePoint = { x: number; y: number }

/**
 * ROCE Compounding Calculator — projects a business compounding at its return
 * on capital and draws the resulting exponential ("hockey-stick") wealth curve.
 * FV = PV x (1 + r)^t. It is a reinvestment model, not a stock-price forecast.
 */
export function RoceCalculator({ roce }: { roce: number | null }) {
  const gradientId = useId().replace(/:/g, '')
  const [rate, setRate] = useState(roce != null ? String(Math.round(roce * 10) / 10) : '15')
  const [capital, setCapital] = useState('100000')
  const [years, setYears] = useState(10)

  const r = toNumber(rate) / 100
  const pv = toNumber(capital)
  const effectiveR = Number.isFinite(r) ? Math.max(r, -0.95) : 0
  const future = pv > 0 ? pv * (1 + effectiveR) ** years : NaN
  const multiple = Number.isFinite(future) && pv > 0 ? future / pv : NaN
  const net = Number.isFinite(future) ? future - pv : NaN
  const roiPct = Number.isFinite(multiple) ? (multiple - 1) * 100 : NaN

  const WIDTH = 300
  const HEIGHT = 48
  const TOP = 4
  const BOTTOM = 44
  const usable = BOTTOM - TOP
  const hasCurve = pv > 0 && Number.isFinite(future) && future > 0

  const valueAt = (t: number): number => (pv > 0 ? pv * (1 + effectiveR) ** t : pv)
  const yFor = (value: number): number => (hasCurve ? BOTTOM - (value / future) * usable : BOTTOM)

  const points: CurvePoint[] = []
  const SAMPLES = 48
  for (let i = 0; i <= SAMPLES; i += 1) {
    const frac = i / SAMPLES
    points.push({ x: 4 + frac * (WIDTH - 8), y: yFor(valueAt(frac * years)) })
  }
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${WIDTH - 4} ${BOTTOM} L 4 ${BOTTOM} Z`
  const markers = [0, 0.25, 0.5, 0.75, 1].map((frac) => ({
    frac,
    x: 4 + frac * (WIDTH - 8),
    y: yFor(valueAt(frac * years)),
  }))
  const baseY = hasCurve ? yFor(pv) : BOTTOM

  const yearLabel = (frac: number) => `Yr ${Math.round(frac * years)}`

  return (
    <div className="flex flex-col justify-between rounded-lg border border-[#1d2b45] bg-[#0e1626] p-3" data-purpose="roce-calculator">
      <div className="flex items-center justify-between border-b border-[#1b263d] pb-2">
        <div className="flex items-center space-x-2">
          <div className="flex h-6 w-6 items-center justify-center rounded border border-cyan-700/60 bg-cyan-950/70 text-cyan-400 shadow-sm">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div className="flex items-center space-x-1.5">
            <h3 className="text-xs font-bold text-white">ROCE Compounding</h3>
            <span className="rounded border border-cyan-800/60 bg-cyan-950/80 px-1.5 py-px font-mono text-[9px] font-semibold text-cyan-300">Power of ROCE</span>
          </div>
        </div>
        <div className="flex items-center space-x-0.5 rounded border border-[#1e2a42] bg-[#090f1d] p-0.5 font-mono text-[9px]">
          {HORIZONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setYears(option)}
              aria-pressed={years === option}
              className={`rounded px-1.5 py-0.5 font-mono transition ${
                years === option ? 'bg-cyan-500 font-bold text-black shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {option}Y
            </button>
          ))}
        </div>
      </div>

      <div className="my-2 grid grid-cols-3 gap-2">
        <div className="rounded border border-[#1e2a42] bg-[#090f1d] p-1.5">
          <div className="mb-1 flex items-center justify-between text-[9px] font-medium text-slate-400">
            <span>ROCE Rate</span>
            <span className="font-mono font-bold text-cyan-400">%</span>
          </div>
          <div className="flex items-center space-x-1">
            <input
              value={rate}
              onChange={(event) => setRate(event.target.value.replace(/[^0-9.\-]/g, ''))}
              inputMode="decimal"
              aria-label="ROCE rate percent"
              className="w-full border-0 bg-transparent p-0 font-mono text-xs font-bold tabular-nums text-cyan-300 focus:outline-none"
            />
            <span className="font-mono text-[10px] font-semibold text-slate-500">%</span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#152136]">
            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${clamp((Number.isFinite(r) ? r * 100 : 0) / 40 * 100, 0, 100)}%` }} />
          </div>
        </div>

        <div className="rounded border border-[#1e2a42] bg-[#090f1d] p-1.5">
          <div className="mb-1 flex items-center justify-between text-[9px] font-medium text-slate-400">
            <span>Initial Capital</span>
            <span className="font-mono text-slate-400">₹</span>
          </div>
          <div className="flex items-center space-x-0.5">
            <span className="font-mono text-[10px] text-slate-400">₹</span>
            <input
              value={capital === '' ? '' : Number(capital).toLocaleString('en-IN')}
              onChange={(event) => setCapital(event.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              aria-label="Initial capital"
              className="w-full border-0 bg-transparent p-0 font-mono text-xs font-bold tabular-nums text-white focus:outline-none"
            />
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#152136]">
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${clamp((pv / 1000000) * 100, 0, 100)}%` }} />
          </div>
        </div>

        <div className="rounded border border-[#1e2a42] bg-[#090f1d] p-1.5">
          <div className="mb-1 flex items-center justify-between text-[9px] font-medium text-slate-400">
            <span>Horizon</span>
            <span className="font-mono text-slate-400">Yrs</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold tabular-nums text-white">{years} Years</span>
            <svg className="h-3 w-3 text-slate-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path clipRule="evenodd" fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
            </svg>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#152136]">
            <div className="h-full rounded-full bg-cyan-500" style={{ width: `${clamp((years / 20) * 100, 0, 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="relative mb-2 overflow-hidden rounded border border-[#18233a] bg-[#090f1d] p-2">
        <div className="mb-1 flex items-center justify-between font-mono text-[9px] text-slate-400">
          <span className="flex items-center space-x-1">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            <span>Compounded ({inr(future)})</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            <span>Initial ({inr(pv)})</span>
          </span>
        </div>
        <div className="relative h-12 w-full">
          <svg className="h-full w-full overflow-visible" preserveAspectRatio="none" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Compounded wealth curve">
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line stroke="#475569" strokeDasharray="2,2" strokeWidth="1" x1="4" x2={WIDTH - 4} y1={baseY} y2={baseY} />
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path d={linePath} fill="none" stroke="#22d3ee" strokeLinecap="round" strokeWidth="2" />
            {markers.map((marker, index) => (
              <circle
                key={marker.frac}
                cx={marker.x}
                cy={marker.y}
                r={index === markers.length - 1 ? 3.5 : index === 0 ? 2 : 2.5}
                fill={index === markers.length - 1 ? '#38bdf8' : index === 0 ? '#64748b' : '#06b6d4'}
                stroke={index === markers.length - 1 ? '#06b6d4' : 'none'}
                strokeWidth={index === markers.length - 1 ? 1.5 : 0}
              />
            ))}
          </svg>
        </div>
        <div className="flex justify-between border-t border-slate-800/80 pt-0.5 font-mono text-[8px] text-slate-500">
          <span>{yearLabel(0)}</span>
          <span>{yearLabel(0.25)}</span>
          <span>{yearLabel(0.5)}</span>
          <span>{yearLabel(0.75)}</span>
          <span className="font-semibold text-cyan-400">
            {yearLabel(1)} {Number.isFinite(multiple) ? `(${multiple.toFixed(2)}x)` : ''}
          </span>
        </div>
      </div>

      <div className="my-1 grid grid-cols-3 gap-2 rounded-md border border-[#192742] bg-[#080d19] p-2 text-center shadow-sm">
        <div className="flex flex-col justify-between">
          <div className="text-[9px] font-medium uppercase tracking-wider text-slate-400">Future Value</div>
          <div className="mt-0.5 font-mono text-sm font-black tabular-nums tracking-tight text-cyan-300">{inr(future)}</div>
          <div className="mt-0.5">
            <span className="inline-flex items-center rounded border border-emerald-500/50 bg-emerald-950/70 px-1 py-px font-mono text-[8px] font-bold text-emerald-400">{pct(roiPct, 0)} ROI</span>
          </div>
        </div>
        <div className="flex flex-col justify-between border-x border-slate-800 px-1">
          <div className="text-[9px] font-medium uppercase tracking-wider text-slate-400">Multiple</div>
          <div className="mt-0.5 font-mono text-sm font-black tabular-nums text-white">{Number.isFinite(multiple) ? `${multiple.toFixed(2)}x` : '—'}</div>
          <div className="mt-0.5">
            <span className="inline-flex items-center rounded bg-cyan-950/50 px-1 py-px font-mono text-[8px] font-medium text-cyan-300">Compounder</span>
          </div>
        </div>
        <div className="flex flex-col justify-between">
          <div className="text-[9px] font-medium uppercase tracking-wider text-slate-400">Net Profit</div>
          <div className="mt-0.5 font-mono text-sm font-black tabular-nums text-emerald-400">{Number.isFinite(net) ? `+${inr(net)}` : '—'}</div>
          <div className="mt-0.5">
            <span className="font-mono text-[8px] text-slate-400">Reinvested</span>
          </div>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between rounded border border-[#162136] bg-[#090f1d] p-1.5 font-mono text-[9px] text-slate-400">
        <div className="flex items-center space-x-1.5 truncate">
          <span className="rounded border border-[#1e2a42] bg-[#0e172a] px-1 py-px text-[8px] font-bold text-cyan-300">FV</span>
          <span className="truncate font-mono text-[9px] text-slate-300">
            PV × (1 + r)<sup>t</sup>
          </span>
        </div>
        <div className="ml-2 flex shrink-0 items-center space-x-1 text-slate-400" title="Assumes the business reinvests incremental earnings at the current ROCE">
          <span className="text-[8px] text-slate-500">Reinvestment Model</span>
          <svg className="h-3 w-3 text-cyan-400/80" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>
    </div>
  )
}

/**
 * Trade Calculator — risk-first position sizing. The chosen risk % sets the
 * rupee budget that may be lost, the entry/stop distance sets risk per share,
 * and the position is the largest whole-share size within that budget (never
 * exceeding the capital). Target drives the reward side and the R:R readout.
 */
export function TradeCalculator({ entry }: { entry: number | null }) {
  const [capital, setCapital] = useState('100000')
  const [riskPct, setRiskPct] = useState(1)
  const [entryPrice, setEntryPrice] = useState(entry != null ? String(entry) : '')
  const [stopLoss, setStopLoss] = useState(entry != null ? String(Math.round(entry * 0.95 * 100) / 100) : '')
  const [target, setTarget] = useState(entry != null ? String(Math.round(entry * 1.1 * 100) / 100) : '')

  const cap = toNumber(capital)
  const ep = toNumber(entryPrice)
  const sl = toNumber(stopLoss)
  const tp = toNumber(target)

  const riskPerShare = ep - sl
  const riskBudget = Number.isFinite(cap) ? (cap * riskPct) / 100 : NaN
  const maxByRisk = riskPerShare > 0 && Number.isFinite(riskBudget) ? Math.floor(riskBudget / riskPerShare) : 0
  const maxByCapital = ep > 0 ? Math.floor(cap / ep) : 0
  const qty = Math.max(0, Math.min(maxByRisk, maxByCapital))

  const allocated = qty * ep
  const allocatedPct = cap > 0 ? (allocated / cap) * 100 : 0
  const riskAmount = riskPerShare > 0 ? qty * riskPerShare : 0
  const reward = tp > ep ? qty * (tp - ep) : 0
  const rr = riskAmount > 0 ? reward / riskAmount : NaN
  const stopPct = ep > 0 && Number.isFinite(sl) ? ((sl - ep) / ep) * 100 : NaN
  const targetPct = ep > 0 && Number.isFinite(tp) ? ((tp - ep) / ep) * 100 : NaN

  const totalMove = riskAmount + reward
  const riskWidth = totalMove > 0 ? (riskAmount / totalMove) * 100 : 50
  const rewardWidth = 100 - riskWidth
  const favorable = Number.isFinite(rr) && rr >= 2
  const rrLabel = !Number.isFinite(rr) ? '—' : rr >= 2 ? 'Excellent' : rr >= 1 ? 'Favorable' : 'Poor'

  const numericField =
    'w-full border-0 bg-transparent p-0 font-mono text-xs font-bold tabular-nums focus:outline-none'
  const numberOnly = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) =>
    setter(event.target.value.replace(/[^0-9.]/g, ''))

  return (
    <div className="flex flex-col justify-between rounded-lg border border-[#1d2b45] bg-[#0e1626] p-3" data-purpose="trade-calculator">
      <div className="flex items-center justify-between border-b border-[#1b263d] pb-2">
        <div className="flex items-center space-x-2">
          <div className="flex h-6 w-6 items-center justify-center rounded border border-cyan-700/60 bg-cyan-950/70 text-cyan-400 shadow-sm">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="2" width="16" height="20" rx="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="8" y1="6" x2="16" y2="6" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="16" y1="14" x2="16" y2="18" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M8 18h.01M12 18h.01" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="flex items-center space-x-1.5">
            <h3 className="text-xs font-bold text-white">Trade Calculator</h3>
            <span className="rounded border border-cyan-800/60 bg-cyan-950/80 px-1.5 py-px font-mono text-[9px] font-semibold text-cyan-300">AUTO-SIZING</span>
          </div>
        </div>
        <div className="flex items-center space-x-0.5 rounded border border-[#1e2a42] bg-[#090f1d] p-0.5 font-mono text-[9px]">
          {RISK_PRESETS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRiskPct(option)}
              aria-pressed={riskPct === option}
              className={`rounded px-1.5 py-0.5 font-mono transition ${
                riskPct === option ? 'bg-cyan-500 font-bold text-black shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {option}%
            </button>
          ))}
        </div>
      </div>

      <div className="my-2 grid grid-cols-2 gap-2">
        <div className="rounded border border-[#1e2a42] bg-[#090f1d] p-1.5">
          <div className="mb-1 flex items-center justify-between text-[9px] font-medium text-slate-400">
            <span>Capital</span>
            <span className="font-mono text-[9px] text-cyan-400">Equity</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-mono text-[10px] text-slate-400">₹</span>
            <input
              value={capital === '' ? '' : Number(capital).toLocaleString('en-IN')}
              onChange={(event) => setCapital(event.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              aria-label="Trading capital"
              className={`${numericField} text-white`}
            />
          </div>
        </div>

        <div className="rounded border border-[#1e2a42] bg-[#090f1d] p-1.5">
          <div className="mb-1 flex items-center justify-between text-[9px] font-medium text-slate-400">
            <span>Entry Price</span>
            <span className="rounded border border-cyan-800/40 bg-cyan-950/60 px-1 py-px font-mono text-[8px] font-semibold text-cyan-300">LTP</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-mono text-[10px] text-slate-400">₹</span>
            <input value={entryPrice} onChange={numberOnly(setEntryPrice)} inputMode="decimal" aria-label="Entry price" className={`${numericField} text-cyan-300`} />
          </div>
        </div>

        <div className="rounded border border-red-950/80 bg-[#090f1d] p-1.5 transition-colors hover:border-red-600/50">
          <div className="mb-1 flex items-center justify-between text-[9px] font-medium">
            <span className="font-medium text-rose-400">Stop Loss</span>
            <span className="rounded bg-red-950/50 px-1 py-px font-mono text-[8px] text-rose-400">
              {Number.isFinite(stopPct) ? `${pct(stopPct)}` : '—'}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-mono text-[10px] text-red-400">₹</span>
            <input value={stopLoss} onChange={numberOnly(setStopLoss)} inputMode="decimal" aria-label="Stop loss price" className={`${numericField} text-red-400`} />
          </div>
        </div>

        <div className="rounded border border-emerald-950/80 bg-[#090f1d] p-1.5 transition-colors hover:border-emerald-600/50">
          <div className="mb-1 flex items-center justify-between text-[9px] font-medium">
            <span className="font-medium text-emerald-400">Target Price</span>
            <span className="rounded bg-emerald-950/50 px-1 py-px font-mono text-[8px] text-emerald-400">
              {Number.isFinite(targetPct) ? `${pct(targetPct)}` : '—'}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-mono text-[10px] text-emerald-400">₹</span>
            <input value={target} onChange={numberOnly(setTarget)} inputMode="decimal" aria-label="Target price" className={`${numericField} text-emerald-400`} />
          </div>
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between rounded border border-[#18233a] bg-[#090f1d] p-2">
        <div className="flex items-center space-x-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
          <span className="text-[10px] font-medium text-slate-400">Position Size:</span>
          <span className="font-mono text-xs font-bold tabular-nums text-white">{qty.toLocaleString('en-IN')} Shares</span>
        </div>
        <div className="flex items-center space-x-1 font-mono text-[9px]">
          <span className="text-slate-500">Allocated:</span>
          <span className="font-semibold tabular-nums text-cyan-300">{inr(allocated)}</span>
          <span className="text-slate-500">({clamp(allocatedPct, 0, 100).toFixed(1)}%)</span>
        </div>
      </div>

      <div className="mb-2 space-y-1 rounded border border-[#162136] bg-[#090f1d] p-2">
        <div className="flex items-center justify-between font-mono text-[9px]">
          <span className="flex items-center space-x-1 text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            <span>Risk</span>
          </span>
          <div className="flex items-center space-x-1">
            <span className="font-mono font-bold text-cyan-300">{Number.isFinite(rr) ? `1 : ${rr.toFixed(1)}` : '—'}</span>
            <span className={`rounded border px-1 py-px text-[8px] font-bold ${favorable ? 'border-emerald-500/50 bg-emerald-950/80 text-emerald-300' : 'border-amber-500/50 bg-amber-950/80 text-amber-300'}`}>
              {rrLabel.toUpperCase()}
            </span>
          </div>
          <span className="flex items-center space-x-1 text-emerald-400">
            <span>Reward</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#1b263d]">
          <div className="h-full bg-rose-500" style={{ width: `${riskWidth}%` }} />
          <div className="h-full bg-emerald-400" style={{ width: `${rewardWidth}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-md border border-[#192742] bg-[#080d19] p-2 text-center shadow-sm">
        <div className="flex flex-col justify-between">
          <div className="text-[9px] font-medium uppercase tracking-wider text-slate-400">Risk Amount</div>
          <div className="mt-0.5 font-mono text-xs font-black tabular-nums text-rose-400">{inr(riskAmount)}</div>
          <div className="mt-0.5">
            <span className="font-mono text-[8px] text-slate-500">{cap > 0 ? `${((riskAmount / cap) * 100).toFixed(1)}%` : '—'} Capital</span>
          </div>
        </div>
        <div className="flex flex-col justify-between border-x border-slate-800 px-1">
          <div className="text-[9px] font-medium uppercase tracking-wider text-slate-400">Reward Amount</div>
          <div className="mt-0.5 font-mono text-xs font-black tabular-nums text-emerald-400">{inr(reward)}</div>
          <div className="mt-0.5">
            <span className="inline-flex items-center rounded border border-emerald-500/50 bg-emerald-950/70 px-1 py-px font-mono text-[8px] font-bold text-emerald-400">
              {Number.isFinite(targetPct) ? pct(targetPct, 2) : '—'} Gain
            </span>
          </div>
        </div>
        <div className="flex flex-col justify-between">
          <div className="text-[9px] font-medium uppercase tracking-wider text-slate-400">Risk : Reward</div>
          <div className="mt-0.5 font-mono text-xs font-black tabular-nums text-cyan-300">{Number.isFinite(rr) ? `1 : ${rr.toFixed(1)}` : '—'}</div>
          <div className="mt-0.5">
            <span className="font-mono text-[8px] font-semibold text-cyan-400">{rrLabel}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
