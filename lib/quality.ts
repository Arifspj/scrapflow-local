/**
 * Deterministic stock-quality rule engine used for the badge row on the
 * company-detail page.
 *
 * Positive classifications (MULTIBAGGER / STRONG COMPOUNDER / VALUE PICK) are
 * strict rule sets; risk warnings (CASH TRAP / HIGH LEVERAGE / OVERPRICED /
 * SLOWING) are computed independently and always displayed alongside the
 * primary badge so a promising story can never hide a real red flag.
 * Missing criteria are never treated as passing.
 */

export type QualityLevel = 'multibagger' | 'strong-compounder' | 'value-pick' | 'watch' | 'insufficient'

export type RiskKind = 'cash-trap' | 'high-leverage' | 'overpriced' | 'slowing'

export type PrimaryBadge = {
  level: QualityLevel
  label: string
  tone: 'good' | 'neutral'
  criteriaPassed: string[]
  criteriaMissing: string[]
}

export type RiskBadge = {
  kind: RiskKind
  label: string
  reasons: string[]
}

export type QualityResult = {
  primary: PrimaryBadge
  risks: RiskBadge[]
}

export type QualityInput = {
  roce: number | null
  roe: number | null
  salesYoy: number | null
  profitYoy: number | null
  cfoPat: number | null
  debtToEquity: number | null
  debtToAssets: number | null
  piotroski: number | null
  pe: number | null
  netProfit: number | null
  /** Premium % above fair value; null when the price is at/below fair value. */
  overvaluation: number | null
  /** True when the fair value is below ₹1 (equity wiped out by debt). */
  noEquity: boolean
  upside: number | null
  intrinsic: number | null
  qoqSalesPct: number | null
  qoqProfitPct: number | null
}

/** Documented thresholds; the reference numbers from the Q-Scan spec. */
export const QUALITY_THRESHOLDS = {
  multibagger: { roce: 25, roe: 20, salesYoy: 30, cfoPat: 0.6, debtToAssets: 0.2, piotroski: 7 },
  compounder: { roce: 20, roe: 18, profitYoy: 15, cfoPat: 0.5, debtToAssets: 0.3, piotroski: 6 },
  value: { pe: 15, roce: 15, debtToEquity: 1.0, debtToAssets: 0.35 },
  highLeverage: 0.7,
  overpricedPremiumPct: 30,
} as const

type Check = { criteria: string; pass: boolean }

function check(label: string, value: number | null, threshold: number | null, direction: 'ge' | 'le'): Check {
  if (value == null || threshold == null) return { criteria: label, pass: false }
  const passes = direction === 'ge' ? value >= threshold : value <= threshold
  return { criteria: label, pass: passes }
}

function criteriaPassed(checks: Check[]): { passed: string[]; missing: string[] } {
  return {
    passed: checks.filter((check) => check.pass).map((check) => check.criteria),
    missing: checks.filter((check) => !check.pass).map((check) => check.criteria),
  }
}

function multibaggerChecks(input: QualityInput): Check[] {
  const t = QUALITY_THRESHOLDS.multibagger
  return [
    check('ROCE ≥ 25%', input.roce, t.roce, 'ge'),
    check('ROE ≥ 20%', input.roe, t.roe, 'ge'),
    check('Sales YoY ≥ 30%', input.salesYoy, t.salesYoy, 'ge'),
    check('CFO/PAT ≥ 0.6', input.cfoPat, t.cfoPat, 'ge'),
    check('Debt/Assets ≤ 0.20', input.debtToAssets, t.debtToAssets, 'le'),
    check('Piotroski ≥ 7', input.piotroski, t.piotroski, 'ge'),
  ]
}

function compounderChecks(input: QualityInput): Check[] {
  const t = QUALITY_THRESHOLDS.compounder
  return [
    check('ROCE ≥ 20%', input.roce, t.roce, 'ge'),
    check('ROE ≥ 18%', input.roe, t.roe, 'ge'),
    check('Profit YoY ≥ 15%', input.profitYoy, t.profitYoy, 'ge'),
    check('CFO/PAT ≥ 0.5', input.cfoPat, t.cfoPat, 'ge'),
    check('Debt/Assets ≤ 0.30', input.debtToAssets, t.debtToAssets, 'le'),
    check('Piotroski ≥ 6', input.piotroski, t.piotroski, 'ge'),
  ]
}

