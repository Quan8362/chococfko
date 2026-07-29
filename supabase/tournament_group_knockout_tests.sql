-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT — GROUP + KNOCKOUT RPC TEST HARNESS (Prompt 09)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Exercises the RPCs from migration_tournament_group_knockout.sql:
--   • anon / authenticated CANNOT EXECUTE them (service-role-only DEFINER RPCs).
--   • save seeds persists GROUP-RANK tokens for both branches; a cross-event group and a duplicate
--     (bracket, slot_index) → 'invalid'.
--   • generate builds BOTH brackets atomically; a second generate → 'already_generated'; seeds are
--     locked afterwards (has_matches). A partially-invalid generate writes NOTHING (rollback).
--   • consolation is created only when consolation tokens are seeded; consolation=0 → championship-only.
--   • a BYE match is status='bye' with a winner and NO games; its winner already fills the downstream
--     slot (auto-advance), per branch.
--   • completing a championship semifinal advances the winner within championship and the loser into
--     the championship third-place — never into consolation.
--   • each branch's podium is written under its own bracket when THAT branch finishes; the podiums are
--     never mixed. The EVENT completes only when the championship AND (if present) the consolation are
--     both finished.
--   • a stale match version → version_conflict; a placeholder/BYE row → not_scoreable.
--   • reset with NO results returns the event to 'knockout_ready' (matches gone); reset WITH results
--     → event_has_results.
--
-- Run AFTER migration_tournament_core.sql AND migration_tournament_group_knockout.sql, against an
-- ISOLATED database. One transaction, ROLLBACK at the end — persists NOTHING.
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;
RESET ROLE;

-- ── Setup: tournament with a dual-branch event E1 and a championship-only event E2 ───────────
INSERT INTO public.tournaments (id, slug, name, status) VALUES
  ('c0000000-0000-0000-0000-000000000001'::uuid, 'gk-t', 'GK Tourney', 'draft');

-- E1: group_knockout, 2 groups, winnerQ=2, consolationQ=1, third-place ON → champ bracket of 4
--     (SF/final/third) + consolation bracket of 2 (final).
INSERT INTO public.tournament_events
  (id, tournament_id, name, format, group_count, winner_qualifiers_per_group,
   consolation_qualifiers_per_group, third_place_enabled, status) VALUES
  ('c1000000-0000-0000-0000-0000000000e1'::uuid, 'c0000000-0000-0000-0000-000000000001'::uuid,
   'E1', 'group_knockout', 2, 2, 1, true, 'knockout_ready');

INSERT INTO public.tournament_groups (id, event_id, name, display_order) VALUES
  ('c1a00000-0000-0000-0000-0000000000a1'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'A', 0),
  ('c1a00000-0000-0000-0000-0000000000a2'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'B', 1);

-- 6 competitors: A1,A2,A3 (group A), B1,B2,B3 (group B).
INSERT INTO public.tournament_competitors (id, event_id, name, display_order) VALUES
  ('c1c00000-0000-0000-0000-0000000000a1'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'A1', 0),
  ('c1c00000-0000-0000-0000-0000000000a2'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'A2', 1),
  ('c1c00000-0000-0000-0000-0000000000a3'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'A3', 2),
  ('c1c00000-0000-0000-0000-0000000000b1'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'B1', 3),
  ('c1c00000-0000-0000-0000-0000000000b2'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'B2', 4),
  ('c1c00000-0000-0000-0000-0000000000b3'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'B3', 5);

-- A foreign group on E2 (for the cross-event seed test + rollback test).
INSERT INTO public.tournament_events
  (id, tournament_id, name, format, group_count, winner_qualifiers_per_group,
   consolation_qualifiers_per_group, third_place_enabled, status) VALUES
  ('c2000000-0000-0000-0000-0000000000e2'::uuid, 'c0000000-0000-0000-0000-000000000001'::uuid,
   'E2', 'group_knockout', 3, 1, 0, false, 'knockout_ready');

