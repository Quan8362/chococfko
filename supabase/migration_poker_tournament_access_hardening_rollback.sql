-- ════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — migration_poker_tournament_access_hardening.sql (27G-G1A)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Restores the PRIOR access posture (public-read policies + anon SELECT grants) exactly as
-- shipped by migration_poker_tournament.sql / _orchestration.sql / _realtime.sql. Reverses
-- only the policy/grant/search_path changes; touches NO data and NO tournament rows.
-- Reviewed rollback per repo convention. Non-destructive.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Restore the original `USING (true)` public-read policies ───────────────────────────
DROP POLICY IF EXISTS "tournaments member read" ON public.poker_tournaments;
CREATE POLICY "tournaments public read" ON public.poker_tournaments        FOR SELECT USING (true);

DROP POLICY IF EXISTS "entries member read" ON public.poker_tournament_entries;
CREATE POLICY "entries public read"     ON public.poker_tournament_entries FOR SELECT USING (true);

DROP POLICY IF EXISTS "seats member read" ON public.poker_tournament_seats;
CREATE POLICY "seats public read"       ON public.poker_tournament_seats   FOR SELECT USING (true);

DROP POLICY IF EXISTS "moves member read" ON public.poker_tournament_moves;
CREATE POLICY "moves public read"       ON public.poker_tournament_moves   FOR SELECT USING (true);

DROP POLICY IF EXISTS "payouts member read" ON public.poker_tournament_payouts;
CREATE POLICY "payouts public read"     ON public.poker_tournament_payouts FOR SELECT USING (true);

DROP POLICY IF EXISTS "table_state member read" ON public.poker_tournament_table_state;
CREATE POLICY "table_state public read" ON public.poker_tournament_table_state FOR SELECT USING (true);

-- ── 2. Restore anon SELECT grants (poker_tournaments keeps the non-seed column list from
--       migration_poker_tournament_realtime.sql; the seed column stays sealed either way) ──
GRANT SELECT (
  id, title, state, entry_fee, starting_stack, min_entries, max_entries, seats_per_table,
  guaranteed_prize_pool, config, scheduled_at, started_at, paused_ms, paused_from_state,
  completed_at, cancelled_at, created_by, created_at, current_level_index, level_started_at
) ON public.poker_tournaments TO anon;
GRANT SELECT ON public.poker_tournament_entries     TO anon;
GRANT SELECT ON public.poker_tournament_seats       TO anon;
GRANT SELECT ON public.poker_tournament_moves       TO anon;
GRANT SELECT ON public.poker_tournament_payouts     TO anon;
GRANT SELECT ON public.poker_tournament_table_state TO anon;
GRANT EXECUTE ON FUNCTION public.poker_tournament_prize_pool(uuid) TO anon;

-- ── 3. Drop the membership helper (no longer referenced once policies are public-read) ────
DROP FUNCTION IF EXISTS public.poker_tournament_is_member(uuid);

-- ── 4. Restore the two helper functions WITHOUT the pinned search_path (original form) ────
CREATE OR REPLACE FUNCTION public.poker_tournament_can_transition(p_from text, p_to text)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_from
    WHEN 'DRAFT'             THEN p_to IN ('SCHEDULED','CANCELLED')
    WHEN 'SCHEDULED'         THEN p_to IN ('REGISTRATION_OPEN','CANCELLED')
    WHEN 'REGISTRATION_OPEN' THEN p_to IN ('STARTING','CANCELLED')
    WHEN 'STARTING'          THEN p_to IN ('RUNNING','PAUSED_FOR_REVIEW','CANCELLED')
    WHEN 'RUNNING'           THEN p_to IN ('BREAK','FINAL_TABLE','PAUSED_FOR_REVIEW','CANCELLED')
    WHEN 'BREAK'             THEN p_to IN ('RUNNING','FINAL_TABLE','PAUSED_FOR_REVIEW','CANCELLED')
    WHEN 'FINAL_TABLE'       THEN p_to IN ('COMPLETED','PAUSED_FOR_REVIEW','CANCELLED')
    WHEN 'PAUSED_FOR_REVIEW' THEN p_to IN ('STARTING','RUNNING','BREAK','FINAL_TABLE','CANCELLED')
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.poker_tournament_prize_pool(p_tournament_id uuid)
RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT GREATEST(
    COALESCE((SELECT SUM(entry_fee) FROM public.poker_tournament_entries
              WHERE tournament_id = p_tournament_id AND state <> 'WITHDRAWN'), 0),
    (SELECT guaranteed_prize_pool FROM public.poker_tournaments WHERE id = p_tournament_id)
  );
$$;
