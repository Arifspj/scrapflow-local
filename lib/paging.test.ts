import { describe, expect, it } from 'vitest'
import { clampPage, pageCount, pageNumbers, pageSlice } from './paging'

describe('pageCount', () => {
  it('never returns less than one page', () => {
    expect(pageCount(0, 100)).toBe(1)
    expect(pageCount(1, 100)).toBe(1)
    expect(pageCount(100, 100)).toBe(1)
  })

  it('rounds partial pages up', () => {
    expect(pageCount(101, 100)).toBe(2)
    expect(pageCount(1150, 100)).toBe(12)
    expect(pageCount(1150, 50)).toBe(23)
  })

  it('is defensive about a bad page size', () => {
    expect(pageCount(500, 0)).toBe(1)
    expect(pageCount(500, Number.NaN)).toBe(1)
  })
})

describe('clampPage', () => {
  it('keeps a valid page', () => {
    expect(clampPage(5, 1150, 100)).toBe(5)
  })

  it('clamps out-of-range pages into the valid set', () => {
    expect(clampPage(0, 1150, 100)).toBe(1)
    expect(clampPage(-3, 1150, 100)).toBe(1)
    expect(clampPage(999, 1150, 100)).toBe(12)
  })

  it('treats a non-finite page as the first page', () => {
    expect(clampPage(Number.NaN, 1150, 100)).toBe(1)
  })
})

describe('pageSlice', () => {
  const rows = Array.from({ length: 1150 }, (_, index) => index + 1)

  it('returns the first page with its zero-based start', () => {
    const { start, rows: page } = pageSlice(rows, 1, 100)
    expect(start).toBe(0)
    expect(page).toHaveLength(100)
    expect(page[0]).toBe(1)
    expect(page.at(-1)).toBe(100)
  })

  it('returns the last, partial page', () => {
    const { start, rows: page } = pageSlice(rows, 12, 100)
    expect(start).toBe(1100)
    expect(page).toHaveLength(50)
    expect(page.at(-1)).toBe(1150)
  })

  it('clamps an over-range page to the last page instead of returning nothing', () => {
    const { start, rows: page } = pageSlice(rows, 99, 100)
    expect(start).toBe(1100)
    expect(page.at(-1)).toBe(1150)
  })

  it('produces distinct, non-overlapping pages', () => {
    const first = pageSlice(rows, 1, 100).rows
    const second = pageSlice(rows, 2, 100).rows
    expect(first.at(-1)).toBe(100)
    expect(second[0]).toBe(101)
    expect(new Set([...first, ...second]).size).toBe(200)
  })
})

describe('pageNumbers', () => {
  it('lists every page when there are few', () => {
    expect(pageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(pageNumbers(3, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('windows a large result set with gaps, keeping first/last/current', () => {
    const items = pageNumbers(6, 12)
    expect(items).toContain(1)
    expect(items).toContain(12)
    expect(items).toContain(6)
    expect(items).toContain('…')
  })
})
