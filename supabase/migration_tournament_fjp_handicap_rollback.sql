-- ════════════════════════════════════════════════════════════════════════════════════════════
-- migration_tournament_fjp_handicap_rollback.sql  (Prompt 15D-1B — reverses migration #10)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Reverses migration_tournament_fjp_handicap.sql, leaving the DB exactly as it was after migration
-- #9 (members). Order matters: first RESTORE the four RPCs to their pre-#10 bodies (which do NOT
-- reference the starting-score columns), THEN drop the constraints + columns, THEN revert the preset.
-- Restoring the bodies first ensures no function is left referencing a dropped column.
--
-- The restored function bodies below are the verbatim pre-#10 definitions from
-- migration_tournament_scoring.sql / migration_tournament_knockout_bracket.sql /
-- migration_tournament_group_knockout.sql / migration_tournament_reset_path.sql.
--
-- NOTE: this rollback does NOT delete competitor compositions or per-game starting scores that were
-- written while #10 was live — it only removes the SCHEMA. Because dropping the columns discards that
-- data, run it only against a DB where losing those values is acceptable (a fresh reapply/retest DB).

-- ── 1. Restore the four RPCs to their pre-#10 bodies (game INSERT without the new columns) ──────

CREATE OR REPLACE FUNCTION public.tournament_save_match_result(
  p_match_id uuid,
  p_event_id uuid,
  p_expected_match_version integer,
  p_games jsonb,
  p_winner_id uuid,
  p_target_status text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_stage    text;
  v_status   text;
  v_version  integer;
  v_group_id uuid;
  v_a        uuid;
  v_b        uuid;
  v_all_completed boolean;
  v_new_status text;
BEGIN
  IF p_games IS NULL OR jsonb_typeof(p_games) <> 'array' OR jsonb_array_length(p_games) = 0 THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;

  SELECT stage, status, version, group_id, competitor_a_id, competitor_b_id
    INTO v_stage, v_status, v_version, v_group_id, v_a, v_b
    FROM public.tournament_matches
    WHERE id = p_match_id AND event_id = p_event_id
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_stage <> 'group' THEN RETURN jsonb_build_object('code', 'wrong_stage'); END IF;
  IF v_status NOT IN ('ready', 'completed') OR v_a IS NULL OR v_b IS NULL THEN
    RETURN jsonb_build_object('code', 'not_scoreable');
  END IF;
  IF v_version <> p_expected_match_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_matches
             WHERE event_id = p_event_id AND stage = 'knockout') THEN
    RETURN jsonb_build_object('code', 'has_knockout');
  END IF;

  BEGIN
    DELETE FROM public.tournament_match_games WHERE match_id = p_match_id;

    INSERT INTO public.tournament_match_games (match_id, game_number, score_a, score_b)
    SELECT p_match_id, (g->>'game_number')::integer, (g->>'score_a')::integer, (g->>'score_b')::integer
    FROM jsonb_array_elements(p_games) AS g;

    UPDATE public.tournament_matches
       SET status = 'completed', winner_competitor_id = p_winner_id
       WHERE id = p_match_id;
  EXCEPTION
    WHEN check_violation OR not_null_violation OR unique_violation
      OR invalid_text_representation OR foreign_key_violation THEN
      RETURN jsonb_build_object('code', 'invalid');
  END;

  DELETE FROM public.tournament_qualification_overrides
    WHERE event_id = p_event_id AND group_id = v_group_id;

  SELECT EXISTS (SELECT 1 FROM public.tournament_matches WHERE event_id = p_event_id AND stage = 'group')
     AND NOT EXISTS (SELECT 1 FROM public.tournament_matches
                     WHERE event_id = p_event_id AND stage = 'group' AND status IN ('ready', 'pending'))
    INTO v_all_completed;

  IF NOT v_all_completed THEN
    v_new_status := 'group_stage';
  ELSIF p_target_status IN ('group_stage_completed', 'knockout_ready', 'completed') THEN
    v_new_status := p_target_status;
  ELSE
    v_new_status := 'group_stage_completed';
  END IF;
  UPDATE public.tournament_events SET status = v_new_status WHERE id = p_event_id;

  RETURN jsonb_build_object('code', 'ok', 'status', v_new_status, 'all_completed', v_all_completed);
END;
$$;

