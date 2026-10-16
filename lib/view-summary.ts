import { ownershipTrend, type OwnershipTrend } from './ownership'
import { assessTurnaround, type TurnaroundAssessment } from './turnaround'
import { multibaggerDetailInputs, type MultibaggerDetailInputs } from './multibagger'
import { buildStockView, type StockView } from './stock-detail'

type SnapshotInput = NonNullable<Parameters<typeof buildStockView>[1]>

export type StockRef = { symbol: string; companyName: string | null }

/** JSON-serialisable list view stored on the snapshot so readers can skip rawData. */
export type ViewSummary = {
  view: Omit<StockView, 'detail' | 'capturedAt'> & { capturedAt: string | null }
  ownership: OwnershipTrend | null
  turnaround: TurnaroundAssessment | null
  multibagger: MultibaggerDetailInputs
}

export type ListStockView = {
  view: StockView
  ownership: OwnershipTrend | null
  turnaround: TurnaroundAssessment | null
  multibaggerInputs: MultibaggerDetailInputs
}

export function buildListStockView(stock: StockRef, latest: SnapshotInput | null | undefined): ListStockView {
  const view = buildStockView(stock, latest)
  return {
    view,
    ownership: ownershipTrend(view.detail?.shareholding),
    turnaround: assessTurnaround(view.detail),
    multibaggerInputs: multibaggerDetailInputs(view),
  }
}

export function summarizeListStockView(list: ListStockView): ViewSummary {
  const { detail, ...rest } = list.view
  return {
    view: { ...rest, capturedAt: list.view.capturedAt ? list.view.capturedAt.toISOString() : null },
    ownership: list.ownership,
    turnaround: list.turnaround,
    multibagger: list.multibaggerInputs,
  }
}

export function buildViewSummary(stock: StockRef, latest: SnapshotInput | null | undefined): ViewSummary {
  return summarizeListStockView(buildListStockView(stock, latest))
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readViewSummary(value: unknown): ListStockView | null {
  if (!isObject(value)) return null
  const view = value.view
  if (!isObject(view)) return null
  if (typeof view.symbol !== 'string') return null
  if (!('capturedAt' in view)) return null
  if (!isObject(value.multibagger)) return null
  if (!('debtChangePct' in value.multibagger)) return null
  if (!('industry' in view) || !Array.isArray(view.industry)) return null

  const { capturedAt, ...rest } = view

  return {
    view: {
      ...(rest as unknown as Omit<StockView, 'detail' | 'capturedAt'>),
      detail: null,
      capturedAt: typeof capturedAt === 'string' ? new Date(capturedAt) : null,
    },
    ownership: isObject(value.ownership) ? (value.ownership as OwnershipTrend) : null,
    turnaround: isObject(value.turnaround) ? (value.turnaround as TurnaroundAssessment) : null,
    multibaggerInputs: value.multibagger as MultibaggerDetailInputs,
  }
}
