'use client'

import { useRouter } from 'next/navigation'
import type { PublicScannerOption } from '@/lib/public-data'

export function ScannerSelect({
  scanners,
  value,
  variant = 'inline',
}: {
  scanners: readonly PublicScannerOption[]
  value: string
  variant?: 'inline' | 'hero'
}) {
  const router = useRouter()
  const options = scanners.map(({ name }) => (
    <option key={name} value={name}>
      {name}
    </option>
  ))

  if (variant === 'hero') {
    return (
      <select
        value={value}
        onChange={(event) => router.push(`/?scanner=${encodeURIComponent(event.target.value)}`)}
        aria-label="Select scanner"
        className="mt-2 w-full max-w-md rounded-lg border border-[#1b2b45] bg-[#0b182b] px-3 py-2 text-2xl font-bold tracking-tight text-white outline-none focus:border-sky-500"
      >
        {options}
      </select>
    )
  }

  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-slate-500">Scanner</span>
      <select
        value={value}
        onChange={(event) => router.push(`/?scanner=${encodeURIComponent(event.target.value)}`)}
        className="rounded-lg border border-[#13243c] bg-[#0a1525] px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500"
      >
        {options}
      </select>
    </label>
  )
}