CREATE OR REPLACE FUNCTION public.tournament_save_knockout_result(
  p_match_id uuid,
  p_event_id uuid,
  p_expected_match_version integer,
  p_games jsonb,
  p_winner_id uuid,
  p_patches jsonb,
  p_podium jsonb,
  p_event_status text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_stage    text;
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
  v_final_status text;
  v_third_id     uuid;
  v_third_status text;
  v_completed    boolean;
  v_new_status   text;
BEGIN
  IF p_games IS NULL OR jsonb_typeof(p_games) <> 'array' OR jsonb_array_length(p_games) = 0 THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;
  IF p_patches IS NULL OR jsonb_typeof(p_patches) <> 'array' THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;

  SELECT stage, status, version, competitor_a_id, competitor_b_id
    INTO v_stage, v_status, v_version, v_a, v_b
    FROM public.tournament_matches
    WHERE id = p_match_id AND event_id = p_event_id
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_stage <> 'knockout' THEN RETURN jsonb_build_object('code', 'wrong_stage'); END IF;
  IF v_status NOT IN ('ready', 'completed') OR v_a IS NULL OR v_b IS NULL THEN
    RETURN jsonb_build_object('code', 'not_scoreable');
  END IF;
  IF v_version <> p_expected_match_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  FOR v_patch IN SELECT value FROM jsonb_array_elements(p_patches) LOOP
    v_t_id   := (v_patch->>'match_id')::uuid;
    v_t_slot := v_patch->>'slot';
    v_t_comp := (v_patch->>'competitor_id')::uuid;
    SELECT status,
           CASE WHEN v_t_slot = 'A' THEN competitor_a_id ELSE competitor_b_id END
      INTO v_t_status, v_t_cur
      FROM public.tournament_matches
      WHERE id = v_t_id AND event_id = p_event_id;
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
         WHERE id = v_t_id AND event_id = p_event_id;
      UPDATE public.tournament_matches
         SET status = 'ready'
         WHERE id = v_t_id AND event_id = p_event_id AND status = 'pending'
           AND competitor_a_id IS NOT NULL AND competitor_b_id IS NOT NULL;
    END LOOP;
  EXCEPTION
    WHEN check_violation OR not_null_violation OR unique_violation
      OR invalid_text_representation OR foreign_key_violation THEN
      RETURN jsonb_build_object('code', 'invalid');
  END;

  SELECT id, status INTO v_third_id, v_third_status
    FROM public.tournament_matches
    WHERE event_id = p_event_id AND stage = 'knockout'
      AND source_outcome_a = 'loser' AND source_outcome_b = 'loser'
    LIMIT 1;

  SELECT m.status INTO v_final_status
    FROM public.tournament_matches m
    WHERE m.event_id = p_event_id AND m.stage = 'knockout'
      AND NOT (COALESCE(m.source_outcome_a,'') = 'loser' AND COALESCE(m.source_outcome_b,'') = 'loser')
      AND NOT EXISTS (
        SELECT 1 FROM public.tournament_matches d
        WHERE d.event_id = p_event_id
          AND (d.source_match_a_id = m.id OR d.source_match_b_id = m.id))
    ORDER BY m.round_number DESC, m.match_number ASC
    LIMIT 1;

  v_completed := (v_final_status = 'completed')
             AND (v_third_id IS NULL OR v_third_status = 'completed');

  IF v_completed AND p_podium IS NOT NULL AND jsonb_typeof(p_podium) = 'array' THEN
    DELETE FROM public.tournament_podium WHERE event_id = p_event_id AND bracket = 'championship';
    BEGIN
      INSERT INTO public.tournament_podium (event_id, bracket, rank, competitor_id, is_joint)
      SELECT p_event_id, 'championship', (e->>'rank')::integer, (e->>'competitor_id')::uuid,
             COALESCE((e->>'is_joint')::boolean, false)
      FROM jsonb_array_elements(p_podium) AS e;
    EXCEPTION
      WHEN check_violation OR not_null_violation OR unique_violation
        OR invalid_text_representation OR foreign_key_violation THEN
        RETURN jsonb_build_object('code', 'invalid');
    END;
  ELSE
    DELETE FROM public.tournament_podium WHERE event_id = p_event_id;
  END IF;

  IF v_completed AND p_event_status = 'completed' THEN
    v_new_status := 'completed';
  ELSE
    v_new_status := 'knockout_running';
  END IF;
  UPDATE public.tournament_events SET status = v_new_status WHERE id = p_event_id;

  RETURN jsonb_build_object('code', 'ok', 'status', v_new_status, 'completed', v_completed);
END;
$$;

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
    FOR v_id IN SELECT (value #>> '{}')::uuid FROM jsonb_array_elements(p_reset_ids) LOOP
      DELETE FROM public.tournament_match_games
        WHERE match_id = v_id
          AND match_id IN (SELECT id FROM public.tournament_matches
                           WHERE event_id = p_event_id AND stage = 'knockout' AND bracket = p_bracket);
      UPDATE public.tournament_matches
         SET status = 'pending', winner_competitor_id = NULL
         WHERE id = v_id AND event_id = p_event_id AND stage = 'knockout' AND bracket = p_bracket;
    END LOOP;

    FOR v_slot IN SELECT value FROM jsonb_array_elements(p_clear_slots) LOOP
      v_t_id   := (v_slot->>'match_id')::uuid;
      v_t_slot := v_slot->>'slot';
      UPDATE public.tournament_matches
         SET competitor_a_id = CASE WHEN v_t_slot = 'A' THEN NULL ELSE competitor_a_id END,
             competitor_b_id = CASE WHEN v_t_slot = 'B' THEN NULL ELSE competitor_b_id END
         WHERE id = v_t_id AND event_id = p_event_id AND stage = 'knockout' AND bracket = p_bracket;
    END LOOP;

    DELETE FROM public.tournament_match_games WHERE match_id = p_upstream_match_id;
    INSERT INTO public.tournament_match_games (match_id, game_number, score_a, score_b)
    SELECT p_upstream_match_id, (g->>'game_number')::integer, (g->>'score_a')::integer, (g->>'score_b')::integer
    FROM jsonb_array_elements(p_games) AS g;
    UPDATE public.tournament_matches
       SET status = 'completed', winner_competitor_id = p_winner_id
       WHERE id = p_upstream_match_id;

    FOR v_patch IN SELECT value FROM jsonb_array_elements(p_patches) LOOP
      v_t_id   := (v_patch->>'match_id')::uuid;
      v_t_slot := v_patch->>'slot';
      v_t_comp := (v_patch->>'competitor_id')::uuid;
      UPDATE public.tournament_matches
         SET competitor_a_id = CASE WHEN v_t_slot = 'A' THEN v_t_comp ELSE competitor_a_id END,
             competitor_b_id = CASE WHEN v_t_slot = 'B' THEN v_t_comp ELSE competitor_b_id END
         WHERE id = v_t_id AND event_id = p_event_id AND stage = 'knockout' AND bracket = p_bracket;
    END LOOP;

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

-- Re-assert service_role-only execution on the restored functions.
REVOKE ALL ON FUNCTION public.tournament_save_match_result(uuid, uuid, integer, jsonb, uuid, text)                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_save_knockout_result(uuid, uuid, integer, jsonb, uuid, jsonb, jsonb, text)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_save_group_knockout_result(uuid, uuid, integer, jsonb, uuid, text, jsonb, jsonb)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_reset_knockout_path(uuid, uuid, text, integer, jsonb, uuid, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tournament_save_match_result(uuid, uuid, integer, jsonb, uuid, text)                          TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_save_knockout_result(uuid, uuid, integer, jsonb, uuid, jsonb, jsonb, text)         TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_save_group_knockout_result(uuid, uuid, integer, jsonb, uuid, text, jsonb, jsonb)   TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_reset_knockout_path(uuid, uuid, text, integer, jsonb, uuid, jsonb, jsonb, jsonb, jsonb) TO service_role;

-- ── 2. Drop the per-game starting-score constraints + columns ──────────────────────────────────
ALTER TABLE public.tournament_match_games DROP CONSTRAINT IF EXISTS tmg_scores_ge_starting;
ALTER TABLE public.tournament_match_games DROP CONSTRAINT IF EXISTS tmg_starting_nonneg;
ALTER TABLE public.tournament_match_games DROP COLUMN IF EXISTS handicap_version;
ALTER TABLE public.tournament_match_games DROP COLUMN IF EXISTS handicap_mode;
ALTER TABLE public.tournament_match_games DROP COLUMN IF EXISTS starting_score_b;
ALTER TABLE public.tournament_match_games DROP COLUMN IF EXISTS starting_score_a;

-- ── 3. Drop the competitor composition constraints + columns ───────────────────────────────────
ALTER TABLE public.tournament_competitors DROP CONSTRAINT IF EXISTS tc_composition_total_valid;
ALTER TABLE public.tournament_competitors DROP CONSTRAINT IF EXISTS tc_composition_complete;
ALTER TABLE public.tournament_competitors DROP CONSTRAINT IF EXISTS tc_composition_counts_nonneg;
ALTER TABLE public.tournament_competitors DROP CONSTRAINT IF EXISTS tc_composition_kind_valid;
ALTER TABLE public.tournament_competitors DROP COLUMN IF EXISTS female_count;
ALTER TABLE public.tournament_competitors DROP COLUMN IF EXISTS male_count;
ALTER TABLE public.tournament_competitors DROP COLUMN IF EXISTS competitor_kind;

-- ── 4. Revert the preset: delete v2, reactivate v1 ─────────────────────────────────────────────
DELETE FROM public.tournament_rule_presets WHERE preset_key = 'fjp_olympiad_2026' AND version = 2;
UPDATE public.tournament_rule_presets
   SET status = 'active', updated_at = now()
   WHERE preset_key = 'fjp_olympiad_2026' AND version = 1;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_fjp_handicap_rollback.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════
