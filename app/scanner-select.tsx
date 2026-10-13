'use client'

import { useRouter } from 'next/navigation'

export function ScannerSelect({
  scanners,
  value,
}: {
  scanners: readonly (readonly [string, string])[]
  value: string
}) {
  const router = useRouter()
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-slate-500">Scanner</span>
      <select
        value={value}
        onChange={(event) => router.push(`/?scanner=${encodeURIComponent(event.target.value)}`)}
        className="rounded-lg border border-[#13243c] bg-[#0a1525] px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500"
      >
        {scanners.map(([name]) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}
