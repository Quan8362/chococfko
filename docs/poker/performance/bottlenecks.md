# Poker — Bottleneck Analysis

Static analysis of the **real** command / query / realtime paths (code + SQL as shipped), plus the
CPU microbenchmark (results.md §1). Each item is marked **fixed**, **watch** (validate on a branch),
or **ok** (verified sound). Nothing here weakens correctness for speed.

---

## Fixed in this phase

### F1 — Hand-history read grabbed an arbitrary 500 rows
`ecosystem.ts:fetchHandHistory` read `poker_hole_cards` with `.limit(500)` and **no ordering**, so a
heavy player's *recent* hands could be truncated in favour of arbitrary older ones, and the read
could not use an ordered index.
**Fix:** `.order('created_at', { ascending: false })` + new index
`poker_hole_cards_user_recent_idx (user_id, created_at DESC)`. Now bounded **and** recency-correct.
Correctness preserved (still read-own via RLS; still capped at 500).

### F2 — Lobby scan degrades as closed tables accumulate
`listLobby` filters `status <> 'closed'` + `ORDER BY created_at DESC LIMIT 100`. The existing
`(status, created_at)` index can't seek on a `!=`, and closed/historical tables bloat the scan over
time.
**Fix:** partial index `poker_tables_live_created_idx (created_at DESC) WHERE status <> 'closed'` —
keeps the lobby scan O(live tables). Chosen so it's **HOT-compatible**: `status`/`created_at` don't
change on the per-action `state_version` bump, so gameplay writes pay no index-maintenance cost.

### F3 — "Recent tables" needed a sort
`ecosystem.ts` reads `poker_table_members` by `user_id` ordered by `last_seen_at DESC`; the existing
`(user_id)` index required a sort. **Fix:** `poker_members_user_recent_idx (user_id, last_seen_at DESC)`.

All three ship in `supabase/migration_poker_perf_indexes.sql` (additive, idempotent, PENDING apply).

---

## Watch — validate on a throwaway branch before scaling

### W1 — Supabase Realtime `postgres_changes` fan-out **(primary ceiling)**
Each committed action UPDATEs `poker_hands` + `poker_seats` and bumps `poker_tables.state_version`
(twice). Every such change is delivered to all subscribers of that table's channel. The preflight
estimate for the `target` profile is **≈ 7,000 realtime messages/s** system-wide. Supabase Realtime
evaluates `postgres_changes` filters per subscription and has a documented throughput ceiling that
depends on plan/compute size.
**Actions:** (a) measure delivery delay + drops on a branch at `moderate` → `target`;
(b) if it saturates, options that preserve correctness — reduce redundant writes (the double
`poker_tables` version bump per action can become a single bump; see W4), coalesce per-seat updates,
or move to a **Broadcast**-based fan-out (server publishes one compact snapshot-changed event per
action instead of relying on N table-level `postgres_changes` rows). Clients already re-read
authoritative state on any signal, so the notification payload can shrink to a single event.

### W2 — Vercel serverless function concurrency + cold starts
Every action is a server-action invocation. At est. peak ~480 action RPS (target) plus reads, the
function concurrency and p99 latency (incl. cold starts) must be checked against the Vercel plan.
**Actions:** confirm region colocation with the Supabase project (avoid cross-region RTT on every
RPC); watch concurrency limits; consider `maxDuration`/warm strategies for the action route.

### W3 — DB connection usage under serverless fan-out
Many concurrent server-action invocations each open a Postgres connection. **Action:** ensure the
Supabase **pooler (PgBouncer, transaction mode)** is used for the app's connections; watch
`connection usage` and lock-wait on the per-table row locks during the `settlement` profile.

### W4 — Double `state_version` bump per action
`poker_commit_action` bumps `poker_hands.state_version` **and** `poker_tables.state_version`, and
several paths update `poker_tables` twice. Functionally correct, but it doubles the realtime deltas
and write amplification on the hottest row. **Action (post-measurement, only if W1 saturates):**
collapse to a single authoritative version bump per action; keep monotonicity guarantees.

### W5 — Turn-timer ticking (`tickActionTimer`)
Server-authoritative turn deadlines are enforced when a client calls the tick path. At 600 seated
players the tick cadence and its snapshot reads add steady read RPS. **Action:** confirm ticks are
demand-driven (only the acting table, only near the deadline), not a global poll.

---

## OK — verified sound (no change needed)

- **O1 Lobby has no N+1.** `listLobby` fetches tables once, then all seats in one
  `.in('table_id', ids)` query and aggregates in memory. ✅
- **O2 Realtime is correctly scoped**, not overbroad: per-table channel, filtered subscriptions,
  and the engine blob (`poker_hand_state`) + hole cards are deliberately **not** in the realtime
  publication and have no client policy. ✅
- **O3 Commit path is atomic, idempotent, conservation-checked.** CAS on `action_seq`, idempotency
  key on `poker_actions`, per-seat `stack+committed` invariant in-RPC. Duplicate/stale/refresh
  commands can't double-apply. ✅
- **O4 Different tables don't contend.** Row locks are table-scoped; cross-table actions run in
  parallel. Same-table actions serialize correctly (one actor at a time). ✅
- **O5 Hot-write tables are indexed for their lookups:** `poker_seats(table_id)`,
  `poker_hands(table_id, hand_no DESC)`, `poker_actions(hand_id, action_seq)` + unique idempotency,
  `poker_hole_cards(user_id, hand_id)`, settlements/hand_state keyed by `hand_id` PK. ✅
- **O6 Pure-engine CPU is negligible** at target (results.md §1): ~0.24 ms per full 6-handed hand;
  system-wide engine CPU < 2 ms/s at target hand rate. ✅
- **O7 No oversized realtime payloads / no hole cards on the wire.** Broadcasts carry public
  columns only; snapshot privacy is asserted (`assertSnapshotPrivacy`). ✅
- **O8 Bounded reads elsewhere:** lobby `limit(100)`, history `limit(25)`, ranking aggregate
  `limit(2000)` (service-role admin/analytics path, not per-user hot path). ✅

---

## Priority order for the live run

1. **W1 Realtime fan-out** — the make-or-break ceiling; measure first.
2. **W2 function concurrency** + **W3 connections/pooler** — measure together under `settlement`.
3. **W5 timer cadence** — confirm demand-driven under `target`.
4. **W4 version-bump collapse** — only if W1 needs headroom.
