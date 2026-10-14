'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Drop-in `useState` that mirrors its value into sessionStorage, so client-only
 * view state (table filters, sort, page size) survives opening a stock and
 * coming back. The first render always uses `initial` to stay hydration-safe;
 * the stored value is applied once on mount, and user updates are written at
 * the moment they happen — never from an effect, so a fresh mount can't clobber
 * stored state before it has been read. Clearing works because setting the
 * value also overwrites storage with the cleared state.
 */
export function useSessionState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(initial)
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    try {
      const raw = window.sessionStorage.getItem(key)
      if (raw != null) setState(JSON.parse(raw) as T)
    } catch {
      // Unreadable or blocked storage: keep the caller's default.
    }
  }, [key])

  const update = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value
        try {
          window.sessionStorage.setItem(key, JSON.stringify(next))
        } catch {
          // Storage unavailable (e.g. private mode): state still updates in memory.
        }
        return next
      })
    },
    [key],
  )

  return [state, update] as const
}
