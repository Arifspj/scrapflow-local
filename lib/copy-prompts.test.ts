import { describe, expect, it } from 'vitest'
import {
  appendPromptToMarkdown,
  BUILTIN_COPY_PROMPT_KEY,
  CANONICAL_COPY_PROMPTS,
  COPY_PROMPT_LIMITS,
  slugifyTitle,
  validateCopyPromptInput,
} from './copy-prompts'

describe('CANONICAL_COPY_PROMPTS', () => {
  it('seeds five prompts with the built-in Normal Data first', () => {
    expect(CANONICAL_COPY_PROMPTS).toHaveLength(5)
    expect(CANONICAL_COPY_PROMPTS[0]).toMatchObject({
      key: BUILTIN_COPY_PROMPT_KEY,
      title: 'Normal Data',
      builtin: true,
      instruction: '',
      sortOrder: 0,
    })
  })

  it('has unique keys and ascending sort order', () => {
    const keys = CANONICAL_COPY_PROMPTS.map((prompt) => prompt.key)
    expect(new Set(keys).size).toBe(keys.length)
    const orders = CANONICAL_COPY_PROMPTS.map((prompt) => prompt.sortOrder)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it('keeps only Normal Data as data-only', () => {
    for (const prompt of CANONICAL_COPY_PROMPTS.slice(1)) {
      expect(prompt.instruction.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('slugifyTitle', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyTitle('Multibagger Research')).toBe('multibagger-research')
    expect(slugifyTitle('Flash Crash   Detector!')).toBe('flash-crash-detector')
  })

  it('strips leading/trailing separators and returns empty for garbage', () => {
    expect(slugifyTitle('--- Intrinsic Value ---')).toBe('intrinsic-value')
    expect(slugifyTitle('ア ag')).toBe('ag')
    expect(slugifyTitle('???')).toBe('')
  })
})

describe('validateCopyPromptInput', () => {
  it('requires a title and instruction for creation', () => {
    expect(validateCopyPromptInput({}).ok).toBe(false)
    expect(validateCopyPromptInput({ title: 'Only a title' }).ok).toBe(false)
  })

  it('accepts a valid create payload and normalises fields', () => {
    const result = validateCopyPromptInput({ title: '  Multibagger Research  ', description: '  long-term  ', instruction: 'Analyse this data.', enabled: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.title).toBe('Multibagger Research')
    expect(result.value.description).toBe('long-term')
    expect(result.value.instruction).toBe('Analyse this data.')
    expect(result.value.enabled).toBe(true)
  })

  it('turns an empty description into null', () => {
    const result = validateCopyPromptInput({ title: 'T', instruction: 'X', description: '   ' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.description).toBeNull()
  })

  it('enforces length limits', () => {
    expect(validateCopyPromptInput({ title: 'x'.repeat(COPY_PROMPT_LIMITS.title + 1), instruction: 'X' }).ok).toBe(false)
    expect(validateCopyPromptInput({ title: 'T', instruction: 'x'.repeat(COPY_PROMPT_LIMITS.instruction + 1) }).ok).toBe(false)
    expect(validateCopyPromptInput({ title: 'T', instruction: 'X', description: 'x'.repeat(COPY_PROMPT_LIMITS.description + 1) }).ok).toBe(false)
  })

  it('rejects non-string / wrong-type fields', () => {
    expect(validateCopyPromptInput({ title: 'T', instruction: 5 }).ok).toBe(false)
    expect(validateCopyPromptInput({ title: 9, instruction: 'X' }).ok).toBe(false)
    expect(validateCopyPromptInput({ title: 'T', instruction: 'X', enabled: 'yes' }).ok).toBe(false)
  })

  it('supports partial updates and rejects empty ones', () => {
    expect(validateCopyPromptInput({}, { partial: true }).ok).toBe(false)
    const result = validateCopyPromptInput({ enabled: false }, { partial: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.enabled).toBe(false)
    expect(result.value.title).toBeUndefined()
  })
})

describe('appendPromptToMarkdown', () => {
  const base = '# Data\n\nrow'

  it('returns the markdown unchanged for a data-only prompt', () => {
    expect(appendPromptToMarkdown(base, { title: 'Normal Data', instruction: '  ' })).toBe(base)
  })

  it('appends a heading and the instruction for research prompts', () => {
    const out = appendPromptToMarkdown(base, { title: 'Multibagger Research', instruction: '  Run the analysis.  ' })
    expect(out).toContain(`${base}\n\n---\n\n## AI Analysis Prompt — Multibagger Research\n\nRun the analysis.\n`)
  })

  it('falls back to a generic heading when the title is blank', () => {
    const out = appendPromptToMarkdown(base, { title: '   ', instruction: 'Go.' })
    expect(out).toContain('## AI Analysis Prompt — AI Analysis Prompt')
  })
})