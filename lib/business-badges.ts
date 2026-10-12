/**
 * Business-quality badges shown alongside the WATCH/quality status chip.
 *
 * These are the descriptive, rule-based labels the detail page has always
 * surfaced (Undervalued, Good ROCE, Low Debt, Sales Momentum, ...) plus the
 * named classifications requested for the header row (COMPOUNDER, EARNING
 * ACCELERATION, ROCE STAR, QUALITY BUSINESS, LOW P/E, UNDERVALUED).
 *
 * The rules are deterministic and documented here; the primary quality badge
 * (WATCH / MULTIBAGGER / STRONG COMPOUNDER / VALUE PICK) and the risk flags live
 * in lib/quality.ts and are intentionally kept separate. Missing data never
 * earns a positive badge.
 */

export type BusinessBadgeTone = 'good' | 'warn' | 'info' | 'neutral'

export type BusinessBadge = {
  label: string
  tone: BusinessBadgeTone
  /** Short, human-readable basis for the badge (used as a tooltip). */
  reason: string
}

export type BusinessBadgeInput = {
  upside: number | null
  pe: number | null
  roce: number | null
  roe: number | null
  salesYoy: number | null
  profitYoy: number | null
  qoqProfitPct: number | null
  debtToEquity: number | null
  /** Piotroski F-Score (partial scores allowed). */
  piotroski: number | null
}

/** Thresholds, kept in one place so the rules stay auditable. */
export const BUSINESS_BADGE_RULES = {
  undervaluedUpside: 15,
  lowPe: 15,
  highPe: 40,
  roceStar: 25,
  highRoce: 15,
  lowRoce: 8,
  qualityBusiness: { roce: 20, roe: 18, maxDebtEquity: 1.0 },
  compounder: { salesYoy: 15, profitYoy: 15, roce: 15, maxDebtEquity: 1.5 },
  earningAcceleration: { profitYoy: 20 },
  lowDebt: 0.5,
  highDebt: 2,
  salesMomentum: 15,
} as const

function pct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

export function buildBusinessBadges(input: BusinessBadgeInput): BusinessBadge[] {
  const { upside, pe, roce, roe, salesYoy, profitYoy, qoqProfitPct, debtToEquity } = input
  const r = BUSINESS_BADGE_RULES
  const badges: BusinessBadge[] = []
  const add = (label: string, tone: BusinessBadgeTone, reason: string) => badges.push({ label, tone, reason })

  // Valuation
  if (upside != null) {
    if (upside >= r.undervaluedUpside) add('UNDERVALUED', 'good', `Trading ${pct(upside)} below calculated intrinsic value.`)
    else if (upside <= -r.undervaluedUpside) add('OVERVALUED', 'warn', `Trading ${pct(-upside)} above calculated intrinsic value.`)
    else add('FAIR VALUE', 'info', 'Price is close to the calculated intrinsic value.')
  }

  // Profitability
  if (roce != null) {
    if (roce >= r.roceStar) add('ROCE STAR', 'good', `ROCE ${roce.toFixed(1)}% (≥ ${r.roceStar}%).`)
    else if (roce >= r.highRoce) add('HIGH ROCE', 'info', `ROCE ${roce.toFixed(1)}% (≥ ${r.highRoce}%).`)
    else if (roce < r.lowRoce) add('LOW ROCE', 'warn', `ROCE ${roce.toFixed(1)}% (< ${r.lowRoce}%).`)
  }

  // Quality business: high returns on both capital and equity, low leverage.
  if (roce != null && roe != null && roce >= r.qualityBusiness.roce && roe >= r.qualityBusiness.roe && (debtToEquity == null || debtToEquity <= r.qualityBusiness.maxDebtEquity)) {
    add('QUALITY BUSINESS', 'good', `ROCE ${roce.toFixed(1)}% ≥ ${r.qualityBusiness.roce}% and ROE ${roe.toFixed(1)}% ≥ ${r.qualityBusiness.roe}% with debt/equity ≤ ${r.qualityBusiness.maxDebtEquity}.`)
  }

  // Growth
  const accelerating = profitYoy != null && profitYoy >= r.earningAcceleration.profitYoy && qoqProfitPct != null && qoqProfitPct > 0
  if (accelerating) add('EARNING ACCELERATION', 'good', `Profit YoY ${pct(profitYoy!)} with positive latest-quarter profit growth.`)
  if (profitYoy != null && profitYoy > 15 && !accelerating) add('GOOD GROWTH', 'good', `Profit YoY ${pct(profitYoy)}.`)
  else if (profitYoy != null && profitYoy < 0) add('PROFIT DECLINING', 'warn', `Profit YoY ${pct(profitYoy)}.`)
  if (salesYoy != null && salesYoy > r.salesMomentum) add('SALES MOMENTUM', 'info', `Sales YoY ${pct(salesYoy)}.`)

  // Compounder: durable growth at a good return on capital.
  if (salesYoy != null && profitYoy != null && roce != null && salesYoy >= r.compounder.salesYoy && profitYoy >= r.compounder.profitYoy && roce >= r.compounder.roce && (debtToEquity == null || debtToEquity <= r.compounder.maxDebtEquity)) {
    add('COMPOUNDER', 'good', `Sales ${pct(salesYoy)} and profit ${pct(profitYoy)} growth with ROCE ≥ ${r.compounder.roce}%.`)
  }

  // Balance sheet
  if (debtToEquity != null) {
    if (debtToEquity <= r.lowDebt) add('LOW DEBT', 'good', `Debt/Equity ${debtToEquity.toFixed(2)} (≤ ${r.lowDebt}).`)
    else if (debtToEquity >= r.highDebt) add('HIGH DEBT', 'warn', `Debt/Equity ${debtToEquity.toFixed(2)} (≥ ${r.highDebt}).`)
  }

  // Valuation ratio
  if (pe != null && pe > 0) {
    if (pe <= r.lowPe) add('LOW P/E', 'good', `P/E ${pe.toFixed(1)} (≤ ${r.lowPe}).`)
    else if (pe >= r.highPe) add('HIGH P/E', 'warn', `P/E ${pe.toFixed(1)} (≥ ${r.highPe}).`)
  }

  // De-duplicate by label, preserving the order above.
  const seen = new Set<string>()
  return badges.filter((badge) => {
    if (seen.has(badge.label)) return false
    seen.add(badge.label)
    return true
  })
}
