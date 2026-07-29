-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT — GROUP MATCH SCORING & QUALIFICATION OVERRIDES (Prompt 07)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Adds four TRANSACTIONAL, service-role-only RPCs on top of migration_tournament_core.sql.
-- Nothing in Prompt-02's schema is modified — this file only CREATEs functions. Idempotent
-- (CREATE OR REPLACE). Run in Supabase SQL Editor (or an isolated local/preview DB), AFTER
-- migration_tournament_core.sql (and it coexists with migration_tournament_group_assignment.sql).
--
-- Why RPCs: the Supabase JS client cannot wrap a multi-statement transaction, but "replace all
-- games + set winner + set status + drop a now-stale override + recompute event status" and the
-- override upsert/delete MUST each be atomic. Every function:
--   • runs in a single implicit transaction (all-or-nothing),
--   • takes the relevant row lock (event and/or match FOR UPDATE) and compares the caller's
--     optimistic-concurrency token BEFORE any write (stale ⇒ version_conflict, nothing written),
--   • REFUSES if a knockout match already exists downstream (has_knockout) — Prompt 07 never
--     cascades into knockout; correcting a scored group after seeding is a Prompt-08 reset path,
--   • re-derives the COARSE completion of the group stage in SQL and CLAMPS the caller-supplied
--     target status to it, so a jump to knockout_ready/completed can only happen when every group
--     match is really finished (the caller computes the precise target via the pure engine),
--   • returns a jsonb {code, …} the server action maps to a typed result — raw SQL errors never
--     surface to the UI,
--   • is SECURITY DEFINER with a pinned search_path and EXECUTE granted to service_role ONLY
--     (REVOKE FROM PUBLIC, anon, authenticated) — same discipline as the Prompt-06 RPCs.
--
-- The winner is ALWAYS derived by the pure engine (deriveMatchOutcome) in the action and passed in;
-- these functions never re-derive it. DB CHECKs (tmg_no_tie, scores ≥ 0, winner ∈ {a,b}) backstop.
-- The server actions still call checkIsAdmin() BEFORE invoking these via the service-role client.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Save (create or update) a group match result — atomic ──────────────────────────────
-- p_games: [{"game_number":int,"score_a":int,"score_b":int}, …] already validated by the engine.
-- Replaces the match's games, sets winner + status='completed', drops the group's qualification
-- override if present (the result changed → any prior manual tie-break may be stale), and sets the
-- event status (clamped to the SQL-observed completion). Guarded by the MATCH version so a stale
-- editor never overwrites a concurrent edit of the SAME match.
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
  -- Only a real, ready/completed pairing can be scored — never a placeholder, BYE or cancelled row.
  IF v_status NOT IN ('ready', 'completed') OR v_a IS NULL OR v_b IS NULL THEN
    RETURN jsonb_build_object('code', 'not_scoreable');
  END IF;
  IF v_version <> p_expected_match_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  -- Never edit a scored group once knockout has been seeded from it (Prompt 08 reset territory).
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

  -- The result changed → a prior manual tie-break for this group may no longer hold. Drop it.
  DELETE FROM public.tournament_qualification_overrides
    WHERE event_id = p_event_id AND group_id = v_group_id;

  -- Coarse completion (SQL truth): every group match finished and at least one exists.
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

-- ── 2. Clear a group match result — atomic ────────────────────────────────────────────────
-- Deletes the games, resets winner→NULL and status→'ready', drops the group's override, and
-- recomputes the event status (which necessarily falls back to group_stage). Guarded by the match
-- version. Blocked once knockout is seeded downstream.
CREATE OR REPLACE FUNCTION public.tournament_clear_match_result(
  p_match_id uuid,
  p_event_id uuid,
  p_expected_match_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_stage    text;
  v_status   text;
  v_version  integer;
  v_group_id uuid;
  v_all_completed boolean;
  v_new_status text;
BEGIN
  SELECT stage, status, version, group_id
    INTO v_stage, v_status, v_version, v_group_id
    FROM public.tournament_matches
    WHERE id = p_match_id AND event_id = p_event_id
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_stage <> 'group' THEN RETURN jsonb_build_object('code', 'wrong_stage'); END IF;
  IF v_status <> 'completed' THEN RETURN jsonb_build_object('code', 'not_scoreable'); END IF;
  IF v_version <> p_expected_match_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_matches
             WHERE event_id = p_event_id AND stage = 'knockout') THEN
    RETURN jsonb_build_object('code', 'has_knockout');
  END IF;

  DELETE FROM public.tournament_match_games WHERE match_id = p_match_id;
  UPDATE public.tournament_matches
     SET status = 'ready', winner_competitor_id = NULL
     WHERE id = p_match_id;

  DELETE FROM public.tournament_qualification_overrides
    WHERE event_id = p_event_id AND group_id = v_group_id;

  -- A just-cleared match is 'ready' → the stage can no longer be complete.
  UPDATE public.tournament_events SET status = 'group_stage' WHERE id = p_event_id;

  RETURN jsonb_build_object('code', 'ok', 'status', 'group_stage');
