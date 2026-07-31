-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT — GROUP + KNOCKOUT: TOKENS, DUAL BRACKETS, RESULTS & PODIUMS (Prompt 09)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Adds the TRANSACTIONAL, service-role-only RPCs for the `group_knockout` format on top of
-- migration_tournament_core.sql. Nothing in Prompt-02's schema is modified — this file only CREATEs
-- functions. Idempotent (CREATE OR REPLACE). Run in Supabase SQL Editor (or an isolated local/preview
-- DB), AFTER migration_tournament_core.sql. Coexists with the Prompt-06/07/08 RPC migrations and does
-- NOT change the round_robin or knockout flows.
--
-- Scope: EVENT FORMAT = 'group_knockout'. Two INDEPENDENT single-elimination brackets:
--   • championship (nhánh thắng) — the top winner_qualifiers ranks of each group,
--   • consolation  (nhánh thua)  — the next consolation_qualifiers ranks (only when > 0).
-- NOT double elimination: a competitor is in exactly one branch; a championship loser never drops to
-- consolation; the two brackets never exchange competitors after generation.
--
-- Seed slots persist GROUP-RANK TOKENS (source_type='group_rank', source_group_id, source_rank) — a
-- qualification SOURCE, never a competitor id — so they stay valid while standings are finalized. The
-- server resolves every token to a real competitor from the CURRENT standings (pure engine) and passes
-- the concrete bracket rows in; these functions never trust client match ids / winners / versions and
-- never re-derive a winner. DB CHECKs (bracket/stage shape, tmg_no_tie, winner ∈ {a,b}, seed-slot
-- shape, unique(event,bracket,slot_index), podium ranks) are the final backstop. Every function:
--   • runs in one implicit transaction (all-or-nothing) — BOTH brackets persist or NEITHER does,
--   • locks the event/match row FOR UPDATE and compares the optimistic-concurrency token BEFORE any
--     write (stale ⇒ version_conflict, nothing written),
--   • returns a jsonb {code, …} the action maps to a typed result (raw SQL errors never reach the UI),
--   • is SECURITY DEFINER, pinned search_path, EXECUTE granted to service_role ONLY (REVOKE FROM
--     PUBLIC, anon, authenticated — Supabase default privileges grant EXECUTE to anon/authenticated,
--     so REVOKE from PUBLIC alone is NOT enough).
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 0. Branch-completion helper (internal) ────────────────────────────────────────────────
-- True iff the given bracket exists and is finished: its final (the terminal non-third match) is
-- completed AND (there is no third-place match OR it too is completed). A bracket with no matches → false.
CREATE OR REPLACE FUNCTION public.tournament_gk_branch_complete(
  p_event_id uuid,
  p_bracket text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_final_status text;
  v_third_id     uuid;
  v_third_status text;
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

  IF v_final_status IS NULL THEN RETURN false; END IF;
  RETURN (v_final_status = 'completed')
     AND (v_third_id IS NULL OR v_third_status = 'completed');
END;
$$;

-- ── 1. Save the full desired seed state (both branches, replace-all, atomic) ───────────────
-- p_slots: [{"bracket":"championship"|"consolation","slot_index":int,
--            "source_group_id":uuid,"source_rank":int}] — ordered group-rank tokens per branch.
-- Cross-event groups and duplicate (bracket,slot_index) or (bracket,group,rank) trip the composite
-- FK / unique constraints → 'invalid'. Blocked once any knockout match exists (has_matches): seeds
-- are frozen after generation — the admin must reset the brackets first.
CREATE OR REPLACE FUNCTION public.tournament_save_group_knockout_seeds(
  p_event_id uuid,
  p_expected_version integer,
  p_slots jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_version integer;
  v_format  text;
  v_count   integer := 0;
BEGIN
  IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;

  SELECT version, format INTO v_version, v_format
    FROM public.tournament_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_format <> 'group_knockout' THEN RETURN jsonb_build_object('code', 'wrong_format'); END IF;
  IF v_version <> p_expected_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_matches
             WHERE event_id = p_event_id AND stage = 'knockout') THEN
    RETURN jsonb_build_object('code', 'has_matches');
  END IF;

  BEGIN
    -- Replace all group-rank seed slots (both brackets). Competitor/bye slots (other formats) are
    -- never used here, so scoping to source_type='group_rank' keeps this format self-contained.
    DELETE FROM public.tournament_knockout_seed_slots
      WHERE event_id = p_event_id AND source_type = 'group_rank';

    INSERT INTO public.tournament_knockout_seed_slots
      (event_id, bracket, slot_index, source_type, source_group_id, source_rank)
    SELECT p_event_id, (e->>'bracket'),
           (e->>'slot_index')::integer, 'group_rank',
           (e->>'source_group_id')::uuid, (e->>'source_rank')::integer
    FROM jsonb_array_elements(p_slots) AS e;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION
    WHEN foreign_key_violation OR unique_violation OR not_null_violation
      OR invalid_text_representation OR check_violation THEN
      RETURN jsonb_build_object('code', 'invalid');
  END;

  -- Version-bumping touch so a concurrent editor holding the old token is detected next time.
  UPDATE public.tournament_events SET display_order = display_order WHERE id = p_event_id;

  RETURN jsonb_build_object('code', 'ok', 'seed_count', v_count);
END;
$$;

-- ── 2. Clear all group-rank seeds — atomic ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tournament_clear_group_knockout_seeds(
  p_event_id uuid,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_version integer;
  v_format  text;
BEGIN
  SELECT version, format INTO v_version, v_format
    FROM public.tournament_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_format <> 'group_knockout' THEN RETURN jsonb_build_object('code', 'wrong_format'); END IF;
  IF v_version <> p_expected_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_matches
             WHERE event_id = p_event_id AND stage = 'knockout') THEN
    RETURN jsonb_build_object('code', 'has_matches');
  END IF;

  DELETE FROM public.tournament_knockout_seed_slots
    WHERE event_id = p_event_id AND source_type = 'group_rank';
  UPDATE public.tournament_events SET display_order = display_order WHERE id = p_event_id;

  RETURN jsonb_build_object('code', 'ok');
END;
$$;

-- ── 3. Generate BOTH brackets — atomic, idempotent ────────────────────────────────────────
-- p_matches: rows built by the server from generateKnockout (+ buildKnockoutMatchRows) for BOTH
-- brackets, each row carrying its own "bracket". Tokens are ALREADY resolved to competitor ids by
-- the pure engine against the current standings. BYEs are already applied (status='bye', one
-- competitor, winner set — never a 0–0 score); their auto-advanced competitor already fills the
-- downstream slot. Two passes: INSERT rows (source refs NULL), then wire source_match_*_id by
-- resolving the stable source key → row id within the event. Idempotent: any existing knockout match
-- ⇒ 'already_generated' (never a partial second write). If either branch fails, the whole tx rolls back.
CREATE OR REPLACE FUNCTION public.tournament_generate_group_knockout(
  p_event_id uuid,
  p_expected_version integer,
  p_matches jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_version  integer;
  v_format   text;
  v_existing integer;
  v_count    integer;
BEGIN
  SELECT version, format INTO v_version, v_format
    FROM public.tournament_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_format <> 'group_knockout' THEN RETURN jsonb_build_object('code', 'wrong_format'); END IF;
  IF v_version <> p_expected_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  SELECT count(*) INTO v_existing FROM public.tournament_matches
    WHERE event_id = p_event_id AND stage = 'knockout';
  IF v_existing > 0 THEN
    RETURN jsonb_build_object('code', 'already_generated', 'match_count', v_existing);
  END IF;

  IF p_matches IS NULL OR jsonb_typeof(p_matches) <> 'array' OR jsonb_array_length(p_matches) = 0 THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;

  BEGIN
    -- Pass 1: insert all matches for both brackets. source refs wired in pass 2.
    INSERT INTO public.tournament_matches
      (event_id, group_id, stage, bracket, round_number, match_number,
       competitor_a_id, competitor_b_id, status, winner_competitor_id, generation_key)
    SELECT p_event_id, NULL, 'knockout', (e->>'bracket'),
           (e->>'round_number')::integer, (e->>'match_number')::integer,
           NULLIF(e->>'competitor_a_id','')::uuid, NULLIF(e->>'competitor_b_id','')::uuid,
           (e->>'status'), NULLIF(e->>'winner_id','')::uuid, (e->>'generation_key')
    FROM jsonb_array_elements(p_matches) AS e
    ON CONFLICT (event_id, generation_key) DO NOTHING;

    -- Pass 2a: wire slot A source (winner/loser of an earlier match in the SAME bracket — the source
    -- key embeds the bracket, so this can never cross branches).
    UPDATE public.tournament_matches t
       SET source_match_a_id = s.id, source_outcome_a = (e->>'source_a_outcome')
      FROM jsonb_array_elements(p_matches) AS e
      JOIN public.tournament_matches s
        ON s.event_id = p_event_id AND s.generation_key = (e->>'source_a_key')
     WHERE t.event_id = p_event_id
       AND t.generation_key = (e->>'generation_key')
       AND (e->>'source_a_key') IS NOT NULL;

    -- Pass 2b: wire slot B source.
    UPDATE public.tournament_matches t
       SET source_match_b_id = s.id, source_outcome_b = (e->>'source_b_outcome')
      FROM jsonb_array_elements(p_matches) AS e
      JOIN public.tournament_matches s
        ON s.event_id = p_event_id AND s.generation_key = (e->>'source_b_key')
     WHERE t.event_id = p_event_id
       AND t.generation_key = (e->>'generation_key')
       AND (e->>'source_b_key') IS NOT NULL;
  EXCEPTION
    WHEN foreign_key_violation OR check_violation OR not_null_violation
      OR invalid_text_representation OR unique_violation THEN
      RETURN jsonb_build_object('code', 'invalid');
  END;

  UPDATE public.tournament_events SET status = 'knockout_running' WHERE id = p_event_id;

  SELECT count(*) INTO v_count FROM public.tournament_matches
    WHERE event_id = p_event_id AND stage = 'knockout';
  RETURN jsonb_build_object('code', 'ok', 'match_count', v_count);
END;
$$;

-- ── 4. Reset BOTH brackets — atomic; only when there are NO results ────────────────────────
-- Wipes all knockout matches (child games cascade) and all podiums, returning the event to
-- 'knockout_ready' (the group stage is done; seeds are KEPT). Refuses if any knockout match is
-- completed, any knockout game exists, or a podium exists → 'event_has_results'. Group matches,
-- standings and qualification overrides are untouched.
CREATE OR REPLACE FUNCTION public.tournament_reset_group_knockout(
  p_event_id uuid,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_version integer;
  v_format  text;
BEGIN
  SELECT version, format INTO v_version, v_format
    FROM public.tournament_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_format <> 'group_knockout' THEN RETURN jsonb_build_object('code', 'wrong_format'); END IF;
  IF v_version <> p_expected_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_matches
             WHERE event_id = p_event_id AND stage = 'knockout' AND status = 'completed') THEN
    RETURN jsonb_build_object('code', 'event_has_results');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tournament_match_games mg
    JOIN public.tournament_matches m ON m.id = mg.match_id
    WHERE m.event_id = p_event_id AND m.stage = 'knockout'
  ) THEN
    RETURN jsonb_build_object('code', 'event_has_results');
  END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_podium WHERE event_id = p_event_id) THEN
    RETURN jsonb_build_object('code', 'event_has_results');
  END IF;

  DELETE FROM public.tournament_matches WHERE event_id = p_event_id AND stage = 'knockout';
  DELETE FROM public.tournament_podium  WHERE event_id = p_event_id;

  UPDATE public.tournament_events SET status = 'knockout_ready' WHERE id = p_event_id;

  RETURN jsonb_build_object('code', 'ok');
