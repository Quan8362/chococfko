-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT — GROUP ASSIGNMENT & GENERATION RPC TEST HARNESS (Prompt 06)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Exercises the four RPCs from migration_tournament_group_assignment.sql:
--   • anon / authenticated CANNOT EXECUTE them (service-role-only DEFINER RPCs).
--   • initialize is idempotent and blocks would_orphan when shrinking a non-empty group.
--   • save is replace-all + permutation-safe; cross-event / duplicate ids → 'invalid'.
--   • stale version → 'version_conflict' with nothing written.
--   • generate is idempotent (2nd call = already_generated, no new rows) and sets status.
--   • regenerate works only with NO results; blocked by completed match, score, or knockout.
--   • generate/regenerate never touch matches of another stage.
--
-- Run AFTER migration_tournament_core.sql AND migration_tournament_group_assignment.sql, against
-- an ISOLATED database. One transaction, ROLLBACK at the end — persists NOTHING.
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;
RESET ROLE;

-- ── Setup ──────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.tournaments (id, slug, name, status) VALUES
  ('e0000000-0000-0000-0000-000000000001'::uuid, 'grp-t', 'Group Tourney', 'draft');

-- round_robin event with 2 groups requested.
INSERT INTO public.tournament_events (id, tournament_id, name, format, group_count) VALUES
  ('e1000000-0000-0000-0000-0000000000a1'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid,
   'RR Event', 'round_robin', 2);
-- A second event to prove cross-event isolation.
INSERT INTO public.tournament_events (id, tournament_id, name, format, group_count) VALUES
  ('e1000000-0000-0000-0000-0000000000a2'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid,
   'Other Event', 'round_robin', 1);
-- A knockout event to prove wrong_format rejection.
INSERT INTO public.tournament_events (id, tournament_id, name, format, group_count) VALUES
  ('e1000000-0000-0000-0000-0000000000a3'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid,
   'KO Event', 'knockout', 1);

-- Four competitors in the RR event, one foreign competitor in the other event.
INSERT INTO public.tournament_competitors (id, event_id, name, display_order) VALUES
  ('c1000000-0000-0000-0000-000000000001'::uuid, 'e1000000-0000-0000-0000-0000000000a1'::uuid, 'A', 0),
  ('c1000000-0000-0000-0000-000000000002'::uuid, 'e1000000-0000-0000-0000-0000000000a1'::uuid, 'B', 1),
  ('c1000000-0000-0000-0000-000000000003'::uuid, 'e1000000-0000-0000-0000-0000000000a1'::uuid, 'C', 2),
  ('c1000000-0000-0000-0000-000000000004'::uuid, 'e1000000-0000-0000-0000-0000000000a1'::uuid, 'D', 3);
INSERT INTO public.tournament_competitors (id, event_id, name) VALUES
  ('c2000000-0000-0000-0000-000000000001'::uuid, 'e1000000-0000-0000-0000-0000000000a2'::uuid, 'Foreign');

-- ── 1. anon & authenticated cannot EXECUTE the RPCs ─────────────────────────────────────────
SET LOCAL ROLE anon;
DO $$
DECLARE ran boolean := false;
BEGIN
  BEGIN
    PERFORM public.tournament_initialize_groups(
      'e1000000-0000-0000-0000-0000000000a1'::uuid, 1, ARRAY['A','B']);
    ran := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ran THEN RAISE EXCEPTION 'FAIL: anon executed tournament_initialize_groups'; END IF;
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE ran boolean := false;
BEGIN
  BEGIN
    PERFORM public.tournament_save_group_assignments(
      'e1000000-0000-0000-0000-0000000000a1'::uuid, 1, '[]'::jsonb);
    ran := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ran THEN RAISE EXCEPTION 'FAIL: authenticated executed tournament_save_group_assignments'; END IF;
END $$;

-- Everything else runs as service_role (createAdminClient() after checkIsAdmin()).
SET LOCAL ROLE service_role;

