'use client'

import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  Clock3,
  Database,
  ExternalLink,
  FileText,
  Gem,
  Globe2,
  LoaderCircle,
  Menu,
  Moon,
  MoreVertical,
  Plus,
  Search,
  Server,
  Settings,
  SlidersHorizontal,
  Star,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react'

const scanners = [
  { name: 'Undervalued Scanner', links: 12, icon: Gem, tone: 'text-sky-400 bg-sky-400/10', lastRun: '6:40 PM', status: 'Success' },
  { name: 'IPO Scanner', links: 6, icon: Zap, tone: 'text-fuchsia-400 bg-fuchsia-400/10', lastRun: '5:20 PM', status: 'Success' },
  { name: 'Multibagger Scanner', links: 8, icon: Trophy, tone: 'text-amber-400 bg-amber-400/10', lastRun: '4:10 PM', status: 'Success' },
  { name: 'Split Scanner', links: 4, icon: Database, tone: 'text-cyan-400 bg-cyan-400/10', lastRun: '9:30 AM', status: 'Success' },
  { name: 'Penny Stocks Scanner', links: 10, icon: BarChart3, tone: 'text-orange-400 bg-orange-400/10', lastRun: '3:15 PM', status: 'Success' },
  { name: 'Business Group Scanner', links: 7, icon: Users, tone: 'text-violet-400 bg-violet-400/10', lastRun: '2:40 PM', status: 'Success' },
  { name: 'Upper Circuit Scan', links: 5, icon: ArrowUpRight, tone: 'text-emerald-400 bg-emerald-400/10', lastRun: '1:10 PM', status: 'Success' },
  { name: 'Sector Scanner', links: 9, icon: SlidersHorizontal, tone: 'text-blue-400 bg-blue-400/10', lastRun: '12:30 PM', status: 'Success' },
  { name: 'Watchlist', links: 3, icon: Star, tone: 'text-yellow-400 bg-yellow-400/10', lastRun: '11:20 AM', status: 'Success' },
]

const navItems = [
  { label: 'Scanner Management', icon: Server },
  { label: 'View Stocks (DB)', icon: BarChart3 },
  { label: 'Cron Job / Scheduler', icon: Clock3 },
  { label: 'Fetch Logs', icon: FileText },
  { label: 'System Settings', icon: Settings },
]

