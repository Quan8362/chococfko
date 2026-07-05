# Internal Poker Bot Playtest — Isolated Environment

Prepared for running **Prompt 27F-A** (practice-bot playtest) **without any contact with
production**. This document is the setup + verification contract for the isolated environment.

> **Status:** code, config templates, scripts, and this runbook are ready and verified.
> Standing up the isolated backend (Supabase project + Google OAuth + Vercel preview) requires a
> few **manual dashboard steps** — see [§7 Manual setup checklist](#7-manual-setup-checklist).
> Nothing in this repo change touches production.

---

## 1. Chosen architecture

**Option A — Vercel *Preview* deployment + a separate non-production Supabase project + real
Google login + a server-enforced tester allowlist + practice-only economy.** This is preferred
because Prompt 27F-A wants real Google login.

**Option B — localhost + a local/separate Supabase project** is documented as a fallback (§8). It
is identical except the site URL is `http://localhost:3000` and `NEXT_PUBLIC_APP_ENV=local`.

Both options reuse the app's existing, already-isolated practice code. **No application logic
needed changing** — the isolation is structural (see §4). What was missing was an *isolated
backend + a fail-closed environment identity*, which this change adds.

### What this change added (all additive — no existing file was edited)

| File | Purpose |
|---|---|
| `lib/playtest/env-guard.ts` | Fail-closed guard: refuses to run if pointed at production Supabase/domain. Pure, no secrets. |
| `lib/playtest/env-guard.test.ts` | Unit test proving production-URL rejection + non-prod acceptance (9 cases). |
| `scripts/poker-playtest/health-check.mjs` | One-command environment audit (prints no secrets; exit 1 on any violation). |
| `scripts/poker-playtest/reset.mjs` | Deletes only `poker_practice_games`; guarded against production. |
| `components/PlaytestEnvBanner.tsx` | "INTERNAL STAGING / LOCAL TEST — NOT PRODUCTION" strip; fail-closed. Wire it manually (§5). |
| `.env.playtest.example` | Non-secret env template for the isolated environment. |
| `docs/poker/testing/internal-playtest-environment.md` | This runbook. |

---

## 2. Environment boundaries (production isolation)

The isolated environment MUST satisfy every row below. `env-guard.ts` + `health-check.mjs`
enforce the starred (★) rows automatically and **fail closed**.

| Boundary | How it is guaranteed |
|---|---|
| ★ Different Supabase **URL** from production | Guard rejects if host == `kjfnqbzfhymhfodmgyow.supabase.co`. |
| ★ Different **anon key** from production | Separate project ⇒ different key; template ships placeholders only. |
| No production **service-role** key | Isolated project has its own; never share the prod key into this env. |
| No production **wallet/ledger** data | Isolated DB gets only the minimum schema (§6). No wallet/ledger tables applied. |
| No production **Realtime** channels | Different project ⇒ different Realtime endpoint. Practice mode opens **no** Realtime channel anyway (server-action driven). |
| No production **Storage** writes | Practice mode performs no Storage I/O. |
| No production **analytics** writes | Practice mode writes only `poker_practice_games`. |
| ★ Not the production **domain** | Guard rejects `NEXT_PUBLIC_SITE_URL` on `chococfko.com`. |
| No **tournament** access | `tournament` flag is hard-coded `false` in `lib/games/poker/flags.ts:102`. Tournament migration stays unapplied. |

Production is left **exactly** as found: no SQL, no migration, no flag change, no commit, no
deploy. The only Supabase management calls made were **read-only** (`list_projects`,
`list_organizations`, `list_branches`).

---

## 3. Google login procedure (testers)

Real Google login is preserved and points at the **isolated** Supabase Auth project.

1. Use two **separate browser profiles** (or one normal + one Incognito) so a production session
   can never authorize the isolated environment. The isolated Supabase project issues its own
   cookies for its own domain, so sessions do not cross over.
2. Open the **preview URL** (staging) or `http://localhost:3000` (local).
3. Click **Sign in with Google** and complete Google's normal consent screen.
   - Primary tester: **tester-a@example.com**
   - Secondary tester: **tester-b@example.com**
4. Claude never sees or stores Google passwords — you log in manually.

Redirect URLs that must be registered (see §7): the Supabase callback
`https://<ISOLATED_REF>.supabase.co/auth/v1/callback` (in Google Cloud) and the app callback
`<SITE_URL>/auth/callback` (in Supabase Auth → URL configuration).

---

## 4. Practice-economy isolation — proof (not just a table name)

Traced through the **actual server action and DB paths**, plus runnable tests. Evidence:

- **Only table touched by practice:** `app/games/poker/practice-actions.ts` reads/writes
  **only** `poker_practice_games` — `.from('poker_practice_games')` at lines **112, 210, 224,
  236**. There is **no** `.from('game_wallets')`, **no** `.from('coin_ledger')`, and **no**
  `.rpc('poker_settle_hand' | 'poker_commit_action' | …)` anywhere in the file.
- **Chips are isolated integers:** starting stack `10_000`, big blind `100`
  (`practice-actions.ts:74-75`); all chip math is pure integer in
  `lib/games/poker/practice/economy.ts` (imports no Supabase client; "mints nothing", zero-sum
  within the isolated supply).
- **Server-only secrets, client can't read the table:**
  `supabase/migration_poker_practice_bots.sql:50-53` — RLS enabled, **no policy**, and
  `REVOKE ALL … FROM anon, authenticated`. Only the service role (trusted server action) can
  touch it.
- **Bots can never take a real seat:** a bot occupant carries `botId` + difficulty, **never** a
  `userId` (`practice-actions.ts:100`); `assertNoBotOnCashTable` / `assertPracticeKind` enforce
  classification.
- **Fail-closed gate on every entry point:** `requirePractice()` (`practice-actions.ts:48-62`)
  requires `pokerPracticeBotsOn(flags, viewer)` **and** an authenticated user before any action.
- **Structural test that fails if isolation regresses:**
  `lib/games/poker/practice/isolation.test.ts` scans practice runtime source for forbidden
  symbols (`@/lib/supabase`, `game_wallets`, `coin_ledger`, settle/commit RPCs, `ranking-data`,
  `achievements`, `missions`) and fails the build if any appears.

**Runnable result (this session):** `node --test` over the practice, bot-isolation, and flags
suites → **86 passed, 0 failed**. The real cash economy (`game_wallets` / `coin_ledger`) is only
reached by cash-poker and TLMN paths (`app/games/poker/actions.ts`, `app/games/tlmn/actions.ts`,
ranking/economy modules) — never by practice code.

> A practice bug cannot move a real balance: the practice path never names a wallet/ledger table
> or RPC, and the isolated project does not even contain those tables (§6).

---

## 5. Environment identity (UI must not look like production)

- `NEXT_PUBLIC_APP_ENV` = `staging` or `local` drives `components/PlaytestEnvBanner.tsx`, a fixed
  top strip reading **"INTERNAL STAGING — NOT PRODUCTION"** (amber) or **"LOCAL TEST — NOT
  PRODUCTION"** (blue). Any other value → red **"ENV UNVERIFIED"** warning (fail-closed).
- With `POKER_ALPHA_MODE=1` the existing poker **ALPHA** ribbon also renders (`app/games/poker`).
- Wire the banner in your **own** commit (kept out of this change to avoid colliding with your
  380 in-flight files):

  ```tsx
  // app/layout.tsx — inside <body>, near the top
  import { PlaytestEnvBanner } from '@/components/PlaytestEnvBanner'
  // ...
  <PlaytestEnvBanner />
  ```

---

## 6. Database setup (isolated project only)

Apply **only** the minimum schema, in the **isolated** project's SQL editor. Never run these
against production.

1. **Auth profiles** — `supabase/migration_profile_v2.sql` then
   `supabase/migration_profile_backfill_oauth.sql` (so Google login can sync a profile).
2. **Practice persistence** — `supabase/migration_poker_practice_bots.sql` (creates
   `poker_practice_games`, RLS deny-all).

**Do NOT apply** (not needed by practice; keep the economy physically absent): the cash-poker
schema (`migration_poker_core / _economy / _engine / _lifecycle / _private / _social /
_admin_ops`), TLMN/Caro, wallet/ledger, and — critically — **`migration_poker_tournament.sql`
(leave PENDING, exactly as in production).**

The app is **degrade-safe**: if a non-practice table is absent, the missing-relation error
(`42P01`) is caught and the feature reports unavailable rather than crashing.

**Seed:** none required. Tester profiles come from real Google login; practice games are created
live in-app. Use `reset.mjs` to clear practice games between sessions.

---

## 7. Manual setup checklist

Do these once. Do not paste secret values into any chat/report.

**A. Create the isolated Supabase project**
1. Supabase dashboard → **New project** (same org is fine; a distinct project = distinct URL +
   keys + Realtime + Storage). Region: `ap-northeast-1` to match latency.
2. Copy its **Project URL**, **anon key**, **service_role key** into `.env.playtest.local`
   (local) or Vercel Preview vars (staging). These MUST differ from production.

**B. Apply only the approved migrations** — run the three files in §6 in the new project's SQL
editor. Confirm `poker_practice_games` exists; confirm no `game_wallets` / `coin_ledger` table
exists.

**C. Enable Google auth on the isolated project**
1. Supabase → **Authentication → Providers → Google** → enable.
2. Google Cloud Console → **APIs & Services → Credentials** → OAuth client → **Authorized
   redirect URI:** `https://<ISOLATED_REF>.supabase.co/auth/v1/callback`.
3. Supabase → **Authentication → URL configuration** → **Site URL** = your preview/local URL;
   **Additional redirect URLs** = `<SITE_URL>/auth/callback`.

**D. Vercel preview (staging)**
1. Vercel → project `chococfko` → **Settings → Environment Variables**. Add every key from
   `.env.playtest.example` and **scope each to _Preview_ only** (uncheck Production +
   Development). This guarantees production keeps its own values.
2. Deploy a **preview** build only — e.g. `vercel` (no `--prod`) or push a non-production branch.
   **Never** `vercel --prod`.

**E. Verify the preview uses the isolated project**
1. `node --env-file=.env.playtest.local scripts/poker-playtest/health-check.mjs` → must print
   **PASS** (exit 0). On staging, confirm the Vercel Preview vars match the same values.
2. Log in with both tester accounts; confirm the banner shows **INTERNAL STAGING / LOCAL TEST**.
3. Confirm production data is absent: the isolated DB has no wallet/ledger tables and
   `poker_practice_games` starts empty.

---

## 8. Fallback: localhost (Option B)

Set `NEXT_PUBLIC_APP_ENV=local` and `NEXT_PUBLIC_SITE_URL=http://localhost:3000` in
`.env.playtest.local`, point `NEXT_PUBLIC_SUPABASE_*` at a **non-production** project (a second
Supabase project, or a local `supabase start` stack if you add the CLI — this repo currently has
no `supabase/config.toml`), apply the §6 migrations there, then `npm run dev`. Google login still
works if the local URL is registered per §7C. Everything else is identical.

---

## 9. Verification commands

```bash
# Isolation proofs (pure; no DB/network) — expect all pass
node --test lib/games/poker/practice/*.test.ts lib/games/poker/bot/isolation.test.ts
node --test lib/games/poker/flags.test.ts
node --test lib/playtest/env-guard.test.ts

# Environment audit (prints no secrets; exit 1 on any violation)
node --env-file=.env.playtest.local scripts/poker-playtest/health-check.mjs

# i18n parity (all 5 locales)
npm run i18n:check

# Reset practice games between sessions (guarded; isolated project only)
node --env-file=.env.playtest.local scripts/poker-playtest/reset.mjs
```

---

## 10. Allowlist behavior (server-enforced)

- Access = `POKER_ALPHA_MODE=1` + `POKER_ALPHA_TESTERS` (server-resolved in
  `app/games/poker/access.ts`), plus `ADMIN_EMAILS`. Both lists are set to **exactly**
  `tester-a@example.com, tester-b@example.com`.
- Enforced server-side in the poker route **layout**, the practice **page**, and **every** server
  action (`requirePractice()`), so a hand-crafted POST cannot bypass it.
- Denials (all fail closed): unauthenticated → `getCurrentUserAccess` returns anon → not visible;
  other authenticated users → not on the allowlist under alpha mode → not visible; public poker /
  tournament / cash bots → flags off / hard-off in code.

---

## 11. Feature-flag status (isolated env)

| Flag | Value | Note |
|---|---|---|
| `POKER_PRACTICE_BOTS_ENABLED` | **1** | the only enabled capability |
| `POKER_ALPHA_MODE` | **1** | restricts visibility to the allowlist |
| `POKER_ENABLED`, `_CREATE_TABLE_`, `_PUBLIC_LOBBY_`, `_PRIVATE_TABLE_`, `_SPECTATOR_` | 0 | public poker off |
| `POKER_BOT_ENABLED` | 0 | live cash bots — also hard-off in code (`flags.ts`) |
| `POKER_TOURNAMENT_ENABLED` | 0 | tournaments — also hard-off in code (`flags.ts`) |
| `POKER_CLOSED_BETA_ENABLED`, social flags | 0 | off |

Flags are fail-closed: only `1/true/on/yes` enable; unset/empty/typo = OFF (`flags.ts:88-92`).
**Production flags are unchanged.**

---

## 12. Known limitations

- The isolated Supabase project, Google provider config, and Vercel Preview vars are **manual**
  (dashboard actions Claude cannot perform). Everything else is prepared.
- The banner and (optionally) any package.json script alias are **not wired** into your files to
  avoid colliding with the 380 uncommitted files in the working tree; wire them in your own
  commit.
- Full-project `tsc`/`next build`/`next lint` were not run here because the working tree is
  mid-flight (their output would reflect in-progress work, not this change). The additive files
  pass native TS execution + their unit tests.

---

## 13. Before re-running Prompt 27F-A

1. Complete §7 A–E (isolated Supabase project, migrations, Google, Vercel Preview vars, verify).
2. `health-check.mjs` prints **PASS**.
3. Both testers can log in and see the **NOT PRODUCTION** banner.
4. Confirm `poker_practice_games` exists and no wallet/ledger tables exist in the isolated DB.
5. Then run 27F-A against the **preview/local URL** only.
