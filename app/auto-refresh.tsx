'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Keep the public scanner showing the latest persisted rows without a manual
 * reload. It only re-runs the existing server data read (router.refresh) on a
 * bounded interval and never triggers any scraping.
 */
export function AutoRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])
  return null
}