/** VALUE PICK requires every applicable criterion to pass AND be evaluable. */
function valuePickChecks(input: QualityInput): { checks: Check[]; applicable: boolean } {
  const t = QUALITY_THRESHOLDS.value
  const debtChecks: Check[] = []
  if (input.debtToAssets != null) debtChecks.push(check('Debt/Assets ≤ 0.35', input.debtToAssets, t.debtToAssets, 'le'))
  if (input.debtToEquity != null) debtChecks.push(check('Debt/Equity ≤ 1.0', input.debtToEquity, t.debtToEquity, 'le'))
  if (debtChecks.length === 0) return { checks: [], applicable: false } // debt cannot be evaluated

  const checks: Check[] = [
    check('P/E < 15', input.pe, t.pe, 'le'),
    check('ROCE ≥ 15%', input.roce, t.roce, 'ge'),
    ...debtChecks,
    check('Sales YoY > 0%', input.salesYoy, 0, 'ge'),
    check('Profit YoY > 0%', input.profitYoy, 0, 'ge'),
  ]
  return { checks, applicable: true }
}

export function computeQuality(input: QualityInput): QualityResult {
  const risks: RiskBadge[] = []

  if (input.debtToAssets != null && input.debtToAssets >= QUALITY_THRESHOLDS.highLeverage) {
    risks.push({
      kind: 'high-leverage',
      label: 'HIGH LEVERAGE',
      reasons: [`Debt/Assets = ${(input.debtToAssets * 100).toFixed(0)}% (≥ 70%)`],
    })
  }

  if (input.noEquity) {
    risks.push({
      kind: 'overpriced',
      label: 'OVERPRICED',
      reasons: ['Fair value is below ₹1 — debt wipes out the equity value'],
    })
  } else if (input.overvaluation != null && input.overvaluation > QUALITY_THRESHOLDS.overpricedPremiumPct) {
    risks.push({
      kind: 'overpriced',
      label: 'OVERPRICED',
      reasons: [`Price is ${input.overvaluation.toFixed(0)}% above the calculated fair value`],
    })
  }

  if (input.netProfit != null && input.netProfit > 0 && input.profitYoy != null && input.profitYoy > 0 && input.cfoPat != null && input.cfoPat < 0) {
    risks.push({
      kind: 'cash-trap',
      label: 'CASH TRAP',
      reasons: [`Profit rising (YoY ${input.profitYoy.toFixed(1)}%) but CFO/PAT = ${input.cfoPat.toFixed(2)} is negative`, 'PAT is positive, so the negative conversion ratio is a genuine concern'],
    })
  }

  if (input.qoqSalesPct != null && input.qoqProfitPct != null && input.qoqSalesPct < 0 && input.qoqProfitPct < 0) {
    risks.push({
      kind: 'slowing',
      label: 'SLOWING',
      reasons: [`QoQ Sales ${input.qoqSalesPct.toFixed(1)}% and QoQ Profit ${input.qoqProfitPct.toFixed(1)}% are both negative`],
    })
  }

  const mb = multibaggerChecks(input)
  const mbAll = mb.every((check) => check.pass)
  const compounder = compounderChecks(input)
  const compounderAll = compounder.every((check) => check.pass)
  const value = valuePickChecks(input)
  const valueAll = value.applicable && value.checks.length > 0 && value.checks.every((check) => check.pass)

  // MULTIBAGGER only fires when every criterion passes AND no risk flag is
  // triggered (explicitly disqualifying per the rule specification).
  if (mbAll && risks.length === 0) {
    return { primary: { level: 'multibagger', label: 'MULTIBAGGER', tone: 'good', criteriaPassed: mb.map((c) => c.criteria), criteriaMissing: [] }, risks }
  }
  if (compounderAll) {
    return {
      primary: {
        level: 'strong-compounder',
        label: 'STRONG COMPOUNDER',
        tone: 'good',
        criteriaPassed: compounder.map((c) => c.criteria),
        criteriaMissing: compounder.filter((c) => !c.pass).map((c) => c.criteria),
      },
      risks,
    }
  }
  if (valueAll) {
    return {
      primary: {
        level: 'value-pick',
        label: 'VALUE PICK',
        tone: 'good',
        criteriaPassed: value.checks.filter((c) => c.pass).map((c) => c.criteria),
        criteriaMissing: value.checks.filter((c) => !c.pass).map((c) => c.criteria),
      },
      risks,
    }
  }

  const anythingEvaluated = [
    input.roce,
    input.roe,
    input.salesYoy,
    input.profitYoy,
    input.cfoPat,
    input.debtToAssets,
    input.debtToEquity,
    input.pe,
    input.piotroski,
  ].some((value) => value != null)

  if (!anythingEvaluated && risks.length === 0) {
    return {
      primary: { level: 'insufficient', label: 'INSUFFICIENT DATA', tone: 'neutral', criteriaPassed: [], criteriaMissing: ['No core financial metrics are available yet'] },
      risks,
    }
  }

  const missing = [...mb.filter((c) => !c.pass).map((c) => c.criteria)]
  return {
    primary: {
      level: 'watch',
      label: 'WATCH',
      tone: 'neutral',
      criteriaPassed: [],
      criteriaMissing: missing,
    },
    risks,
  }
}