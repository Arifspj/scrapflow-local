'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Sidebar, type SidebarItem } from './sidebar'

const COLLAPSE_KEY = 'qscan:sidebar-collapsed'

/**
 * Owns the saved-stocks sidebar layout state so the server-rendered page can
 * stay a server component. Desktop users can collapse the sidebar to a compact
 * rail (persisted in localStorage); on small screens the same sidebar becomes a
 * slide-out drawer with a backdrop, Escape-to-close and close-on-navigate.
 */
export function StockWorkspace({
  items,
  activeSymbol,
  children,
}: {
  items: SidebarItem[]
  activeSymbol: string
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1')
    } catch {
      // Storage can be unavailable (private mode); the default stays expanded.
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        // Ignore storage failures; the visible state still toggles.
      }
      return next
    })
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open saved stocks"
        className="fixed bottom-4 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-cyan-700/50 bg-[#122038] text-cyan-300 shadow-lg shadow-black/40 lg:hidden"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="flex items-start">
        <Sidebar
          items={items}
          activeSymbol={activeSymbol}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          open={open}
          onClose={() => setOpen(false)}
        />
        {children}
      </div>
    </>
  )
}
