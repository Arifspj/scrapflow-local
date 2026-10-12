'use client'

import { useState } from 'react'
import type { ChartSeries } from '@/lib/stock-detail'

function fmt(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'
}

function ChartTooltip({ title, chart, index, leftPct }: { title: string; chart: ChartSeries; index: number; leftPct: number }) {
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-md border border-[#2b3f63] bg-[#0b1424]/95 px-2 py-1.5 text-[10px] shadow-xl backdrop-blur"
      style={{ left: `${Math.min(Math.max(leftPct, 14), 86)}%` }}
    >
      <div className="mb-1 border-b border-[#1d2b45] pb-0.5 font-semibold text-white">{title}</div>
      {chart.series.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1 text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: entry.color }} />
            {entry.name}
          </span>
          <span className="font-mono font-semibold text-white">₹ {fmt(entry.values[index])} Cr</span>
        </div>
      ))}
    </div>
  )
}

function Legend({ chart }: { chart: ChartSeries }) {
  return (
    <div className="mt-2 flex items-center justify-center gap-4 border-t border-[#172236] pt-2 text-[10px]">
      {chart.series.map((entry) => (
        <span key={entry.name} className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-slate-300">{entry.name}</span>
        </span>
      ))}
    </div>
  )
}

export function QuarterlyBarChart({ chart }: { chart: ChartSeries | null }) {
  const [active, setActive] = useState<number | null>(null)
  if (!chart) return <p className="flex h-44 items-center justify-center text-xs text-slate-500">Quarterly data not available.</p>

  const max = Math.max(...chart.series.flatMap((entry) => entry.values), 1)
  return (
    <div className="relative">
      {active != null && (
        <ChartTooltip title={chart.columns[active]} chart={chart} index={active} leftPct={((active + 0.5) / chart.columns.length) * 100} />
      )}
      <div className="flex h-40 items-end justify-between gap-2 border-b border-slate-800 px-2" onMouseLeave={() => setActive(null)}>
        {chart.columns.map((column, index) => (
          <button
            type="button"
            key={column}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onClick={() => setActive((current) => (current === index ? null : index))}
            aria-label={`${column} data`}
            className="flex h-full flex-1 items-end justify-center gap-0.5 rounded-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
          >
            {chart.series.map((entry) => (
              <div
                key={entry.name}
                className={`w-2 rounded-t-sm transition-opacity ${active == null || active === index ? 'opacity-100' : 'opacity-40'}`}
                style={{ height: `${Math.max((entry.values[index] / max) * 100, 1)}%`, background: entry.color }}
              />
            ))}
          </button>
        ))}
      </div>
      <div className="flex justify-between px-2 pt-1 font-mono text-[9px] text-slate-400">
        {chart.columns.map((column) => (
          <span key={column} className="flex-1 text-center">{column}</span>
        ))}
      </div>
      <Legend chart={chart} />
    </div>
  )
}

export function ProfitLineChart({ chart }: { chart: ChartSeries | null }) {
  const [active, setActive] = useState<number | null>(null)
  if (!chart) return <p className="flex h-44 items-center justify-center text-xs text-slate-500">Annual data not available.</p>

  const all = chart.series.flatMap((entry) => entry.values)
  const maxV = Math.max(...all, 1)
  const minV = Math.min(...all, 0)
  const range = maxV - minV || 1
  const width = 300
  const height = 130
  const pad = 12
  const xFor = (index: number) => pad + (index * (width - pad * 2)) / Math.max(chart.columns.length - 1, 1)
  const yFor = (value: number) => height - pad - ((value - minV) / range) * (height - pad * 2)

  return (
    <div className="relative">
      {active != null && (
        <ChartTooltip title={chart.columns[active]} chart={chart} index={active} leftPct={(xFor(active) / width) * 100} />
      )}
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-40 w-full" onMouseLeave={() => setActive(null)}>
        {chart.series.map((entry) => (
          <g key={entry.name}>
            <polyline fill="none" stroke={entry.color} strokeWidth="2" points={entry.values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(' ')} />
            {entry.values.map((value, index) => (
              <circle key={index} cx={xFor(index)} cy={yFor(value)} r={active === index ? 3.2 : 2.4} fill={entry.color} />
            ))}
          </g>
        ))}
        {chart.columns.map((_, index) => (
          <rect
            key={index}
            x={xFor(index) - width / (chart.columns.length * 2)}
            y={0}
            width={width / chart.columns.length}
            height={height}
            fill="transparent"
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onClick={() => setActive((current) => (current === index ? null : index))}
          />
        ))}
      </svg>
      <div className="flex justify-between px-2 font-mono text-[9px] text-slate-400">
        {chart.columns.map((column) => (
          <span key={column} className="flex-1 text-center">{column.replace(/^Mar\s+/, '')}</span>
        ))}
      </div>
      <Legend chart={chart} />
    </div>
  )
}