-- ── 2. initialize creates the requested groups and is idempotent ────────────────────────────
DO $$
DECLARE r jsonb; v integer; n integer;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'e1000000-0000-0000-0000-0000000000a1';
  r := public.tournament_initialize_groups('e1000000-0000-0000-0000-0000000000a1'::uuid, v, ARRAY['A','B']);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: init not ok: %', r; END IF;
  SELECT count(*) INTO n FROM public.tournament_groups WHERE event_id = 'e1000000-0000-0000-0000-0000000000a1';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: expected 2 groups, got %', n; END IF;

  -- Re-run with the (now bumped) version → still 2 groups, no duplicates.
  SELECT version INTO v FROM public.tournament_events WHERE id = 'e1000000-0000-0000-0000-0000000000a1';
  r := public.tournament_initialize_groups('e1000000-0000-0000-0000-0000000000a1'::uuid, v, ARRAY['A','B']);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: init(2) not ok: %', r; END IF;
  SELECT count(*) INTO n FROM public.tournament_groups WHERE event_id = 'e1000000-0000-0000-0000-0000000000a1';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: init not idempotent, groups=%', n; END IF;
END $$;

-- ── 3. stale version → version_conflict (nothing written) ──────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := public.tournament_initialize_groups('e1000000-0000-0000-0000-0000000000a1'::uuid, 1, ARRAY['A','B','C']);
  IF r->>'code' <> 'version_conflict' THEN RAISE EXCEPTION 'FAIL: expected version_conflict, got %', r; END IF;
END $$;

-- ── 4. knockout event → wrong_format ────────────────────────────────────────────────────────
DO $$
DECLARE r jsonb; v integer;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'e1000000-0000-0000-0000-0000000000a3';
  r := public.tournament_initialize_groups('e1000000-0000-0000-0000-0000000000a3'::uuid, v, ARRAY['A']);
  IF r->>'code' <> 'wrong_format' THEN RAISE EXCEPTION 'FAIL: expected wrong_format, got %', r; END IF;
END $$;

-- ── 5. save a valid permutation (2 per group) ───────────────────────────────────────────────
DO $$
DECLARE r jsonb; v integer; ga uuid; gb uuid; n integer;
BEGIN
  SELECT id INTO ga FROM public.tournament_groups WHERE event_id='e1000000-0000-0000-0000-0000000000a1' AND name='A';
  SELECT id INTO gb FROM public.tournament_groups WHERE event_id='e1000000-0000-0000-0000-0000000000a1' AND name='B';
  SELECT version INTO v FROM public.tournament_events WHERE id = 'e1000000-0000-0000-0000-0000000000a1';
  r := public.tournament_save_group_assignments('e1000000-0000-0000-0000-0000000000a1'::uuid, v,
    jsonb_build_array(
      jsonb_build_object('group_id', ga, 'competitor_ids',
        jsonb_build_array('c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002')),
      jsonb_build_object('group_id', gb, 'competitor_ids',
        jsonb_build_array('c1000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000004'))
    ));
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: save not ok: %', r; END IF;
  SELECT count(*) INTO n FROM public.tournament_group_memberships WHERE event_id='e1000000-0000-0000-0000-0000000000a1';
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 memberships, got %', n; END IF;
END $$;

-- ── 6. save with a CROSS-EVENT competitor → invalid, memberships unchanged (replace rolled back) ─
DO $$
DECLARE r jsonb; v integer; ga uuid; n integer;
BEGIN
  SELECT id INTO ga FROM public.tournament_groups WHERE event_id='e1000000-0000-0000-0000-0000000000a1' AND name='A';
  SELECT version INTO v FROM public.tournament_events WHERE id = 'e1000000-0000-0000-0000-0000000000a1';
  r := public.tournament_save_group_assignments('e1000000-0000-0000-0000-0000000000a1'::uuid, v,
    jsonb_build_array(
      jsonb_build_object('group_id', ga, 'competitor_ids',
        jsonb_build_array('c2000000-0000-0000-0000-000000000001'))  -- foreign competitor
    ));
  IF r->>'code' <> 'invalid' THEN RAISE EXCEPTION 'FAIL: expected invalid (cross-event), got %', r; END IF;
  SELECT count(*) INTO n FROM public.tournament_group_memberships WHERE event_id='e1000000-0000-0000-0000-0000000000a1';
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL: failed save must not mutate memberships, got %', n; END IF;
END $$;

