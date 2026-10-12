import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { ScrapedCompany } from '@/lib/scrapers/resolve'

export type StockSearchHit = {
  symbol: string
  companyName: string | null
}

function toDecimal(value: number | undefined): Prisma.Decimal | null {
  return value == null || !Number.isFinite(value) ? null : new Prisma.Decimal(value)
}

/** Look up saved stocks by exact symbol or company-name substring. */
export async function findStocksByQuery(query: string, limit = 10): Promise<StockSearchHit[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  return prisma.stock.findMany({
    where: {
      OR: [
        { symbol: trimmed.toUpperCase() },
        { companyName: { contains: trimmed, mode: 'insensitive' } },
      ],
    },
    select: { symbol: true, companyName: true },
    orderBy: { symbol: 'asc' },
    take: limit,
  })
}

/**
 * Persist a scraped screener company: upsert the Stock and replace its latest
 * fundamental snapshot with the freshly scraped values.
 */
export async function upsertStockFromScrape(company: ScrapedCompany): Promise<StockSearchHit> {
  const stock = await prisma.stock.upsert({
    where: { symbol: company.symbol },
    create: { symbol: company.symbol, companyName: company.companyName },
    update: company.companyName ? { companyName: company.companyName } : {},
    select: { id: true, symbol: true, companyName: true },
  })

  const f = company.fundamentals ?? {}
  await prisma.stockFundamentalSnapshot.deleteMany({ where: { stockId: stock.id } })
  await prisma.stockFundamentalSnapshot.create({
    data: {
      stockId: stock.id,
      marketCap: toDecimal(f.marketCap),
      peRatio: toDecimal(f.peRatio),
      bookValue: toDecimal(f.bookValue),
      dividendYield: toDecimal(f.dividendYield),
      roce: toDecimal(f.roce),
      roe: toDecimal(f.roe),
      debtToEquity: toDecimal(f.debtToEquity),
      revenue: toDecimal(f.revenue),
      netProfit: toDecimal(f.netProfit),
      rawData: Object.keys(f).length ? (f as Prisma.InputJsonValue) : undefined,
      sourceUrl: company.sourceUrl,
      parserVersion: company.parserVersion,
    },
  })

  return { symbol: stock.symbol, companyName: stock.companyName }
}
