'use client'

import { useEffect, useState } from 'react'

type Point = { time: string; open: number; high: number; low: number; close: number; volume: number }

type HistoryResponse = { ok: boolean; symbol?: string; currency?: string; points?: Point[]; error?: string }

const TIMEFRAMES = [
  { label: '1Y', interval: '1d', range: '1y' },
  { label: '5Y', interval: '1mo', range: '5y' },
  { label: '10Y', interval: '1mo', range: '10y' },
  { label: 'Max', interval: '1mo', range: 'max' },
] as const

const PRICE_UP = '#22c55e'
const PRICE_DOWN = '#ef4444'
const VOLUME_UP = '#cbd5e1'
const VOLUME_DOWN = '#475569'
const CROSSHAIR = '#64748b'

const WIDTH = 600
const HEIGHT = 200
const PAD = 10
const PRICE_TOP = 12
const PRICE_BOTTOM = 138
const VOLUME_TOP = 148
const VOLUME_BOTTOM = 190

function formatPrice(value: number): string {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatAxisPrice(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: value >= 1000 ? 0 : 2 })
}

function formatVolume(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function formatMonth(time: string): string {
  const [year, month] = time.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[Number(month) - 1] ?? ''} ${year?.slice(2) ?? ''}`
}

const TIME_TICKS = 5

function Plot({ points }: { points: Point[] }) {
  const [active, setActive] = useState<number | null>(null)

  const width = 600
  const height = 200
  const pad = 10
  const priceTop = 12
  const priceBottom = 138
  const volumeTop = 148
  const volumeBottom = 190
  const plotWidth = width - pad * 2

  const maxPrice = Math.max(...points.map((point) => point.high))
  const minPrice = Math.min(...points.map((point) => point.low))
  const priceRange = maxPrice - minPrice || 1
  const maxVolume = Math.max(...points.map((point) => point.volume), 1)

  const xFor = (index: number) => pad + (index * plotWidth) / Math.max(points.length - 1, 1)
  const priceY = (value: number) => priceTop + ((maxPrice - value) / priceRange) * (priceBottom - priceTop)
  const volumeHeight = (value: number) => (value / maxVolume) * (volumeBottom - volumeTop)
  const barWidth = Math.max((plotWidth / points.length) * 0.65, 0.6)
  const activeX = active == null ? 0 : xFor(active)
  const activePoint = active == null ? null : points[active]

  const priceTicks = [maxPrice, minPrice + priceRange / 2, minPrice]
  const timeTicks = Array.from({ length: TIME_TICKS }, (_, index) => {
    const point = points[Math.round((index / (TIME_TICKS - 1)) * (points.length - 1))]
    return point?.time ?? ''
  })

  return (
    <div>
      <div className="relative flex gap-1" onMouseLeave={() => setActive(null)}>
        <div className="relative h-44 w-12 shrink-0">
          {[...new Set([maxPrice, minPrice + priceRange / 2, minPrice])].map((value) => (
            <span
              key={value}
              className="absolute right-1 -translate-y-1/2 font-mono text-[10px] tabular-nums text-slate-500"
              style={{ top: `${(priceY(value) / height) * 100}%` }}
            >
              {formatAxisPrice(value)}
            </span>
          ))}
        </div>

        <div className="relative h-44 flex-1">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="h-44 w-full cursor-crosshair"
            role="img"
            aria-label="Price and volume history"
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              if (!rect.width) return
              const fraction = (event.clientX - rect.left) / rect.width
              const index = Math.round(fraction * (points.length - 1))
              setActive(Math.min(Math.max(index, 0), points.length - 1))
            }}
          >
            {[maxPrice, minPrice + priceRange / 2, minPrice].map((value) => (
              <line
                key={`grid-${value}`}
                x1={0}
                y1={priceY(value)}
                x2={width}
                y2={priceY(value)}
                stroke="#1d2b45"
                strokeWidth={0.6}
              />
            ))}
            {points.map((point, index) => {
              const bar = Math.max(volumeHeight(point.volume), 0.6)
              const up = point.close >= point.open
              return (
                <rect
                  key={`vol-${point.time}`}
                  x={xFor(index) - barWidth / 2}
                  y={volumeBottom - bar}
                  width={barWidth}
                  height={bar}
                  fill={up ? VOLUME_UP : VOLUME_DOWN}
                  opacity={0.85}
                />
              )
            })}
            {points.map((point, index) => {
              if (index === 0) return null
              const previous = points[index - 1]
              const up = point.close >= previous.close
              return (
                <line
                  key={`seg-${point.time}`}
                  x1={xFor(index - 1)}
                  y1={priceY(previous.close)}
                  x2={xFor(index)}
                  y2={priceY(point.close)}
                  stroke={up ? PRICE_UP : PRICE_DOWN}
                  strokeWidth={1.6}
                  strokeLinecap="round"
                />
              )
            })}
            {activePoint && (
              <g>
                <line x1={xFor(active!)} y1={0} x2={xFor(active!)} y2={height} stroke="#64748b" strokeWidth={0.8} strokeDasharray="3 3" />
                <line x1={0} y1={priceY(activePoint.close)} x2={width} y2={priceY(activePoint.close)} stroke="#64748b" strokeWidth={0.8} strokeDasharray="3 3" />
                <circle cx={xFor(active!)} cy={priceY(activePoint.close)} r={3} fill="#e2e8f0" stroke="#0e1626" strokeWidth={1} />
              </g>
            )}
          </svg>

          {activePoint && (
            <div
              className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded border border-[#1d2b45] bg-[#0a1220]/95 px-2 py-1 font-mono text-[11px] leading-tight text-slate-200 shadow-lg"
              style={{ left: `${Math.min(Math.max((xFor(active ?? 0) / width) * 100, 14), 86)}%` }}
            >
              <div className="text-slate-400">{activePoint.time}</div>
              <div>₹ {formatPrice(activePoint.close)}</div>
              <div className="text-slate-400">Vol {formatVolume(activePoint.volume)}</div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-1 flex gap-1">
        <div className="w-12 shrink-0" />
        <div className="flex flex-1 justify-between font-mono text-[10px] tabular-nums text-slate-500">
          {Array.from({ length: TIME_TICKS }, (_, step) => points[Math.round((step / (TIME_TICKS - 1)) * (points.length - 1))]).map(
            (point, index) => (
              <span key={`${point.time}-${index}`} className={index === 0 ? '' : index === TIME_TICKS - 1 ? 'text-right' : 'text-center'}>
                {formatMonth(point.time)}
              </span>
            ),
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[#172236] pt-2 text-[12px]">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: PRICE_UP }} />
            <span className="text-slate-300">Up</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: PRICE_DOWN }} />
            <span className="text-slate-300">Down</span>
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: VOLUME_UP }} />
            <span className="text-slate-300">Vol up</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: VOLUME_DOWN }} />
            <span className="text-slate-300">Vol down</span>
          </span>
        </span>
      </div>
    </div>
  )
}

export function PriceVolumeChart({ symbol }: { symbol: string }) {
  const [frame, setFrame] = useState(1)
  const [points, setPoints] = useState<Point[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setMessage(null)

    const { interval, range } = TIMEFRAMES[frame]
    const query = `interval=${interval}&range=${range}`

    fetch(`/api/stocks/${encodeURIComponent(symbol)}/history?${query}`, { signal: controller.signal })
      .then(async (response) => ({ ok: response.ok, body: (await response.json()) as HistoryResponse }))
      .then(({ ok, body }) => {
        if (!ok || !body.ok || !body.points?.length) {
          setPoints(null)
          setMessage(body.error ?? 'Historical data unavailable for this ticker.')
          return
        }
        setPoints(body.points)
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === 'AbortError') return
        setPoints(null)
        setMessage('Could not load price history.')
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [symbol, frame])

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-500">Price (line) with volume (histogram)</span>
        <div className="flex gap-1">
          {TIMEFRAMES.map((item, index) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setFrame(index)}
              className={`rounded border px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors ${
                index === frame
                  ? 'border-cyan-600/60 bg-[#13223d] text-cyan-300'
                  : 'border-[#1d2b45] text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <p className="flex h-44 items-center justify-center text-xs text-slate-500">Loading price history…</p>
      ) : !points ? (
        <p className="flex h-44 items-center justify-center text-xs text-slate-500">
          {message ?? 'Historical data unavailable for this ticker.'}
        </p>
      ) : points.length < 2 ? (
        <p className="flex h-44 items-center justify-center text-xs text-slate-500">
          Not enough price history to plot yet.
        </p>
      ) : (
        <Plot points={points} />
      )}
    </div>
  )
}