END;
$$;

-- ── 5. Save (create or update) a branch match result — atomic ──────────────────────────────
-- Replaces the match games, sets winner + status='completed', then advances the winner (and, for a
-- semifinal, the loser → third-place) into the downstream slots supplied by the caller (p_patches,
-- from progressKnockout). All patches stay WITHIN this match's branch (source keys are branch-scoped),
-- so a championship result never touches consolation. Correction safety: a patch that would change a
-- slot of an already-completed downstream match → 'downstream_has_results' (no cascade in Prompt 09).
-- The branch podium (p_branch_podium, from calculatePodium for p_bracket) is persisted when THIS
-- branch is finished, else cleared. The EVENT is 'completed' only when the championship is finished
-- AND (consolation does not exist OR it too is finished) — clamped in SQL as a backstop.
--   p_bracket : 'championship' | 'consolation' (this match's branch)
--   p_patches : [{"match_id":uuid,"slot":"A"|"B","competitor_id":uuid}]
--   p_branch_podium : null OR [{"rank":int,"competitor_id":uuid,"is_joint":bool}]
CREATE OR REPLACE FUNCTION public.tournament_save_group_knockout_result(
  p_match_id uuid,
  p_event_id uuid,
  p_expected_match_version integer,
  p_games jsonb,
  p_winner_id uuid,
  p_bracket text,
  p_patches jsonb,
  p_branch_podium jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_stage    text;
  v_bracket  text;
  v_status   text;
  v_version  integer;
  v_a        uuid;
  v_b        uuid;
  v_patch    jsonb;
  v_t_id     uuid;
  v_t_slot   text;
  v_t_comp   uuid;
  v_t_status text;
  v_t_cur    uuid;
  v_branch_done  boolean;
  v_conso_exists boolean;
  v_completed    boolean;
  v_new_status   text;
BEGIN
  IF p_games IS NULL OR jsonb_typeof(p_games) <> 'array' OR jsonb_array_length(p_games) = 0 THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;
  IF p_patches IS NULL OR jsonb_typeof(p_patches) <> 'array' THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;
  IF p_bracket NOT IN ('championship', 'consolation') THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;

  SELECT stage, bracket, status, version, competitor_a_id, competitor_b_id
    INTO v_stage, v_bracket, v_status, v_version, v_a, v_b
    FROM public.tournament_matches
    WHERE id = p_match_id AND event_id = p_event_id
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_stage <> 'knockout' THEN RETURN jsonb_build_object('code', 'wrong_stage'); END IF;
  IF v_bracket <> p_bracket THEN RETURN jsonb_build_object('code', 'wrong_stage'); END IF;
  IF v_status NOT IN ('ready', 'completed') OR v_a IS NULL OR v_b IS NULL THEN
    RETURN jsonb_build_object('code', 'not_scoreable');
  END IF;
  IF v_version <> p_expected_match_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  -- Correction guard: a patch changing an already-completed downstream slot is refused (a first
  -- completion or a pure score edit passes). All downstream matches must belong to the same branch.
  FOR v_patch IN SELECT value FROM jsonb_array_elements(p_patches) LOOP
    v_t_id   := (v_patch->>'match_id')::uuid;
    v_t_slot := v_patch->>'slot';
    v_t_comp := (v_patch->>'competitor_id')::uuid;
    SELECT status,
           CASE WHEN v_t_slot = 'A' THEN competitor_a_id ELSE competitor_b_id END
      INTO v_t_status, v_t_cur
      FROM public.tournament_matches
      WHERE id = v_t_id AND event_id = p_event_id AND bracket = p_bracket;
    IF NOT FOUND THEN RETURN jsonb_build_object('code', 'invalid'); END IF;
    IF v_t_status = 'completed' AND v_t_cur IS DISTINCT FROM v_t_comp THEN
      RETURN jsonb_build_object('code', 'downstream_has_results');
    END IF;
  END LOOP;

  BEGIN
    DELETE FROM public.tournament_match_games WHERE match_id = p_match_id;
    INSERT INTO public.tournament_match_games (match_id, game_number, score_a, score_b)
    SELECT p_match_id, (g->>'game_number')::integer, (g->>'score_a')::integer, (g->>'score_b')::integer
    FROM jsonb_array_elements(p_games) AS g;

    UPDATE public.tournament_matches
       SET status = 'completed', winner_competitor_id = p_winner_id
       WHERE id = p_match_id;

    FOR v_patch IN SELECT value FROM jsonb_array_elements(p_patches) LOOP
      v_t_id   := (v_patch->>'match_id')::uuid;
      v_t_slot := v_patch->>'slot';
      v_t_comp := (v_patch->>'competitor_id')::uuid;
      UPDATE public.tournament_matches
         SET competitor_a_id = CASE WHEN v_t_slot = 'A' THEN v_t_comp ELSE competitor_a_id END,
             competitor_b_id = CASE WHEN v_t_slot = 'B' THEN v_t_comp ELSE competitor_b_id END
         WHERE id = v_t_id AND event_id = p_event_id AND bracket = p_bracket;
      UPDATE public.tournament_matches
         SET status = 'ready'
         WHERE id = v_t_id AND event_id = p_event_id AND bracket = p_bracket AND status = 'pending'
           AND competitor_a_id IS NOT NULL AND competitor_b_id IS NOT NULL;
    END LOOP;
  EXCEPTION
    WHEN check_violation OR not_null_violation OR unique_violation
      OR invalid_text_representation OR foreign_key_violation THEN
      RETURN jsonb_build_object('code', 'invalid');
  END;

  -- This branch's podium: written only when the branch is finished; a correction that un-finishes it
  -- clears just THIS branch's podium (the other branch's podium is untouched).
  v_branch_done := public.tournament_gk_branch_complete(p_event_id, p_bracket);
  IF v_branch_done AND p_branch_podium IS NOT NULL AND jsonb_typeof(p_branch_podium) = 'array' THEN
    DELETE FROM public.tournament_podium WHERE event_id = p_event_id AND bracket = p_bracket;
    BEGIN
      INSERT INTO public.tournament_podium (event_id, bracket, rank, competitor_id, is_joint)
      SELECT p_event_id, p_bracket, (e->>'rank')::integer, (e->>'competitor_id')::uuid,
             COALESCE((e->>'is_joint')::boolean, false)
      FROM jsonb_array_elements(p_branch_podium) AS e;
    EXCEPTION
      WHEN check_violation OR not_null_violation OR unique_violation
        OR invalid_text_representation OR foreign_key_violation THEN
        RETURN jsonb_build_object('code', 'invalid');
    END;
  ELSE
    DELETE FROM public.tournament_podium WHERE event_id = p_event_id AND bracket = p_bracket;
  END IF;

  -- Event completion: championship finished AND (no consolation OR consolation finished).
  v_conso_exists := EXISTS (SELECT 1 FROM public.tournament_matches
                            WHERE event_id = p_event_id AND stage = 'knockout' AND bracket = 'consolation');
  v_completed := public.tournament_gk_branch_complete(p_event_id, 'championship')
             AND (NOT v_conso_exists OR public.tournament_gk_branch_complete(p_event_id, 'consolation'));

  v_new_status := CASE WHEN v_completed THEN 'completed' ELSE 'knockout_running' END;
  UPDATE public.tournament_events SET status = v_new_status WHERE id = p_event_id;

  RETURN jsonb_build_object('code', 'ok', 'status', v_new_status,
                            'branch_completed', v_branch_done, 'event_completed', v_completed);
END;
$$;

-- ── 6. Clear a branch match result — atomic ────────────────────────────────────────────────
-- Deletes the games, resets the match to 'ready' (its competitors came from upstream), and empties
-- the downstream slots this match fed (p_clear_slots, same branch), returning them to 'pending'.
-- Refused if a downstream match is already completed → 'downstream_has_results'. This branch's podium
-- is dropped and the event returns to 'knockout_running'. Guarded by the match version.
--   p_clear_slots: [{"match_id":uuid,"slot":"A"|"B"}]
CREATE OR REPLACE FUNCTION public.tournament_clear_group_knockout_result(
  p_match_id uuid,
  p_event_id uuid,
  p_expected_match_version integer,
  p_clear_slots jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_stage    text;
  v_bracket  text;
  v_status   text;
  v_version  integer;
  v_slot     jsonb;
  v_t_id     uuid;
  v_t_slot   text;
  v_t_status text;
BEGIN
  IF p_clear_slots IS NULL OR jsonb_typeof(p_clear_slots) <> 'array' THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;

  SELECT stage, bracket, status, version INTO v_stage, v_bracket, v_status, v_version
    FROM public.tournament_matches
    WHERE id = p_match_id AND event_id = p_event_id
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_stage <> 'knockout' THEN RETURN jsonb_build_object('code', 'wrong_stage'); END IF;
  IF v_status <> 'completed' THEN RETURN jsonb_build_object('code', 'not_scoreable'); END IF;
  IF v_version <> p_expected_match_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  FOR v_slot IN SELECT value FROM jsonb_array_elements(p_clear_slots) LOOP
    v_t_id := (v_slot->>'match_id')::uuid;
    SELECT status INTO v_t_status
      FROM public.tournament_matches WHERE id = v_t_id AND event_id = p_event_id AND bracket = v_bracket;
    IF NOT FOUND THEN RETURN jsonb_build_object('code', 'invalid'); END IF;
    IF v_t_status = 'completed' THEN RETURN jsonb_build_object('code', 'downstream_has_results'); END IF;
  END LOOP;

  DELETE FROM public.tournament_match_games WHERE match_id = p_match_id;
  UPDATE public.tournament_matches
     SET status = 'ready', winner_competitor_id = NULL
     WHERE id = p_match_id;

  FOR v_slot IN SELECT value FROM jsonb_array_elements(p_clear_slots) LOOP
    v_t_id   := (v_slot->>'match_id')::uuid;
    v_t_slot := v_slot->>'slot';
    UPDATE public.tournament_matches
       SET competitor_a_id = CASE WHEN v_t_slot = 'A' THEN NULL ELSE competitor_a_id END,
           competitor_b_id = CASE WHEN v_t_slot = 'B' THEN NULL ELSE competitor_b_id END,
           winner_competitor_id = NULL,
           status = 'pending'
       WHERE id = v_t_id AND event_id = p_event_id AND bracket = v_bracket;
  END LOOP;

  -- Un-finishing this branch drops its podium; the event is no longer complete.
  DELETE FROM public.tournament_podium WHERE event_id = p_event_id AND bracket = v_bracket;
  UPDATE public.tournament_events SET status = 'knockout_running' WHERE id = p_event_id;

  RETURN jsonb_build_object('code', 'ok', 'status', 'knockout_running');
END;
$$;

-- ── 7. Lock down execution to service_role only ───────────────────────────────────────────
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on new public functions to anon + authenticated,
-- so REVOKE from PUBLIC alone is NOT enough — revoke from those roles explicitly.
REVOKE ALL ON FUNCTION public.tournament_gk_branch_complete(uuid, text)                                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_save_group_knockout_seeds(uuid, integer, jsonb)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_clear_group_knockout_seeds(uuid, integer)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_generate_group_knockout(uuid, integer, jsonb)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_reset_group_knockout(uuid, integer)                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_save_group_knockout_result(uuid, uuid, integer, jsonb, uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_clear_group_knockout_result(uuid, uuid, integer, jsonb)          FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.tournament_gk_branch_complete(uuid, text)                                 TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_save_group_knockout_seeds(uuid, integer, jsonb)                TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_clear_group_knockout_seeds(uuid, integer)                      TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_generate_group_knockout(uuid, integer, jsonb)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_reset_group_knockout(uuid, integer)                            TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_save_group_knockout_result(uuid, uuid, integer, jsonb, uuid, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_clear_group_knockout_result(uuid, uuid, integer, jsonb)        TO service_role;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_group_knockout.sql
-- ════════════════════════════════════════════════════════════════════════════════════
