'use client'

import { useState } from 'react'
import type { ChartSeries } from '@/lib/stock-detail'

function fmt(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'
}

/** Split a series into polyline point-strings, breaking wherever a value is missing. */
function lineSegments(
  values: (number | null)[],
  xFor: (index: number) => number,
  yFor: (value: number) => number,
): string[] {
  const segments: string[] = []
  let current: string[] = []
  values.forEach((value, index) => {
    if (value == null || !Number.isFinite(value)) {
      if (current.length) {
        segments.push(current.join(' '))
        current = []
      }
      return
    }
    current.push(`${xFor(index)},${yFor(value)}`)
  })
  if (current.length) segments.push(current.join(' '))
  return segments
}

/**
 * A fixed readout panel rendered BELOW the plot (never overlaying it). Shows the
 * values for one period in a compact two-column layout with a stable height, so
 * hovering does not squeeze or hide the chart. Falls back to the latest period
 * when the user has not selected a point.
 */
function PointReadout({ chart, index, selected }: { chart: ChartSeries; index: number; selected: boolean }) {
  const period = chart.columns[index] ?? '—'
  return (
    <div className="mt-2 w-full rounded-md border border-[#1d2b45] bg-[#0a1220] px-3 py-2">
      <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">
        {selected ? 'Selected period' : 'Latest period'}: <span className="text-cyan-300">{period}</span>
      </div>
      <div className="mt-1.5 min-w-[220px] overflow-x-auto">
        <table className="w-full text-[12px]">
          <tbody>
            {chart.series.map((entry) => {
              const value = entry.values[index]
              const numeric = value != null && Number.isFinite(value) ? value : null
              return (
                <tr key={entry.name} className="border-t border-[#152035] first:border-0">
                  <td className="py-1 pr-3 text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: entry.color }} />
                      {entry.name}
                    </span>
                  </td>
                  <td className="py-1 text-right font-mono font-semibold tabular-nums whitespace-nowrap text-white">
                    {numeric != null ? `₹ ${fmt(numeric)} Cr` : '—'}
                  </td>
                </tr>
              )
            })}
            {!chart.series.length && (
              <tr>
                <td className="py-1 text-slate-500">No series data.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Legend({ chart }: { chart: ChartSeries }) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-[#172236] pt-2 text-[12px]">
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

  const max = Math.max(
    ...chart.series.flatMap((entry) => entry.values).filter((value): value is number => value != null && Number.isFinite(value)),
    1,
  )
  const selectedIndex = active ?? Math.max(chart.columns.length - 1, 0)
  return (
    <div>
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
            {chart.series.map((entry) => {
              const value = entry.values[index]
              if (value == null || !Number.isFinite(value)) return null
              return (
                <div
                  key={entry.name}
                  className={`w-2 rounded-t-sm transition-opacity ${active == null || active === index ? 'opacity-100' : 'opacity-40'}`}
                  style={{ height: `${Math.max((value / max) * 100, 1)}%`, background: entry.color }}
                />
              )
            })}
          </button>
        ))}
      </div>
      <div className="flex justify-between px-2 pt-1 font-mono text-[11px] text-slate-400">
        {chart.columns.map((column) => (
          <span key={column} className="flex-1 text-center">{column}</span>
        ))}
      </div>
      <PointReadout chart={chart} index={selectedIndex} selected={active != null} />
      <Legend chart={chart} />
    </div>
  )
}

export function ProfitLineChart({ chart }: { chart: ChartSeries | null }) {
  const [active, setActive] = useState<number | null>(null)
  if (!chart) return <p className="flex h-44 items-center justify-center text-xs text-slate-500">Annual data not available.</p>

  const all = chart.series
    .flatMap((entry) => entry.values)
    .filter((value): value is number => value != null && Number.isFinite(value))
  const maxV = Math.max(...all, 1)
  const minV = Math.min(...all, 0)
  const range = maxV - minV || 1
  const width = 300
  const height = 130
  const pad = 12
  const xFor = (index: number) => pad + (index * (width - pad * 2)) / Math.max(chart.columns.length - 1, 1)
  const yFor = (value: number) => height - pad - ((value - minV) / range) * (height - pad * 2)
  const selectedIndex = active ?? Math.max(chart.columns.length - 1, 0)

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-40 w-full" onMouseLeave={() => setActive(null)}>
        {chart.series.map((entry) => (
          <g key={entry.name}>
            {lineSegments(entry.values, xFor, yFor).map((points, segment) => (
              <polyline key={segment} fill="none" stroke={entry.color} strokeWidth="2" points={points} />
            ))}
            {entry.values.map((value, index) =>
              value == null || !Number.isFinite(value) ? null : (
                <circle key={index} cx={xFor(index)} cy={yFor(value)} r={active === index ? 3.2 : 2.4} fill={entry.color} />
              ),
            )}
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
      <div className="flex justify-between px-2 font-mono text-[11px] text-slate-400">
        {chart.columns.map((column) => (
          <span key={column} className="flex-1 text-center">{column.replace(/^Mar\s+/, '')}</span>
        ))}
      </div>
      <PointReadout chart={chart} index={selectedIndex} selected={active != null} />
      <Legend chart={chart} />
    </div>
  )
}