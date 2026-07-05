# LOCAL Poker Bot Playtest — localhost + local Supabase (Option B)

Stand up a **fully local, production-isolated** environment for re-running **Prompt 27F-A**
(practice-bot playtest) on this Windows machine. Nothing here touches production Supabase,
GitHub, or Vercel.

This is the concrete, working realization of *Option B (localhost)* from
[`internal-playtest-environment.md`](./internal-playtest-environment.md). That document proves
the practice-economy isolation (§4) — this one is the host runbook.

> **Status:** VERIFIED on this host. `local-ready-check.mjs` prints
> **READY — SAFE LOCAL POKER PLAYTEST ENVIRONMENT** (21/21).

---

## 0. Why this architecture (Windows + WSL2 + Docker)

Docker Desktop is **not** installed. Instead, Docker Engine + the Supabase CLI run natively
inside **WSL2 (Ubuntu)**, and the Supabase local stack lives at `~/poker-local` in WSL. The
Next.js dev server runs on **Windows** (native Node). The one hard problem is that the Windows
browser must reach the Supabase containers that are published inside WSL.

```
┌─ Windows ─────────────────────────────┐        ┌─ WSL2 (Ubuntu, mirrored networking) ─────────┐
│  Browser + Next.js dev (node)         │        │  Supabase local stack (Docker)                │
│                                       │        │   kong :54321  db :54322  studio :54323       │
│  http://127.0.0.1:3000  (Next dev) ───┼──mirror─┤  Mailpit/Inbucket :54324  realtime  storage   │
│  http://127.0.0.1:64321 (Supabase) ───┼──mirror─► socat relay :64321 ─► kong :54321             │
│  http://127.0.0.1:64324 (mail UI)  ───┼──mirror─► socat relay :64324 ─► inbucket :54324         │
└───────────────────────────────────────┘        └───────────────────────────────────────────────┘
```

Two host-level facts make this work and are already configured (see §11 safeguards):

1. **WSL2 mirrored networking** (`%USERPROFILE%\.wslconfig`: `networkingMode=mirrored`,
   `firewall=false`) shares `localhost` between Windows and WSL. Docker's own published ports are
   **not** surfaced by mirrored mode, so we add tiny **socat relays** (normal sockets, which
   *are* surfaced) on `64321`/`64324` that forward to the WSL-local docker ports. The app talks
   to `127.0.0.1:64321`, never the raw `54321`.
2. A **self-healing keepalive** keeps the WSL VM from idle-shutting-down (which would recreate
   the containers). Without it the VM stops as soon as no `wsl.exe` session is held.

---

## 1. Prerequisites (all already installed on this host)

| Requirement | This host |
|---|---|
| Windows 11 + WSL2 (Ubuntu, systemd) | ✅ WSL 2.7.10 |
| Docker Engine (in WSL) + `unless-stopped` supabase containers | ✅ Docker 29.x, enabled |
| Supabase CLI (in WSL) | ✅ 2.109.0 |
| `socat` (in WSL) | ✅ used by the relay services |
| Node.js (Windows) | ✅ v24 (has `--env-file`) |
| Local Supabase project | ✅ `~/poker-local` (WSL) |

If starting from a clean machine, the one-time host setup is: install WSL2 + Ubuntu, install
Docker Engine + Supabase CLI + socat inside WSL, `supabase init && supabase start` in a project
dir, then apply the migrations in §4 and create the relay/keepalive services in §11.

---

## 2. Start / verify Docker + Supabase local

Everything auto-starts with WSL (Docker is `systemctl enable`d, containers are `unless-stopped`,
relays + keepalive are systemd services). To bring it up manually or check health:

```powershell
# From Windows PowerShell — keep the VM alive for the whole session (self-healing):
Start-Process -FilePath "cmd.exe" -WindowStyle Hidden -ArgumentList '/c','for /l %i in () do (wsl -d Ubuntu -e bash -lc "sleep 3600" & timeout /t 1 >nul)'

# Wait for the stack to be healthy:
wsl -d Ubuntu -e bash -lc 'for i in $(seq 1 40); do d=$(docker inspect -f "{{.State.Health.Status}}" supabase_db_poker-local 2>/dev/null); k=$(docker inspect -f "{{.State.Health.Status}}" supabase_kong_poker-local 2>/dev/null); a=$(docker inspect -f "{{.State.Health.Status}}" supabase_auth_poker-local 2>/dev/null); [ "$d" = healthy ] && [ "$k" = healthy ] && [ "$a" = healthy ] && { echo HEALTHY; break; }; sleep 3; done'
```

The keepalive is the single most important step — without a held `wsl.exe` session the VM idles
off in seconds and the containers get recreated.

Local endpoints (source of truth = `wsl -d Ubuntu -e bash -lc 'cd ~/poker-local && supabase status'`):

