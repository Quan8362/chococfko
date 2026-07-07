-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — TOURNAMENT ACCESS HARDENING (27G-G1A — anon-enumeration + search_path fix)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Strictly forward-only, ADDITIVE + IDEMPOTENT. Closes the 27G-G-CC Medium finding:
-- the tournament game-state tables shipped with `USING (true)` public-read policies AND
-- anon SELECT grants, so an UNAUTHENTICATED Data-API client could enumerate participant
-- identities (poker_tournament_entries/seats/payouts.user_id → profiles.display_name),
-- finishing places, prize amounts, and tournament capacity/title — even though the app
-- route is 404 for non-cohort users and public tournament is OFF.
--
-- This migration:
--   1. Adds a SECURITY DEFINER membership helper (bypasses RLS → no policy recursion).
--   2. Replaces every `USING (true)` public-read policy with a member-scoped policy that
--      is `TO authenticated` only (participant of the tournament OR its creator/operator).
--      poker_tournaments additionally stays discoverable in the joinable lobby states
--      (SCHEDULED / REGISTRATION_OPEN) so allowlisted users can still self-register.
--   3. REVOKEs anon SELECT on all six game-state tables (defence in depth atop the policy).
--   4. Pins a non-mutable search_path on the two flagged pure helper functions.
--
-- PRESERVED, unchanged:
--   • No client write path (INSERT/UPDATE/DELETE stay REVOKEd; only DEFINER RPCs mutate).
--   • Operator workflows: every operator action already runs through the service-role admin
--     client (service_role bypasses RLS); operator VIEW reads (getTournamentDetail) pass via
--     the creator clause. Service-role-only RPCs stay service-role-only.
--   • Realtime: the publication membership is untouched (seats/entries/table_state). A
--     subscribing participant still passes the member policy; a non-participant/anon receives
--     nothing. Secret tables (poker_tournaments.seed, poker_tournament_hands.state) stay
--     server-only and unpublished — this migration does not touch that seal.
--   • WALLET ISOLATION: nothing here writes game_wallets / coin_ledger, and no existing
--     tournament row is modified.
--
-- Apply AFTER migration_poker_tournament.sql, _orchestration.sql, _realtime.sql, _recovery.sql.
-- Rollback: migration_poker_tournament_access_hardening_rollback.sql (restores the prior
-- public-read policies + anon grants). Local-validated on a disposable DB before any prod
-- apply; prod apply is a separate controlled phase (never reapplied blindly).
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Membership helper (SECURITY DEFINER → bypasses RLS, so policies that call it on the
--       same tables do NOT recurse). Returns true iff the current auth user is a participant
--       of the tournament OR its creator (the operator who created it). ────────────────────
CREATE OR REPLACE FUNCTION public.poker_tournament_is_member(p_tournament_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.poker_tournament_entries e
      WHERE e.tournament_id = p_tournament_id AND e.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.poker_tournaments t
      WHERE t.id = p_tournament_id AND t.created_by = auth.uid()
    )
  );
$$;

REVOKE ALL ON FUNCTION public.poker_tournament_is_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poker_tournament_is_member(uuid) TO authenticated, service_role;

-- ── 2. Replace the public-read policies with member-scoped, authenticated-only policies ────
-- poker_tournaments: members/creator always; plus joinable-lobby discoverability so an
-- allowlisted user who has not registered yet can still find an open tournament to join.
DROP POLICY IF EXISTS "tournaments public read" ON public.poker_tournaments;
DROP POLICY IF EXISTS "tournaments member read" ON public.poker_tournaments;
CREATE POLICY "tournaments member read" ON public.poker_tournaments
  FOR SELECT TO authenticated
  USING (
    state IN ('SCHEDULED', 'REGISTRATION_OPEN')
    OR public.poker_tournament_is_member(id)
  );

-- Result / roster / live-state tables: members (participants + creator) only. This is the
-- boundary that stops anon AND non-participant enumeration of identities + results.
DROP POLICY IF EXISTS "entries public read" ON public.poker_tournament_entries;
DROP POLICY IF EXISTS "entries member read" ON public.poker_tournament_entries;
CREATE POLICY "entries member read" ON public.poker_tournament_entries
  FOR SELECT TO authenticated
  USING (public.poker_tournament_is_member(tournament_id));

