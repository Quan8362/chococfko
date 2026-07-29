-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT — REALTIME PUBLICATION + KNOCKOUT DEPENDENCY-PATH RESET (Prompt 11)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Two concerns, both additive on top of the Prompt-02..09 migrations. Nothing in the existing
-- schema is modified — this file only publishes tables to realtime and CREATEs functions. Idempotent
-- (CREATE OR REPLACE + guarded ALTER PUBLICATION). Run in Supabase SQL Editor (or a local/preview DB)
-- AFTER migration_tournament_core.sql and the knockout/group-knockout migrations.
--
-- 1. REALTIME. Publishes the SIX non-secret tournament tables Guest + Admin surfaces watch, so a change
--    made by an admin is delivered to open pages as a *signal* (the client then refetches the safe read
--    model — payloads are never trusted as the source of truth). REPLICA IDENTITY FULL is set so a
--    FILTERED (event_id / tournament_id) subscription also matches UPDATE/DELETE. tournament_audit_log
--    is DELIBERATELY NOT published — it is never exposed to Guests and must never traverse realtime.
--    RLS still gates what each subscriber receives (public_select ⇒ only published/completed rows).
--
-- 2. RESET DEPENDENCY PATH. When an admin corrects the SCORE of an upstream knockout match whose
--    downstream matches are ALREADY completed, the previous phases refuse the edit (downstream_has_
--    results). This adds the controlled correction: a single TRANSACTIONAL, service-role-only RPC that
--    resets ONLY the dependency path (computed by the pure engine analyzeKnockoutCorrection in the
--    action from DB truth, never the client), saves the new upstream result, re-progresses the new
--    winner/loser one level, and recalculates branch completion + podium + event status atomically.
--    All-or-nothing: any failure rolls the whole thing back. The upstream match VERSION is compared
--    BEFORE any write (stale ⇒ version_conflict) so data changed after the preview is refused.
--    SECURITY DEFINER, pinned search_path, EXECUTE granted to service_role ONLY.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Publish the non-secret tables to realtime (idempotent) ─────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tournaments',
    'tournament_events',
    'tournament_matches',
    'tournament_match_games',
    'tournament_qualification_overrides',
    'tournament_podium'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- REPLICA IDENTITY FULL so filtered (event_id / tournament_id) subscriptions match UPDATE/DELETE too.
ALTER TABLE public.tournaments                        REPLICA IDENTITY FULL;
ALTER TABLE public.tournament_events                  REPLICA IDENTITY FULL;
ALTER TABLE public.tournament_matches                 REPLICA IDENTITY FULL;
ALTER TABLE public.tournament_match_games             REPLICA IDENTITY FULL;
ALTER TABLE public.tournament_qualification_overrides REPLICA IDENTITY FULL;
ALTER TABLE public.tournament_podium                  REPLICA IDENTITY FULL;