| Service | WSL (native) | Windows (via relay) |
|---|---|---|
| API / Auth / REST / Realtime (kong) | `127.0.0.1:54321` | **`127.0.0.1:64321`** |
| Postgres | `127.0.0.1:54322` | (WSL only) |
| Studio | `127.0.0.1:54323` | `127.0.0.1:54323`* |
| Mailpit / Inbucket (emails) | `127.0.0.1:54324` | **`127.0.0.1:64324`** |

\* Studio is a normal-socket web server, usually surfaced directly; use it from WSL if not.

---

## 3. Keys

Get them with `supabase status`. This stack uses the **new key format**:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the **Publishable** key (`sb_publishable_…`)
- `SUPABASE_SERVICE_ROLE_KEY` = the **Secret** key (`sb_secret_…`)

Both are the shared local-dev defaults — **not secrets**, and only ever used against
`127.0.0.1`. Never copy any value from the production `.env.local`.

---

## 4. Migration order (LOCAL only — never production)

Applied to the local DB, in dependency order:

1. `supabase/schema.sql` — base `profiles` table + `handle_new_user` trigger (auto-creates a
   profile row on `auth.users` insert) + `posts` + `posts_with_author` view.
2. `supabase/migration_profile_v2.sql` — extra profile columns + `avatars` storage bucket.
3. `supabase/migration_profile_backfill_oauth.sql` — no-op with no pre-existing users.
4. `supabase/migration_poker_practice_bots.sql` — `poker_practice_games` (RLS deny-all;
   server/service-role mediated). *(Already present on this host.)*
5. Post-step: `grant all on public.profiles, public.posts, public.posts_with_author to anon,
   authenticated, service_role;` — restores the Supabase default PostgREST grants for the tables
   `schema.sql` created.

Apply a file:
```bash
wsl -d Ubuntu -e bash -lc 'cd /mnt/d/Projects/chococfko-web/web/supabase && docker exec -i supabase_db_poker-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < schema.sql'
```

**Do NOT apply** (kept physically absent, exactly as production): the cash-poker schema
(`migration_poker_core/_economy/_engine/_lifecycle/_private/_social/_admin_ops`), and — critically
— **`migration_poker_tournament.sql`**. `game_wallets` / `coin_ledger` exist on this host but are
**empty** (0 rows) and are never touched by the practice path (see isolation proof §11).

---

## 5. Environment file — `.env.playtest.local`

Git-ignored via `.env*.local`. Built only from `supabase status`; no production value copied.
Key lines (see the file for the full flag list — public poker / cash bots / tournament all `0`):

```dotenv
NEXT_PUBLIC_APP_ENV=local
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:64321        # relay → kong :54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_…          # local publishable key
SUPABASE_SERVICE_ROLE_KEY=sb_secret_…                   # local secret key (server-only)
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
ADMIN_EMAILS=tester-a@example.com,tester-b@example.com
POKER_ALPHA_MODE=1
POKER_ALPHA_TESTERS=tester-a@example.com,tester-b@example.com
POKER_PRACTICE_BOTS_ENABLED=1
POKER_ENABLED=0   # …and every other poker flag = 0
```

---

## 6. Start the app (Windows) — overriding production `.env.local`

The production `.env.local` still sits in `web/` and Next.js auto-loads it. Launch through Node's
`--env-file` so the playtest values are in `process.env` **before** Next loads — `@next/env` will
not override already-set variables, so the local values win (verified against the `@next/env`
source). **Do not** run a bare `next dev`.

```powershell
cd D:\Projects\chococfko-web\web
node --env-file=.env.playtest.local node_modules/next/dist/bin/next dev -p 3000
```

App: **http://127.0.0.1:3000**. Next prints `Environments: .env.local` (it *found* that file) but
the served bundle contains `127.0.0.1:64321` and **not** the production ref — confirmed by the
health check and a bundle scan.

---

## 7. Local login (email + password) — two browser sessions

The app's login page supports **email + password** as well as OAuth. Two tester accounts were
created via the GoTrue admin API with email **pre-confirmed** (password in `.env.playtest.local`
→ `PLAYTEST_TESTER_PASSWORD`):

- `tester-a@example.com`
- `tester-b@example.com`

Procedure:
1. Open **http://127.0.0.1:3000/login** in browser **profile A** → sign in as tester #1.
2. Open the same URL in a **second browser profile** (or an Incognito/private window) → sign in
   as tester #2. Each profile keeps its own cookies → **two distinct sessions**.
3. Both are on the allowlist, so **/games/poker** and **/games/poker/practice** become visible.
   Any other account (and anonymous) is denied server-side (404 / not visible).

