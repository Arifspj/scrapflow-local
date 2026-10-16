# Local dev runbook (Q-Scan)

Local testing needs **two** processes running at the same time:

| Process | What it is | Port |
| --- | --- | --- |
| Prisma Postgres local daemon (`scrapeflow`) | The database | **51214** (TCP) + 51213/51215/51216 |
| Next.js dev server | The app | **3001** |

If either one is down you get errors like `Can't reach database server at 127.0.0.1:51214`.

## 1. Is it running right now?

```powershell
# Which of the two ports are listening? (empty = that process is down)
Get-NetTCPConnection -State Listen |
  Where-Object { $_.LocalPort -in 3001, 51214 } |
  Format-Table LocalAddress, LocalPort, OwningProcess

# Can the app actually reach the database?
Invoke-RestMethod http://localhost:3001/api/health/db
```

Health replies:

- `{"ok":true,"database":"reachable"}` → both fine.
- HTTP **503** `{"ok":false,...}` → app is up, **database is down** → restart the daemon (step 2).
- Connection refused → **app is down** → start the dev server (step 2).

## 2. How to start

### Database

```powershell
npx prisma dev -d -n scrapeflow
```

- `-d` runs it **detached (background)**. Always use this.
- Do **not** rely on `npx prisma dev start scrapeflow` (foreground) — it dies as soon as the parent shell closes.

### Dev server (separate terminal)

```powershell
npm run dev -- -p 3001
```

Or detached in the background:

```powershell
Start-Process cmd -ArgumentList '/c','node node_modules/next/dist/bin/next dev -p 3001 > "%TEMP%\opencode\dev.log" 2>&1' -WindowStyle Hidden
```

App: <http://localhost:3001> · Admin: <http://localhost:3001/admin> (secret `local-dev-secret`).

## 3. How to stop

```powershell
npx prisma dev stop scrapeflow
```

Dev server: close its terminal, or kill the owning PID from the port check above (`Stop-Process -Id <pid>`).

## 4. Golden rules (read before debugging)

1. **NEVER run `npx prisma dev rm scrapeflow --force`** unless you *want* to wipe the whole local
   database. It deletes every stock, scanner, source and snapshot. This has already cost us a full
   re-import once. To recover from a stale `Lock file is already being held` error, use
   `stop` → wait a few seconds → `dev -d -n scrapeflow`.
2. **Stale lock fix**: `npx prisma dev stop scrapeflow`, wait ~5s, then `npx prisma dev -d -n scrapeflow`.
3. The connection string must use **`127.0.0.1`** (not `localhost`) and **`&pgbouncer=true`**, or Prisma
   fails with `P1001` / `prepared statement "s0" already exists`:
   ```
   postgres://postgres:postgres@127.0.0.1:51214/template1?sslmode=disable&pgbouncer=true
   ```
4. The **Prisma CLI does not read `.env.local`** (that file is Next-only). For CLI commands set the
   variable inline:
   ```powershell
   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:51214/template1?sslmode=disable&pgbouncer=true'
   ```
5. The daemon is flaky and can die under heavy load. If imports start failing mid-run, check the
   port/health first and restart the daemon.

## 5. Fresh setup (only when starting over)

```powershell
npx prisma dev -d -n scrapeflow
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:51214/template1?sslmode=disable&pgbouncer=true'
npm run db:deploy
```

Then re-add scanners/sources in the admin panel (canonical scanners such as *IPO Scanner* and
*QoQ Results* are auto-seeded) and run **Import**.

## 6. Useful checks

```powershell
# Is the database reachable at all? (easiest check)
Invoke-RestMethod http://localhost:3001/api/health/db

# Is the app compiling / what is it doing? tail the dev log
Get-Content "$env:TEMP\opencode\dev.log" -Wait
```

Typecheck / tests:

```powershell
npm run typecheck
npm test
```