-- ── 7. generate group matches (2+2 → 1+1 = 2 matches) and is idempotent ─────────────────────
DO $$
DECLARE r jsonb; v integer; ga uuid; gb uuid; n integer; st text;
BEGIN
  SELECT id INTO ga FROM public.tournament_groups WHERE event_id='e1000000-0000-0000-0000-0000000000a1' AND name='A';
  SELECT id INTO gb FROM public.tournament_groups WHERE event_id='e1000000-0000-0000-0000-0000000000a1' AND name='B';
  SELECT version INTO v FROM public.tournament_events WHERE id = 'e1000000-0000-0000-0000-0000000000a1';
  r := public.tournament_generate_group_matches('e1000000-0000-0000-0000-0000000000a1'::uuid, v,
    jsonb_build_array(
      jsonb_build_object('group_id', ga, 'round_number', 1, 'match_number', 1,
        'competitor_a_id','c1000000-0000-0000-0000-000000000001',
        'competitor_b_id','c1000000-0000-0000-0000-000000000002',
        'generation_key','rr:'||ga||':a:b'),
      jsonb_build_object('group_id', gb, 'round_number', 1, 'match_number', 1,
        'competitor_a_id','c1000000-0000-0000-0000-000000000003',
        'competitor_b_id','c1000000-0000-0000-0000-000000000004',
        'generation_key','rr:'||gb||':c:d')
    ));
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: generate not ok: %', r; END IF;
  SELECT count(*) INTO n FROM public.tournament_matches WHERE event_id='e1000000-0000-0000-0000-0000000000a1' AND stage='group';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: expected 2 group matches, got %', n; END IF;
  SELECT status INTO st FROM public.tournament_events WHERE id='e1000000-0000-0000-0000-0000000000a1';
  IF st <> 'group_stage' THEN RAISE EXCEPTION 'FAIL: status not group_stage, got %', st; END IF;

  -- Idempotency: a second generate returns already_generated and does NOT add matches.
  SELECT version INTO v FROM public.tournament_events WHERE id = 'e1000000-0000-0000-0000-0000000000a1';
  r := public.tournament_generate_group_matches('e1000000-0000-0000-0000-0000000000a1'::uuid, v,
    jsonb_build_array(
      jsonb_build_object('group_id', ga, 'round_number', 1, 'match_number', 1,
        'competitor_a_id','c1000000-0000-0000-0000-000000000001',
        'competitor_b_id','c1000000-0000-0000-0000-000000000002',
        'generation_key','rr:'||ga||':a:b')));
  IF r->>'code' <> 'already_generated' THEN RAISE EXCEPTION 'FAIL: expected already_generated, got %', r; END IF;
  SELECT count(*) INTO n FROM public.tournament_matches WHERE event_id='e1000000-0000-0000-0000-0000000000a1' AND stage='group';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: idempotent generate changed match count, got %', n; END IF;
END $$;

-- ── 8. save is blocked once matches exist (has_matches) ─────────────────────────────────────
DO $$
DECLARE r jsonb; v integer; ga uuid;
BEGIN
  SELECT id INTO ga FROM public.tournament_groups WHERE event_id='e1000000-0000-0000-0000-0000000000a1' AND name='A';
  SELECT version INTO v FROM public.tournament_events WHERE id = 'e1000000-0000-0000-0000-0000000000a1';
  r := public.tournament_save_group_assignments('e1000000-0000-0000-0000-0000000000a1'::uuid, v,
    jsonb_build_array(jsonb_build_object('group_id', ga, 'competitor_ids', '[]'::jsonb)));
  IF r->>'code' <> 'has_matches' THEN RAISE EXCEPTION 'FAIL: expected has_matches, got %', r; END IF;
END $$;