export default function Page() {
  const [activeNav, setActiveNav] = useState('Scanner Management')
  const [activeScanner, setActiveScanner] = useState('Undervalued Scanner')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  const filteredScanners = useMemo(
    () => scanners.filter((scanner) => scanner.name.toLowerCase().includes(query.toLowerCase())),
    [query],
  )

  function runFetch() {
    setIsRunning(true)
    window.setTimeout(() => setIsRunning(false), 1400)
  }

  return (
    <main className="flex min-h-screen bg-[#080c15] text-slate-300 selection:bg-blue-500/30">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-white/[0.07] bg-[#0b101b] transition-transform lg:static lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300"><BarChart3 className="size-5" /></div>
            <div><p className="font-semibold tracking-tight text-white">Q-Scan</p><p className="text-[11px] text-slate-500">Admin Panel</p></div>
          </div>
          <button onClick={() => setMobileMenuOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 lg:hidden" aria-label="Close navigation"><X className="size-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <nav aria-label="Primary navigation" className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const selected = activeNav === item.label
              return <button key={item.label} onClick={() => { setActiveNav(item.label); setMobileMenuOpen(false) }} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition ${selected ? 'border border-blue-400/25 bg-blue-500/15 text-sky-300' : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'}`}><Icon className="size-4" />{item.label}</button>
            })}
          </nav>
          <div className="mt-8">
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">Scanner List</p>
            <div className="flex flex-col gap-0.5">
              {scanners.map((scanner) => { const Icon = scanner.icon; return <button key={scanner.name} onClick={() => setActiveScanner(scanner.name)} className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition ${activeScanner === scanner.name ? 'bg-blue-500/15 text-white' : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'}`}><span className="flex min-w-0 items-center gap-3"><Icon className={`size-3.5 ${scanner.tone.split(' ')[0]}`} /><span className="truncate">{scanner.name}</span></span><span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px]">{scanner.links}</span></button> })}
            </div>
          </div>
        </div>
        <div className="m-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-[11px]">
          <div className="mb-3 flex items-center gap-2 border-b border-white/[0.07] pb-2 font-semibold text-slate-300"><Database className="size-3.5 text-sky-400" />Database Info</div>
          <div className="flex flex-col gap-2 text-slate-500"><div className="flex justify-between"><span>Total Scanners</span><b className="text-white">9</b></div><div className="flex justify-between"><span>Total Links</span><b className="text-white">56</b></div><div className="flex justify-between"><span>Total Stocks</span><b className="text-white">12,946</b></div><div className="flex justify-between"><span>DB Size</span><b className="text-white">125 MB</b></div></div>
        </div>
      </aside>

      {mobileMenuOpen && <button className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation overlay" />}
      <section className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between border-b border-white/[0.07] bg-[#0b101b] px-4 sm:px-6">
          <button className="rounded-lg p-2 text-slate-400 hover:bg-white/5 lg:hidden" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation"><Menu className="size-5" /></button>
          <div className="ml-auto flex items-center gap-2 sm:gap-4"><button className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.08] sm:flex">Visit Website <ExternalLink className="size-3" /></button><button className="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-amber-300 hover:bg-white/[0.08]" aria-label="Toggle theme"><Moon className="size-3.5" /></button><div className="flex items-center gap-2 border-l border-white/10 pl-3"><span className="flex size-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">A</span><span className="hidden text-xs font-medium text-slate-200 sm:block">Admin</span><ChevronDown className="size-3 text-slate-500" /></div></div>
        </header>
        <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-medium text-sky-400">Operations / {activeNav}</p><h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{activeNav}</h1><p className="mt-1.5 max-w-2xl text-xs leading-5 text-slate-500">Add and manage Chartink / Screener links. The JavaScript worker fetches data on schedule and saves validated results to the database.</p></div><div className="flex gap-2"><button onClick={runFetch} disabled={isRunning} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-60">{isRunning ? <LoaderCircle className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}{isRunning ? 'Running fetch...' : 'Run fetch now'}</button><button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg shadow-blue-600/15 transition hover:bg-blue-500"><Plus className="size-3.5" />Create scanner</button></div></div>

          <div className="mb-5 grid gap-3 sm:grid-cols-3"><Stat label="Active scanners" value="9" detail="All systems operational" tone="text-emerald-400" /><Stat label="Stocks in database" value="12,946" detail="+218 since yesterday" tone="text-sky-400" /><Stat label="Last successful run" value="6:40 PM" detail="12 Oct 2026" tone="text-amber-300" /></div>
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-sm font-semibold text-white">Scanner configurations</h2><p className="mt-1 text-xs text-slate-600">Select a scanner to manage its source links and run history.</p></div><div className="relative"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-600" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search scanners" className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-blue-500/60 sm:w-56" /></div></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{filteredScanners.map((scanner) => { const Icon = scanner.icon; const selected = activeScanner === scanner.name; return <button key={scanner.name} onClick={() => setActiveScanner(scanner.name)} className={`group rounded-xl border p-4 text-left transition ${selected ? 'border-blue-500/50 bg-blue-500/[0.07] shadow-lg shadow-blue-950/20' : 'border-white/[0.07] bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.04]'}`}><div className="flex items-start justify-between"><span className={`flex size-9 items-center justify-center rounded-lg ${scanner.tone}`}><Icon className="size-4" /></span><MoreVertical className="size-4 text-slate-600 transition group-hover:text-slate-300" /></div><p className="mt-4 text-xs font-semibold text-white">{scanner.name}</p><p className="mt-1 text-[11px] text-slate-500">{scanner.links} source links</p><div className="mt-5 flex items-center justify-between border-t border-white/[0.07] pt-3 text-[10px]"><span className="text-slate-600">Today, {scanner.lastRun}</span><span className="flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-2 py-1 font-medium text-emerald-400"><span className="size-1.5 rounded-full bg-emerald-400" />{scanner.status}</span></div></button> })}</div>
          {filteredScanners.length === 0 && <div className="rounded-xl border border-dashed border-white/10 py-16 text-center"><Search className="mx-auto size-5 text-slate-600" /><p className="mt-3 text-sm text-slate-400">No scanners match your search.</p></div>}
        </div>
      </section>
      {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="create-title"><div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111827] p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h2 id="create-title" className="font-semibold text-white">Create scanner</h2><p className="mt-1 text-xs text-slate-500">UI-only step. Database wiring comes next.</p></div><button onClick={() => setShowCreate(false)} className="rounded-lg p-1 text-slate-500 hover:bg-white/5 hover:text-white" aria-label="Close dialog"><X className="size-4" /></button></div><label className="mt-6 block text-xs font-medium text-slate-300">Scanner name<input className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500" placeholder="e.g. Quality compounders" /></label><div className="mt-5 flex justify-end gap-2"><button onClick={() => setShowCreate(false)} className="rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-white/5">Cancel</button><button onClick={() => setShowCreate(false)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500"><Check className="size-3.5" />Save draft</button></div></div></div>}
    </main>
  )
}

function Stat({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="flex items-center justify-between"><p className="text-xs text-slate-500">{label}</p><span className={`size-2 rounded-full bg-current ${tone}`} /></div><p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p><p className={`mt-1 text-[11px] ${tone}`}>{detail}</p></div>
}
