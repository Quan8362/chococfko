-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT — KNOCKOUT-ONLY SEEDING, BRACKET, RESULTS & PODIUM (Prompt 08)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Adds six TRANSACTIONAL, service-role-only RPCs on top of migration_tournament_core.sql.
-- Nothing in Prompt-02's schema is modified — this file only CREATEs functions. Idempotent
-- (CREATE OR REPLACE). Run in Supabase SQL Editor (or an isolated local/preview DB), AFTER
-- migration_tournament_core.sql. Coexists with the Prompt-06/07 RPC migrations.
--
-- Scope: EVENT FORMAT = 'knockout' ONLY (single championship bracket). group_knockout is Prompt 09.
--
-- Why RPCs: the Supabase JS client cannot wrap a multi-statement transaction, but each of
-- "replace all seeds", "generate the whole bracket (+ wire source refs + auto-advance BYEs)",
-- "reset the bracket", and "save/clear a knockout result (+ advance the winner/loser + podium +
-- event status)" MUST be atomic. Every function:
--   • runs in a single implicit transaction (all-or-nothing),
--   • takes the relevant row lock (event and/or match FOR UPDATE) and compares the caller's
--     optimistic-concurrency token BEFORE any write (stale ⇒ version_conflict, nothing written),
--   • returns a jsonb {code, …} the server action maps to a typed result — raw SQL errors never
--     surface to the UI,
--   • is SECURITY DEFINER with a pinned search_path and EXECUTE granted to service_role ONLY
--     (REVOKE FROM PUBLIC, anon, authenticated) — Supabase default privileges grant EXECUTE to
--     anon/authenticated, so REVOKE from PUBLIC alone is NOT enough.
--
-- The WINNER is ALWAYS derived by the pure engine (deriveMatchOutcome) in the action and passed in;
-- these functions never re-derive it. Downstream slot targets and podium are computed by the pure
-- engine (progressKnockout / calculatePodium) in the action and passed as concrete patches — the
-- server never trusts the client for match ids, slots, winners or versions. DB CHECKs (tmg_no_tie,
-- scores ≥ 0, winner ∈ {a,b}, bye shape) are the final backstop. Actions call checkIsAdmin() BEFORE
-- invoking these via the service-role client; the EXECUTE grant is the second fence.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Save the full desired seed state (replace-all, atomic) ─────────────────────────────
-- p_slots: [{"slot_index":int, "competitor_id":uuid}] — ordered championship seed slots. Foreign /
-- cross-event competitors and duplicate slot indexes trip the composite FK / unique(event,bracket,
-- slot_index) → reported as 'invalid'. Blocked once the bracket is generated (has_matches): seeds
-- are frozen after generation — the admin must reset the bracket first.
CREATE OR REPLACE FUNCTION public.tournament_save_knockout_seeds(
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
  IF v_format <> 'knockout' THEN RETURN jsonb_build_object('code', 'wrong_format'); END IF;
  IF v_version <> p_expected_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_matches
             WHERE event_id = p_event_id AND stage = 'knockout') THEN
    RETURN jsonb_build_object('code', 'has_matches');
  END IF;

  BEGIN
    DELETE FROM public.tournament_knockout_seed_slots
      WHERE event_id = p_event_id AND bracket = 'championship';

    INSERT INTO public.tournament_knockout_seed_slots
      (event_id, bracket, slot_index, source_type, competitor_id)
    SELECT p_event_id, 'championship',
           (e->>'slot_index')::integer, 'competitor', (e->>'competitor_id')::uuid
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

-- ── 2. Clear all seeds — atomic ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tournament_clear_knockout_seeds(
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
  IF v_format <> 'knockout' THEN RETURN jsonb_build_object('code', 'wrong_format'); END IF;
  IF v_version <> p_expected_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_matches
             WHERE event_id = p_event_id AND stage = 'knockout') THEN
    RETURN jsonb_build_object('code', 'has_matches');
  END IF;

  DELETE FROM public.tournament_knockout_seed_slots
    WHERE event_id = p_event_id AND bracket = 'championship';
  UPDATE public.tournament_events SET display_order = display_order WHERE id = p_event_id;

  RETURN jsonb_build_object('code', 'ok');