INSERT INTO public.tournament_groups (id, event_id, name, display_order) VALUES
  ('c2a00000-0000-0000-0000-0000000000a1'::uuid, 'c2000000-0000-0000-0000-0000000000e2'::uuid, 'A', 0),
  ('c2a00000-0000-0000-0000-0000000000a2'::uuid, 'c2000000-0000-0000-0000-0000000000e2'::uuid, 'B', 1),
  ('c2a00000-0000-0000-0000-0000000000a3'::uuid, 'c2000000-0000-0000-0000-0000000000e2'::uuid, 'C', 2);

INSERT INTO public.tournament_competitors (id, event_id, name, display_order) VALUES
  ('c2c00000-0000-0000-0000-000000000001'::uuid, 'c2000000-0000-0000-0000-0000000000e2'::uuid, 'X1', 0),
  ('c2c00000-0000-0000-0000-000000000002'::uuid, 'c2000000-0000-0000-0000-0000000000e2'::uuid, 'X2', 1),
  ('c2c00000-0000-0000-0000-000000000003'::uuid, 'c2000000-0000-0000-0000-0000000000e2'::uuid, 'X3', 2);

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 1. anon & authenticated cannot EXECUTE the RPCs
-- ══════════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE anon;
DO $$
DECLARE ran boolean := false;
BEGIN
  BEGIN
    PERFORM public.tournament_generate_group_knockout('c1000000-0000-0000-0000-0000000000e1'::uuid, 1, '[]'::jsonb);
    ran := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ran THEN RAISE EXCEPTION 'FAIL: anon executed tournament_generate_group_knockout'; END IF;
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE ran boolean := false;
BEGIN
  BEGIN
    PERFORM public.tournament_reset_group_knockout('c1000000-0000-0000-0000-0000000000e1'::uuid, 1);
    ran := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ran THEN RAISE EXCEPTION 'FAIL: authenticated executed tournament_reset_group_knockout'; END IF;
END $$;

SET LOCAL ROLE service_role;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 2. save seeds: cross-event group → invalid; duplicate (bracket, slot_index) → invalid
-- ══════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r jsonb; v integer;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'c1000000-0000-0000-0000-0000000000e1';
  -- group from E2 referenced on E1 → composite FK violation
  r := public.tournament_save_group_knockout_seeds('c1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"bracket":"championship","slot_index":0,"source_group_id":"c2a00000-0000-0000-0000-0000000000a1","source_rank":1}]'::jsonb);
  IF r->>'code' <> 'invalid' THEN RAISE EXCEPTION 'FAIL: expected invalid (cross-event group), got %', r; END IF;

  -- duplicate (bracket, slot_index)
  r := public.tournament_save_group_knockout_seeds('c1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"bracket":"championship","slot_index":0,"source_group_id":"c1a00000-0000-0000-0000-0000000000a1","source_rank":1},
      {"bracket":"championship","slot_index":0,"source_group_id":"c1a00000-0000-0000-0000-0000000000a2","source_rank":1}]'::jsonb);
  IF r->>'code' <> 'invalid' THEN RAISE EXCEPTION 'FAIL: expected invalid (dup slot), got %', r; END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 3. save valid seeds for BOTH branches (champ 4 tokens + conso 2 tokens)
-- ══════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r jsonb; v integer; nc integer; ns integer;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'c1000000-0000-0000-0000-0000000000e1';
  r := public.tournament_save_group_knockout_seeds('c1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"bracket":"championship","slot_index":0,"source_group_id":"c1a00000-0000-0000-0000-0000000000a1","source_rank":1},
      {"bracket":"championship","slot_index":1,"source_group_id":"c1a00000-0000-0000-0000-0000000000a2","source_rank":2},
      {"bracket":"championship","slot_index":2,"source_group_id":"c1a00000-0000-0000-0000-0000000000a2","source_rank":1},
      {"bracket":"championship","slot_index":3,"source_group_id":"c1a00000-0000-0000-0000-0000000000a1","source_rank":2},
      {"bracket":"consolation","slot_index":0,"source_group_id":"c1a00000-0000-0000-0000-0000000000a1","source_rank":3},
      {"bracket":"consolation","slot_index":1,"source_group_id":"c1a00000-0000-0000-0000-0000000000a2","source_rank":3}]'::jsonb);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: save seeds not ok: %', r; END IF;
  SELECT count(*) INTO nc FROM public.tournament_knockout_seed_slots
    WHERE event_id = 'c1000000-0000-0000-0000-0000000000e1' AND bracket = 'championship';
  SELECT count(*) INTO ns FROM public.tournament_knockout_seed_slots
    WHERE event_id = 'c1000000-0000-0000-0000-0000000000e1' AND bracket = 'consolation';
  IF nc <> 4 OR ns <> 2 THEN RAISE EXCEPTION 'FAIL: expected 4 champ + 2 conso slots, got % / %', nc, ns; END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 4. generate BOTH brackets (championship: SF1,SF2,final,third ; consolation: final)
