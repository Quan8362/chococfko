-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — TOURNAMENT REALTIME + PRIVATE-STATE SEAL (live-table sync, E3A-3C)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Strictly ADDITIVE + IDEMPOTENT. Enables Supabase Realtime for the internal-alpha live
-- tournament table AND closes a private-state hole that only becomes reachable once real hands
-- are dealt (E3A-3C). Two concerns:
--
-- 1. PRIVATE-STATE SEAL (the important one). A hand's hole cards are DETERMINISTICALLY derivable
--    from a shuffle seed. That seed lives in two client-reachable places from earlier phases:
--      • poker_tournaments.seed        (per-hand seed = f(tournament seed, table, hand#))
--      • poker_tournament_hands.state  (the per-hand engine config, incl. the mixed seed)
--    While the surface was dark this was moot (no hands ever ran). Before ANY live hand it MUST be
--    sealed, or any authenticated client could compute every opponent's cards. This migration:
--      • REVOKEs column SELECT on poker_tournaments.seed from anon/authenticated (server reads it
--        via the service role only), and
--      • removes public read of poker_tournament_hands entirely (server-only; the browser gets a
--        redacted viewer-safe projection via the server action, never the raw seed-bearing row).
--
-- 2. REALTIME. Supabase realtime broadcasts EVERY column of a changed row to any subscriber that
--    passes the row's RLS SELECT — it does NOT honour column-level privileges. So a table carrying
--    a secret can NEVER be published. We therefore publish ONLY non-secret tables
--    (poker_tournament_seats, poker_tournament_entries) plus a new NON-SECRET per-table pointer
--    (poker_tournament_table_state) whose version bumps on every action / hand / level / status
--    change. Realtime is NOTIFICATION-ONLY: a bump makes the client re-fetch the viewer-safe
--    snapshot from the server. The seed-bearing tables are deliberately NOT published.
--    REPLICA IDENTITY FULL is set on published tables so FILTERED (tournament_id) UPDATE/DELETE
--    events also match — the same fix already shipped for cash poker.
--
-- WALLET ISOLATION preserved: nothing here writes game_wallets / coin_ledger.
-- Apply AFTER migration_poker_tournament.sql + migration_poker_tournament_orchestration.sql.
-- Rollback: migration_poker_tournament_realtime_rollback.sql. Local-validated before any prod
-- apply; prod apply is a separate controlled phase (never reapplied blindly).
-- ════════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 1. Seal the seed leaks ──────────────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════════════════════════
-- 1a. The tournament seed is server-only. In Postgres a column privilege is the UNION of the
--     table-level and column-level grants, so a bare `REVOKE SELECT (seed)` is a no-op while the
--     table-level SELECT still confers it. The correct seal is: revoke the whole-table SELECT, then
--     re-GRANT SELECT on the explicit non-seed column list. The rest of the row stays public
--     (lobby/standings); `seed` becomes unreadable by clients (server reads it via the service role).
REVOKE SELECT ON public.poker_tournaments FROM anon, authenticated;
GRANT SELECT (
  id, title, state, entry_fee, starting_stack, min_entries, max_entries, seats_per_table,
  guaranteed_prize_pool, config, scheduled_at, started_at, paused_ms, paused_from_state,
  completed_at, cancelled_at, created_by, created_at, current_level_index, level_started_at
) ON public.poker_tournaments TO anon, authenticated;

-- 1b. The per-hand engine state (seed + action log) is server-only. Drop the public read policy and
--     revoke table SELECT: the browser NEVER reads a raw hand row — it receives the redacted
--     viewer-safe projection (board + own cards only) from the server action. The service role
--     (SECURITY DEFINER / admin client) bypasses RLS and still reads it.
DROP POLICY IF EXISTS "hands public read" ON public.poker_tournament_hands;
REVOKE SELECT ON public.poker_tournament_hands FROM anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 2. Non-secret per-table realtime pointer ────────────────────────────────────────────
-- One row per live table. Carries ONLY non-secret data: a monotonically bumping `version`, the
-- current hand number, and a mirror of the tournament state + blind level (so a single
-- subscription surfaces per-action, hand-start, blind-level and status changes). NEVER holds a
-- seed, hole card, deck, or pot detail. The client reacts to a version bump by re-fetching the
-- viewer-safe snapshot; the pointer's own contents are only a notification hint.
-- ════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.poker_tournament_table_state (
  tournament_id    uuid NOT NULL REFERENCES public.poker_tournaments(id) ON DELETE CASCADE,
  table_no         int  NOT NULL,
  version          bigint NOT NULL DEFAULT 0,
  hand_no          int  NOT NULL DEFAULT 0,
  tournament_state text,
  level_index      int  NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, table_no)
);

ALTER TABLE public.poker_tournament_table_state ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.poker_tournament_table_state FROM anon, authenticated;
DROP POLICY IF EXISTS "table_state public read" ON public.poker_tournament_table_state;
CREATE POLICY "table_state public read" ON public.poker_tournament_table_state FOR SELECT USING (true);

-- Service-role-only DEFINER bump. Increments version and refreshes the non-secret mirror. Called by
-- the server after every viewer-visible change (hand open, action, settlement, level, status).
CREATE OR REPLACE FUNCTION public.poker_tournament_touch_table(
  p_tournament_id uuid, p_table_no int, p_hand_no int, p_state text, p_level int
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v bigint;
BEGIN
  INSERT INTO public.poker_tournament_table_state
    (tournament_id, table_no, version, hand_no, tournament_state, level_index, updated_at)
    VALUES (p_tournament_id, p_table_no, 1, COALESCE(p_hand_no, 0), p_state, COALESCE(p_level, 0), now())
  ON CONFLICT (tournament_id, table_no) DO UPDATE
    SET version = public.poker_tournament_table_state.version + 1,
        hand_no = GREATEST(public.poker_tournament_table_state.hand_no, COALESCE(EXCLUDED.hand_no, 0)),
        tournament_state = COALESCE(EXCLUDED.tournament_state, public.poker_tournament_table_state.tournament_state),
        level_index = COALESCE(EXCLUDED.level_index, public.poker_tournament_table_state.level_index),
        updated_at = now()
  RETURNING version INTO v;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.poker_tournament_touch_table(uuid, int, int, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poker_tournament_touch_table(uuid, int, int, text, int) TO service_role;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 3. Publish ONLY the non-secret tables to realtime ──────────────────────────────────
-- (Deliberately NOT poker_tournaments / poker_tournament_hands — they carry the seed.)
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'poker_tournament_seats',
    'poker_tournament_entries',
    'poker_tournament_table_state'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- REPLICA IDENTITY FULL so a filtered (tournament_id) subscription also matches UPDATE/DELETE.
ALTER TABLE public.poker_tournament_seats       REPLICA IDENTITY FULL;
ALTER TABLE public.poker_tournament_entries     REPLICA IDENTITY FULL;
ALTER TABLE public.poker_tournament_table_state REPLICA IDENTITY FULL;

-- ════════════════════════════════════════════════════════════════════════════════════
-- Done. Live table subscribes to poker_tournament_table_state / _seats / _entries (all non-secret);
-- the seed-bearing tournament + hand rows are server-only and never traverse realtime.
-- ════════════════════════════════════════════════════════════════════════════════════
