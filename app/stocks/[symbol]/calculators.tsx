'use client'

import { useState } from 'react'

function fmt(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export function RoceCalculator({ roce }: { roce: number | null }) {
  const [rate, setRate] = useState(roce != null ? String(roce) : '15')
  const [investment, setInvestment] = useState('100000')
  const [years, setYears] = useState('10')

  const r = Number(rate) / 100
  const pv = Number(investment)
  const n = Number(years)
  const future = Number.isFinite(pv) && Number.isFinite(r) && Number.isFinite(n) ? pv * (1 + r) ** n : NaN
  const multiple = Number.isFinite(future) && pv > 0 ? future / pv : NaN
  const gain = Number.isFinite(future) ? future - pv : NaN

  return (
    <div className="flex flex-col rounded-lg border border-[#1d2b45] bg-[#0e1626] p-3">
      <div className="border-b border-[#1b263d] pb-2">
        <h3 className="text-xs font-bold text-white">ROCE Compounding Calculator</h3>
      </div>
      <div className="my-2 grid grid-cols-3 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-slate-400">ROCE (%)</span>
          <input value={rate} onChange={(event) => setRate(event.target.value)} className="w-full rounded border border-[#223352] bg-[#090f1d] px-2 py-1 font-mono text-xs font-bold text-cyan-300 focus:border-cyan-500 focus:outline-none" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-slate-400">Investment (₹)</span>
          <input value={investment} onChange={(event) => setInvestment(event.target.value)} className="w-full rounded border border-[#223352] bg-[#090f1d] px-2 py-1 font-mono text-xs font-bold text-white focus:border-cyan-500 focus:outline-none" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-slate-400">Years</span>
          <select value={years} onChange={(event) => setYears(event.target.value)} className="w-full rounded border border-[#223352] bg-[#090f1d] px-2 py-1 font-mono text-xs text-white focus:border-cyan-500 focus:outline-none">
            {[5, 10, 15, 20].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="my-1 grid grid-cols-3 rounded-md border border-[#192742] bg-[#080d19] p-2.5 text-center">
        <div>
          <div className="text-[10px] text-slate-400">Future Value</div>
          <div className="mt-0.5 font-mono text-sm font-black text-cyan-400">₹{fmt(future)}</div>
        </div>
        <div className="border-x border-slate-800">
          <div className="text-[10px] text-slate-400">Multiple</div>
          <div className="mt-0.5 font-mono text-sm font-black text-white">{Number.isFinite(multiple) ? `${multiple.toFixed(2)}x` : '—'}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">Net Profit</div>
          <div className="mt-0.5 font-mono text-sm font-black text-emerald-400">{Number.isFinite(gain) ? `+${fmt(gain)}` : '—'}</div>
        </div>
      </div>
      <div className="border-t border-[#162136] pt-1 text-[9px] leading-tight text-slate-400">
        <div>
          FV = PV × (1 + ROCE/100)<sup>Years</sup>
        </div>
        <div className="mt-0.5">ROCE is a business return rate, not exact stock return</div>
      </div>
    </div>
  )
}

export function TradeCalculator({ entry }: { entry: number | null }) {
  const [capital, setCapital] = useState('100000')
  const [risk, setRisk] = useState('1')
  const [entryPrice, setEntryPrice] = useState(entry != null ? String(entry) : '')
  const [stopLoss, setStopLoss] = useState(entry != null ? String(Math.round(entry * 0.95)) : '')
  const [targetOverride, setTargetOverride] = useState('')

  const cap = Number(capital)
  const riskAmount = (cap * Number(risk)) / 100
  const entryNum = Number(entryPrice)
  const stopNum = Number(stopLoss)
  const riskPerShare = entryNum - stopNum
  // Default the target to a 3R reward (risk : reward 1 : 3) from entry/stop-loss.
  // Clearing the Target field returns to the auto value; the user can override.
  const autoTarget = riskPerShare > 0 ? entryNum + 3 * riskPerShare : NaN
  const targetAuto = targetOverride.trim() === ''
  const targetNum = targetAuto ? autoTarget : Number(targetOverride)
  const qty = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0
  const reward = qty > 0 && targetNum > entryNum ? qty * (targetNum - entryNum) : 0
  const rr = riskAmount > 0 && reward > 0 ? reward / riskAmount : NaN
  const targetDisplay = targetAuto ? (Number.isFinite(autoTarget) && autoTarget > 0 ? String(Math.round(autoTarget)) : '') : targetOverride

  return (
    <div className="flex flex-col rounded-lg border border-[#1d2b45] bg-[#0e1626] p-3">
      <div className="border-b border-[#1b263d] pb-1.5">
        <h3 className="text-xs font-bold text-white">Trade Calculator</h3>
      </div>
      <div className="my-1 grid grid-cols-3 gap-2">
        {[
          { key: 'capital', label: 'Capital (₹)', value: capital, set: setCapital, tone: 'text-white' },
          { key: 'entry', label: 'Entry (₹)', value: entryPrice, set: setEntryPrice, tone: 'text-white' },
          { key: 'stop', label: 'Stop Loss (₹)', value: stopLoss, set: setStopLoss, tone: 'text-red-400' },
          {
            key: 'target',
            label: (
              <span className="flex items-center gap-1">
                Target (₹)
                {targetAuto && entryNum > stopNum && (
                  <span className="rounded bg-cyan-900/70 px-1 py-px text-[8px] font-medium text-cyan-300">auto 1:3</span>
                )}
              </span>
            ),
            value: targetDisplay,
            set: setTargetOverride,
            tone: 'text-emerald-400',
          },
        ].map((field) => (
          <label key={field.key} className="block">
            <span className="mb-0.5 block text-[10px] text-slate-400">{field.label}</span>
            <input value={field.value} onChange={(event) => field.set(event.target.value)} className={`w-full rounded border border-[#223352] bg-[#090f1d] px-1.5 py-1 font-mono text-2xs font-bold ${field.tone} focus:outline-none`} />
          </label>
        ))}
        <label className="block">
          <span className="mb-0.5 block text-[10px] text-slate-400">Risk %</span>
          <select value={risk} onChange={(event) => setRisk(event.target.value)} className="w-full rounded border border-[#223352] bg-[#090f1d] px-1 py-1 font-mono text-2xs text-white focus:outline-none">
            {[1, 2, 3].map((option) => (
              <option key={option} value={option}>
                {option}%
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] text-slate-400">Qty (Shares)</span>
          <input readOnly value={qty} className="w-full rounded border border-[#223352] bg-[#090f1d] px-1.5 py-1 font-mono text-2xs font-bold text-cyan-300 focus:outline-none" />
        </label>
      </div>
      <div className="grid grid-cols-3 border-t border-[#172338] pt-2 text-center">
        <div>
          <div className="text-[9px] text-slate-400">Risk Amount</div>
          <div className="mt-0.5 font-mono text-xs font-bold text-emerald-400">₹ {fmt(riskAmount)}</div>
        </div>
        <div>
          <div className="text-[9px] text-slate-400">Reward Amount</div>
          <div className="mt-0.5 font-mono text-xs font-bold text-emerald-400">₹ {fmt(reward)}</div>
        </div>
        <div>
          <div className="text-[9px] text-slate-400">Risk : Reward</div>
          <div className="mt-0.5 font-mono text-xs font-bold text-emerald-400">{Number.isFinite(rr) ? `1 : ${rr.toFixed(1)}` : '—'}</div>
        </div>
      </div>
    </div>
  )
}