-- ══════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r jsonb; v integer; nch integer; nco integer; st text;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'c1000000-0000-0000-0000-0000000000e1';
  r := public.tournament_generate_group_knockout('c1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"bracket":"championship","generation_key":"ko:championship:r1:m1","round_number":1,"match_number":1,"competitor_a_id":"c1c00000-0000-0000-0000-0000000000a1","competitor_b_id":"c1c00000-0000-0000-0000-0000000000b2","status":"ready","winner_id":null,"source_a_key":null,"source_a_outcome":null,"source_b_key":null,"source_b_outcome":null},
      {"bracket":"championship","generation_key":"ko:championship:r1:m2","round_number":1,"match_number":2,"competitor_a_id":"c1c00000-0000-0000-0000-0000000000b1","competitor_b_id":"c1c00000-0000-0000-0000-0000000000a2","status":"ready","winner_id":null,"source_a_key":null,"source_a_outcome":null,"source_b_key":null,"source_b_outcome":null},
      {"bracket":"championship","generation_key":"ko:championship:r2:m1","round_number":2,"match_number":1,"competitor_a_id":null,"competitor_b_id":null,"status":"pending","winner_id":null,"source_a_key":"ko:championship:r1:m1","source_a_outcome":"winner","source_b_key":"ko:championship:r1:m2","source_b_outcome":"winner"},
      {"bracket":"championship","generation_key":"ko:championship:third","round_number":2,"match_number":2,"competitor_a_id":null,"competitor_b_id":null,"status":"pending","winner_id":null,"source_a_key":"ko:championship:r1:m1","source_a_outcome":"loser","source_b_key":"ko:championship:r1:m2","source_b_outcome":"loser"},
      {"bracket":"consolation","generation_key":"ko:consolation:r1:m1","round_number":1,"match_number":1,"competitor_a_id":"c1c00000-0000-0000-0000-0000000000a3","competitor_b_id":"c1c00000-0000-0000-0000-0000000000b3","status":"ready","winner_id":null,"source_a_key":null,"source_a_outcome":null,"source_b_key":null,"source_b_outcome":null}]'::jsonb);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: generate not ok: %', r; END IF;
  IF (r->>'match_count')::int <> 5 THEN RAISE EXCEPTION 'FAIL: expected 5 matches, got %', r; END IF;

  SELECT count(*) INTO nch FROM public.tournament_matches
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND stage='knockout' AND bracket='championship';
  SELECT count(*) INTO nco FROM public.tournament_matches
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND stage='knockout' AND bracket='consolation';
  IF nch <> 4 OR nco <> 1 THEN RAISE EXCEPTION 'FAIL: expected 4 champ + 1 conso matches, got % / %', nch, nco; END IF;

  SELECT status INTO st FROM public.tournament_events WHERE id='c1000000-0000-0000-0000-0000000000e1';
  IF st <> 'knockout_running' THEN RAISE EXCEPTION 'FAIL: event not knockout_running after generate, got %', st; END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 5. second generate is idempotent (already_generated); 6. seeds locked (has_matches)
