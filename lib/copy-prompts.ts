/**
 * Copy-Data prompt templates: the canonical set, shared limits, input
 * validation and the markdown append helper. This module is intentionally
 * isomorphic (no Prisma / server-only imports) so the public `Copy Data`
 * dropdown can reuse `appendPromptToMarkdown` on the client while the admin
 * routes validate with the exact same rules on the server.
 */

/** Stable key of the built-in, data-only option that never appends a prompt. */
export const BUILTIN_COPY_PROMPT_KEY = 'normal-data'

export const COPY_PROMPT_LIMITS = {
  title: 80,
  description: 200,
  instruction: 8000,
} as const

/** Public, client-safe shape of a prompt template. */
export type CopyPromptTemplate = {
  id: string
  key: string
  title: string
  description: string | null
  instruction: string
  builtin: boolean
}

export type CopyPromptDef = {
  key: string
  title: string
  description: string
  instruction: string
  builtin: boolean
  sortOrder: number
}

const MULTIBAGGER_RESEARCH = `You are a fundamental equity analyst. Using ONLY the company data pasted above, evaluate whether this stock has multibagger potential over the next 3-5 years.

Cover:
1. Business quality and moat — what gives it durable pricing power?
2. Growth runway — sales/profit CAGR, order book, capacity expansion or new products.
3. Reinvestment engines — ROCE/ROE trend and whether returns are improving or fading.
4. Balance sheet — debt, cash conversion (CFO/PAT) and dilution risk.
5. Valuation vs growth — is the current P/E justified? Compare intrinsic value and margin of safety.
6. Key catalysts and risks over the next 2-3 years.

Rules: cite the exact figures from the data. If a metric is N/A or missing, say so explicitly and do not estimate. Finish with a 3-tier verdict (High / Medium / Low multibagger probability) and the single biggest risk to the thesis.`

const STOCK_STORY_TRIGGER = `Summarise the investment story of this company as a tight narrative for a busy investor.

Structure:
1. What the company does and how it makes money.
2. What has changed recently (latest quarter/annual results, margin or growth inflection).
3. The 2-3 concrete triggers/catalysts that could move the stock.
4. The bear case — what would break the story.
5. One-line thesis.

Use only the pasted data. Flag any missing figures as N/A instead of guessing.`

const INTRINSIC_VALUE_MOS = `Act as a conservative valuation analyst. Using only the pasted data, review the calculated intrinsic value.

1. Re-derive the Fair P/E from the growth used and sanity-check the capped growth.
2. Walk through the Graham number and growth fair value and their blend.
3. Explain the margin of safety and the over/under-valuation vs the current price.
4. Stress-test: what growth or margin assumption would make the current price fair?
5. State whether there is a genuine margin of safety, and how much.

Do not invent inputs; if book value, EPS or growth are N/A, say the valuation cannot be trusted and stop.`

const FORENSIC_RED_FLAGS = `Run a forensic / red-flag audit on this company using only the pasted data.

Check and report each:
1. Cash conversion: CFO/PAT, its trend, and any cash-trap signal.
2. Working capital: debtor days, inventory days, days payable and the CCC trend.
3. Debt: borrowings, D/E and interest-coverage direction.
4. Profit quality: other-income dependence vs operating profit.
5. Governance flags: pledging, promoter-holding changes and frequent equity dilution (from the shareholding data if present).
6. Any accounting-ratio deterioration.

For every flag, cite the exact number. If a check cannot be evaluated because the data is missing, mark it "not evaluable" — never assume it is clean.`

