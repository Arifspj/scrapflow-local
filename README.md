# Q-Scan — Fundamental Stock Scanner

A self-hosted fundamental scanner for Indian listed companies. It pulls screens and
company pages from [screener.in](https://www.screener.in) (optionally with a logged-in
session) and Chartink scans, persists every stock it sees, and scores them with a
classic quality/valuation score, an **Opportunity Score**, and an evidence-weighted
**Multibagger Score v2**.

The public site is a table of source-backed results; everything on it is read from the
database — nothing is fabricated or estimated when the data is missing.

## What it does

- **Import scanners from links.** Attach a screener.in `/screens`, `/screen`, `/market`,
  `/results`, `/ipo` or company page, or a Chartink scan, to a scanner. Each source is
  imported into `Stock` + `StockFundamentalSnapshot` rows and memberships are tracked.
- **Public scanner pages.** Pick a scanner on the homepage → table of members with
  LTP, intrinsic value, margin of safety, P/E, market cap, ROCE, D/E, growth and the
  stock score. Search, CSV export, and per-scanner totals.
- **Opportunity Dashboard.** The homepage (without a scanner) ranks every persisted
  stock by Opportunity Score, surface multibagger candidates, and live-refreshes on a
  60s poll while visible.
- **Stock detail pages.** Classic score, Opportunity Score, Multibagger Score v2 with
  per-input evidence, turnaround and ownership-trend analysis, plus a configurable
  "Copy Data" prompt dropdown.
- **Admin panel (`/admin`).** Manage scanners and their source links, preview + import
  a source, edit the copy-data prompts, inspect fetch logs and persisted stocks.
- **Scheduled fetching.** A Vercel cron hits `/api/cron/fetch` daily (`0 3 * * *`).

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js **16.4.0** (App Router, Turbopack), React 19 |
| Language | TypeScript 5.7.3 (strict) |
| Database | PostgreSQL (Neon in production, Prisma Postgres locally) |
| ORM | Prisma 6.19.3 |
| Styling | Tailwind CSS 4 |
| Scraping | `cheerio` |
| Tests | Vitest |

## Getting started

### 1. Install

```bash
pnpm install          # runs `prisma generate` via postinstall
```

### 2. Configure environment

```bash
cp .env.example .env
```