END;
$$;

-- ── 3. Save a qualification override (manual tie-break) — atomic ───────────────────────────
-- Upserts the group's resolved order (the FULL permutation of the group roster, produced by the
-- engine from the Admin's tie-group ordering). Guarded by the EVENT version so a standings change
-- (any match save bumps it) since the Admin loaded is detected → version_conflict. The event status
-- is set to the caller-computed target, clamped to SQL completion.
CREATE OR REPLACE FUNCTION public.tournament_save_qualification_override(
  p_event_id uuid,
  p_group_id uuid,
  p_expected_event_version integer,
  p_resolved_order jsonb,
  p_reason text,
  p_actor uuid,
  p_target_status text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_version integer;
  v_all_completed boolean;
  v_new_status text;
BEGIN
  IF p_resolved_order IS NULL OR jsonb_typeof(p_resolved_order) <> 'array'
     OR jsonb_array_length(p_resolved_order) = 0 THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;

  SELECT version INTO v_version FROM public.tournament_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_version <> p_expected_event_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_matches
             WHERE event_id = p_event_id AND stage = 'knockout') THEN
    RETURN jsonb_build_object('code', 'has_knockout');
  END IF;

  -- The group must belong to this event (composite FK also enforces it on write).
  IF NOT EXISTS (SELECT 1 FROM public.tournament_groups WHERE id = p_group_id AND event_id = p_event_id) THEN
    RETURN jsonb_build_object('code', 'not_found');
  END IF;

  BEGIN
    INSERT INTO public.tournament_qualification_overrides (event_id, group_id, resolved_order, reason, created_by)
    VALUES (p_event_id, p_group_id, p_resolved_order, NULLIF(btrim(coalesce(p_reason, '')), ''), p_actor)
    ON CONFLICT (event_id, group_id)
      DO UPDATE SET resolved_order = EXCLUDED.resolved_order,
                    reason = EXCLUDED.reason,
                    created_by = EXCLUDED.created_by,
                    created_at = now();
  EXCEPTION
    WHEN foreign_key_violation OR check_violation OR not_null_violation OR invalid_text_representation THEN
      RETURN jsonb_build_object('code', 'invalid');
  END;

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

  RETURN jsonb_build_object('code', 'ok', 'status', v_new_status);
END;
$$;

-- ── 4. Delete a qualification override — atomic ───────────────────────────────────────────
-- Removes the manual tie-break for a group and recomputes the event status (removing a needed
-- override re-blocks knockout_ready → group_stage_completed). Guarded by the EVENT version.
CREATE OR REPLACE FUNCTION public.tournament_delete_qualification_override(
  p_event_id uuid,
  p_group_id uuid,
  p_expected_event_version integer,
  p_target_status text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_version integer;
  v_all_completed boolean;
  v_new_status text;
  v_deleted integer;
BEGIN
  SELECT version INTO v_version FROM public.tournament_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_version <> p_expected_event_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_matches
             WHERE event_id = p_event_id AND stage = 'knockout') THEN
    RETURN jsonb_build_object('code', 'has_knockout');
  END IF;

  WITH del AS (
    DELETE FROM public.tournament_qualification_overrides
      WHERE event_id = p_event_id AND group_id = p_group_id
    RETURNING 1
  ) SELECT count(*) INTO v_deleted FROM del;
  IF v_deleted = 0 THEN RETURN jsonb_build_object('code', 'not_found'); END IF;

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

  RETURN jsonb_build_object('code', 'ok', 'status', v_new_status);
END;
$$;

-- ── 5. Lock down execution to service_role only ───────────────────────────────────────────
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on new public functions to anon +
-- authenticated, so REVOKE from PUBLIC alone is NOT enough — revoke from those roles explicitly.
REVOKE ALL ON FUNCTION public.tournament_save_match_result(uuid, uuid, integer, jsonb, uuid, text)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_clear_match_result(uuid, uuid, integer)                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_save_qualification_override(uuid, uuid, integer, jsonb, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_delete_qualification_override(uuid, uuid, integer, text)             FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.tournament_save_match_result(uuid, uuid, integer, jsonb, uuid, text)             TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_clear_match_result(uuid, uuid, integer)                               TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_save_qualification_override(uuid, uuid, integer, jsonb, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_delete_qualification_override(uuid, uuid, integer, text)              TO service_role;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_scoring.sql
-- ════════════════════════════════════════════════════════════════════════════════════
