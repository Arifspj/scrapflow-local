import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCategoryData } from '@/lib/category-data'
import { categoryHref, categoryLevel, categorySourceUrl, LEVEL_LABEL, normalizeMarketSegments } from '@/lib/category'
import { CategoryTable } from './category-table'
import { ImportCategoryButton } from './import-category-button'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string[] }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const segments = normalizeMarketSegments(slug)
  if (!segments) return { title: 'Category not found | Q-Scan' }
  const { trail } = await getCategoryData(segments)
  const name = trail.at(-1)?.name ?? segments.join(' / ')
  return { title: `${name} — ${LEVEL_LABEL[categoryLevel(segments)]} | Q-Scan` }
}

export default async function MarketCategoryPage({ params }: Props) {
  const { slug } = await params
  const segments = normalizeMarketSegments(slug)
  if (!segments) notFound()

  const { rows, trail, imported } = await getCategoryData(segments)
  const level = categoryLevel(segments)
  const heading = trail.at(-1)?.name ?? segments.join(' / ')
  const sourceUrl = categorySourceUrl(segments)

  return (
    <main className="min-h-screen bg-[#050b14] text-slate-300 antialiased">
      <header className="sticky top-0 z-20 border-b border-[#122238] bg-[#071120]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1720px] items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-tr from-sky-600 to-emerald-500 text-lg font-bold text-white">Q</span>
            <span>
              <b className="block text-base tracking-tight text-white">Q-Scan</b>
              <small className="text-[12px] text-slate-400">Fundamental Stock Scanner</small>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 text-xs font-medium md:flex">
            <Link className="rounded-md px-3.5 py-1.5 text-slate-400 hover:bg-white/5 hover:text-white" href="/">Scanner</Link>
            <Link className="rounded-md px-3.5 py-1.5 text-slate-400 hover:bg-white/5 hover:text-white" href="/admin">Admin</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1720px] space-y-4 px-4 py-4">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-slate-400">
          <Link href="/" className="rounded px-1 py-0.5 hover:text-sky-300">Home</Link>
          {trail.length > 0 ? (
            trail.map((crumb, index) => {
              const isLast = index === trail.length - 1
              const href = categoryHref(segments.slice(0, index + 1))
              return (
                <span key={`${crumb.level}-${index}`} className="flex items-center gap-1">
                  <span aria-hidden="true" className="text-slate-600">›</span>
                  {isLast ? (
                    <span className="rounded px-1 py-0.5 font-semibold text-slate-200">{crumb.name ?? segments[index]}</span>
                  ) : (
                    <Link href={href} className="rounded px-1 py-0.5 hover:text-sky-300" title={LEVEL_LABEL[crumb.level]}>
                      {crumb.name ?? segments[index]}
                    </Link>
                  )}
                </span>
              )
            })
          ) : (
            segments.map((segment, index) => (
              <span key={segment} className="flex items-center gap-1">
                <span aria-hidden="true" className="text-slate-600">›</span>
                {index === segments.length - 1 ? (
                  <span className="rounded px-1 py-0.5 font-semibold text-slate-200">{segment}</span>
                ) : (
                  <Link href={categoryHref(segments.slice(0, index + 1))} className="rounded px-1 py-0.5 hover:text-sky-300">
                    {segment}
                  </Link>
                )}
              </span>
            ))
          )}
        </nav>

        <section className="grid items-end gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-sky-400">{LEVEL_LABEL[level]}</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">{heading}</h1>
            <p className="mt-1 text-xs text-slate-400">
              {imported
                ? `${imported.uniqueCompanies} companies imported from screener.in${imported.totalResults != null ? ` (source reports ${imported.totalResults})` : ''}.`
                : 'Companies saved in Q-Scan whose screener.in classification matches this category.'}{' '}
              <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
                View source on screener.in
              </a>
            </p>
            {imported && (
              <p className="mt-1 text-[13px] text-slate-500">
                Last import: {imported.status} · {imported.pagesFetched} page(s)
                {imported.pagesFailed > 0 ? ` · ${imported.pagesFailed} failed` : ''}
                {imported.finishedAt ? ` · ${new Date(imported.finishedAt).toLocaleString('en-IN')}` : ''}
              </p>
            )}
          </div>
          <div className="flex flex-col items-stretch gap-3 lg:col-span-4 lg:items-end">
            <ImportCategoryButton segments={segments} />
            <div className="grid w-full grid-cols-2 gap-3">
              <div className="rounded-xl border border-[#152742] bg-[#091527] p-3">
                <p className="text-[13px] text-slate-500">Companies</p>
                <p className="mt-2 text-base font-bold text-white">{rows.length}</p>
              </div>
              <div className="rounded-xl border border-[#152742] bg-[#091527] p-3">
                <p className="text-[13px] text-slate-500">Category path</p>
                <p className="mt-2 truncate font-mono text-xs text-slate-300">{sourceUrl}</p>
              </div>
            </div>
          </div>
        </section>

        {rows.length > 0 ? (
          <CategoryTable rows={rows} />
        ) : (
          <section className="rounded-xl border border-[#152742] bg-[#091527] p-8 text-center">
            <h2 className="text-sm font-semibold text-white">No saved companies in this category yet</h2>
            <p className="mx-auto mt-2 max-w-lg text-xs text-slate-400">
              This is a valid screener.in category, but none of the companies imported into Q-Scan are classified here.
              Open a company page to import it, then its classification will appear on this page.
            </p>
            <Link href="/" className="mt-4 inline-block rounded-md border border-sky-500/50 bg-[#0b294e] px-4 py-1.5 text-xs font-semibold text-sky-300 hover:bg-[#0e3560]">
              Go to the scanner
            </Link>
          </section>
        )}
      </div>
    </main>
  )
}
