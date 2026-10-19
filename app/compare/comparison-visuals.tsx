'use client'

import { SpiderRadarChart, type RadarStock } from './spider-radar'
import { ValuationMatrixChart, type MatrixStock } from './valuation-matrix'

type ViewMode = 'table' | 'radar' | 'matrix'

type Props = {
  activeView: ViewMode
  stocks: (RadarStock & MatrixStock)[]
}

export function ComparisonVisualizations({ activeView, stocks }: Props) {
  if (activeView === 'radar') {
    return <SpiderRadarChart stocks={stocks} />
  }
  if (activeView === 'matrix') {
    return <ValuationMatrixChart stocks={stocks} />
  }
  return null
}
