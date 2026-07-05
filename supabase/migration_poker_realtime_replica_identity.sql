-- ── Poker realtime: REPLICA IDENTITY FULL on filtered tables ──────────────────
-- APPLIED to prod (kjfnqbzfhymhfodmgyow) 2026-07-05 via Supabase migration
-- `poker_realtime_replica_identity_full`. This file mirrors that change for repo
-- tracking.
--
-- Bug: waiting players only saw hand progression after a manual hard refresh —
-- realtime UPDATE events never reached them. usePokerRealtime subscribes to
-- postgres_changes on poker_hands / poker_seats with a filter on `table_id`
-- (a NON-primary-key column). Supabase Realtime can only evaluate UPDATE/DELETE
-- filters against columns present in the table's REPLICA IDENTITY. With the
-- default identity (primary key `id` only), the `table_id` filter matched INSERT
-- but was silently DROPPED for every UPDATE (bets, street/turn changes) — so the
-- non-acting client never got notified and the 12s watchdog was the only path.
--
-- Contrast: Caro filters on its PK `id`, so it correctly keeps DEFAULT replica
-- identity (see migration_caro_realtime_sync.sql). Poker filters by table_id,
-- so it needs FULL.
--
-- Cost: FULL logs the full OLD row to WAL on each UPDATE. Negligible at table
-- volume; the correctness win is required for realtime multiplayer.
--
-- Rollback: ALTER TABLE ... REPLICA IDENTITY DEFAULT; (restores PK-only identity,
-- reintroducing the dropped-UPDATE bug).

ALTER TABLE public.poker_hands REPLICA IDENTITY FULL;
ALTER TABLE public.poker_seats REPLICA IDENTITY FULL;

-- poker_tables is intentionally left DEFAULT: the client filters it on `id`
-- (the primary key), so UPDATE filter matching already works.

NOTIFY pgrst, 'reload schema';

-- ── Verification ──────────────────────────────────────────────────────────────
-- Expect poker_hands & poker_seats = 'f' (full), poker_tables = 'd' (default):
--   SELECT c.relname, c.relreplident
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--     AND c.relname IN ('poker_hands','poker_seats','poker_tables');
