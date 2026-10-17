# AI Insight — plan (detail page right drawer + browser bridge)

Status: **planned, not implemented**. This document is the source of truth for the feature.

## Goal

On the stock detail page (`/stocks/[symbol]`) add an **AI Insight** button next to the
existing **Copy** button. It opens a **right drawer** that shows an AI fundamental
analysis for the stock. The analysis is produced by sending a structured prompt +
stock snapshot to **ChatGPT (web)**, capturing the returned JSON through a
**browser extension bridge**, validating it, storing it in the DB, and rendering it
in the drawer.

The prompts reuse the **existing Copy-Data prompt catalog** (`CopyPrompt` table /
`lib/copy-prompts.ts`): the same briefs already shipped for copy-paste, but each one
is paired with a **short JSON output spec** so the AI returns compact, machine-
parsable JSON instead of long prose.

## Decisions (locked)

| Topic | Decision |
| --- | --- |
| AI provider | **ChatGPT web** first. Gemini added later via a provider adapter. |
| Provider field | Stored on both job and analysis so more providers can be added without schema changes. |
| Prompt catalog | Reuse the **Copy-Prompt** catalog (`CopyPrompt` / `lib/copy-prompts.ts`); each prompt gets a short JSON answer spec. |
| Analyses per stock | One **latest analysis per (symbol, promptKey)** — running a prompt again overwrites only that prompt's result. |
| Manual fallback | **Yes** — the feature must work without the extension via copy-prompt / paste-JSON. |
| Extension target | **Chrome / Chromium (Manifest V3)**. |
| Buttons | Two sibling buttons in the header: existing **Copy** (unchanged) and new **AI Insight**. |

## UX

Header actions row (`app/stocks/[symbol]/page.tsx`, near `CopyDataMenu`):

1. **Copy** — existing `CopyDataMenu`, unchanged.
2. **AI Insight** — opens the right drawer and starts/loads the analysis.

Right drawer (`app/stocks/[symbol]/ai-drawer.tsx`, client component):

- **Prompt selector** — same list as the Copy-Data dropdown (e.g. Multibagger
  Research, Stock Story & Trigger, Intrinsic Value & MOS, Forensic & Red Flags).
  The built-in **Normal Data** option (empty instruction) is excluded — it is not
  an analysis.
- One tab/card per selected prompt, each with its own short JSON result.
- Empty state -> "Run analysis" button.
- Loading state while a job is `PENDING` / `SENT` (poll).
- Result state: rendered from the prompt's short JSON (verdict/score/summary and
  the prompt-specific fields), plus a collapsible **Raw JSON** and last-run
  timestamp + provider/model.
- Error state with retry.
- Manual mode: "Copy prompt" + "Paste JSON" inputs (works with no extension).
- Drawer behaviour reuses the pattern from `app/stocks/[symbol]/workspace.tsx`
  (Escape to close, backdrop, `localStorage` for last-open state).

## Architecture / flow

Automatic (extension present):

1. User clicks **AI Insight** -> drawer opens; user picks a prompt (or the default).
2. Drawer `POST /api/stocks/[symbol]/ai` with `{ promptKey }` to create/ensure a job.
3. Server builds `prompt = CopyPrompt.instruction + stock snapshot + short JSON
   answer spec + schemaVersion` and stores an `AiJob` (`PENDING`), returns job id.
4. Extension content script (on the ChatGPT host) pulls the next job via
   `GET /api/ai/jobs/next`, injects the prompt, waits for the answer to finish,
   extracts the JSON, and `POST`s it to `/api/ai/jobs/:id/result`.
5. Server validates the JSON, upserts the latest `AiAnalysis`, marks the job `DONE`.
6. Drawer polls `GET /api/stocks/[symbol]/ai` until done and renders.

Manual fallback (no extension / failure):

1. Drawer shows the same prompt with a **Copy** action.
2. User pastes it into ChatGPT, copies the JSON answer.
3. User pastes the JSON into the drawer (or the extension's result endpoint is
   called by the drawer directly with the pasted text).
4. Same validation + upsert path as step 5.

## Prompts and short JSON output

The catalog is the existing Copy-Data prompt set. The **brief** stays as-is; we add a
**short JSON answer spec** per prompt so the model replies with compact JSON only
(no markdown prose). The spec is appended to the brief and is admin-editable
(seed defaults, never overwrite edits — same rule as `CANONICAL_COPY_PROMPTS`).

Shared envelope (every prompt):

```json
{
  "verdict": "string (one line)",
  "score": "integer 0-100 (confidence in the verdict)",
  "summary": "string, <= 2 sentences",
  "confidence": "high | medium | low"
}
```

Prompt-specific fields (illustrative, final list TBD) mapped to the shipped keys:

| Prompt key | Title | Short JSON answer (beyond the envelope) |
| --- | --- | --- |
| `multibagger-research` | Multibagger Research | `multibaggerProbability: high/medium/low`, `thesis`, `catalysts[]`, `topRisks[]` |
| `stock-story-trigger` | Stock Story & Trigger | `story`, `recentChanges[]`, `triggers[]`, `bearCase`, `oneLineThesis` |
| `intrinsic-value-mos` | Intrinsic Value & MOS | `fairPe`, `graham`, `growthUsed`, `marginOfSafety`, `hasMarginOfSafety: bool` |
| `forensic-red-flags` | Forensic & Red Flags | `flags: [{ area, status: clean/watch/flag, note }]` |

