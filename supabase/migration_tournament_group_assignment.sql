-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT — GROUP ASSIGNMENT & ROUND-ROBIN GENERATION (Prompt 06)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Adds four TRANSACTIONAL, service-role-only RPCs on top of migration_tournament_core.sql.
-- Nothing in Prompt-02's schema is modified — this file only CREATEs functions. Idempotent
-- (CREATE OR REPLACE). Run in Supabase SQL Editor (or an isolated local/preview DB).
--
-- Why RPCs: the Supabase JS client cannot wrap a multi-statement transaction, but "save the whole
-- desired assignment" (delete-all + re-insert) and "generate matches" (bulk insert + status change)
-- MUST be atomic. Each function:
--   • runs in a single implicit transaction (all-or-nothing),
--   • takes a row lock on the event (SELECT … FOR UPDATE) and compares the caller's expected
--     version BEFORE any write → optimistic-concurrency guard (stale token ⇒ version_conflict,
--     nothing written); the event's version trigger bumps on the final touch so a concurrent admin
--     who saved first is detected,
--   • returns a jsonb {code, …} the server action maps to a typed result — raw SQL errors never
--     surface to the UI,
--   • is SECURITY DEFINER with a pinned search_path and EXECUTE granted to service_role ONLY
--     (REVOKE FROM PUBLIC) — same "service-role-only DEFINER RPC" discipline as poker_tournament_*.
--
-- The server actions still call checkIsAdmin() BEFORE invoking these via the service-role client;
-- the EXECUTE grant is the second fence.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Initialize groups (idempotent structure build) ─────────────────────────────────────
-- Materializes exactly the groups named in p_names (computed as A,B,C… in JS so the naming stays
-- pure/testable). Creates missing ones; deletes now-surplus EMPTY ones; blocks (would_orphan) if a
-- surplus group still holds competitors — the admin must move them out first (never silently drop
-- a membership). Blocked entirely once group matches exist (structure is frozen post-generate).
CREATE OR REPLACE FUNCTION public.tournament_initialize_groups(
  p_event_id uuid,
  p_expected_version integer,
  p_names text[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_version integer;
  v_format  text;
  v_orphans text[];
  v_created integer := 0;
  v_removed integer := 0;
  v_name    text;
  i         integer;
BEGIN
  SELECT version, format INTO v_version, v_format
    FROM public.tournament_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_format = 'knockout' THEN RETURN jsonb_build_object('code', 'wrong_format'); END IF;
  IF v_version <> p_expected_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_matches
             WHERE event_id = p_event_id AND stage = 'group') THEN
    RETURN jsonb_build_object('code', 'has_matches');
  END IF;

  -- Surplus groups (present but not requested) that still hold competitors → refuse.
  SELECT array_agg(g.name ORDER BY g.name) INTO v_orphans
  FROM public.tournament_groups g
  WHERE g.event_id = p_event_id
    AND NOT (g.name = ANY(p_names))
    AND EXISTS (SELECT 1 FROM public.tournament_group_memberships m WHERE m.group_id = g.id);
  IF v_orphans IS NOT NULL THEN
    RETURN jsonb_build_object('code', 'would_orphan', 'groups', to_jsonb(v_orphans));
  END IF;

  -- Delete surplus EMPTY groups.
  WITH del AS (
    DELETE FROM public.tournament_groups g
    WHERE g.event_id = p_event_id AND NOT (g.name = ANY(p_names))
    RETURNING 1
  ) SELECT count(*) INTO v_removed FROM del;

  -- Upsert the requested groups, keeping display_order aligned to the requested index.
  FOR i IN 1 .. array_length(p_names, 1) LOOP
    v_name := p_names[i];
    INSERT INTO public.tournament_groups (event_id, name, display_order)
    VALUES (p_event_id, v_name, i - 1)
    ON CONFLICT (event_id, name) DO UPDATE SET display_order = EXCLUDED.display_order;
  END LOOP;
  SELECT count(*) INTO v_created FROM public.tournament_groups WHERE event_id = p_event_id;

  -- Version-bumping touch (concurrency backstop for readers holding the old token).
  UPDATE public.tournament_events SET display_order = display_order WHERE id = p_event_id;

  RETURN jsonb_build_object('code', 'ok', 'group_count', v_created, 'removed', v_removed);
END;
$$;

-- ── 2. Save the full desired assignment (replace-all, atomic) ─────────────────────────────
-- p_assignments: [{"group_id": uuid, "competitor_ids": [uuid, …]}]. Competitors NOT listed are
-- left unassigned (no membership row). Foreign groups/competitors, cross-event ids, or a
-- competitor listed twice all trip the composite FKs / unique(event_id,competitor_id) → caught and
-- reported as 'invalid'. Blocked once group matches exist (assignment frozen post-generate).
CREATE OR REPLACE FUNCTION public.tournament_save_group_assignments(
  p_event_id uuid,
  p_expected_version integer,
  p_assignments jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_version integer;
  v_format  text;
  v_count   integer := 0;
BEGIN
  SELECT version, format INTO v_version, v_format
    FROM public.tournament_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_format = 'knockout' THEN RETURN jsonb_build_object('code', 'wrong_format'); END IF;
  IF v_version <> p_expected_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_matches
             WHERE event_id = p_event_id AND stage = 'group') THEN
    RETURN jsonb_build_object('code', 'has_matches');
  END IF;

  BEGIN
    DELETE FROM public.tournament_group_memberships WHERE event_id = p_event_id;

    INSERT INTO public.tournament_group_memberships (event_id, group_id, competitor_id, display_order)
    SELECT p_event_id,
           (elem->>'group_id')::uuid,
           ci.competitor_id::uuid,
           (ci.ord - 1)::integer
    FROM jsonb_array_elements(p_assignments) AS elem
    CROSS JOIN LATERAL jsonb_array_elements_text(elem->'competitor_ids')
      WITH ORDINALITY AS ci(competitor_id, ord);

    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION
    WHEN foreign_key_violation OR unique_violation OR not_null_violation
      OR invalid_text_representation OR check_violation THEN
      RETURN jsonb_build_object('code', 'invalid');
  END;

  UPDATE public.tournament_events SET display_order = display_order WHERE id = p_event_id;

  RETURN jsonb_build_object('code', 'ok', 'assigned', v_count);
END;
$$;

-- ── 3. Generate group (round-robin) matches — atomic, idempotent ──────────────────────────
-- p_matches: [{"group_id","round_number","match_number","competitor_a_id","competitor_b_id",
-- "generation_key"}] built by the server from re-loaded DB truth (generateRoundRobin per group).
-- Idempotent: if group matches already exist, returns 'already_generated' without touching
-- anything; ON CONFLICT (event_id, generation_key) DO NOTHING is the DB backstop against a
-- double-submit race. On success sets event.status = 'group_stage'.
CREATE OR REPLACE FUNCTION public.tournament_generate_group_matches(
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
  IF v_format = 'knockout' THEN RETURN jsonb_build_object('code', 'wrong_format'); END IF;
  IF v_version <> p_expected_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  SELECT count(*) INTO v_existing FROM public.tournament_matches
    WHERE event_id = p_event_id AND stage = 'group';
  IF v_existing > 0 THEN
    RETURN jsonb_build_object('code', 'already_generated', 'match_count', v_existing);
  END IF;

  IF p_matches IS NULL OR jsonb_typeof(p_matches) <> 'array' OR jsonb_array_length(p_matches) = 0 THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;

  BEGIN
    INSERT INTO public.tournament_matches
      (event_id, group_id, stage, bracket, round_number, match_number,
       competitor_a_id, competitor_b_id, status, generation_key)
    SELECT p_event_id,
           (e->>'group_id')::uuid, 'group', NULL,
           (e->>'round_number')::integer, (e->>'match_number')::integer,
           (e->>'competitor_a_id')::uuid, (e->>'competitor_b_id')::uuid,
           'ready', (e->>'generation_key')
    FROM jsonb_array_elements(p_matches) AS e
    ON CONFLICT (event_id, generation_key) DO NOTHING;
  EXCEPTION
    WHEN foreign_key_violation OR check_violation OR not_null_violation
      OR invalid_text_representation OR unique_violation THEN
      RETURN jsonb_build_object('code', 'invalid');
  END;

  UPDATE public.tournament_events SET status = 'group_stage' WHERE id = p_event_id;

  SELECT count(*) INTO v_count FROM public.tournament_matches
    WHERE event_id = p_event_id AND stage = 'group';
  RETURN jsonb_build_object('code', 'ok', 'match_count', v_count);
END;
$$;

-- ── 4. Regenerate group matches — atomic; only when there are NO results ──────────────────
-- Wipes the existing group matches (and their child games) and rebuilds from p_matches, in ONE
-- transaction. Refuses if any group match is completed, any score/game exists, or any knockout
-- match exists downstream — never cascades into results. Only touches stage='group' rows.
CREATE OR REPLACE FUNCTION public.tournament_regenerate_group_matches(
  p_event_id uuid,
  p_expected_version integer,
  p_matches jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_version integer;
  v_format  text;
  v_count   integer;
BEGIN
  SELECT version, format INTO v_version, v_format
    FROM public.tournament_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_format = 'knockout' THEN RETURN jsonb_build_object('code', 'wrong_format'); END IF;
  IF v_version <> p_expected_version THEN RETURN jsonb_build_object('code', 'version_conflict'); END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_matches
             WHERE event_id = p_event_id AND stage = 'knockout') THEN
    RETURN jsonb_build_object('code', 'event_has_knockout');
  END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_matches
             WHERE event_id = p_event_id AND stage = 'group' AND status = 'completed') THEN
    RETURN jsonb_build_object('code', 'event_has_results');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tournament_match_games mg
    JOIN public.tournament_matches m ON m.id = mg.match_id
    WHERE m.event_id = p_event_id AND m.stage = 'group'
  ) THEN
    RETURN jsonb_build_object('code', 'event_has_results');
  END IF;

  IF p_matches IS NULL OR jsonb_typeof(p_matches) <> 'array' OR jsonb_array_length(p_matches) = 0 THEN
    RETURN jsonb_build_object('code', 'invalid');
  END IF;

  BEGIN
    DELETE FROM public.tournament_matches WHERE event_id = p_event_id AND stage = 'group';

    INSERT INTO public.tournament_matches
      (event_id, group_id, stage, bracket, round_number, match_number,
       competitor_a_id, competitor_b_id, status, generation_key)
    SELECT p_event_id,
           (e->>'group_id')::uuid, 'group', NULL,
           (e->>'round_number')::integer, (e->>'match_number')::integer,
           (e->>'competitor_a_id')::uuid, (e->>'competitor_b_id')::uuid,
           'ready', (e->>'generation_key')
    FROM jsonb_array_elements(p_matches) AS e;
  EXCEPTION
    WHEN foreign_key_violation OR check_violation OR not_null_violation
      OR invalid_text_representation OR unique_violation THEN
      RETURN jsonb_build_object('code', 'invalid');
  END;

  UPDATE public.tournament_events SET status = 'group_stage' WHERE id = p_event_id;

  SELECT count(*) INTO v_count FROM public.tournament_matches
    WHERE event_id = p_event_id AND stage = 'group';
  RETURN jsonb_build_object('code', 'ok', 'match_count', v_count);
END;
$$;

-- ── 5. Lock down execution to service_role only ───────────────────────────────────────────
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on new public functions to anon +
-- authenticated, so REVOKE from PUBLIC alone is NOT enough — revoke from those roles explicitly.
REVOKE ALL ON FUNCTION public.tournament_initialize_groups(uuid, integer, text[])       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_save_group_assignments(uuid, integer, jsonb)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_generate_group_matches(uuid, integer, jsonb)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_regenerate_group_matches(uuid, integer, jsonb)  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.tournament_initialize_groups(uuid, integer, text[])      TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_save_group_assignments(uuid, integer, jsonb)   TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_generate_group_matches(uuid, integer, jsonb)   TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_regenerate_group_matches(uuid, integer, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_group_assignment.sql
-- ════════════════════════════════════════════════════════════════════════════════════