-- ── 2a. Bracket-completion helper (per-bracket, SQL truth) ────────────────────────────────
-- A bracket is finished when its FINAL (the terminal non-third match nobody consumes) is completed and,
-- if the bracket has a third-place match (the one fed by two losers), that is completed too. Pure read.
CREATE OR REPLACE FUNCTION public.tournament_reset_bracket_complete(
  p_event_id uuid,
  p_bracket text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_third_id     uuid;
  v_third_status text;
  v_final_status text;
BEGIN
  SELECT id, status INTO v_third_id, v_third_status
    FROM public.tournament_matches
    WHERE event_id = p_event_id AND stage = 'knockout' AND bracket = p_bracket
      AND source_outcome_a = 'loser' AND source_outcome_b = 'loser'
    LIMIT 1;

  SELECT m.status INTO v_final_status
    FROM public.tournament_matches m
    WHERE m.event_id = p_event_id AND m.stage = 'knockout' AND m.bracket = p_bracket
      AND NOT (COALESCE(m.source_outcome_a,'') = 'loser' AND COALESCE(m.source_outcome_b,'') = 'loser')
      AND NOT EXISTS (
        SELECT 1 FROM public.tournament_matches d
        WHERE d.event_id = p_event_id AND d.bracket = p_bracket
          AND (d.source_match_a_id = m.id OR d.source_match_b_id = m.id))
    ORDER BY m.round_number DESC, m.match_number ASC
    LIMIT 1;

  RETURN (v_final_status = 'completed') AND (v_third_id IS NULL OR v_third_status = 'completed');
END;
$$;

-- ── 2b. Reset the dependency path & re-apply the corrected result — atomic ─────────────────
-- p_reset_ids  : [uuid,…]                       — downstream matches on the path (games wiped, un-completed)
-- p_clear_slots: [{"match_id":uuid,"slot":"A"|"B"}] — slots fed from the corrected path (emptied)
-- p_patches    : [{"match_id":uuid,"slot":"A"|"B","competitor_id":uuid}] — one-level re-feed of NEW result
-- p_podium     : null OR [{"rank":int,"competitor_id":uuid,"is_joint":bool}] — corrected bracket only
-- All ids are computed by the server (analyzeKnockoutCorrection) from freshly reloaded DB truth. This
-- function re-verifies the upstream (event/bracket/completed/version) and re-derives completion in SQL.
CREATE OR REPLACE FUNCTION public.tournament_reset_knockout_path(
  p_upstream_match_id uuid,
  p_event_id uuid,
  p_bracket text,
  p_expected_match_version integer,
  p_games jsonb,
  p_winner_id uuid,
  p_reset_ids jsonb,
  p_clear_slots jsonb,
  p_patches jsonb,
  p_podium jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_stage   text;
  v_status  text;
  v_version integer;
  v_bracket text;
  v_format  text;
  v_a       uuid;
  v_b       uuid;
  v_id      uuid;
  v_slot    jsonb;
  v_patch   jsonb;
  v_t_id    uuid;
  v_t_slot  text;
  v_t_comp  uuid;
  v_champ_done boolean;
  v_has_conso  boolean;
  v_conso_done boolean;
  v_completed  boolean;
  v_new_status text;
BEGIN
  IF p_games IS NULL OR jsonb_typeof(p_games) <> 'array' OR jsonb_array_length(p_games) = 0 THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;
  IF p_reset_ids IS NULL OR jsonb_typeof(p_reset_ids) <> 'array'
     OR p_clear_slots IS NULL OR jsonb_typeof(p_clear_slots) <> 'array'
     OR p_patches IS NULL OR jsonb_typeof(p_patches) <> 'array' THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;
  IF p_bracket NOT IN ('championship', 'consolation') THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;

  -- Lock + verify the upstream match. It must be a real, completed knockout pairing in this bracket,
  -- and its version must match the token captured in the preview (stale ⇒ version_conflict).
  SELECT stage, status, version, bracket, competitor_a_id, competitor_b_id
    INTO v_stage, v_status, v_version, v_bracket, v_a, v_b
    FROM public.tournament_matches
    WHERE id = p_upstream_match_id AND event_id = p_event_id
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_stage <> 'knockout' THEN RETURN jsonb_build_object('code', 'wrong_stage'); END IF;
  IF v_bracket <> p_bracket THEN RETURN jsonb_build_object('code', 'invalid'); END IF;
  IF v_status <> 'completed' OR v_a IS NULL OR v_b IS NULL THEN
    RETURN jsonb_build_object('code', 'not_scoreable');
  END IF;
  IF v_version <> p_expected_match_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;
  IF p_winner_id IS DISTINCT FROM v_a AND p_winner_id IS DISTINCT FROM v_b THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;

  SELECT format INTO v_format FROM public.tournament_events WHERE id = p_event_id;
  IF v_format NOT IN ('knockout', 'group_knockout') THEN
    RETURN jsonb_build_object('code', 'wrong_format');
  END IF;

  BEGIN
    -- (1) Reset every downstream match on the path: wipe games, un-complete, drop the winner. Each id
    --     is re-scoped to this event + bracket so a stray id can never touch another branch/event.
    FOR v_id IN SELECT (value #>> '{}')::uuid FROM jsonb_array_elements(p_reset_ids) LOOP
      DELETE FROM public.tournament_match_games
        WHERE match_id = v_id
          AND match_id IN (SELECT id FROM public.tournament_matches
                           WHERE event_id = p_event_id AND stage = 'knockout' AND bracket = p_bracket);
      UPDATE public.tournament_matches
         SET status = 'pending', winner_competitor_id = NULL
         WHERE id = v_id AND event_id = p_event_id AND stage = 'knockout' AND bracket = p_bracket;
    END LOOP;

    -- (2) Empty the slots fed from the corrected path (sibling slots fed by INDEPENDENT matches stay).
    FOR v_slot IN SELECT value FROM jsonb_array_elements(p_clear_slots) LOOP
      v_t_id   := (v_slot->>'match_id')::uuid;
      v_t_slot := v_slot->>'slot';
      UPDATE public.tournament_matches
         SET competitor_a_id = CASE WHEN v_t_slot = 'A' THEN NULL ELSE competitor_a_id END,
             competitor_b_id = CASE WHEN v_t_slot = 'B' THEN NULL ELSE competitor_b_id END
         WHERE id = v_t_id AND event_id = p_event_id AND stage = 'knockout' AND bracket = p_bracket;
    END LOOP;

    -- (3) Save the corrected upstream result.
    DELETE FROM public.tournament_match_games WHERE match_id = p_upstream_match_id;
    INSERT INTO public.tournament_match_games (match_id, game_number, score_a, score_b)
    SELECT p_upstream_match_id, (g->>'game_number')::integer, (g->>'score_a')::integer, (g->>'score_b')::integer
    FROM jsonb_array_elements(p_games) AS g;
    UPDATE public.tournament_matches
       SET status = 'completed', winner_competitor_id = p_winner_id
       WHERE id = p_upstream_match_id;

    -- (4) Re-progress the NEW winner/loser ONE level into the immediate downstream slots.
    FOR v_patch IN SELECT value FROM jsonb_array_elements(p_patches) LOOP
      v_t_id   := (v_patch->>'match_id')::uuid;
      v_t_slot := v_patch->>'slot';
      v_t_comp := (v_patch->>'competitor_id')::uuid;
      UPDATE public.tournament_matches
         SET competitor_a_id = CASE WHEN v_t_slot = 'A' THEN v_t_comp ELSE competitor_a_id END,
             competitor_b_id = CASE WHEN v_t_slot = 'B' THEN v_t_comp ELSE competitor_b_id END
         WHERE id = v_t_id AND event_id = p_event_id AND stage = 'knockout' AND bracket = p_bracket;
    END LOOP;

    -- (5) A reset downstream match with both competitors known again becomes 'ready'; still-missing
    --     ones remain 'pending' until their own parents are replayed by the admin.
    FOR v_id IN SELECT (value #>> '{}')::uuid FROM jsonb_array_elements(p_reset_ids) LOOP
      UPDATE public.tournament_matches
         SET status = 'ready'
         WHERE id = v_id AND event_id = p_event_id AND stage = 'knockout' AND bracket = p_bracket
           AND status = 'pending' AND competitor_a_id IS NOT NULL AND competitor_b_id IS NOT NULL;
    END LOOP;
  EXCEPTION
    WHEN check_violation OR not_null_violation OR unique_violation
      OR invalid_text_representation OR foreign_key_violation THEN
      RETURN jsonb_build_object('code', 'invalid');
  END;

  -- (6) Recompute the corrected bracket's podium. It is invalidated by the reset; if (edge case) the
  --     bracket is somehow still complete, the caller-supplied podium is written back.
  DELETE FROM public.tournament_podium WHERE event_id = p_event_id AND bracket = p_bracket;
  IF public.tournament_reset_bracket_complete(p_event_id, p_bracket)
     AND p_podium IS NOT NULL AND jsonb_typeof(p_podium) = 'array' THEN
    BEGIN
      INSERT INTO public.tournament_podium (event_id, bracket, rank, competitor_id, is_joint)
      SELECT p_event_id, p_bracket, (e->>'rank')::integer, (e->>'competitor_id')::uuid,
             COALESCE((e->>'is_joint')::boolean, false)
      FROM jsonb_array_elements(p_podium) AS e;
    EXCEPTION
      WHEN check_violation OR not_null_violation OR unique_violation
        OR invalid_text_representation OR foreign_key_violation THEN
        RETURN jsonb_build_object('code', 'invalid');
    END;
  END IF;

  -- (7) Recompute event completion in SQL. knockout ⇒ championship only; group_knockout ⇒ championship
  --     AND (no consolation OR consolation complete). A broken branch pulls the event back to running.
  v_champ_done := public.tournament_reset_bracket_complete(p_event_id, 'championship');
  v_has_conso  := EXISTS (SELECT 1 FROM public.tournament_matches
                          WHERE event_id = p_event_id AND stage = 'knockout' AND bracket = 'consolation');
  v_conso_done := (NOT v_has_conso) OR public.tournament_reset_bracket_complete(p_event_id, 'consolation');
  v_completed  := v_champ_done AND v_conso_done;
  v_new_status := CASE WHEN v_completed THEN 'completed' ELSE 'knockout_running' END;
  UPDATE public.tournament_events SET status = v_new_status WHERE id = p_event_id;

  RETURN jsonb_build_object('code', 'ok', 'status', v_new_status, 'completed', v_completed);
END;
$$;

-- ── 3. Lock down execution to service_role only ───────────────────────────────────────────
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on new public functions to anon + authenticated,
-- so REVOKE from PUBLIC alone is NOT enough — revoke from those roles explicitly.
REVOKE ALL ON FUNCTION public.tournament_reset_bracket_complete(uuid, text)                                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_reset_knockout_path(uuid, uuid, text, integer, jsonb, uuid, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.tournament_reset_bracket_complete(uuid, text)                                       TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_reset_knockout_path(uuid, uuid, text, integer, jsonb, uuid, jsonb, jsonb, jsonb, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_reset_path.sql
-- ════════════════════════════════════════════════════════════════════════════════════