/** Canonical prompts seeded on first use (idempotent, never overwrites edits). */
export const CANONICAL_COPY_PROMPTS: CopyPromptDef[] = [
  {
    key: BUILTIN_COPY_PROMPT_KEY,
    title: 'Normal Data',
    description: 'Copy stock data only',
    instruction: '',
    builtin: true,
    sortOrder: 0,
  },
  {
    key: 'multibagger-research',
    title: 'Multibagger Research',
    description: 'Long-term growth potential and triggers',
    instruction: MULTIBAGGER_RESEARCH,
    builtin: false,
    sortOrder: 1,
  },
  {
    key: 'stock-story-trigger',
    title: 'Stock Story & Trigger',
    description: 'Major linkage, order and catalyst',
    instruction: STOCK_STORY_TRIGGER,
    builtin: false,
    sortOrder: 2,
  },
  {
    key: 'intrinsic-value-mos',
    title: 'Intrinsic Value & MOS',
    description: 'Valuation and margin of safety',
    instruction: INTRINSIC_VALUE_MOS,
    builtin: false,
    sortOrder: 3,
  },
  {
    key: 'forensic-red-flags',
    title: 'Forensic & Red Flags',
    description: 'Cash flow, debt and governance checks',
    instruction: FORENSIC_RED_FLAGS,
    builtin: false,
    sortOrder: 4,
  },
]

/** Lowercase, hyphenated token for a custom prompt key. */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export type CopyPromptFields = {
  title: string
  description: string | null
  instruction: string
  enabled: boolean
}

export type CopyPromptValidation =
  | { ok: true; value: Partial<CopyPromptFields> }
  | { ok: false; error: string }

/**
 * Validate and normalise admin-supplied prompt fields. `partial` allows PATCH
 * semantics (only the supplied keys are returned); otherwise a title and an
 * instruction field are required.
 */
export function validateCopyPromptInput(body: unknown, options: { partial?: boolean } = {}): CopyPromptValidation {
  if (!body || typeof body !== 'object') return { ok: false, error: 'A JSON body is required.' }
  const input = body as Record<string, unknown>
  const value: Partial<CopyPromptFields> = {}
  const partial = options.partial === true
  let touched = false

  if (input.title !== undefined) {
    if (typeof input.title !== 'string') return { ok: false, error: 'Title must be text.' }
    const title = input.title.trim()
    if (!title) return { ok: false, error: 'A title is required.' }
    if (title.length > COPY_PROMPT_LIMITS.title) return { ok: false, error: `Title must be ${COPY_PROMPT_LIMITS.title} characters or fewer.` }
    value.title = title
    touched = true
  } else if (!partial) {
    return { ok: false, error: 'A title is required.' }
  }

  if (input.description !== undefined) {
    if (input.description === null) {
      value.description = null
      touched = true
    } else if (typeof input.description === 'string') {
      const description = input.description.trim()
      if (description.length > COPY_PROMPT_LIMITS.description) {
        return { ok: false, error: `Description must be ${COPY_PROMPT_LIMITS.description} characters or fewer.` }
      }
      value.description = description || null
      touched = true
    } else {
      return { ok: false, error: 'Description must be text.' }
    }
  }

  if (input.instruction !== undefined) {
    if (typeof input.instruction !== 'string') return { ok: false, error: 'Instruction must be text.' }
    const instruction = input.instruction.trim()
    if (instruction.length > COPY_PROMPT_LIMITS.instruction) {
      return { ok: false, error: `Instruction must be ${COPY_PROMPT_LIMITS.instruction} characters or fewer.` }
    }
    value.instruction = instruction
    touched = true
  } else if (!partial) {
    return { ok: false, error: 'An instruction is required (use an empty instruction only for the built-in Normal Data option).' }
  }

  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') return { ok: false, error: 'Enabled must be true or false.' }
    value.enabled = input.enabled
    touched = true
  }

  if (partial && !touched) return { ok: false, error: 'Nothing to update.' }
  return { ok: true, value }
}

/**
 * Append the selected prompt's instruction under the pasted stock data so the
 * whole thing can be dropped into an AI chat in one paste. Returns the input
 * unchanged when the prompt has no instruction (the built-in Normal Data case).
 */
export function appendPromptToMarkdown(markdown: string, prompt: Pick<CopyPromptTemplate, 'title' | 'instruction'>): string {
  const instruction = prompt.instruction.trim()
  if (!instruction) return markdown
  const title = prompt.title.trim() || 'AI Analysis Prompt'
  return `${markdown}\n\n---\n\n## AI Analysis Prompt — ${title}\n\n${instruction}\n`
}
