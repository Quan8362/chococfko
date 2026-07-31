-- ════════════════════════════════════════════════════════════════════════════════════════════
-- migration_tournament_fjp_handicap.sql  (Prompt 15D-1B — MIGRATION #10, applies AFTER members)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Adds the OFFICIAL FJP OLYMPIAD 2026 gender handicap ("chấp điểm") to the scoring path:
--   • competitor COMPOSITION columns (kind + men/women counts) on tournament_competitors — the ONLY
--     thing the handicap keys off (never identity, never a pair/category name).
--   • per-game STARTING-SCORE + handicap provenance columns on tournament_match_games, so a game that
--     began 2–0 / 4–0 is immutably auditable and a LATER preset edit can never re-interpret it.
--   • the four score-persisting RPCs re-defined to store those starting scores IN THE SAME atomic
--     transaction as the final scoreboard scores (the only change is the game INSERT column list — the
--     rest of each body is reproduced verbatim, the standard Postgres "replace the whole function"
--     migration idiom; these definitions SUPERSEDE the game-insert in migrations #2/#3/#8/reset_path).
--   • the FJP preset VERSION 2 seeded (handicap configured: 2 points per surplus woman), and VERSION 1
--     marked deprecated so the admin picker offers v2 by default. V1 is NOT mutated (existing v1
--     snapshots still resolve for provenance; they stay handicap-blocked, by design).
--
-- Depends on: migration_tournament_core.sql (tournament_competitors / tournament_match_games / the
-- four RPCs' prerequisites) + migration_tournament_rule_engine.sql (tournament_rule_presets). Apply as
-- migration #10, AFTER migration_tournament_members.sql. See the runbook.
--
-- Additive & idempotent: ADD COLUMN IF NOT EXISTS, constraints added via guarded DO blocks (skip when
-- present), CREATE OR REPLACE FUNCTION, ON CONFLICT preset upsert. It modifies NO approved migration
-- and adds only NULLABLE / DEFAULTed columns to existing tables (safe on populated tables).
--
-- Score semantics (see docs/tournaments/TOURNAMENT_RULES_DESIGN.md §Handicap): the handicap is each
-- side's OPENING score for every game/set. The score_a/score_b stored are the FINAL scoreboard scores,
-- already including the head start. The server computes the starting score authoritatively from the
-- two compositions (lib/tournaments/rules/handicap.ts) and NEVER trusts a client value; these columns
-- and the CHECK below are a defense-in-depth backstop.

-- ── 1. Competitor composition columns ─────────────────────────────────────────────────────────
ALTER TABLE public.tournament_competitors ADD COLUMN IF NOT EXISTS competitor_kind text;
ALTER TABLE public.tournament_competitors ADD COLUMN IF NOT EXISTS male_count      integer;
ALTER TABLE public.tournament_competitors ADD COLUMN IF NOT EXISTS female_count    integer;

DO $$
BEGIN
  -- kind ∈ {single,pair,team} when set.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tc_composition_kind_valid') THEN
    ALTER TABLE public.tournament_competitors
      ADD CONSTRAINT tc_composition_kind_valid
      CHECK (competitor_kind IS NULL OR competitor_kind IN ('single','pair','team'));
  END IF;
  -- counts are non-negative when set.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tc_composition_counts_nonneg') THEN
    ALTER TABLE public.tournament_competitors
      ADD CONSTRAINT tc_composition_counts_nonneg
      CHECK ((male_count IS NULL OR male_count >= 0) AND (female_count IS NULL OR female_count >= 0));
  END IF;
  -- Composition is either FULLY unset (legacy / non-handicap event) or FULLY set — never partial.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tc_composition_complete') THEN
    ALTER TABLE public.tournament_competitors
      ADD CONSTRAINT tc_composition_complete
      CHECK (num_nonnulls(competitor_kind, male_count, female_count) IN (0, 3));
  END IF;
  -- When set, the member total agrees with the kind (single ⇒ 1, pair ⇒ 2, team ⇒ ≥ 2).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tc_composition_total_valid') THEN
    ALTER TABLE public.tournament_competitors
      ADD CONSTRAINT tc_composition_total_valid
      CHECK (
        competitor_kind IS NULL
        OR (competitor_kind = 'single' AND male_count + female_count = 1)
        OR (competitor_kind = 'pair'   AND male_count + female_count = 2)
        OR (competitor_kind = 'team'   AND male_count + female_count >= 2)
      );
  END IF;
END $$;

-- ── 2. Per-game starting-score + handicap provenance columns ───────────────────────────────────
ALTER TABLE public.tournament_match_games ADD COLUMN IF NOT EXISTS starting_score_a integer NOT NULL DEFAULT 0;
ALTER TABLE public.tournament_match_games ADD COLUMN IF NOT EXISTS starting_score_b integer NOT NULL DEFAULT 0;
ALTER TABLE public.tournament_match_games ADD COLUMN IF NOT EXISTS handicap_mode    text;
ALTER TABLE public.tournament_match_games ADD COLUMN IF NOT EXISTS handicap_version integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tmg_starting_nonneg') THEN
    ALTER TABLE public.tournament_match_games
      ADD CONSTRAINT tmg_starting_nonneg CHECK (starting_score_a >= 0 AND starting_score_b >= 0);
  END IF;
  -- Backstop for §11: a FINAL scoreboard score can never be below the side's handicap head start.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tmg_scores_ge_starting') THEN
    ALTER TABLE public.tournament_match_games
      ADD CONSTRAINT tmg_scores_ge_starting CHECK (score_a >= starting_score_a AND score_b >= starting_score_b);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Re-define the four score-persisting RPCs to store starting scores atomically.
-- The ONLY change vs migrations #2/#3/#8/reset_path is the game INSERT column list; every guard,
-- lock, version check, downstream/podium/status logic is reproduced verbatim. starting_score_* /
-- handicap_* are read from each game object with COALESCE so a null/absent key is a safe 0/NULL.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ── 3a. Group match result ─────────────────────────────────────────────────────────────────────
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

    INSERT INTO public.tournament_match_games
      (match_id, game_number, score_a, score_b, starting_score_a, starting_score_b, handicap_mode, handicap_version)
    SELECT p_match_id, (g->>'game_number')::integer, (g->>'score_a')::integer, (g->>'score_b')::integer,
           COALESCE((g->>'starting_score_a')::integer, 0), COALESCE((g->>'starting_score_b')::integer, 0),
           NULLIF(g->>'handicap_mode', ''), (g->>'handicap_version')::integer
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

-- ── 3b. Knockout match result ──────────────────────────────────────────────────────────────────
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
    INSERT INTO public.tournament_match_games
      (match_id, game_number, score_a, score_b, starting_score_a, starting_score_b, handicap_mode, handicap_version)
    SELECT p_match_id, (g->>'game_number')::integer, (g->>'score_a')::integer, (g->>'score_b')::integer,
           COALESCE((g->>'starting_score_a')::integer, 0), COALESCE((g->>'starting_score_b')::integer, 0),
           NULLIF(g->>'handicap_mode', ''), (g->>'handicap_version')::integer
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

-- ── 3c. Group-knockout branch match result ─────────────────────────────────────────────────────
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
    INSERT INTO public.tournament_match_games
      (match_id, game_number, score_a, score_b, starting_score_a, starting_score_b, handicap_mode, handicap_version)
    SELECT p_match_id, (g->>'game_number')::integer, (g->>'score_a')::integer, (g->>'score_b')::integer,
           COALESCE((g->>'starting_score_a')::integer, 0), COALESCE((g->>'starting_score_b')::integer, 0),
           NULLIF(g->>'handicap_mode', ''), (g->>'handicap_version')::integer
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

-- ── 3d. Knockout dependency-path correction (reset) ────────────────────────────────────────────
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
    INSERT INTO public.tournament_match_games
      (match_id, game_number, score_a, score_b, starting_score_a, starting_score_b, handicap_mode, handicap_version)
    SELECT p_upstream_match_id, (g->>'game_number')::integer, (g->>'score_a')::integer, (g->>'score_b')::integer,
           COALESCE((g->>'starting_score_a')::integer, 0), COALESCE((g->>'starting_score_b')::integer, 0),
           NULLIF(g->>'handicap_mode', ''), (g->>'handicap_version')::integer
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

-- ── 3e. Re-assert service_role-only execution (CREATE OR REPLACE keeps ACLs, but if a function was
-- somehow freshly created here Supabase's ALTER DEFAULT PRIVILEGES would grant anon/authenticated —
-- so REVOKE + GRANT again to stay fail-safe). Signatures are unchanged from migrations #2/#3/#8/reset.
REVOKE ALL ON FUNCTION public.tournament_save_match_result(uuid, uuid, integer, jsonb, uuid, text)                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_save_knockout_result(uuid, uuid, integer, jsonb, uuid, jsonb, jsonb, text)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_save_group_knockout_result(uuid, uuid, integer, jsonb, uuid, text, jsonb, jsonb)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_reset_knockout_path(uuid, uuid, text, integer, jsonb, uuid, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.tournament_save_match_result(uuid, uuid, integer, jsonb, uuid, text)                          TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_save_knockout_result(uuid, uuid, integer, jsonb, uuid, jsonb, jsonb, text)         TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_save_group_knockout_result(uuid, uuid, integer, jsonb, uuid, text, jsonb, jsonb)   TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_reset_knockout_path(uuid, uuid, text, integer, jsonb, uuid, jsonb, jsonb, jsonb, jsonb) TO service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 4. FJP OLYMPIAD 2026 preset VERSION 2 — official gender handicap (mirror of
-- buildFjpOlympiad2026PresetV2() in lib/tournaments/rules/presets.ts). Handicap: mode
-- 'female_count_difference', points_per_difference = 2, requires_configuration = false.
-- Idempotent upsert. The sporting rules are identical to v1.
-- ════════════════════════════════════════════════════════════════════════════════════════════
INSERT INTO public.tournament_rule_presets
  (preset_key, version, label, description, schema_version, is_default, requires_configuration, status, payload)
VALUES (
  'fjp_olympiad_2026',
  2,
  'FJP Olympiad 2026',
  'FJP Olympiad 2026 badminton preset (v2, OFFICIAL handicap). Beginner: group play touch-15 (win by '
    || '1); Standard: group play touch-21 (win by 1). Both categories: knockout touch-21, win by 2, '
    || 'deuce cap 31. Standings: table points (win 1 / loss 0) → point difference → points for → '
    || 'organizer decision. Gender handicap CONFIGURED: the pair with more women starts each game 2 '
    || 'points ahead per surplus woman (difference-based, keyed off composition, never identity).',
  1,
  false,   -- never the global default
  false,   -- handicap is now configured
  'active',
  $json$[
    {
      "category": "beginner",
      "rules": {
        "group": {
          "match": { "games_to_win": 1, "max_games": 1, "points_to_win": 15, "win_by": 1, "points_cap": null, "allow_tied_game": false },
          "win_table_points": 1,
          "loss_table_points": 0,
          "tie_break_order": ["table_points", "point_difference", "points_for", "organizer_decision"]
        },
        "knockout": {
          "match": { "games_to_win": 1, "max_games": 1, "points_to_win": 21, "win_by": 2, "points_cap": 31, "allow_tied_game": false }
        },
        "handicap": { "enabled": true, "mode": "female_count_difference", "entries": [], "points_per_difference": 2, "requires_configuration": false }
      }
    },
    {
      "category": "standard",
      "rules": {
        "group": {
          "match": { "games_to_win": 1, "max_games": 1, "points_to_win": 21, "win_by": 1, "points_cap": null, "allow_tied_game": false },
          "win_table_points": 1,
          "loss_table_points": 0,
          "tie_break_order": ["table_points", "point_difference", "points_for", "organizer_decision"]
        },
        "knockout": {
          "match": { "games_to_win": 1, "max_games": 1, "points_to_win": 21, "win_by": 2, "points_cap": 31, "allow_tied_game": false }
        },
        "handicap": { "enabled": true, "mode": "female_count_difference", "entries": [], "points_per_difference": 2, "requires_configuration": false }
      }
    }
  ]$json$::jsonb
)
ON CONFLICT (preset_key, version) DO UPDATE SET
  label                  = EXCLUDED.label,
  description            = EXCLUDED.description,
  schema_version         = EXCLUDED.schema_version,
  is_default             = EXCLUDED.is_default,
  requires_configuration = EXCLUDED.requires_configuration,
  status                 = EXCLUDED.status,
  payload                = EXCLUDED.payload,
  updated_at             = now();

-- 5. Deprecate v1 so the admin picker offers v2 by default. V1 is retained (not deleted): existing v1
-- snapshots still resolve for provenance and stay handicap-blocked by design. Payload is NOT touched.
UPDATE public.tournament_rule_presets
   SET status = 'deprecated', updated_at = now()
   WHERE preset_key = 'fjp_olympiad_2026' AND version = 1;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_fjp_handicap.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════
