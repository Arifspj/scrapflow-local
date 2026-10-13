import { prisma } from '@/lib/prisma'
import {
  CANONICAL_COPY_PROMPTS,
  slugifyTitle,
  type CopyPromptFields,
  type CopyPromptTemplate,
} from '@/lib/copy-prompts'

/**
 * Server-only store for admin-managed copy-data prompts. Seeding is idempotent
 * and never overwrites edits (mirrors `ensureCanonicalScanners`).
 */

let seededInProcess = false

export async function ensureCopyPrompts(): Promise<void> {
  if (seededInProcess) return
  for (const def of CANONICAL_COPY_PROMPTS) {
    const existing = await prisma.copyPrompt.findUnique({ where: { key: def.key }, select: { id: true } })
    if (existing) continue
    await prisma.copyPrompt.create({ data: def })
  }
  seededInProcess = true
}

type CopyPromptRow = {
  id: string
  key: string
  title: string
  description: string | null
  instruction: string
  builtin: boolean
}

/** Admin view of a prompt: the public template plus its workflow fields. */
export type AdminCopyPrompt = CopyPromptTemplate & { enabled: boolean; sortOrder: number }

function toTemplate(row: CopyPromptRow): CopyPromptTemplate {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    description: row.description,
    instruction: row.instruction,
    builtin: row.builtin,
  }
}

const promptSelect = {
  id: true,
  key: true,
  title: true,
  description: true,
  instruction: true,
  builtin: true,
} as const

/** Enabled prompts in admin-defined order — everything the public dropdown needs. */
export async function listPublicCopyPrompts(): Promise<CopyPromptTemplate[]> {
  await ensureCopyPrompts()
  const rows = await prisma.copyPrompt.findMany({
    where: { enabled: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: promptSelect,
  })
  return rows.map(toTemplate)
}

/** Every prompt (including disabled) for the admin table. */
export async function listAllCopyPrompts(): Promise<AdminCopyPrompt[]> {
  await ensureCopyPrompts()
  const rows = await prisma.copyPrompt.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { ...promptSelect, enabled: true, sortOrder: true },
  })
  return rows.map((row) => ({ ...toTemplate(row), enabled: row.enabled, sortOrder: row.sortOrder }))
}

async function uniqueKey(title: string): Promise<string> {
  const base = `custom-${slugifyTitle(title) || 'prompt'}`
  let key = base
  let counter = 1
  while (await prisma.copyPrompt.findUnique({ where: { key }, select: { id: true } })) {
    counter += 1
    key = `${base}-${counter}`
  }
  return key
}

/** Create a custom prompt, appended to the end of the order. */
export async function createCopyPrompt(fields: CopyPromptFields): Promise<CopyPromptTemplate> {
  const last = await prisma.copyPrompt.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } })
  const row = await prisma.copyPrompt.create({
    data: {
      key: await uniqueKey(fields.title),
      title: fields.title,
      description: fields.description,
      instruction: fields.instruction,
      enabled: fields.enabled,
      builtin: false,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    select: promptSelect,
  })
  return toTemplate(row)
}

export type UpdateCopyPromptResult =
  | { ok: true; prompt: CopyPromptTemplate }
  | { ok: false; status: number; error: string }

/** Update a prompt; the built-in data-only option may not gain an instruction. */
export async function updateCopyPrompt(id: string, fields: Partial<CopyPromptFields>): Promise<UpdateCopyPromptResult> {
  const existing = await prisma.copyPrompt.findUnique({ where: { id }, select: { ...promptSelect, builtin: true } })
  if (!existing) return { ok: false, status: 404, error: 'Prompt not found.' }

  const data: Partial<CopyPromptFields> = {
    title: fields.title,
    description: fields.description,
    instruction: fields.instruction,
    enabled: fields.enabled,
  }
  if (existing.builtin && fields.instruction !== undefined && fields.instruction.trim()) {
    return { ok: false, status: 400, error: 'The built-in Normal Data option must stay data-only (no instruction).' }
  }
  if (existing.builtin) delete data.instruction

  const row = await prisma.copyPrompt.update({ where: { id }, data, select: promptSelect })
  return { ok: true, prompt: toTemplate(row) }
}

export type DeleteCopyPromptResult = { ok: true } | { ok: false; status: number; error: string }

/** Delete a custom prompt; built-in prompts are protected. */
export async function deleteCopyPrompt(id: string): Promise<DeleteCopyPromptResult> {
  const existing = await prisma.copyPrompt.findUnique({ where: { id }, select: { builtin: true } })
  if (!existing) return { ok: false, status: 404, error: 'Prompt not found.' }
  if (existing.builtin) return { ok: false, status: 400, error: 'The built-in Normal Data option cannot be deleted.' }
  await prisma.copyPrompt.delete({ where: { id } })
  return { ok: true }
}

/** Persist a new order given the full list of prompt ids (index = position). */
export async function reorderCopyPrompts(ids: string[]): Promise<AdminCopyPrompt[]> {
  await prisma.$transaction(ids.map((id, index) => prisma.copyPrompt.update({ where: { id }, data: { sortOrder: index } })))
  return listAllCopyPrompts()
}