END;
$$;

-- ── 3. Generate the knockout bracket — atomic, idempotent ─────────────────────────────────
-- p_matches: rows built by the server from generateKnockout (+ buildKnockoutMatchRows). Each row:
--   {generation_key, round_number, match_number, competitor_a_id, competitor_b_id, status,
--    winner_id, source_a_key, source_a_outcome, source_b_key, source_b_outcome}
-- BYEs are already resolved (status='bye', one competitor, winner set — never a 0–0 score); their
-- auto-advanced competitor already fills the downstream slot (status='ready'/'pending' accordingly).
-- Two passes: INSERT the rows (source refs NULL), then wire source_match_*_id by resolving the
-- stable source key → row id within the event. Idempotent: existing knockout ⇒ 'already_generated'.
CREATE OR REPLACE FUNCTION public.tournament_generate_knockout(
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
  IF v_format <> 'knockout' THEN RETURN jsonb_build_object('code', 'wrong_format'); END IF;
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
    -- Pass 1: insert all matches (championship bracket). source refs wired in pass 2.
    INSERT INTO public.tournament_matches
      (event_id, group_id, stage, bracket, round_number, match_number,
       competitor_a_id, competitor_b_id, status, winner_competitor_id, generation_key)
    SELECT p_event_id, NULL, 'knockout', 'championship',
           (e->>'round_number')::integer, (e->>'match_number')::integer,
           NULLIF(e->>'competitor_a_id','')::uuid, NULLIF(e->>'competitor_b_id','')::uuid,
           (e->>'status'), NULLIF(e->>'winner_id','')::uuid, (e->>'generation_key')
    FROM jsonb_array_elements(p_matches) AS e
    ON CONFLICT (event_id, generation_key) DO NOTHING;

    -- Pass 2a: wire slot A source (winner/loser of an earlier match).
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

-- ── 4. Reset the bracket — atomic; only when there are NO results ──────────────────────────
-- Wipes the knockout matches (child games cascade) and any podium, then returns the event to
-- 'setup' (seeds are KEPT so the admin can re-generate). Refuses if any knockout match is completed,
-- any game exists, or a podium exists → 'event_has_results'. Only touches knockout rows + podium.
CREATE OR REPLACE FUNCTION public.tournament_reset_knockout(
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
  IF v_format <> 'knockout' THEN RETURN jsonb_build_object('code', 'wrong_format'); END IF;
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

  UPDATE public.tournament_events SET status = 'setup' WHERE id = p_event_id;

  RETURN jsonb_build_object('code', 'ok');
END;
$$;

-- ── 5. Save (create or update) a knockout match result — atomic ───────────────────────────
-- Replaces the match games, sets winner + status='completed', then advances the winner (and, for a
-- semifinal, the loser → third-place) into the exact downstream slots supplied by the caller
-- (p_patches, computed via progressKnockout). Correction safety: if a downstream slot would change
-- but that downstream match is already completed → 'downstream_has_results' (NO cascade in Prompt 08).
-- Finally persists the podium (p_podium) and event status when the bracket is truly finished — final
-- (and the third-place match, if the bracket has one) both completed — clamped in SQL as a backstop.
--   p_patches: [{"match_id":uuid,"slot":"A"|"B","competitor_id":uuid}]
--   p_podium : null OR [{"rank":int,"competitor_id":uuid,"is_joint":bool}]
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
  -- Only a real, ready/completed pairing can be scored — never a placeholder/BYE/cancelled row.
  IF v_status NOT IN ('ready', 'completed') OR v_a IS NULL OR v_b IS NULL THEN
    RETURN jsonb_build_object('code', 'not_scoreable');
  END IF;
  IF v_version <> p_expected_match_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  -- Correction guard (read-only pre-check): a patch that would CHANGE a slot of an already-completed
  -- downstream match is refused. A first completion (downstream pending/ready) and a pure score edit
  -- (slot value unchanged) both pass.
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

    -- Advance winner/loser into downstream slots; a filled 'pending' match becomes 'ready'.
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

  -- Completion truth from the DB: the third-place match is the one fed by two LOSERS; the final is
  -- the terminal championship match that is NOT the third-place. The bracket is finished when the
  -- final and (if it exists) the third-place match are both completed.
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

  -- Podium is written only when the bracket is finished; a correction that un-completes it clears it.
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

  -- Clamp the caller's target status to SQL completion truth.
  IF v_completed AND p_event_status = 'completed' THEN
    v_new_status := 'completed';
  ELSE
    v_new_status := 'knockout_running';
  END IF;
  UPDATE public.tournament_events SET status = v_new_status WHERE id = p_event_id;

  RETURN jsonb_build_object('code', 'ok', 'status', v_new_status, 'completed', v_completed);
END;
$$;

-- ── 6. Clear a knockout match result — atomic ─────────────────────────────────────────────
-- Deletes the games, resets the match to 'ready' (its own competitors stay — they came from
-- upstream), and empties the downstream slots this match fed (p_clear_slots), returning them to
-- 'pending'. Refused if a downstream match is already completed → 'downstream_has_results'. Any
-- podium is dropped and the event returns to 'knockout_running'. Guarded by the match version.
--   p_clear_slots: [{"match_id":uuid,"slot":"A"|"B"}]
CREATE OR REPLACE FUNCTION public.tournament_clear_knockout_result(
  p_match_id uuid,
  p_event_id uuid,
  p_expected_match_version integer,
  p_clear_slots jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_stage    text;
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

  SELECT stage, status, version INTO v_stage, v_status, v_version
    FROM public.tournament_matches
    WHERE id = p_match_id AND event_id = p_event_id
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_stage <> 'knockout' THEN RETURN jsonb_build_object('code', 'wrong_stage'); END IF;
  IF v_status <> 'completed' THEN RETURN jsonb_build_object('code', 'not_scoreable'); END IF;
  IF v_version <> p_expected_match_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  -- A downstream match with its own result must not be silently undone.
  FOR v_slot IN SELECT value FROM jsonb_array_elements(p_clear_slots) LOOP
    v_t_id := (v_slot->>'match_id')::uuid;
    SELECT status INTO v_t_status
      FROM public.tournament_matches WHERE id = v_t_id AND event_id = p_event_id;
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
       WHERE id = v_t_id AND event_id = p_event_id;
  END LOOP;

  DELETE FROM public.tournament_podium WHERE event_id = p_event_id;
  UPDATE public.tournament_events SET status = 'knockout_running' WHERE id = p_event_id;

  RETURN jsonb_build_object('code', 'ok', 'status', 'knockout_running');
END;
$$;

-- ── 7. Lock down execution to service_role only ───────────────────────────────────────────
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on new public functions to anon +
-- authenticated, so REVOKE from PUBLIC alone is NOT enough — revoke from those roles explicitly.
REVOKE ALL ON FUNCTION public.tournament_save_knockout_seeds(uuid, integer, jsonb)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_clear_knockout_seeds(uuid, integer)                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_generate_knockout(uuid, integer, jsonb)                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_reset_knockout(uuid, integer)                                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_save_knockout_result(uuid, uuid, integer, jsonb, uuid, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_clear_knockout_result(uuid, uuid, integer, jsonb)               FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.tournament_save_knockout_seeds(uuid, integer, jsonb)                      TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_clear_knockout_seeds(uuid, integer)                            TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_generate_knockout(uuid, integer, jsonb)                        TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_reset_knockout(uuid, integer)                                  TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_save_knockout_result(uuid, uuid, integer, jsonb, uuid, jsonb, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_clear_knockout_result(uuid, uuid, integer, jsonb)              TO service_role;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_knockout_bracket.sql
-- ════════════════════════════════════════════════════════════════════════════════════
