'use client'

import ReactECharts from 'echarts-for-react'
import { normalizeMetric } from './visual-utils'

export type RadarStock = {
  symbol: string
  name: string
  values: Record<string, number | null>
}

type Props = {
  stocks: RadarStock[]
}

const COLORS = ['#22d3ee', '#34d399', '#f59e0b', '#a78bfa', '#fb7185', '#38bdf8']

const PILLARS = [
  'Valuation Attractiveness',
  'Capital Quality',
  'Growth Momentum',
  'Solvency',
  'Cash Conversion',
  'Forensic Safety',
]

/**
 * Six-pillar radar. Each pillar is a normalized composite (0 = weak, 100 =
 * strong) so stocks of very different size/units can be compared on one web.
 * Missing inputs fall back to a neutral value and are never shown as a peak.
 */
function pillarScores(stock: RadarStock): number[] {
  const value = (key: string): number | null => {
    const raw = stock.values[key]
    return raw == null || !Number.isFinite(raw) ? null : raw
  }

  const cheapness = (() => {
    const pe = normalizeMetric(value('pe'), 0, 60, true)
    const pb = normalizeMetric(value('pb'), 0, 20, true)
    const ps = normalizeMetric(value('ps'), 0, 12, true)
    const scored = [pe, pb, ps].filter((n): n is number => n != null)
    return scored.length ? scored.reduce((sum, n) => sum + n, 0) / scored.length : null
  })()

  const quality = (() => {
    const roce = normalizeMetric(value('roce'), 0, 40)
    const roe = normalizeMetric(value('roe'), 0, 40)
    const opm = normalizeMetric(value('opm'), 0, 30)
    const scored = [roce, roe, opm].filter((n): n is number => n != null)
    return scored.length ? scored.reduce((sum, n) => sum + n, 0) / scored.length : null
  })()

  const growth = (() => {
    const sales = normalizeMetric(value('salesCagr3'), 0, 35)
    const profit = normalizeMetric(value('profitCagr3'), 0, 40)
    const scored = [sales, profit].filter((n): n is number => n != null)
    return scored.length ? scored.reduce((sum, n) => sum + n, 0) / scored.length : null
  })()

  const solvency = normalizeMetric(value('debtEquity'), 0, 2.5, true)

  const cash = (() => {
    const cfo = normalizeMetric(value('cfoPat'), 0, 1.8)
    const fcf = normalizeMetric(value('fcfYield'), 0, 10)
    const scored = [cfo, fcf].filter((n): n is number => n != null)
    return scored.length ? scored.reduce((sum, n) => sum + n, 0) / scored.length : null
  })()

  const forensic = (() => {
    const fScore = normalizeMetric(value('piotroski'), 0, 9)
    const pledged = value('pledged')
    const pledgeSafety = pledged == null ? null : normalizeMetric(pledged, 0, 25, true)
    const scored = [fScore, pledgeSafety].filter((n): n is number => n != null)
    return scored.length ? scored.reduce((sum, n) => sum + n, 0) / scored.length : null
  })()

  return [cheapness, quality, growth, solvency, cash, forensic].map((n) => (n == null ? 0 : n))
}

export function SpiderRadarChart({ stocks }: Props) {
  if (stocks.length === 0) {
    return (
      <section className="rounded-xl border border-[#162844] bg-[#091527] px-6 py-14 text-center">
        <p className="text-xs text-slate-400">Add at least one stock to see the Spider Radar.</p>
      </section>
    )
  }

  const option = {
    backgroundColor: 'transparent',
    legend: {
      data: stocks.map((stock) => stock.symbol),
      textStyle: { color: '#cbd5e1' },
      top: 0,
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0b1626',
      borderColor: '#1e3a5f',
      textStyle: { color: '#e2e8f0' },
      formatter: (params: { data: { name: string; value: number[] } }) => {
        const rows = PILLARS.map((pillar, index) => `${pillar}: <b>${params.data.value[index]}</b>`).join('<br/>')
        return `<strong>${params.data.name}</strong><br/>${rows}`
      },
    },
    radar: {
      indicator: PILLARS.map((name) => ({ name, max: 100 })),
      radius: '65%',
      center: ['50%', '56%'],
      axisName: { color: '#94a3b8', fontSize: 11 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitArea: { areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.01)'] } },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
    },
    series: [
      {
        type: 'radar',
        data: stocks.map((stock, index) => ({
          name: stock.symbol,
          value: pillarScores(stock),
          itemStyle: { color: COLORS[index % COLORS.length] },
          lineStyle: { width: 2, color: COLORS[index % COLORS.length] },
          areaStyle: { color: COLORS[index % COLORS.length], opacity: 0.25 },
        })),
      },
    ],
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[#162844] bg-[#091527]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">Spider Radar</p>
          <p className="text-xs text-slate-500">Six fundamental pillars, each normalized to 0–100. Demo data.</p>
        </div>
      </div>
      <div className="px-2 pb-4">
        <ReactECharts option={option} style={{ height: 520, width: '100%' }} notMerge lazyUpdate />
      </div>
    </section>
  )
}
