# Poker Preflight Audit — Chợ Cóc FKO

**Date:** 2026-06-30
**Scope:** Read-only audit of the existing repository to determine the safest architecture for a professional realtime **No-Limit Texas Hold'em** game. **No Poker code, migrations, UI, or rules were written.** Nothing was committed, pushed, or deployed.

**Repository facts**
- Repo root **and** Next.js app root: `web/` (`web/.git`, remote `https://github.com/Quan8362/chococfko.git`, branch `main`). This is the only path to production (`chococfko.com`, Vercel project `chococfko`).
- Working tree at audit time: clean except three **untracked** files — `public/pocker_desktop.webp`, `public/pocker_mobile.webp`, `public/pocker_tablet.webp` (see [05 asset detail below](#poker-table-asset-audit)).
- Stack confirmed from [package.json](../../package.json): Next.js `^14.2.35` (App Router), React `18.3`, TypeScript `5.6`, `@supabase/ssr ^0.5.2` + `@supabase/supabase-js ^2.45.4`, `next-intl ^4.13`, `framer-motion ^12`. Tests via `node --test`; e2e via Playwright. Tailwind.

---

## 1. Executive summary

The codebase **already contains a production-grade, server-authoritative, hidden-information card-game stack** in Tiến Lên Miền Nam (TLMN). Texas Hold'em is structurally the same problem class as TLMN (seated multiplayer, private cards, turn order, server-settled coin deltas, realtime fan-out, AFK/reconnect resilience) **plus** betting rounds, a pot, side-pots, and a community board. **The single most important finding: Poker should be built as a sibling of TLMN, reusing its proven security spine (service-role writes + RLS-private hands + SECURITY DEFINER coin RPCs + idempotent settlement) and explicitly NOT reusing the looser parts (broad `authenticated` write RLS on `tlmn_rooms`/`tlmn_seats`).**

There is one realtime weakness to design around (see §6): the live game tables are kept in sync by **client-nudged polling + reconcile-on-resubscribe**, not by a hardened recovery watchdog on the game-state table. Caro already solved this (recovery watchdog + monotonic `state_version`); Poker must adopt the Caro-grade pattern, not the TLMN-grade one, because money-bearing betting cannot tolerate a "you acted but I never saw it" gap.

---

## 2. What was inspected (evidence index)

| Area | Files / objects inspected |
| --- | --- |
| Supabase clients | [lib/supabase/client.ts](../../lib/supabase/client.ts) (browser singleton), [server.ts](../../lib/supabase/server.ts) (cookie/anon SSR), [admin.ts](../../lib/supabase/admin.ts) (service-role + `checkIsAdmin`), [public.ts](../../lib/supabase/public.ts) (cookie-free anon) |
| Identity / profiles | [lib/userIdentity.ts](../../lib/userIdentity.ts), `profiles` table (`display_name`, `avatar_url`), [lib/syncProfile.ts](../../lib/syncProfile.ts), `lib/games/tlmn/avatar.ts` |
| Coin economy | [lib/game/economy.ts](../../lib/game/economy.ts) (integer constants + formatters), [app/games/tlmn/wallet.ts](../../app/games/tlmn/wallet.ts), [supabase/migration_tlmn_run7_economy.sql](../../supabase/migration_tlmn_run7_economy.sql) (`game_wallets`, `coin_ledger`, `round_settlements`, `ensure_wallet`/`get_wallet`/`claim_daily_coins`/`settle_round`) |
| Card-game engine | [lib/games/tlmn/engine.ts](../../lib/games/tlmn/engine.ts) (794 lines, pure), `round.ts`, `bot.ts`, `lifecycle.ts`, `interactions.ts`, plus `engine.test.ts`/`round.test.ts`/`qa-acceptance.test.ts` |
| Server actions / table state | [app/games/tlmn/actions.ts](../../app/games/tlmn/actions.ts) (≈1.5k lines) — `playCards`, `passTurn`, `tickTurnTimer`, `runBotTurn`, `reapAbandonedGames`, `fetchMyHand`, `settle_round` invocation |
| Game state schema | [migration_tlmn.sql](../../supabase/migration_tlmn.sql) (rooms/seats), [migration_tlmn_phase3.sql](../../supabase/migration_tlmn_phase3.sql) (`tlmn_games` public + `tlmn_hands` RLS-private) |
| Realtime client | [app/games/tlmn/[roomCode]/TlmnRoom.tsx](../../app/games/tlmn/[roomCode]/TlmnRoom.tsx) (channel/subscribe/reconcile/connState), Caro `CaroGame.tsx` (recovery watchdog + `state_version`) |
| Game registration / routing | [app/games/page.tsx](../../app/games/page.tsx) (`GAMES[]` registry, i18n ns), locale via `next-intl`, `messages/{en,ja,ko,vi,zh}.json` |
| Cron / reapers | [vercel.json](../../vercel.json) (`/api/cron/tlmn-maintenance` every minute) |
| Tooling | `package.json` scripts: `build`, `lint`, `typecheck`, `test`, `i18n:check`, `test:e2e:tlmn` |
| Assets | `public/pocker_*.webp` (dimensions, bytes, references) |

---

## 3. Next.js application structure

- **App Router**, single locale handled by `next-intl` (cookie-driven locale, 5 locales: `en/ja/ko/vi/zh`). Public routes are English slugs (`/games`, `/community`, `/places`, `/japanese`). There is **no `[locale]` path segment** — locale is a cookie, which forces some routes dynamic. Poker lives under `/games/poker` to match the existing `/games/{tlmn,caro,chinese-chess,...}` convention.
- **Game registry**: [app/games/page.tsx](../../app/games/page.tsx) defines a `GAMES: { id, href, ns, tone, meta, players, accent, iconBg, glow }[]` array (line ~167) plus an `ICONS` record. Adding Poker = one registry row + one SVG icon + one i18n namespace block per locale. Low risk, additive.
- **Per-game folder shape (TLMN, the template to copy):**
  - `app/games/tlmn/page.tsx` — server entry (lobby).
  - `app/games/tlmn/actions.ts` — all `'use server'` actions (authoritative writes).
  - `app/games/tlmn/[roomCode]/` — room/table client components (`TlmnRoom.tsx`, `TlmnTable.tsx`, `TlmnCard.tsx`, `useTlmnSound.ts`, `useTlmnInteractions.ts`).
  - `lib/games/tlmn/` — pure engine + bots + sim/AI (no React, no Supabase) — fully unit-tested.
  - `supabase/migration_tlmn_*.sql` — schema, applied manually.

**Reuse verdict:** routing, registry, locale, and the folder template are all directly reusable. Poker mirrors this shape.

---

## 4. Supabase / data-access layer

Four client factories, each with a clear role — **this separation is the backbone of the security model and Poker must respect it exactly**:

| Factory | Role | Auth | Use for Poker |
| --- | --- | --- | --- |
| `lib/supabase/client.ts` → `createClient()` | Browser singleton (one instance to avoid JWT-refresh races that kill realtime) | anon + user cookie | Realtime subscriptions + **RLS-guarded reads of own hole cards only** |
| `lib/supabase/server.ts` → `createClient()` | SSR/`'use server'` cookie client | anon as the signed-in user (`auth.uid()`) | Resolve caller identity (`auth.getUser()`), call **player-facing** SECURITY DEFINER RPCs |
| `lib/supabase/admin.ts` → `createAdminClient()` | Service role, **bypasses RLS** | service role | All **authoritative game-state writes** + trusted `settle_*` RPCs. Never imported into a Client Component. |
| `lib/supabase/public.ts` → `createPublicClient()` | Cookie-free anon, cache-safe | anon | Public lobby lists inside `unstable_cache` (not needed for live tables) |

`createAdminClient()` reads `SUPABASE_SERVICE_ROLE_KEY` (server-only env). **Confirmed: service-role is never referenced from browser code** (no `pocker`/`poker` references exist anywhere yet; service-role is only imported in `'use server'` modules and admin routes). Admin gating is email-allowlist via `ADMIN_EMAILS` + `checkIsAdmin()`.

---

## 5. Authentication & identity

- Supabase Auth (email + OAuth). Session persistence is hardened (see memory `auth-session-persistence`, `oauth-callback-i18n`): middleware lets `@supabase/ssr` own cookie rotation; `AuthSync.tsx` handles mobile/BFCache resume + cross-tab sync.
- **Authoritative identity = `auth.uid()`** server-side via `supabase.auth.getUser()`. Every TLMN action begins with this and **never trusts a client-supplied user id**. Poker must do the same — the browser only ever sends *intent* (`{ roomId, action }`), never *who it is*.
- Display name/avatar resolved by `getUserIdentity(id)` ([lib/userIdentity.ts](../../lib/userIdentity.ts)): prefers `profiles`, falls back to `auth.users` metadata, then email local-part. TLMN additionally hydrates avatars **live** from `profiles` at read time and treats `seats.avatar_url` as display-only (memory `tlmn-avatar-fix`). Poker reuses `getUserIdentity` + `UserAvatar` directly.

**Reuse verdict:** auth + identity are fully reusable as-is.

---

## 6. Realtime audit — traced end to end (TLMN `playCards`)

1. **User presses Play** → client calls server action `playCards(roomId, cards)` ([actions.ts:1363](../../app/games/tlmn/actions.ts)).
2. **Server validates** (all server-side, service-role for reads of state): `auth.getUser()` → `seatIndexOf` → `latestGame(onlyPlaying)` → `turn_seat === mySeat` → `isExpired(turn_deadline)` → load hands → pure engine `applyPlay` → `if (!res.ok) return error`.
3. **DB updated** via service role: `commitRound` writes `tlmn_games` (public counts + new `turn_deadline`/`turn_started_at`) and `tlmn_hands` (private). A finished round calls `settle_round` RPC (idempotent).
4. **Realtime emitted**: `tlmn_games` row change is published over `supabase_realtime` (`postgres_changes`). `tlmn_hands` is **deliberately not published**.
5. **Opponent receives** the `tlmn_games` change on the per-room channel `tlmn:${roomId}` and **re-fetches its own hand** via `fetchMyHand` (anon client, RLS) — so opponents' cards never traverse the wire.
6. **Refresh/reconnect**: on every `SUBSCRIBED` the client reconciles via a fresh `fetchGameState`; `connState` UX shows connecting/connected/reconnecting.

**The weakness (must design around for Poker):** TLMN's live-table sync leans on **client-nudged polling** (`tickTurnTimer`/`runBotTurn` nudges double as a heartbeat) and **reconcile-only-on-resubscribe**. There is no continuous recovery watchdog or monotonic version guard on the game-state row at the table level. The memory record `caro-realtime-sync` documents the exact failure mode this risks — *"opponent doesn't see move until refresh"* — and its fix: a **recovery watchdog (12s + visibility/online) + monotonic `state_version` + `setAuth` on token refresh + malformed-state refetch**, plus `caro-secure-moves` (a single `caro_make_move` SECURITY DEFINER RPC with row-lock and `REVOKE` of direct writes). **Poker must be built on the Caro-grade realtime+RPC pattern from day one** — betting cannot tolerate a missed update or a tampered write.

---

## 7. Coin-integrity audit

The economy spine ([migration_tlmn_run7_economy.sql](../../supabase/migration_tlmn_run7_economy.sql) + [lib/game/economy.ts](../../lib/game/economy.ts)) is **excellent and directly reusable**:

- **Integer-only** `bigint` balances; `CHECK (balance >= 0)`; no floats anywhere. ✅ matches Poker rule "integer coins only".
- **Server-authoritative**: all mutations live in `SECURITY DEFINER` functions; **no client INSERT/UPDATE/DELETE policy** on `game_wallets`/`coin_ledger` → only the definer functions can mutate.
- **Idempotent settlement**: `round_settlements (game_code, round_number)` PK settles each round **exactly once**; `INSERT ... ON CONFLICT DO NOTHING` + `IF NOT FOUND RETURN settled:false` makes reconnects/retries safe.
- **Atomic + race-safe**: `SELECT ... FOR UPDATE` per wallet, deterministic lock order by `user_id` to avoid deadlocks.
- **Append-only audit trail**: `coin_ledger` writes one row per delta with `balance_after`.
- **Least privilege**: `settle_round` is `REVOKE`d from `anon`/`authenticated` and `GRANT`ed only to `service_role`. Player-facing RPCs (`ensure_wallet`/`get_wallet`/`claim_daily_coins`) operate strictly on `auth.uid()`.
- **Entry gate**: `ENTRY_MIN_BALANCE = 10_000` enforced before joining.

**The shared wallet is the right substrate for Poker.** Poker introduces concepts TLMN lacks — **buy-in / stack escrow** (coins move wallet→table on sit-down and table→wallet on stand-up) and **pot/side-pot settlement** — which require **new Poker-specific SECURITY DEFINER RPCs** that debit/credit `game_wallets` and write `coin_ledger`, reusing the same locking + idempotency discipline. The existing `settle_round` is TLMN-shaped (card-point × `COIN_PER_POINT`) and **must not** be reused for Poker; Poker needs its own `poker_settle_hand`-style function keyed on a hand id.

---

## 8. Private-card audit

The **hidden-hand model is the crown jewel and maps 1:1 to Poker hole cards** ([migration_tlmn_phase3.sql](../../supabase/migration_tlmn_phase3.sql)):

- `tlmn_games` (public): carries only **card counts**, never cards → `FOR SELECT USING (true)` + published to realtime.
- `tlmn_hands` (private): `FOR SELECT USING (seat owner = auth.uid())`, **no write policy** (service-role only), and **not in the realtime publication**. Clients re-fetch their own hand with the anon client after each public update.
- Net effect: *"the network payload can never contain an opponent's cards even if the server is wrong"* (comment in `fetchMyHand`).

**Poker private state is strictly larger than TLMN's** and demands the same posture, extended:
- **Hole cards** → `poker_hole_cards`-style table, RLS read-own, never published.
- **The deck / burn cards / undealt stub** → must live in a **server-only** table (no SELECT policy at all, service-role only) so no client can read future board cards.
- **Community board** (flop/turn/river) → public, but **only revealed cards** are ever written to the public row; the engine must never leak un-turned cards into the public payload.
- **Showdown** → reveal logic runs server-side; only at showdown are the necessary hole cards copied into a public reveal field.

Risk: any accidental inclusion of hole cards / deck in a public `select('*')`, a broadcast, a spectator payload, a log, or an analytics event is a catastrophic cheat vector. This is the #1 security focus of the build (see [04-risk-register](04-risk-register.md)).

---

## 9. Other reusable subsystems (brief)

- **Engine pattern**: TLMN's pure, fully-unit-tested engine in `lib/games/tlmn/` (no React/Supabase imports) is the template — Poker gets `lib/games/poker/` with a pure NLHE engine (hand evaluator, betting state machine, pot/side-pot math) tested with `node --test`.
- **Bots/AI**: TLMN has a mature bot + headless sim/optimizer (`lib/games/tlmn/{ai,sim}`). Architecture is reusable as a template; Poker bot logic is new.
- **Turn timer**: `turn_deadline` + `turn_started_at` (authoritative base) + `GRACE_MS` + client-nudged `tickTurnTimer`; reusable concept, Poker adds "fold on timeout" + optional auto-check.
- **Abandoned-game reaper**: `reapAbandonedGames` + `/api/cron/tlmn-maintenance` (every minute) + lobby-load nudge (memory `tlmn-abandoned-match-reaper`). Poker needs its own reaper that **refunds/settles escrowed stacks safely** when a table is abandoned mid-hand.
- **Social layer**: TLMN chat/emote/throwables via transient `tlmn-fx:` broadcast (memory `tlmn-interactions`) — optional reuse for Poker.
- **Card UI/sound**: `TlmnCard.tsx` (CSS cards, 359 lines) + `useTlmnSound.ts` (module-level singleton AudioContext) are reusable references; Poker likely wants its own card faces but the sound singleton pattern should be copied verbatim (memory `tlmn-mobile-layout-sound`).
- **Leaderboard / stats / achievements**: TLMN has `recordRoundStats` + achievements/coin-tier badges (`lib/games/coinTier.ts`, memory `tlmn-achievements-leaderboard`). The coin-tier badge is shared and reusable; Poker stats are new.

---

## 10. Tooling / quality gates

From `package.json`:
- `npm run build` (`next build`), `npm run lint` (`next lint`), `npm run typecheck` (`tsc --noEmit --skipLibCheck`), `npm test` (`node --test "lib/**/*.test.ts"`), `npm run i18n:check`.
- e2e: Playwright (`test:e2e:tlmn` — realtime + responsive projects). A `e2e/poker/` suite should mirror `e2e/tlmn/`.
- **Known environmental hazard** (memory `tlmn-audit-harden`): a full `next build` has crashed in a Windows ESLint worker — an environment quirk, not a code defect. Prefer `npm run typecheck` + targeted `node --test` for fast Poker iteration; treat a Windows `next build` crash as suspect-environment until reproduced in CI.
- ESLint ignores `supabase/`, `scripts/`, `public/` — migrations are not linted (so SQL correctness is on us + manual review).

---

## 11. Poker table asset audit

Inspected `public/pocker_*.webp` (untracked, per `git status`):

| File | Format | Dimensions | Aspect | Size | Intended role |
| --- | --- | --- | --- | --- | --- |
| `pocker_desktop.webp` | WebP (VP8 lossy) | **1672 × 941** | ≈16:9 (1.777) | 95,534 B (≈93 KB) | Desktop landscape table |
| `pocker_tablet.webp` | WebP (VP8 lossy) | **1448 × 1086** | 4:3 (1.333) | 84,624 B (≈83 KB) | Tablet landscape table |
| `pocker_mobile.webp` | WebP (VP8 lossy) | **1672 × 941** | ≈16:9 (1.777) | 85,396 B (≈83 KB) | Mobile **landscape** table |

Findings:
- **Misspelling confirmed:** the prefix is `pocker` (should be `poker`).
- **No code references** any of the three files (verified across `app/`, `lib/`, `components/` — zero `poker`/`pocker` matches). They are orphan assets.
- **Untracked in git** — not yet part of any commit.
- **Mobile dimensions equal desktop (1672×941, 16:9)** → the mobile table is **landscape-oriented**, consistent with the TLMN seat-positioning lessons (memory `tlmn-seat-positioning`: iPhone-landscape seat anchoring, PWA banner/toolbar collisions). Poker on mobile should likewise be landscape-locked.
- **Safe to rename** to `poker-desktop.webp` / `poker-tablet.webp` / `poker-mobile.webp`: nothing references the old names, they're untracked, and the new kebab-case names match the repo's asset conventions. **Recommendation only — no rename performed in this phase.** Do the rename in the first Poker implementation phase, together with the code that first references them, so the reference and the file land in the same change.

---

## 12. Go/No-go

**GO**, with a fixed architecture: build Poker as a TLMN sibling, inheriting the security spine (service-role writes, RLS-private hands, SECURITY DEFINER coin RPCs, idempotent settlement) and the Caro-grade realtime hardening (recovery watchdog + monotonic version + secure-move RPC), and adding Poker-only primitives (betting state machine, pot/side-pots, stack escrow, deck secrecy). See [02-reuse-matrix](02-reuse-matrix.md), [03-implementation-roadmap](03-implementation-roadmap.md), [04-risk-register](04-risk-register.md).
