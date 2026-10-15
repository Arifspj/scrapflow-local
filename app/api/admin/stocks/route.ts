import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

function num(value: unknown): number | null {
  return value == null ? null : Number(value)
}

/** Read-only view of the persisted Stock records for the admin "View Stocks" tab. */
export async function GET(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied

  try {
    const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
    const stocks = await prisma.stock.findMany({
      where: q
        ? { OR: [{ symbol: { contains: q.toUpperCase() } }, { companyName: { contains: q, mode: 'insensitive' } }] }
        : {},
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        fundamentals: { orderBy: { capturedAt: 'desc' }, take: 1 },
        scanners: { include: { scanner: { select: { name: true } } } },
      },
    })

    return NextResponse.json({
      ok: true,
      total: stocks.length,
      stocks: stocks.map((stock) => {
        const f = stock.fundamentals[0]
        return {
          symbol: stock.symbol,
          companyName: stock.companyName,
          marketCap: num(f?.marketCap),
          pe: num(f?.peRatio),
          roce: num(f?.roce),
          roe: num(f?.roe),
          capturedAt: f?.capturedAt ?? null,
          scanners: stock.scanners.map((membership) => membership.scanner.name),
        }
      }),
    })
  } catch (error) {
    console.error('[admin/stocks] failed', error)
    return NextResponse.json({ ok: false, error: 'Database unavailable.' }, { status: 503 })
  }
}