See [Environment variables](#environment-variables) below. `DATABASE_URL` is the only
required variable; without screener credentials the app still works but only reads the
publicly visible top ratios.

### 3. Start a database

**Local, no Docker needed** — Prisma's dev server ships a local Postgres:

```bash
npx prisma dev -d -n scrapeflow     # prints a DATABASE_URL (TCP form, e.g. 127.0.0.1:51214)
```

Point `.env` at it and add `&pgbouncer=true` — the local server shares prepared
statements across connections, and that flag disables them:

```
DATABASE_URL="postgres://postgres:postgres@127.0.0.1:51214/template1?sslmode=disable&pgbouncer=true"
```

Any other PostgreSQL works too — just set `DATABASE_URL` and skip `prisma dev`.

### 4. Apply migrations and run

```bash
pnpm db:deploy        # prisma migrate deploy
pnpm dev              # http://localhost:3000
```

### 5. Open the admin panel

Set `ADMIN_SECRET` in `.env`, open <http://localhost:3000/admin>, and enter that value
when prompted (it is stored in your browser's `localStorage` only). Then:

1. **Add New Scanner** (name + category).
2. Select it → **Add source link** and paste a screener.in URL (or pick a suggestion).
3. **Test** to preview the symbols it found, **Import** to persist them.

Once imported, the scanner card on the homepage shows the number of persisted members,
and `/?scanner=<name>` renders the results table.

## Share a live preview (Cloudflare tunnel)

Want a friend to open the running app from anywhere? Cloudflare's **Quick Tunnel** puts
your local dev server on a throwaway public `https://…trycloudflare.com` URL — no
account, no config.

1. With the dev server running on port **3001** (`pnpm dev -- -p 3001`; see
   [docs/local-dev.md](docs/local-dev.md)), start the tunnel in a second terminal:

   ```bash
   pnpm tunnel        # or: npm run tunnel
   ```

   This runs `cloudflared tunnel --url http://localhost:3001`.

2. Cloudflare prints a box in the terminal with your public URL — the
   `https://[random-words].trycloudflare.com` line. That is the link to share.

3. Open it in a browser (or send it to a friend); it serves the same UI as
   `http://localhost:3001`.

Notes:

- Needs the `cloudflared` CLI on your `PATH`. Install it once with
  `winget install --id Cloudflare.cloudflared` (Windows) or
  `brew install cloudflared` (macOS) — see the
  [official download page](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
- The URL is temporary: it changes on every run and stops working when you close the
  command. Anyone with the link can reach your app, so treat it as public — the local
  dev database it reads is your own scratch data.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm tunnel` | Expose the local dev server at `:3001` via a Cloudflare Quick Tunnel |
| `pnpm db:deploy` | Apply pending Prisma migrations |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Run the Vitest suite |
| `vercel-build` | `prisma migrate deploy` (tolerates an unreachable DB) → `prisma generate` → `next build` |

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string for Prisma |
| `SCREENER_EMAIL` / `SCREENER_PASSWORD` | no | Log in to screener.in to fetch the full P&L / balance sheet / cash flow / shareholding tables. Without them the app falls back to public top ratios |
| `ADMIN_SECRET` | no | Unlocks `/admin` and the `/api/admin/*` endpoints |
| `CRON_SECRET` | no | Authorizes `GET /api/cron/fetch` |
| `NEXT_PUBLIC_SITE_URL` | no | Base URL for absolute links |

**Never commit real credentials.** In production set these in the Vercel project
settings; `.env`, `.env.local` and `.env.*` are gitignored (only `.env.example` is
tracked).

## Scoring models

All scores are computed from persisted fundamentals and are covered by unit tests, so
regressions in the numbers show up as test failures rather than silent drift.

- **Classic score** — quality/valuation blend of ROCE, ROE, operating margin,
  sales/profit growth, CFO-to-PAT, debt ratios, P/E and upside.
- **Opportunity Score** — intrinsic value and margin of safety.
- **Multibagger Score v2** — evidence-weighted, capped small-base component, and gated
  scanner confluence; weights sum to 100 and low-coverage inputs are down-weighted
  rather than padded.
- **Turnaround** and **ownership trend** — change-over-time assessments.

## Data model (summary)

- `Scanner` / `ScannerSource` / `ScannerStock` — scanners, the links that feed them, and
  current memberships.
- `FetchRun` — one row per import, with status, counts and diagnostics.
- `Stock` — symbol, name, identifiers.
- `StockFundamentalSnapshot` — the captured fundamentals. Stores the raw scraped payload
  (`rawData`) **and** a compact `viewSummary` (the derived view minus the heavy detail,
  plus ownership/turnaround/multibagger inputs) so list and dashboard reads never pull
  the full JSON blob. `POST /api/admin/backfill-view-summary` fills summaries for
  snapshots captured before the column existed.
- `StockMetricHistory` — append-only per-scrape metrics, which is what makes genuine
  score/ROCE/growth movement possible across runs.
- `CopyPrompt` — the admin-editable "Copy Data" prompts on stock pages.

## API (selected)

| Route | Notes |
| --- | --- |
| `GET /api/dashboard` | Live dashboard metrics for the homepage poll |
| `GET /api/health/db` | DB reachability check |
| `GET /api/cron/fetch` | Cron entry point (protected by `CRON_SECRET`) |
| `GET/POST/PATCH/DELETE /api/admin/*` | Scanner, source, prompt and stock management (protected by `ADMIN_SECRET`) |
| `POST /api/admin/backfill-view-summary` | Fill missing `viewSummary` values |
| `GET /api/stocks/search` | Stock search |
| `GET /api/copy-prompts` | Enabled copy-data prompts |

## Notes for contributors

- Outages are handled gracefully: public pages and admin reads return empty states or
  `503 Database unavailable` instead of crashing on an unreachable database.
- `next dev` regenerates `AGENTS.md` and rewrites `next-env.d.ts` for dev mode; the
  committed `next-env.d.ts` should stay pointed at `.next/types`.
- The local database is scratch data — production data is untouched.
