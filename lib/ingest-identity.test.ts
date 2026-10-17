import { beforeEach, describe, expect, it, vi } from 'vitest'

// The ingest module pulls in the Prisma client and Next.js cache helpers at
// import time; neither is exercised by `resolveNumericMembers`, so stub them.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/scrapers/resolve', () => ({ resolveSymbolFromName: vi.fn() }))

import { resolveNumericMembers } from '@/lib/ingest'
import { resolveSymbolFromName } from '@/lib/scrapers/resolve'

const mockedResolve = vi.mocked(resolveSymbolFromName)

beforeEach(() => {
  mockedResolve.mockReset()
})

describe('resolveNumericMembers', () => {
  it('replaces a numeric source code with a resolved non-numeric ticker', async () => {
    mockedResolve.mockResolvedValueOnce('PARMESHWAR')
    const warnings: string[] = []

    const result = await resolveNumericMembers(
      [{ symbol: '544330', companyName: 'Parmeshwar Metal Ltd.' }],
      warnings,
      50,
    )

    expect(result).toEqual([{ symbol: 'PARMESHWAR', companyName: 'Parmeshwar Metal Ltd.' }])
    expect(warnings).toEqual([])
  })

  it('keeps the numeric code and warns when no listed ticker can be established', async () => {
    mockedResolve.mockResolvedValueOnce(null)
    const warnings: string[] = []

    const result = await resolveNumericMembers(
      [{ symbol: '544330', companyName: 'Parmeshwar Metal Ltd.' }],
      warnings,
      50,
    )

    expect(result).toEqual([{ symbol: '544330', companyName: 'Parmeshwar Metal Ltd.' }])
    expect(warnings.join(' ')).toMatch(/numeric source code/i)
  })

  it('passes an already-resolved ticker through untouched and never resolves it', async () => {
    const warnings: string[] = []

    const result = await resolveNumericMembers(
      [{ symbol: 'RELIANCE', companyName: 'Reliance Industries Ltd' }],
      warnings,
      50,
    )

    expect(result).toEqual([{ symbol: 'RELIANCE', companyName: 'Reliance Industries Ltd' }])
    expect(mockedResolve).not.toHaveBeenCalled()
  })

  it('keeps the numeric code when there is no company name to resolve', async () => {
    const warnings: string[] = []

    const result = await resolveNumericMembers([{ symbol: '544330', companyName: null }], warnings, 50)

    expect(result[0].symbol).toBe('544330')
    expect(mockedResolve).not.toHaveBeenCalled()
  })

  it('bounds lookups by maxLookups and leaves later codes untouched', async () => {
    mockedResolve.mockResolvedValue('AAA')
    const warnings: string[] = []

    const result = await resolveNumericMembers(
      [
        { symbol: '111111', companyName: 'First Ltd' },
        { symbol: '222222', companyName: 'Second Ltd' },
        { symbol: '333333', companyName: 'Third Ltd' },
      ],
      warnings,
      1,
    )

    expect(result.map((item) => item.symbol)).toEqual(['AAA', '222222', '333333'])
    expect(mockedResolve).toHaveBeenCalledTimes(1)
  })
})
