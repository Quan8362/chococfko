-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — PERFORMANCE: read-path indexes (additive, non-destructive, idempotent)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Derived from the load-test static analysis (docs/poker/performance/bottlenecks.md). Each
-- index below directly serves a hot READ predicate identified in the code and is chosen so it
-- does NOT slow the per-action authoritative write path:
--
--   • poker_tables is UPDATEd twice per action (state_version bumps). None of the indexed
--     columns here (created_at, status) change on those bumps, so the update stays HOT-eligible
--     and pays no index-maintenance cost for gameplay. The index only re-maintains on the rare
--     status transition (open→closing→closed).
--   • poker_hole_cards / poker_table_members are written at hand-start / join cadence (NOT per
--     action), so their extra index is cheap.
--
-- Apply AFTER the poker core/private/economy/engine migrations. Strictly additive. Touches NO
-- existing TLMN/Caro/wallet object. Safe to run multiple times.
--
-- NOTE on live data: poker currently ships DARK (POKER_ENABLED=false, no real rows), so plain
-- CREATE INDEX is fine here. If this is ever applied to a table with significant live rows,
-- prefer running each statement as CREATE INDEX CONCURRENTLY (outside a transaction) to avoid a
-- write lock. The IF NOT EXISTS guard makes either path idempotent.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Hand-history recency (fetchHandHistory) ───────────────────────────────────────────
-- ecosystem.ts reads the caller's OWN hole-card rows to learn which hands they were dealt into,
-- then orders the matching hands by recency. The existing (user_id, hand_id) index answers the
-- membership lookup but not "most recent first", forcing an arbitrary 500-row grab. This index
-- lets the read be bounded + recency-ordered (paired with the ORDER BY created_at code change).
CREATE INDEX IF NOT EXISTS poker_hole_cards_user_recent_idx
  ON public.poker_hole_cards (user_id, created_at DESC);

-- ── 2. Lobby listing at scale (listLobby / lobby viewers) ───────────────────────────────
-- listLobby filters `status <> 'closed'` and orders by created_at DESC (limit 100). A partial
-- index over only the LIVE tables keeps the lobby scan O(live tables) even as closed/historical
-- tables accumulate, and — because status is excluded from the predicate columns that change on
-- a state_version bump — it never touches the gameplay write path.
CREATE INDEX IF NOT EXISTS poker_tables_live_created_idx
  ON public.poker_tables (created_at DESC)
  WHERE status <> 'closed';

-- ── 3. "Recent tables" for a player (ecosystem recent list) ──────────────────────────────
-- ecosystem.ts reads poker_table_members by user_id ordered by last_seen_at DESC. The existing
-- (user_id) index needs a sort; this composite serves the order-by directly.
CREATE INDEX IF NOT EXISTS poker_members_user_recent_idx
  ON public.poker_table_members (user_id, last_seen_at DESC);

-- ── verify (optional, run manually) ─────────────────────────────────────────────────────
-- SELECT indexname FROM pg_indexes
--   WHERE schemaname='public'
--     AND indexname IN ('poker_hole_cards_user_recent_idx','poker_tables_live_created_idx','poker_members_user_recent_idx');