> **Magic-link note:** local magic-link/OTP emails land in Mailpit/Inbucket
> (**http://127.0.0.1:64324**), but the clickable link uses GoTrue's external URL (`:54321`),
> which is not reachable from the Windows browser. **Use email+password locally.**
> Local login does **not** validate real Google OAuth — that requires the cloud/staging option
> (see `internal-playtest-environment.md` §7).

To (re)create the users:
```bash
wsl -d Ubuntu -e bash -lc 'SEC="<sb_secret_key>"; for e in tester-a@example.com tester-b@example.com; do curl -s -o /dev/null -w "$e %{http_code}\n" -X POST http://127.0.0.1:54321/auth/v1/admin/users -H "apikey: $SEC" -H "Authorization: Bearer $SEC" -H "Content-Type: application/json" -d "{\"email\":\"$e\",\"password\":\"<TESTER_PASSWORD — see .env.playtest.local>\",\"email_confirm\":true}"; done'
```

---

## 8. Health check (must print READY)

```powershell
cd D:\Projects\chococfko-web\web

# Fast env-only audit (no network):
node --env-file=.env.playtest.local scripts/poker-playtest/health-check.mjs        # → PASS

# Allowlist deny proof (testers in, others out):
node --env-file=.env.playtest.local scripts/poker-playtest/allowlist-proof.mjs      # → PASS

# Full live READY check (Docker/Supabase/Auth/Realtime/practice table/economy/app):
node --env-file=.env.playtest.local scripts/poker-playtest/local-ready-check.mjs    # → READY
```

The last one must end with:

```
  READY — SAFE LOCAL POKER PLAYTEST ENVIRONMENT
```

---

## 9. Shutdown & reset

```powershell
# Clear practice games between sessions (guarded; refuses a production URL):
node --env-file=.env.playtest.local scripts/poker-playtest/reset.mjs

# Stop the app: Ctrl+C its terminal, or:
Stop-Process -Id (Get-Content $env:TEMP\poker-playtest-next.pid) -ErrorAction SilentlyContinue

# Stop Supabase local (data is preserved in the docker volume):
wsl -d Ubuntu -e bash -lc 'cd ~/poker-local && supabase stop'

# Stop the keepalive (lets the WSL VM idle down):
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -like '*sleep 3600*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

To fully revert the host networking change: delete `%USERPROFILE%\.wslconfig` (or remove its
`[wsl2]` block) and run `wsl --shutdown`.

---

## 10. Re-running Prompt 27F-A on localhost

1. Ensure the keepalive is running and the stack is healthy (§2).
2. `local-ready-check.mjs` prints **READY** (§8).
3. Start the app via `node --env-file=…` (§6).
4. Log in both testers in two browser profiles (§7); confirm the **NOT PRODUCTION** context
   (blue LOCAL banner if `PlaytestEnvBanner` is wired; the poker ALPHA ribbon renders regardless).
5. Run the 27F-A practice-bot hand matrix at **http://127.0.0.1:3000/games/poker/practice**.
6. `reset.mjs` between sessions to clear `poker_practice_games`.

---

## 11. Production-isolation safeguards (how this stays safe)

- **Different Supabase everything** — URL is loopback `127.0.0.1:64321`; keys are local-dev
  defaults; Realtime/Storage/Auth are the local project's. The fail-closed guard
  (`lib/playtest/env-guard.ts`) + `health-check.mjs` reject the production host
  `kjfnqbzfhymhfodmgyow.supabase.co` and the domain `chococfko.com`.
- **No production data** — `game_wallets` and `coin_ledger` are **empty (0 rows)**; there is no
  tournament table (`poker_tournaments` → 404).
- **Practice touches nothing real** — `app/games/poker/practice-actions.ts` reads/writes **only**
  `poker_practice_games`; no `game_wallets`, `coin_ledger`, or settle/commit RPCs. Proven by
  `lib/games/poker/practice/isolation.test.ts` + bot/flags suites (**39 passed**) and structurally
  by the deny-all RLS on `poker_practice_games`.
- **Allowlist is exact** — `POKER_ALPHA_TESTERS` and `ADMIN_EMAILS` are the two testers only; a
  third account and anonymous are denied server-side (`allowlist-proof.mjs` PASS).
- **Everything real stays off** — `POKER_ENABLED`, public lobby, cash bots, **tournament**,
  closed beta, social flags are all `0` (and several are hard-off in `lib/games/poker/flags.ts`).
- **Production untouched** — no SQL/migration/flag/commit/deploy against production; the only
  changes are local (WSL config, local DB, relay/keepalive services, `.env.playtest.local`,
  and these additive playtest scripts).

### Host services created (WSL, systemd)
- `poker-playtest-relay-api.service` — socat `64321 → 127.0.0.1:54321`
- `poker-playtest-relay-inbucket.service` — socat `64324 → 127.0.0.1:54324`
- `poker-playtest-keepalive.service` — `sleep infinity` (backup keepalive)
- Windows-side self-healing keepalive loop (see §2) — the primary VM keep-up mechanism.
