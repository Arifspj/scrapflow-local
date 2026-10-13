'use client'

import { useEffect, useRef, type ReactNode } from 'react'

const ROW_HEIGHT = 8
const GAP = 12

/**
 * A compact masonry grid for the dashboard cards.
 *
 * A normal CSS grid aligns every row to its tallest card, so a short card (the
 * ROCE calculator next to two tall charts, QoQ/YoY next to the taller
 * Shareholding card, …) always leaves dead space beneath it. Native CSS masonry
 * is not available in all browsers, so this measures each card and assigns it a
 * `grid-row` span in a fine-grained `grid-auto-rows`, letting later cards flow
 * up into the gaps without stretching any card to the tallest one.
 *
 * DOM order (and therefore tab/reading order) is preserved: cards are placed
 * left-to-right into the shortest column, never reordered. Before hydration the
 * grid simply renders as a normal (row-aligned) grid, so there is no overlap.
 */
export function MasonryGrid({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return
    const items = Array.from(container.children).filter((node): node is HTMLElement => node instanceof HTMLElement)
    if (!items.length) return

    let frame = 0
    const layout = () => {
      frame = 0
      container.style.gridAutoRows = `${ROW_HEIGHT}px`
      for (const item of items) item.style.gridRowEnd = 'auto'
      for (const item of items) {
        const height = item.getBoundingClientRect().height
        const span = Math.max(1, Math.round((height + GAP) / (ROW_HEIGHT + GAP)))
        item.style.gridRowEnd = `span ${span}`
      }
    }
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(layout)
    }

    layout()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    if (observer) for (const item of items) observer.observe(item)
    window.addEventListener('resize', schedule)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [children])

  return (
    <div ref={ref} className={`grid items-start gap-3 ${className ?? ''}`}>
      {children}
    </div>
  )
}