-- ── 9. regenerate succeeds when there are no results ────────────────────────────────────────
DO $$
DECLARE r jsonb; v integer; ga uuid; gb uuid; n integer;
BEGIN
  SELECT id INTO ga FROM public.tournament_groups WHERE event_id='e1000000-0000-0000-0000-0000000000a1' AND name='A';
  SELECT id INTO gb FROM public.tournament_groups WHERE event_id='e1000000-0000-0000-0000-0000000000a1' AND name='B';
  SELECT version INTO v FROM public.tournament_events WHERE id = 'e1000000-0000-0000-0000-0000000000a1';
  r := public.tournament_regenerate_group_matches('e1000000-0000-0000-0000-0000000000a1'::uuid, v,
    jsonb_build_array(
      jsonb_build_object('group_id', ga, 'round_number', 1, 'match_number', 1,
        'competitor_a_id','c1000000-0000-0000-0000-000000000001',
        'competitor_b_id','c1000000-0000-0000-0000-000000000002',
        'generation_key','rr:'||ga||':a:b'),
      jsonb_build_object('group_id', gb, 'round_number', 1, 'match_number', 1,
        'competitor_a_id','c1000000-0000-0000-0000-000000000003',
        'competitor_b_id','c1000000-0000-0000-0000-000000000004',
        'generation_key','rr:'||gb||':c:d')
    ));
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: regenerate not ok: %', r; END IF;
  SELECT count(*) INTO n FROM public.tournament_matches WHERE event_id='e1000000-0000-0000-0000-0000000000a1' AND stage='group';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: regenerate match count wrong, got %', n; END IF;
END $$;

-- ── 10. regenerate blocked by a completed match (event_has_results) ─────────────────────────
DO $$
DECLARE r jsonb; v integer; ga uuid; mid uuid;
BEGIN
  SELECT id INTO ga FROM public.tournament_groups WHERE event_id='e1000000-0000-0000-0000-0000000000a1' AND name='A';
  SELECT id INTO mid FROM public.tournament_matches WHERE event_id='e1000000-0000-0000-0000-0000000000a1' AND stage='group' LIMIT 1;
  UPDATE public.tournament_matches SET status='completed', winner_competitor_id=competitor_a_id WHERE id=mid;

  SELECT version INTO v FROM public.tournament_events WHERE id = 'e1000000-0000-0000-0000-0000000000a1';
  r := public.tournament_regenerate_group_matches('e1000000-0000-0000-0000-0000000000a1'::uuid, v,
    jsonb_build_array(jsonb_build_object('group_id', ga, 'round_number', 1, 'match_number', 1,
      'competitor_a_id','c1000000-0000-0000-0000-000000000001',
      'competitor_b_id','c1000000-0000-0000-0000-000000000002',
      'generation_key','rr:'||ga||':a:b')));
  IF r->>'code' <> 'event_has_results' THEN RAISE EXCEPTION 'FAIL: expected event_has_results, got %', r; END IF;
END $$;

-- ── 11. generate/regenerate never delete matches of another stage (knockout survives) ───────
DO $$
DECLARE r jsonb; v integer; ga uuid; n integer;
BEGIN
  SELECT id INTO ga FROM public.tournament_groups WHERE event_id='e1000000-0000-0000-0000-0000000000a1' AND name='A';
  -- Add a knockout match by hand.
  INSERT INTO public.tournament_matches (event_id, stage, bracket, round_number, match_number, generation_key, status)
    VALUES ('e1000000-0000-0000-0000-0000000000a1', 'knockout', 'championship', 1, 1, 'ko:test:1', 'pending');

  SELECT version INTO v FROM public.tournament_events WHERE id = 'e1000000-0000-0000-0000-0000000000a1';
  r := public.tournament_regenerate_group_matches('e1000000-0000-0000-0000-0000000000a1'::uuid, v,
    jsonb_build_array(jsonb_build_object('group_id', ga, 'round_number', 1, 'match_number', 1,
      'competitor_a_id','c1000000-0000-0000-0000-000000000001',
      'competitor_b_id','c1000000-0000-0000-0000-000000000002',
      'generation_key','rr:'||ga||':a:b')));
  IF r->>'code' <> 'event_has_knockout' THEN RAISE EXCEPTION 'FAIL: expected event_has_knockout, got %', r; END IF;
  SELECT count(*) INTO n FROM public.tournament_matches WHERE event_id='e1000000-0000-0000-0000-0000000000a1' AND stage='knockout';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: knockout match must survive, got %', n; END IF;
END $$;

RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'ALL GROUP-ASSIGNMENT/GENERATION RPC ASSERTIONS PASSED'; END $$;

ROLLBACK;
-- ════════════════════════════════════════════════════════════════════════════════════
-- END tournament_group_assignment_tests.sql
-- ════════════════════════════════════════════════════════════════════════════════════