Rules baked into every spec: use only the pasted data; mark missing figures as `null`
and say so (never estimate); return **only** a single JSON object; keep every string
short (hard cap, e.g. <= 280 chars per field, <= ~2 KB total).

## Data model (Prisma)

New models (local `npx prisma migrate dev`; prod `migrate deploy` only after the
Neon quota reset — never `prisma dev rm`).

```prisma
enum AiJobStatus { PENDING, SENT, DONE, ERROR }

model AiJob {
  id            String      @id @default(cuid())
  symbol        String
  promptKey     String
  provider      String      @default("chatgpt")
  status        AiJobStatus @default(PENDING)
  prompt        String
  schemaVersion Int         @default(1)
  error         String?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  expiresAt     DateTime?

  @@index([status, createdAt])
  @@index([symbol, promptKey, createdAt])
}

model AiAnalysis {
  id            String   @id @default(cuid())
  symbol        String
  promptKey     String
  provider      String
  model         String?
  schemaVersion Int      @default(1)
  requestJson   Json
  responseJson  Json
  verdict       String?
  score         Int?
  summary       String?
  confidence    String?
  payload       Json?    // prompt-specific fields (catalysts, flags, valuation, ...)
  sourceUrl     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([symbol, promptKey])   // latest-only per prompt
  @@index([createdAt])
}
```

- `symbol` refers to `Stock.symbol` (string, to avoid a hard FK dependency).
- `@@unique([symbol, promptKey])` enforces one latest analysis per prompt per stock.
- Generic columns (`verdict`, `score`, `summary`, `confidence`) are the shared
  envelope; prompt-specific fields live in `payload` (Json) keyed off `promptKey`.

## API routes

Reuse `lib/admin-auth.ts` (`requireAdmin` / `x-admin-secret`). Add a dedicated
extension token if we don't want to share the admin secret.

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/stocks/[symbol]/ai` | public (rate-limited) | Body `{ promptKey }` — create/ensure a job, return prompt + job id |
| GET | `/api/stocks/[symbol]/ai?promptKey=...` | public | Latest analysis for that prompt (or job status) |
| POST | `/api/stocks/[symbol]/ai/result` | token | Manual paste path: validate + upsert for `promptKey` |
| GET | `/api/ai/jobs/next` | token | Extension pulls the next pending job |
| POST | `/api/ai/jobs/[id]/result` | token | Extension pushes the captured JSON |

Implementation notes:

- Build the stock snapshot with `lib/stock-detail.ts` (`buildStockView`) and reuse
  `lib/copy-data.ts` for the serialisable payload.
- The prompt brief is `CopyPrompt.instruction` (by `promptKey`); append the
  prompt's short JSON answer spec (new `lib/ai-prompts.ts`) before sending.
- Store the answer spec on the prompt (e.g. an optional `answerSpec`/output column
  on `CopyPrompt`, seeded per canonical prompt and admin-editable).
- Always `cache-control: no-store` on reads.

## Extension (`extension/`, Manifest V3)

- `manifest.json`: host permissions for the ChatGPT site + the app origin
  (localhost and/or the deployed domain).
- **background** service worker: job polling, tab management, backoff.
- **content script** (ChatGPT host): inject prompt, detect answer completion,
  extract JSON (code fence -> balanced-brace fallback), post result.
- **options** page: API base URL + token stored in `chrome.storage` (never
  hardcoded in the content script).
- Provider adapter shape so a Gemini content script can be added later.

## Security

- Extension token lives in `chrome.storage`, not in source.
- Never execute AI output; render as text only, cap size, sanitize.
- Validate JSON against the schema + size limit before storing.
- Rate-limit job creation per symbol; expire/clean up stale jobs.

## Edge cases

- ChatGPT DOM changes -> selector fallback + explicit error surfaced to the drawer.
- Parse failure / non-JSON answer -> job `ERROR`, drawer offers retry/manual.
- Duplicate clicks -> debounce; reuse an existing `PENDING` job.
- Detail not yet scraped -> call `ensureStockDetail` before building the snapshot.
- Expired jobs cleaned up; drawer falls back to manual.

## Phasing

- **Phase A** — Prisma models + job/result API + drawer skeleton with the prompt
  selector and per-prompt short JSON specs + manual copy/paste flow (fully usable
  without the extension).
- **Phase B** — Chrome extension auto-bridge.
- **Phase C** — admin page to manage analyses/history + provider adapters (Gemini).

## Open questions

- Final per-prompt short JSON field list (proposal above).
- Where to store the per-prompt answer spec (new `CopyPrompt` column vs separate
  table / `lib/ai-prompts.ts` defaults).
- Whether to add a dedicated `EXTENSION_TOKEN` or reuse `ADMIN_SECRET`.
- Whether to keep history later (currently latest-only per prompt).
