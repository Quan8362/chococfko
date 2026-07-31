-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT — CONTROLLED RULE CHANGE, RESET & REGENERATION (Prompt 15D-2, migration #11)
-- ════════════════════════════════════════════════════════════════════════════════════
-- ADDITIVE on top of migrations #1..#10. Nothing existing is modified — this file only CREATEs one
-- orchestrator function (idempotent CREATE OR REPLACE) and locks its execution to service_role.
--
-- Purpose. The conservative rule guard (lib/tournaments/rules/editor.ts) blocks a rule edit once an
-- event has generated matches. Prompt 15C-2 added reset-to-preset / delete-in-setup. This adds the
-- CONTROLLED post-generation path: change the scoring rules AFTER a schedule / bracket exists (even
-- after results), in ONE atomic step that (a) resets the downstream data the new rules invalidate,
-- (b) updates the event's rule snapshot, and (c) optionally regenerates the round-robin schedule —
-- ALL-OR-NOTHING. Any failure inside the mutation rolls back every change (a single savepoint block).
--
-- Discipline (mirrors tournament_reset_knockout_path / tournament_regenerate_group_matches):
--   • SECURITY DEFINER, pinned search_path, EXECUTE granted to service_role ONLY.
--   • ALL validation (existence, anti-IDOR tournament↔event, format, completed-event block, event +
--     snapshot optimistic-version, destructive confirmation) happens BEFORE any mutation, so an error
--     path never leaves a partial write.
--   • The event row AND the snapshot row are locked FOR UPDATE first, so the version checks are
--     race-free (a concurrent editor is serialized behind the lock).
--   • The impact analysis (counts, classification, the pre-built round-robin match rows) is computed by
--     the PURE engine in the server action from freshly reloaded DB truth and an impact TOKEN; this RPC
--     re-verifies versions as the DB-level backstop. The client payload is never trusted.
--   • Preserved by design: the tournament, event, competitors, groups + group assignments, the rule
--     PRESET, membership, and the audit log. Never orphaned, never mixed-generation.
-- ════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tournament_apply_rule_change(
  p_event_id uuid,
  p_tournament_id uuid,
  p_snapshot_id uuid,
  p_expected_snapshot_version integer,
  p_expected_event_version integer,
  p_new_payload jsonb,
  p_new_snapshot_version integer,
  p_requires_configuration boolean,
  p_reset_mode text,
  p_regenerate_mode text,
  p_regen_matches jsonb,
  p_confirm boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ev_version   integer;
  v_ev_status    text;
  v_ev_tourn     uuid;
  v_format       text;
  v_snap_event   uuid;
  v_snap_version integer;
  v_has_results  boolean;
  v_scored_games integer;
  v_completed    integer;
  v_podium_rows  integer;
  v_qual_rows    integer;
  v_group_del    integer;
  v_ko_del       integer;
  v_regenerated  boolean := false;
  v_new_status   text;
  v_regen_count  integer := 0;
BEGIN
  -- ── 0. Argument sanity (no I/O) ───────────────────────────────────────────────────────────
  IF p_reset_mode NOT IN ('schedule_only', 'all_results_and_downstream') THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;
  IF p_regenerate_mode NOT IN ('none', 'round_robin', 'knockout', 'all_applicable') THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;
  IF p_new_payload IS NULL OR jsonb_typeof(p_new_payload) <> 'object' THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;
  IF p_new_snapshot_version IS NULL OR p_new_snapshot_version < 1 THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;

  -- ── 1. Lock + verify the event (anti-IDOR + format + completed block + version) ────────────
  SELECT version, status, tournament_id, format
    INTO v_ev_version, v_ev_status, v_ev_tourn, v_format
    FROM public.tournament_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_ev_tourn <> p_tournament_id THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF p_expected_event_version IS NOT NULL AND v_ev_version <> p_expected_event_version THEN
    RETURN jsonb_build_object('code', 'event_version_conflict');
  END IF;
  -- A completed event is blocked by default; it must be reopened through the existing flow first (§6).
  IF v_ev_status = 'completed' THEN RETURN jsonb_build_object('code', 'event_completed'); END IF;

  -- ── 2. Lock + verify the snapshot (belongs to event, optimistic version) ───────────────────
  SELECT event_id, version INTO v_snap_event, v_snap_version
    FROM public.tournament_event_rule_snapshots WHERE id = p_snapshot_id FOR UPDATE;
  IF NOT FOUND OR v_snap_event <> p_event_id THEN
    RETURN jsonb_build_object('code', 'snapshot_not_found');
  END IF;
  IF v_snap_version <> p_expected_snapshot_version THEN
    RETURN jsonb_build_object('code', 'snapshot_version_conflict');
  END IF;

  -- ── 3. Count downstream truth (for the response + the destructive gate) ────────────────────
  SELECT count(*) INTO v_completed FROM public.tournament_matches
    WHERE event_id = p_event_id AND status = 'completed';
  SELECT count(*) INTO v_scored_games FROM public.tournament_match_games mg
    JOIN public.tournament_matches m ON m.id = mg.match_id WHERE m.event_id = p_event_id;
  SELECT count(*) INTO v_podium_rows FROM public.tournament_podium WHERE event_id = p_event_id;
  SELECT count(*) INTO v_qual_rows FROM public.tournament_qualification_overrides WHERE event_id = p_event_id;
  v_has_results := (v_completed > 0) OR (v_scored_games > 0) OR (v_podium_rows > 0);

  -- ── 4. Destructive gate — results present may ONLY be wiped with the explicit destructive mode +
  --      confirmation. A schedule_only request over live results is refused (never silent). ────
  IF v_has_results THEN
    IF p_reset_mode <> 'all_results_and_downstream' THEN
      RETURN jsonb_build_object('code', 'results_present');
    END IF;
    IF p_confirm IS NOT TRUE THEN
      RETURN jsonb_build_object('code', 'confirmation_required');
    END IF;
  END IF;

  -- ── 5. Mutation — ALL inside ONE savepoint block. Any failure rolls back EVERYTHING (the deletes,
  --      the snapshot update AND the regeneration) so the event can never be left mixed-generation. ─
  BEGIN
    -- (a) Reset downstream in dependency order. Podium → qualification overrides → match games →
    --     matches. Competitors, groups, group assignments, the preset, membership and audit are kept.
    DELETE FROM public.tournament_podium WHERE event_id = p_event_id;
    DELETE FROM public.tournament_qualification_overrides WHERE event_id = p_event_id;
    DELETE FROM public.tournament_match_games
      WHERE match_id IN (SELECT id FROM public.tournament_matches WHERE event_id = p_event_id);
    WITH del_ko AS (
      DELETE FROM public.tournament_matches WHERE event_id = p_event_id AND stage = 'knockout' RETURNING 1)
      SELECT count(*) INTO v_ko_del FROM del_ko;
    WITH del_gr AS (
      DELETE FROM public.tournament_matches WHERE event_id = p_event_id AND stage = 'group' RETURNING 1)
      SELECT count(*) INTO v_group_del FROM del_gr;

    -- (b) Update the rule snapshot (pinned on the expected version — race-free under the FOR UPDATE
    --     lock, but pinned anyway as a backstop). The bump trigger advances `version`.
    UPDATE public.tournament_event_rule_snapshots
       SET payload = p_new_payload,
           snapshot_version = p_new_snapshot_version,
           requires_configuration = p_requires_configuration
       WHERE id = p_snapshot_id AND event_id = p_event_id AND version = p_expected_snapshot_version;

    -- (c) Regenerate the round-robin schedule when requested and applicable. The knockout bracket is
    --     NEVER auto-generated here — it needs fresh, valid standings (or a manual reseed), so a
    --     group_knockout only regenerates its group stage (§10).
    IF p_regenerate_mode IN ('round_robin', 'all_applicable')
       AND v_format IN ('round_robin', 'group_knockout')
       AND p_regen_matches IS NOT NULL AND jsonb_typeof(p_regen_matches) = 'array'
       AND jsonb_array_length(p_regen_matches) > 0 THEN
      INSERT INTO public.tournament_matches
        (event_id, group_id, stage, bracket, round_number, match_number,
         competitor_a_id, competitor_b_id, status, generation_key)
      SELECT p_event_id,
             (e->>'group_id')::uuid, 'group', NULL,
             (e->>'round_number')::integer, (e->>'match_number')::integer,
             (e->>'competitor_a_id')::uuid, (e->>'competitor_b_id')::uuid,
             'ready', (e->>'generation_key')
      FROM jsonb_array_elements(p_regen_matches) AS e;
      GET DIAGNOSTICS v_regen_count = ROW_COUNT;
      v_regenerated := v_regen_count > 0;
    END IF;

    -- (d) Recompute event status: regenerated group stage ⇒ 'group_stage'; otherwise back to 'setup'
    --     (no matches remain — no mixed-generation, no stale bracket).
    v_new_status := CASE WHEN v_regenerated THEN 'group_stage' ELSE 'setup' END;
    UPDATE public.tournament_events SET status = v_new_status WHERE id = p_event_id;
  EXCEPTION
    WHEN check_violation OR not_null_violation OR unique_violation
      OR invalid_text_representation OR foreign_key_violation THEN
      -- Savepoint rollback: every mutation above is undone. The event is exactly as it was.
      RETURN jsonb_build_object('code', 'invalid');
  END;

  RETURN jsonb_build_object(
    'code', 'ok',
    'status', v_new_status,
    'snapshot_version', p_new_snapshot_version,
    'regenerated', v_regenerated,
    'regenerated_count', v_regen_count,
    'reset', jsonb_build_object(
      'group_matches', v_group_del,
      'knockout_matches', v_ko_del,
      'scored_games', v_scored_games,
      'completed_matches', v_completed,
      'podium_rows', v_podium_rows,
      'qualification_overrides', v_qual_rows
    )
  );
END;
$$;

-- ── Lock execution to service_role only (Supabase grants EXECUTE to anon+authenticated by default) ─
REVOKE ALL ON FUNCTION public.tournament_apply_rule_change(
  uuid, uuid, uuid, integer, integer, jsonb, integer, boolean, text, text, jsonb, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tournament_apply_rule_change(
  uuid, uuid, uuid, integer, integer, jsonb, integer, boolean, text, text, jsonb, boolean
) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_rule_reset.sql
-- ════════════════════════════════════════════════════════════════════════════════════
