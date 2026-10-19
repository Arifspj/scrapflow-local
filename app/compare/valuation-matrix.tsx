'use client'

import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'

export type MatrixStock = {
  symbol: string
  name: string
  values: Record<string, number | null>
}

type Props = {
  stocks: MatrixStock[]
}

type AxisMode = 'pe_roce' | 'ps_growth' | 'de_mos'

const AXES: { id: AxisMode; label: string; x: string; y: string; xMedian: number; yMedian: number }[] = [
  { id: 'pe_roce', label: 'P/E vs ROCE', x: 'P/E (TTM) → expensive', y: 'ROCE % → quality', xMedian: 35, yMedian: 15 },
  { id: 'ps_growth', label: 'P/S vs Sales Growth', x: 'P/S → expensive', y: 'Sales growth % (YoY)', xMedian: 3, yMedian: 15 },
  { id: 'de_mos', label: 'Debt/Equity vs Margin of Safety', x: 'Debt / Equity →', y: 'Margin of safety %', xMedian: 0.75, yMedian: 15 },
]

function bubbleColor(score: number | null): string {
  if (score == null) return '#94a3b8'
  if (score >= 80) return '#34d399'
  if (score >= 65) return '#22d3ee'
  if (score >= 50) return '#f59e0b'
  return '#fb7185'
}

export function ValuationMatrixChart({ stocks }: Props) {
  const [mode, setMode] = useState<AxisMode>('pe_roce')
  const axis = AXES.find((item) => item.id === mode) ?? AXES[0]

  const points = useMemo(() => {
    return stocks
      .map((stock) => {
        const pick = (key: string): number | null => {
          const raw = stock.values[key]
          return raw == null || !Number.isFinite(raw) ? null : raw
        }
        const x = mode === 'pe_roce' ? pick('pe') : mode === 'ps_growth' ? pick('ps') : pick('debtEquity')
        const y = mode === 'pe_roce' ? pick('roce') : mode === 'ps_growth' ? pick('salesYoy') : pick('mos')
        if (x == null || y == null) return null
        const marketCap = pick('marketCap') ?? 5000
        const score = pick('fundScore')
        const size = Math.max(12, Math.min(48, Math.sqrt(marketCap) / 12))
        return {
          name: stock.symbol,
          value: [x, y],
          symbolSize: size,
          itemStyle: { color: bubbleColor(score), opacity: 0.85 },
          meta: { marketCap, score },
        }
      })
      .filter((point): point is NonNullable<typeof point> => point != null)
  }, [stocks, mode])

  const option = useMemo(
    () => ({
      backgroundColor: 'transparent',
      grid: { left: 64, right: 32, top: 40, bottom: 56 },
      tooltip: {
        trigger: 'item',
        backgroundColor: '#0b1626',
        borderColor: '#1e3a5f',
        textStyle: { color: '#e2e8f0' },
        formatter: (params: { data: (typeof points)[number] }) => {
          const [x, y] = params.data.value
          const { marketCap, score } = params.data.meta
          return [
            `<strong>${params.data.name}</strong>`,
            `${axis.x}: <b>${Number(x).toFixed(2)}</b>`,
            `${axis.y}: <b>${Number(y).toFixed(2)}</b>`,
            `Market cap: <b>₹${marketCap.toLocaleString('en-IN')} Cr</b>`,
            `Fundamental score: <b>${score ?? '—'}</b>`,
          ].join('<br/>')
        },
      },
      xAxis: {
        type: 'value',
        name: axis.x,
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: { color: '#94a3b8' },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
        axisLabel: { color: '#94a3b8' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      },
      yAxis: {
        type: 'value',
        name: axis.y,
        nameTextStyle: { color: '#94a3b8' },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
        axisLabel: { color: '#94a3b8' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      },
      series: [
        {
          type: 'scatter',
          data: points,
          label: {
            show: true,
            position: 'top',
            color: '#cbd5e1',
            fontSize: 11,
            formatter: (params: { data: { name: string } }) => params.data.name,
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { type: 'dashed', color: 'rgba(148,163,184,0.5)' },
            label: { color: '#94a3b8', formatter: '' },
            data: [{ xAxis: axis.xMedian }, { yAxis: axis.yMedian }],
          },
          markArea: {
            silent: true,
            label: { color: '#64748b', fontSize: 11 },
            data: [
              [
                { name: 'Undervalued Compounders', xAxis: 0, yAxis: axis.yMedian, itemStyle: { color: 'rgba(16,185,129,0.05)' }, label: { position: 'insideTopLeft' } },
                { xAxis: axis.xMedian, yAxis: 'max' },
              ],
              [
                { name: 'Expensive Moats', xAxis: axis.xMedian, yAxis: axis.yMedian, itemStyle: { color: 'rgba(34,211,238,0.05)' }, label: { position: 'insideTopRight' } },
                { xAxis: 'max', yAxis: 'max' },
              ],
              [
                { name: 'Value Traps', xAxis: 0, yAxis: 'min', itemStyle: { color: 'rgba(245,158,11,0.05)' }, label: { position: 'insideBottomLeft' } },
                { xAxis: axis.xMedian, yAxis: axis.yMedian },
              ],
              [
                { name: 'Toxic / Avoid', xAxis: axis.xMedian, yAxis: 0, itemStyle: { color: 'rgba(244,63,94,0.05)' }, label: { position: 'insideBottomRight' } },
                { xAxis: 'max', yAxis: axis.yMedian },
              ],
            ],
          },
        },
      ],
    }),
    [points, axis],
  )

  if (stocks.length < 2) {
    return (
      <section className="rounded-xl border border-[#162844] bg-[#091527] px-6 py-14 text-center">
        <p className="text-xs text-slate-400">Add at least 2 stocks to see the Valuation Matrix.</p>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[#162844] bg-[#091527]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">Valuation Matrix</p>
          <p className="text-xs text-slate-500">Bubble size = market cap, colour = fundamental score. Demo data.</p>
        </div>
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as AxisMode)}
          aria-label="Matrix axes"
          className="rounded-md border border-[#1e3352] bg-[#0b1626] px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500"
        >
          {AXES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="px-2 pb-4">
        <ReactECharts option={option} style={{ height: 520, width: '100%' }} notMerge lazyUpdate />
      </div>
    </section>
  )
}