DROP POLICY IF EXISTS "seats public read" ON public.poker_tournament_seats;
DROP POLICY IF EXISTS "seats member read" ON public.poker_tournament_seats;
CREATE POLICY "seats member read" ON public.poker_tournament_seats
  FOR SELECT TO authenticated
  USING (public.poker_tournament_is_member(tournament_id));

DROP POLICY IF EXISTS "moves public read" ON public.poker_tournament_moves;
DROP POLICY IF EXISTS "moves member read" ON public.poker_tournament_moves;
CREATE POLICY "moves member read" ON public.poker_tournament_moves
  FOR SELECT TO authenticated
  USING (public.poker_tournament_is_member(tournament_id));

DROP POLICY IF EXISTS "payouts public read" ON public.poker_tournament_payouts;
DROP POLICY IF EXISTS "payouts member read" ON public.poker_tournament_payouts;
CREATE POLICY "payouts member read" ON public.poker_tournament_payouts
  FOR SELECT TO authenticated
  USING (public.poker_tournament_is_member(tournament_id));

DROP POLICY IF EXISTS "table_state public read" ON public.poker_tournament_table_state;
DROP POLICY IF EXISTS "table_state member read" ON public.poker_tournament_table_state;
CREATE POLICY "table_state member read" ON public.poker_tournament_table_state
  FOR SELECT TO authenticated
  USING (public.poker_tournament_is_member(tournament_id));

-- ── 3. Defence in depth: strip anon's SELECT grant on every game-state table. A table-level
--       REVOKE also removes the column-level grants, so anon loses the poker_tournaments
--       non-seed column grant too. authenticated keeps its grants; RLS now gates the rows. ──
REVOKE SELECT ON public.poker_tournaments          FROM anon;
REVOKE SELECT ON public.poker_tournament_entries   FROM anon;
REVOKE SELECT ON public.poker_tournament_seats     FROM anon;
REVOKE SELECT ON public.poker_tournament_moves     FROM anon;
REVOKE SELECT ON public.poker_tournament_payouts   FROM anon;
REVOKE SELECT ON public.poker_tournament_table_state FROM anon;

-- prize_pool reads entries; anon must not reach it now that anon has no entry access.
REVOKE ALL ON FUNCTION public.poker_tournament_prize_pool(uuid) FROM anon;

-- ── 4. Pin a non-mutable search_path on the two flagged helper functions (advisor:
--       function_search_path_mutable). Bodies are byte-for-byte the originals; only the
--       function attribute changes. can_transition references no objects; prize_pool
--       fully-qualifies with public. ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.poker_tournament_can_transition(p_from text, p_to text)
RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_from
    WHEN 'DRAFT'             THEN p_to IN ('SCHEDULED','CANCELLED')
    WHEN 'SCHEDULED'         THEN p_to IN ('REGISTRATION_OPEN','CANCELLED')
    WHEN 'REGISTRATION_OPEN' THEN p_to IN ('STARTING','CANCELLED')
    WHEN 'STARTING'          THEN p_to IN ('RUNNING','PAUSED_FOR_REVIEW','CANCELLED')
    WHEN 'RUNNING'           THEN p_to IN ('BREAK','FINAL_TABLE','PAUSED_FOR_REVIEW','CANCELLED')
    WHEN 'BREAK'             THEN p_to IN ('RUNNING','FINAL_TABLE','PAUSED_FOR_REVIEW','CANCELLED')
    WHEN 'FINAL_TABLE'       THEN p_to IN ('COMPLETED','PAUSED_FOR_REVIEW','CANCELLED')
    WHEN 'PAUSED_FOR_REVIEW' THEN p_to IN ('STARTING','RUNNING','BREAK','FINAL_TABLE','CANCELLED')
    ELSE false   -- COMPLETED / CANCELLED are terminal
  END;
$$;

CREATE OR REPLACE FUNCTION public.poker_tournament_prize_pool(p_tournament_id uuid)
RETURNS bigint
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT GREATEST(
    COALESCE((SELECT SUM(entry_fee) FROM public.poker_tournament_entries
              WHERE tournament_id = p_tournament_id AND state <> 'WITHDRAWN'), 0),
    (SELECT guaranteed_prize_pool FROM public.poker_tournaments WHERE id = p_tournament_id)
  );
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- Done. anon: zero tournament rows. authenticated non-participant: no roster/result rows,
-- only joinable-lobby tournament metadata. participant/creator: unchanged legitimate reads.
-- Secret seal + realtime publication untouched. No wallet/ledger/tournament-row mutation.
-- ════════════════════════════════════════════════════════════════════════════════════