-- ══════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r jsonb; v integer;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'c1000000-0000-0000-0000-0000000000e1';
  r := public.tournament_generate_group_knockout('c1000000-0000-0000-0000-0000000000e1'::uuid, v, '[]'::jsonb);
  IF r->>'code' <> 'already_generated' THEN RAISE EXCEPTION 'FAIL: expected already_generated, got %', r; END IF;

  r := public.tournament_save_group_knockout_seeds('c1000000-0000-0000-0000-0000000000e1'::uuid, v, '[]'::jsonb);
  IF r->>'code' <> 'has_matches' THEN RAISE EXCEPTION 'FAIL: expected has_matches, got %', r; END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 7. complete championship SF1 → winner into champ final slot A, loser into champ third slot A;
--    consolation is UNTOUCHED (loser never drops to consolation)
-- ══════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r jsonb; v integer; fa uuid; ta uuid; co_a uuid; co_b uuid;
BEGIN
  SELECT version INTO v FROM public.tournament_matches
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r1:m1';
  r := public.tournament_save_group_knockout_result(
    (SELECT id FROM public.tournament_matches WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r1:m1'),
    'c1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"game_number":1,"score_a":21,"score_b":10}]'::jsonb,
    'c1c00000-0000-0000-0000-0000000000a1'::uuid, 'championship',
    ('[{"match_id":"' || (SELECT id FROM public.tournament_matches WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r2:m1') || '","slot":"A","competitor_id":"c1c00000-0000-0000-0000-0000000000a1"},'
     || '{"match_id":"' || (SELECT id FROM public.tournament_matches WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:third') || '","slot":"A","competitor_id":"c1c00000-0000-0000-0000-0000000000b2"}]')::jsonb,
    NULL);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: save champ SF1 not ok: %', r; END IF;

  SELECT competitor_a_id INTO fa FROM public.tournament_matches
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r2:m1';
  IF fa <> 'c1c00000-0000-0000-0000-0000000000a1' THEN RAISE EXCEPTION 'FAIL: champ final slot A not SF1 winner, got %', fa; END IF;
  SELECT competitor_a_id INTO ta FROM public.tournament_matches
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:third';
  IF ta <> 'c1c00000-0000-0000-0000-0000000000b2' THEN RAISE EXCEPTION 'FAIL: champ third slot A not SF1 loser, got %', ta; END IF;

  -- Consolation final is unchanged — the championship loser did NOT leak into it.
  SELECT competitor_a_id, competitor_b_id INTO co_a, co_b FROM public.tournament_matches
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:consolation:r1:m1';
  IF co_a <> 'c1c00000-0000-0000-0000-0000000000a3' OR co_b <> 'c1c00000-0000-0000-0000-0000000000b3' THEN
    RAISE EXCEPTION 'FAIL: consolation final changed by a championship result: % / %', co_a, co_b; END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 8. complete the CONSOLATION final → consolation podium (bracket='consolation'); event NOT done
--    yet (championship unfinished). Podiums are not mixed.
-- ══════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r jsonb; v integer; nco integer; nch integer; st text; b text;
BEGIN
  SELECT version INTO v FROM public.tournament_matches
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:consolation:r1:m1';
  r := public.tournament_save_group_knockout_result(
    (SELECT id FROM public.tournament_matches WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:consolation:r1:m1'),
    'c1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"game_number":1,"score_a":21,"score_b":14}]'::jsonb,
    'c1c00000-0000-0000-0000-0000000000a3'::uuid, 'consolation',
    '[]'::jsonb,
    '[{"rank":1,"competitor_id":"c1c00000-0000-0000-0000-0000000000a3","is_joint":false},
      {"rank":2,"competitor_id":"c1c00000-0000-0000-0000-0000000000b3","is_joint":false}]'::jsonb);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: save conso final not ok: %', r; END IF;
  IF (r->>'branch_completed')::boolean <> true THEN RAISE EXCEPTION 'FAIL: consolation should be complete, got %', r; END IF;
  IF (r->>'event_completed')::boolean <> false THEN RAISE EXCEPTION 'FAIL: event must NOT be complete (champ unfinished), got %', r; END IF;

  SELECT count(*) INTO nco FROM public.tournament_podium
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND bracket='consolation';
  SELECT count(*) INTO nch FROM public.tournament_podium
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND bracket='championship';
  IF nco <> 2 THEN RAISE EXCEPTION 'FAIL: expected 2 consolation podium rows, got %', nco; END IF;
  IF nch <> 0 THEN RAISE EXCEPTION 'FAIL: championship podium must be empty still, got %', nch; END IF;

  SELECT status INTO st FROM public.tournament_events WHERE id='c1000000-0000-0000-0000-0000000000e1';
  IF st <> 'knockout_running' THEN RAISE EXCEPTION 'FAIL: event should still be knockout_running, got %', st; END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 9. finish the championship (SF2, final, third) → championship podium + EVENT completed
-- ══════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r jsonb; v integer;
BEGIN
  -- SF2
  SELECT version INTO v FROM public.tournament_matches
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r1:m2';
  r := public.tournament_save_group_knockout_result(
    (SELECT id FROM public.tournament_matches WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r1:m2'),
    'c1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"game_number":1,"score_a":21,"score_b":18}]'::jsonb,
    'c1c00000-0000-0000-0000-0000000000b1'::uuid, 'championship',
    ('[{"match_id":"' || (SELECT id FROM public.tournament_matches WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r2:m1') || '","slot":"B","competitor_id":"c1c00000-0000-0000-0000-0000000000b1"},'
     || '{"match_id":"' || (SELECT id FROM public.tournament_matches WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:third') || '","slot":"B","competitor_id":"c1c00000-0000-0000-0000-0000000000a2"}]')::jsonb,
    NULL);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: save champ SF2 not ok: %', r; END IF;

  -- final
  SELECT version INTO v FROM public.tournament_matches
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r2:m1';
  r := public.tournament_save_group_knockout_result(
    (SELECT id FROM public.tournament_matches WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r2:m1'),
    'c1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"game_number":1,"score_a":21,"score_b":15}]'::jsonb,
    'c1c00000-0000-0000-0000-0000000000a1'::uuid, 'championship', '[]'::jsonb, NULL);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: save champ final not ok: %', r; END IF;
  IF (r->>'event_completed')::boolean <> false THEN RAISE EXCEPTION 'FAIL: event must NOT complete (third pending), got %', r; END IF;

  -- third-place → championship done → event completed
  SELECT version INTO v FROM public.tournament_matches
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:third';
  r := public.tournament_save_group_knockout_result(
    (SELECT id FROM public.tournament_matches WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:third'),
    'c1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"game_number":1,"score_a":21,"score_b":9}]'::jsonb,
    'c1c00000-0000-0000-0000-0000000000b2'::uuid, 'championship', '[]'::jsonb,
    '[{"rank":1,"competitor_id":"c1c00000-0000-0000-0000-0000000000a1","is_joint":false},
      {"rank":2,"competitor_id":"c1c00000-0000-0000-0000-0000000000b1","is_joint":false},
      {"rank":3,"competitor_id":"c1c00000-0000-0000-0000-0000000000b2","is_joint":false}]'::jsonb);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: save champ third not ok: %', r; END IF;
  IF (r->>'event_completed')::boolean <> true THEN RAISE EXCEPTION 'FAIL: event should be complete now, got %', r; END IF;
END $$;

-- ── 9b. podiums are separated by bracket and the event is completed ──────────────────────────
DO $$
DECLARE nch integer; nco integer; champ1 uuid; conso1 uuid; st text;
BEGIN
  SELECT count(*) INTO nch FROM public.tournament_podium
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND bracket='championship';
  SELECT count(*) INTO nco FROM public.tournament_podium
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND bracket='consolation';
  IF nch <> 3 OR nco <> 2 THEN RAISE EXCEPTION 'FAIL: expected 3 champ + 2 conso podium rows, got % / %', nch, nco; END IF;

  SELECT competitor_id INTO champ1 FROM public.tournament_podium
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND bracket='championship' AND rank=1;
  SELECT competitor_id INTO conso1 FROM public.tournament_podium
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND bracket='consolation' AND rank=1;
  IF champ1 <> 'c1c00000-0000-0000-0000-0000000000a1' THEN RAISE EXCEPTION 'FAIL: wrong champion, got %', champ1; END IF;
  IF conso1 <> 'c1c00000-0000-0000-0000-0000000000a3' THEN RAISE EXCEPTION 'FAIL: wrong consolation winner, got %', conso1; END IF;

  SELECT status INTO st FROM public.tournament_events WHERE id='c1000000-0000-0000-0000-0000000000e1';
  IF st <> 'completed' THEN RAISE EXCEPTION 'FAIL: event not completed, got %', st; END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 10. reset with results is refused (event_has_results); stale version → version_conflict
-- ══════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r jsonb; v integer;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'c1000000-0000-0000-0000-0000000000e1';
  r := public.tournament_reset_group_knockout('c1000000-0000-0000-0000-0000000000e1'::uuid, v);
  IF r->>'code' <> 'event_has_results' THEN RAISE EXCEPTION 'FAIL: expected event_has_results, got %', r; END IF;

  -- stale save with a wrong match version
  r := public.tournament_save_group_knockout_result(
    (SELECT id FROM public.tournament_matches WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r1:m1'),
    'c1000000-0000-0000-0000-0000000000e1'::uuid, 999,
    '[{"game_number":1,"score_a":21,"score_b":5}]'::jsonb,
    'c1c00000-0000-0000-0000-0000000000a1'::uuid, 'championship', '[]'::jsonb, NULL);
  IF r->>'code' <> 'version_conflict' THEN RAISE EXCEPTION 'FAIL: expected version_conflict, got %', r; END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 11. E2 (consolation=0): a partially-invalid generate writes NOTHING (rollback)
-- ══════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r jsonb; v integer; n integer;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'c2000000-0000-0000-0000-0000000000e2';
  -- one good champ row + one row whose competitor belongs to E1 → composite FK violation → invalid
  r := public.tournament_generate_group_knockout('c2000000-0000-0000-0000-0000000000e2'::uuid, v,
    '[{"bracket":"championship","generation_key":"ko:championship:r1:m2","round_number":1,"match_number":2,"competitor_a_id":"c2c00000-0000-0000-0000-000000000002","competitor_b_id":"c2c00000-0000-0000-0000-000000000003","status":"ready","winner_id":null,"source_a_key":null,"source_a_outcome":null,"source_b_key":null,"source_b_outcome":null},
      {"bracket":"championship","generation_key":"ko:championship:r1:m1","round_number":1,"match_number":1,"competitor_a_id":"c1c00000-0000-0000-0000-0000000000a1","competitor_b_id":null,"status":"bye","winner_id":"c1c00000-0000-0000-0000-0000000000a1","source_a_key":null,"source_a_outcome":null,"source_b_key":null,"source_b_outcome":null}]'::jsonb);
  IF r->>'code' <> 'invalid' THEN RAISE EXCEPTION 'FAIL: expected invalid (cross-event competitor), got %', r; END IF;
  SELECT count(*) INTO n FROM public.tournament_matches
    WHERE event_id='c2000000-0000-0000-0000-0000000000e2' AND stage='knockout';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: partial generate persisted % rows (must roll back)', n; END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 12. E2 real generate: championship-only with a BYE that auto-advances; no consolation branch
-- ══════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r jsonb; v integer; nco integer; bye_st text; bye_w uuid; final_a uuid; final_st text;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'c2000000-0000-0000-0000-0000000000e2';
  r := public.tournament_generate_group_knockout('c2000000-0000-0000-0000-0000000000e2'::uuid, v,
    '[{"bracket":"championship","generation_key":"ko:championship:r1:m1","round_number":1,"match_number":1,"competitor_a_id":"c2c00000-0000-0000-0000-000000000001","competitor_b_id":null,"status":"bye","winner_id":"c2c00000-0000-0000-0000-000000000001","source_a_key":null,"source_a_outcome":null,"source_b_key":null,"source_b_outcome":null},
      {"bracket":"championship","generation_key":"ko:championship:r1:m2","round_number":1,"match_number":2,"competitor_a_id":"c2c00000-0000-0000-0000-000000000002","competitor_b_id":"c2c00000-0000-0000-0000-000000000003","status":"ready","winner_id":null,"source_a_key":null,"source_a_outcome":null,"source_b_key":null,"source_b_outcome":null},
      {"bracket":"championship","generation_key":"ko:championship:r2:m1","round_number":2,"match_number":1,"competitor_a_id":"c2c00000-0000-0000-0000-000000000001","competitor_b_id":null,"status":"pending","winner_id":null,"source_a_key":"ko:championship:r1:m1","source_a_outcome":"winner","source_b_key":"ko:championship:r1:m2","source_b_outcome":"winner"}]'::jsonb);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: E2 generate not ok: %', r; END IF;

  SELECT count(*) INTO nco FROM public.tournament_matches
    WHERE event_id='c2000000-0000-0000-0000-0000000000e2' AND bracket='consolation';
  IF nco <> 0 THEN RAISE EXCEPTION 'FAIL: consolation=0 must create NO consolation matches, got %', nco; END IF;

  -- BYE match: status='bye', winner set, NO games.
  SELECT status, winner_competitor_id INTO bye_st, bye_w FROM public.tournament_matches
    WHERE event_id='c2000000-0000-0000-0000-0000000000e2' AND generation_key='ko:championship:r1:m1';
  IF bye_st <> 'bye' OR bye_w <> 'c2c00000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'FAIL: bye match wrong: % / %', bye_st, bye_w; END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_match_games g
             JOIN public.tournament_matches m ON m.id=g.match_id
             WHERE m.event_id='c2000000-0000-0000-0000-0000000000e2' AND m.generation_key='ko:championship:r1:m1') THEN
    RAISE EXCEPTION 'FAIL: bye match must have no games'; END IF;

  -- BYE winner already auto-advanced into the final slot A (still pending — slot B awaits the SF).
  SELECT competitor_a_id, status INTO final_a, final_st FROM public.tournament_matches
    WHERE event_id='c2000000-0000-0000-0000-0000000000e2' AND generation_key='ko:championship:r2:m1';
  IF final_a <> 'c2c00000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'FAIL: bye winner not auto-advanced, got %', final_a; END IF;
  IF final_st <> 'pending' THEN RAISE EXCEPTION 'FAIL: final should be pending (slot B empty), got %', final_st; END IF;
END $$;

-- ── 12b. BYE row is not scoreable ────────────────────────────────────────────────────────────
DO $$
DECLARE r jsonb; v integer;
BEGIN
  SELECT version INTO v FROM public.tournament_matches
    WHERE event_id='c2000000-0000-0000-0000-0000000000e2' AND generation_key='ko:championship:r1:m1';
  r := public.tournament_save_group_knockout_result(
    (SELECT id FROM public.tournament_matches WHERE event_id='c2000000-0000-0000-0000-0000000000e2' AND generation_key='ko:championship:r1:m1'),
    'c2000000-0000-0000-0000-0000000000e2'::uuid, v,
    '[{"game_number":1,"score_a":21,"score_b":0}]'::jsonb,
    'c2c00000-0000-0000-0000-000000000001'::uuid, 'championship', '[]'::jsonb, NULL);
  IF r->>'code' <> 'not_scoreable' THEN RAISE EXCEPTION 'FAIL: expected not_scoreable for BYE, got %', r; END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 13. E2 reset with NO results → matches gone, event back to 'knockout_ready'
-- ══════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r jsonb; v integer; n integer; st text;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'c2000000-0000-0000-0000-0000000000e2';
  r := public.tournament_reset_group_knockout('c2000000-0000-0000-0000-0000000000e2'::uuid, v);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: E2 reset not ok: %', r; END IF;
  SELECT count(*) INTO n FROM public.tournament_matches
    WHERE event_id='c2000000-0000-0000-0000-0000000000e2' AND stage='knockout';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: E2 knockout matches not deleted, got %', n; END IF;
  SELECT status INTO st FROM public.tournament_events WHERE id='c2000000-0000-0000-0000-0000000000e2';
  IF st <> 'knockout_ready' THEN RAISE EXCEPTION 'FAIL: E2 not back to knockout_ready, got %', st; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL GROUP_KNOCKOUT RPC ASSERTIONS PASSED'; END $$;

ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════════════
-- END tournament_group_knockout_tests.sql
-- ════════════════════════════════════════════════════════════════════════════════════
