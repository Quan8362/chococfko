-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT — KNOCKOUT RPC TEST HARNESS (Prompt 08)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Exercises the six RPCs from migration_tournament_knockout_bracket.sql:
--   • anon / authenticated CANNOT EXECUTE them (service-role-only DEFINER RPCs).
--   • save seeds replaces-all; a foreign competitor and a duplicate slot index → 'invalid'.
--   • generate builds the bracket; a second generate → 'already_generated' (idempotent).
--   • BYE match is status='bye' with a winner and NO games (never a 0–0 score), and its winner
--     already fills the downstream slot.
--   • saving a result advances the winner into the next slot (a filled 'pending' → 'ready') and,
--     for a semifinal, the loser into the third-place slot.
--   • completing the final AND third-place completes the event and writes the podium; the podium is
--     NOT written early (third-place still pending → status stays knockout_running, no podium).
--   • a stale match version → version_conflict; a placeholder/BYE row → not_scoreable.
--   • correcting a result whose downstream is already completed → downstream_has_results (no cascade).
--   • reset with NO results succeeds (matches gone, status 'setup'); reset WITH results → event_has_results.
--   • seeds are blocked once the bracket is generated (has_matches).
--
-- Run AFTER migration_tournament_core.sql AND migration_tournament_knockout_bracket.sql, against an
-- ISOLATED database. One transaction, ROLLBACK at the end — persists NOTHING.
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;
RESET ROLE;

-- ── Setup: a knockout event with 4 competitors ───────────────────────────────────────────────
INSERT INTO public.tournaments (id, slug, name, status) VALUES
  ('b0000000-0000-0000-0000-000000000001'::uuid, 'ko-t', 'KO Tourney', 'draft');

INSERT INTO public.tournament_events (id, tournament_id, name, format, group_count, winner_qualifiers_per_group, third_place_enabled) VALUES
  ('b1000000-0000-0000-0000-0000000000e1'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid,
   'KO Event', 'knockout', 1, 0, true);

INSERT INTO public.tournament_competitors (id, event_id, name, display_order) VALUES
  ('d1000000-0000-0000-0000-000000000001'::uuid, 'b1000000-0000-0000-0000-0000000000e1'::uuid, 'K1', 0),
  ('d1000000-0000-0000-0000-000000000002'::uuid, 'b1000000-0000-0000-0000-0000000000e1'::uuid, 'K2', 1),
  ('d1000000-0000-0000-0000-000000000003'::uuid, 'b1000000-0000-0000-0000-0000000000e1'::uuid, 'K3', 2),
  ('d1000000-0000-0000-0000-000000000004'::uuid, 'b1000000-0000-0000-0000-0000000000e1'::uuid, 'K4', 3);

-- A foreign competitor on a DIFFERENT event (for the cross-event seed test).
INSERT INTO public.tournament_events (id, tournament_id, name, format) VALUES
  ('b1000000-0000-0000-0000-0000000000e2'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, 'Other', 'knockout');
INSERT INTO public.tournament_competitors (id, event_id, name, display_order) VALUES
  ('d2000000-0000-0000-0000-0000000000ff'::uuid, 'b1000000-0000-0000-0000-0000000000e2'::uuid, 'FOREIGN', 0);

-- ── 1. anon & authenticated cannot EXECUTE the RPCs ─────────────────────────────────────────
SET LOCAL ROLE anon;
DO $$
DECLARE ran boolean := false;
BEGIN
  BEGIN
    PERFORM public.tournament_generate_knockout('b1000000-0000-0000-0000-0000000000e1'::uuid, 1, '[]'::jsonb);
    ran := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ran THEN RAISE EXCEPTION 'FAIL: anon executed tournament_generate_knockout'; END IF;
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE ran boolean := false;
BEGIN
  BEGIN
    PERFORM public.tournament_reset_knockout('b1000000-0000-0000-0000-0000000000e1'::uuid, 1);
    ran := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ran THEN RAISE EXCEPTION 'FAIL: authenticated executed tournament_reset_knockout'; END IF;
END $$;

SET LOCAL ROLE service_role;

-- ── 2. save seeds: foreign competitor → invalid; duplicate slot index → invalid ─────────────
DO $$
DECLARE r jsonb; v integer;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'b1000000-0000-0000-0000-0000000000e1';
  -- foreign competitor from another event
  r := public.tournament_save_knockout_seeds('b1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"slot_index":0,"competitor_id":"d2000000-0000-0000-0000-0000000000ff"}]'::jsonb);
  IF r->>'code' <> 'invalid' THEN RAISE EXCEPTION 'FAIL: expected invalid (foreign competitor), got %', r; END IF;

  -- duplicate slot index
  r := public.tournament_save_knockout_seeds('b1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"slot_index":0,"competitor_id":"d1000000-0000-0000-0000-000000000001"},
      {"slot_index":0,"competitor_id":"d1000000-0000-0000-0000-000000000002"}]'::jsonb);
  IF r->>'code' <> 'invalid' THEN RAISE EXCEPTION 'FAIL: expected invalid (dup slot), got %', r; END IF;
END $$;

-- ── 3. save valid seeds (replace-all) ────────────────────────────────────────────────────────
DO $$
DECLARE r jsonb; v integer; n integer;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'b1000000-0000-0000-0000-0000000000e1';
  r := public.tournament_save_knockout_seeds('b1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"slot_index":0,"competitor_id":"d1000000-0000-0000-0000-000000000001"},
      {"slot_index":1,"competitor_id":"d1000000-0000-0000-0000-000000000004"},
      {"slot_index":2,"competitor_id":"d1000000-0000-0000-0000-000000000002"},
      {"slot_index":3,"competitor_id":"d1000000-0000-0000-0000-000000000003"}]'::jsonb);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: save seeds not ok: %', r; END IF;
  SELECT count(*) INTO n FROM public.tournament_knockout_seed_slots
    WHERE event_id = 'b1000000-0000-0000-0000-0000000000e1' AND bracket = 'championship';
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 seed slots, got %', n; END IF;
END $$;

-- ── 4. generate the bracket (4 seeds → 2 semifinals + final + third-place) ───────────────────
DO $$
DECLARE r jsonb; v integer; n integer; st text;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'b1000000-0000-0000-0000-0000000000e1';
  r := public.tournament_generate_knockout('b1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"generation_key":"ko:championship:r1:m1","round_number":1,"match_number":1,"competitor_a_id":"d1000000-0000-0000-0000-000000000001","competitor_b_id":"d1000000-0000-0000-0000-000000000004","status":"ready","winner_id":null,"source_a_key":null,"source_a_outcome":null,"source_b_key":null,"source_b_outcome":null},
      {"generation_key":"ko:championship:r1:m2","round_number":1,"match_number":2,"competitor_a_id":"d1000000-0000-0000-0000-000000000002","competitor_b_id":"d1000000-0000-0000-0000-000000000003","status":"ready","winner_id":null,"source_a_key":null,"source_a_outcome":null,"source_b_key":null,"source_b_outcome":null},
      {"generation_key":"ko:championship:r2:m1","round_number":2,"match_number":1,"competitor_a_id":null,"competitor_b_id":null,"status":"pending","winner_id":null,"source_a_key":"ko:championship:r1:m1","source_a_outcome":"winner","source_b_key":"ko:championship:r1:m2","source_b_outcome":"winner"},
      {"generation_key":"ko:championship:third","round_number":2,"match_number":2,"competitor_a_id":null,"competitor_b_id":null,"status":"pending","winner_id":null,"source_a_key":"ko:championship:r1:m1","source_a_outcome":"loser","source_b_key":"ko:championship:r1:m2","source_b_outcome":"loser"}]'::jsonb);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: generate not ok: %', r; END IF;
  IF (r->>'match_count')::int <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 matches, got %', r; END IF;

  -- source refs wired: the final references two winners; the third-place references two losers.
  SELECT count(*) INTO n FROM public.tournament_matches
    WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r2:m1'
      AND source_match_a_id IS NOT NULL AND source_match_b_id IS NOT NULL
      AND source_outcome_a='winner' AND source_outcome_b='winner';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: final source refs not wired'; END IF;

  SELECT status INTO st FROM public.tournament_events WHERE id='b1000000-0000-0000-0000-0000000000e1';
  IF st <> 'knockout_running' THEN RAISE EXCEPTION 'FAIL: event not knockout_running after generate, got %', st; END IF;
END $$;

-- ── 5. second generate is idempotent (already_generated) ─────────────────────────────────────
DO $$
DECLARE r jsonb; v integer;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'b1000000-0000-0000-0000-0000000000e1';
  r := public.tournament_generate_knockout('b1000000-0000-0000-0000-0000000000e1'::uuid, v, '[]'::jsonb);
  IF r->>'code' <> 'already_generated' THEN RAISE EXCEPTION 'FAIL: expected already_generated, got %', r; END IF;
END $$;

-- ── 6. seeds are locked once generated (has_matches) ─────────────────────────────────────────
DO $$
DECLARE r jsonb; v integer;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'b1000000-0000-0000-0000-0000000000e1';
  r := public.tournament_save_knockout_seeds('b1000000-0000-0000-0000-0000000000e1'::uuid, v, '[]'::jsonb);
  IF r->>'code' <> 'has_matches' THEN RAISE EXCEPTION 'FAIL: expected has_matches, got %', r; END IF;
END $$;

-- ── 7. complete semifinal 1 → winner into final slot A, loser into third slot A ──────────────
DO $$
DECLARE r jsonb; v integer; fa uuid; ta uuid; fs text;
BEGIN
  SELECT version INTO v FROM public.tournament_matches
    WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r1:m1';
  r := public.tournament_save_knockout_result(
    (SELECT id FROM public.tournament_matches WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r1:m1'),
    'b1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"game_number":1,"score_a":21,"score_b":10}]'::jsonb,
    'd1000000-0000-0000-0000-000000000001'::uuid,
    ('[{"match_id":"' || (SELECT id FROM public.tournament_matches WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r2:m1') || '","slot":"A","competitor_id":"d1000000-0000-0000-0000-000000000001"},'
     || '{"match_id":"' || (SELECT id FROM public.tournament_matches WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:third') || '","slot":"A","competitor_id":"d1000000-0000-0000-0000-000000000004"}]')::jsonb,
    NULL, 'knockout_running');
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: save SF1 not ok: %', r; END IF;

  SELECT competitor_a_id, status INTO fa, fs FROM public.tournament_matches
    WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r2:m1';
  IF fa <> 'd1000000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'FAIL: final slot A not filled with SF1 winner, got %', fa; END IF;
  IF fs <> 'pending' THEN RAISE EXCEPTION 'FAIL: final should still be pending (slot B empty), got %', fs; END IF;

  SELECT competitor_a_id INTO ta FROM public.tournament_matches
    WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:third';
  IF ta <> 'd1000000-0000-0000-0000-000000000004' THEN RAISE EXCEPTION 'FAIL: third slot A not filled with SF1 loser, got %', ta; END IF;
END $$;

-- ── 8. complete semifinal 2 → final becomes ready (both slots filled) ────────────────────────
DO $$
DECLARE r jsonb; v integer; fs text;
BEGIN
  SELECT version INTO v FROM public.tournament_matches
    WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r1:m2';
  r := public.tournament_save_knockout_result(
    (SELECT id FROM public.tournament_matches WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r1:m2'),
    'b1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"game_number":1,"score_a":21,"score_b":18}]'::jsonb,
    'd1000000-0000-0000-0000-000000000002'::uuid,
    ('[{"match_id":"' || (SELECT id FROM public.tournament_matches WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r2:m1') || '","slot":"B","competitor_id":"d1000000-0000-0000-0000-000000000002"},'
     || '{"match_id":"' || (SELECT id FROM public.tournament_matches WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:third') || '","slot":"B","competitor_id":"d1000000-0000-0000-0000-000000000003"}]')::jsonb,
    NULL, 'knockout_running');
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: save SF2 not ok: %', r; END IF;

  SELECT status INTO fs FROM public.tournament_matches
    WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r2:m1';
  IF fs <> 'ready' THEN RAISE EXCEPTION 'FAIL: final should be ready now, got %', fs; END IF;
END $$;

-- ── 9. complete the FINAL but third-place still pending → NO podium yet, still knockout_running ─
DO $$
DECLARE r jsonb; v integer; np integer; st text;
BEGIN
  SELECT version INTO v FROM public.tournament_matches
    WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r2:m1';
  r := public.tournament_save_knockout_result(
    (SELECT id FROM public.tournament_matches WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r2:m1'),
    'b1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"game_number":1,"score_a":21,"score_b":15}]'::jsonb,
    'd1000000-0000-0000-0000-000000000001'::uuid, '[]'::jsonb, NULL, 'knockout_running');
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: save final not ok: %', r; END IF;
  IF (r->>'completed')::boolean <> false THEN RAISE EXCEPTION 'FAIL: bracket must NOT be complete (third pending), got %', r; END IF;
  SELECT count(*) INTO np FROM public.tournament_podium WHERE event_id='b1000000-0000-0000-0000-0000000000e1';
  IF np <> 0 THEN RAISE EXCEPTION 'FAIL: podium written too early, got % rows', np; END IF;
  SELECT status INTO st FROM public.tournament_events WHERE id='b1000000-0000-0000-0000-0000000000e1';
  IF st <> 'knockout_running' THEN RAISE EXCEPTION 'FAIL: event should still be knockout_running, got %', st; END IF;
END $$;

-- ── 10. correcting SF1 (winner change) while the final is completed → downstream_has_results ──
DO $$
DECLARE r jsonb; v integer;
BEGIN
  SELECT version INTO v FROM public.tournament_matches
    WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r1:m1';
  r := public.tournament_save_knockout_result(
    (SELECT id FROM public.tournament_matches WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r1:m1'),
    'b1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"game_number":1,"score_a":10,"score_b":21}]'::jsonb,
    'd1000000-0000-0000-0000-000000000004'::uuid,
    ('[{"match_id":"' || (SELECT id FROM public.tournament_matches WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r2:m1') || '","slot":"A","competitor_id":"d1000000-0000-0000-0000-000000000004"}]')::jsonb,
    NULL, 'knockout_running');
  IF r->>'code' <> 'downstream_has_results' THEN RAISE EXCEPTION 'FAIL: expected downstream_has_results, got %', r; END IF;
END $$;

-- ── 11. complete third-place → bracket done → podium written, event completed ────────────────
DO $$
DECLARE r jsonb; v integer; np integer; st text; r1 uuid;
BEGIN
  SELECT version INTO v FROM public.tournament_matches
    WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:third';
  r := public.tournament_save_knockout_result(
    (SELECT id FROM public.tournament_matches WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:third'),
    'b1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"game_number":1,"score_a":21,"score_b":9}]'::jsonb,
    'd1000000-0000-0000-0000-000000000004'::uuid, '[]'::jsonb,
    '[{"rank":1,"competitor_id":"d1000000-0000-0000-0000-000000000001","is_joint":false},
      {"rank":2,"competitor_id":"d1000000-0000-0000-0000-000000000002","is_joint":false},
      {"rank":3,"competitor_id":"d1000000-0000-0000-0000-000000000004","is_joint":false}]'::jsonb,
    'completed');
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: save third not ok: %', r; END IF;
  IF (r->>'completed')::boolean <> true THEN RAISE EXCEPTION 'FAIL: bracket should be complete, got %', r; END IF;

  SELECT count(*) INTO np FROM public.tournament_podium WHERE event_id='b1000000-0000-0000-0000-0000000000e1';
  IF np <> 3 THEN RAISE EXCEPTION 'FAIL: expected 3 podium rows, got %', np; END IF;
  SELECT competitor_id INTO r1 FROM public.tournament_podium
    WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND bracket='championship' AND rank=1;
  IF r1 <> 'd1000000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'FAIL: wrong champion, got %', r1; END IF;
  SELECT status INTO st FROM public.tournament_events WHERE id='b1000000-0000-0000-0000-0000000000e1';
  IF st <> 'completed' THEN RAISE EXCEPTION 'FAIL: event not completed, got %', st; END IF;
END $$;

-- ── 12. reset with results is refused (event_has_results) ────────────────────────────────────
DO $$
DECLARE r jsonb; v integer;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'b1000000-0000-0000-0000-0000000000e1';
  r := public.tournament_reset_knockout('b1000000-0000-0000-0000-0000000000e1'::uuid, v);
  IF r->>'code' <> 'event_has_results' THEN RAISE EXCEPTION 'FAIL: expected event_has_results, got %', r; END IF;
END $$;

-- ── 13. stale version → version_conflict (save result) ───────────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := public.tournament_save_knockout_result(
    (SELECT id FROM public.tournament_matches WHERE event_id='b1000000-0000-0000-0000-0000000000e1' AND generation_key='ko:championship:r1:m1'),
    'b1000000-0000-0000-0000-0000000000e1'::uuid, 999,
    '[{"game_number":1,"score_a":21,"score_b":10}]'::jsonb,
    'd1000000-0000-0000-0000-000000000001'::uuid, '[]'::jsonb, NULL, 'knockout_running');
  IF r->>'code' <> 'version_conflict' THEN RAISE EXCEPTION 'FAIL: expected version_conflict, got %', r; END IF;
END $$;

-- ── 14. BYE auto-advance: a fresh 3-seed bracket has a bye match (winner set, no games) ──────
DO $$
DECLARE r jsonb; v integer; bst text; bw uuid; bng integer; fa uuid;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'b1000000-0000-0000-0000-0000000000e2';
  -- seed 3 competitors into a size-4 bracket: seed 1 gets the BYE.
  INSERT INTO public.tournament_competitors (id, event_id, name, display_order) VALUES
    ('d2000000-0000-0000-0000-000000000002'::uuid, 'b1000000-0000-0000-0000-0000000000e2'::uuid, 'B2', 1),
    ('d2000000-0000-0000-0000-000000000003'::uuid, 'b1000000-0000-0000-0000-0000000000e2'::uuid, 'B3', 2);
  -- m1: B1 vs BYE (auto-advance B1); m2: B2 vs B3; final fed by winner(m1)=B1 already + winner(m2).
  r := public.tournament_generate_knockout('b1000000-0000-0000-0000-0000000000e2'::uuid, v,
    '[{"generation_key":"ko:championship:r1:m1","round_number":1,"match_number":1,"competitor_a_id":"d2000000-0000-0000-0000-0000000000ff","competitor_b_id":null,"status":"bye","winner_id":"d2000000-0000-0000-0000-0000000000ff"},
      {"generation_key":"ko:championship:r1:m2","round_number":1,"match_number":2,"competitor_a_id":"d2000000-0000-0000-0000-000000000002","competitor_b_id":"d2000000-0000-0000-0000-000000000003","status":"ready","winner_id":null},
      {"generation_key":"ko:championship:r2:m1","round_number":2,"match_number":1,"competitor_a_id":"d2000000-0000-0000-0000-0000000000ff","competitor_b_id":null,"status":"pending","source_a_key":"ko:championship:r1:m1","source_a_outcome":"winner","source_b_key":"ko:championship:r1:m2","source_b_outcome":"winner"}]'::jsonb);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: generate bye bracket not ok: %', r; END IF;

  SELECT status, winner_competitor_id INTO bst, bw FROM public.tournament_matches
    WHERE event_id='b1000000-0000-0000-0000-0000000000e2' AND generation_key='ko:championship:r1:m1';
  IF bst <> 'bye' THEN RAISE EXCEPTION 'FAIL: bye match not status bye, got %', bst; END IF;
  IF bw <> 'd2000000-0000-0000-0000-0000000000ff' THEN RAISE EXCEPTION 'FAIL: bye winner not set, got %', bw; END IF;
  SELECT count(*) INTO bng FROM public.tournament_match_games mg
    JOIN public.tournament_matches m ON m.id = mg.match_id
    WHERE m.generation_key='ko:championship:r1:m1' AND m.event_id='b1000000-0000-0000-0000-0000000000e2';
  IF bng <> 0 THEN RAISE EXCEPTION 'FAIL: bye must have no games, got %', bng; END IF;
  -- The bye winner already fills the final's slot A.
  SELECT competitor_a_id INTO fa FROM public.tournament_matches
    WHERE event_id='b1000000-0000-0000-0000-0000000000e2' AND generation_key='ko:championship:r2:m1';
  IF fa <> 'd2000000-0000-0000-0000-0000000000ff' THEN RAISE EXCEPTION 'FAIL: bye winner not pre-placed in final, got %', fa; END IF;

  -- Scoring the BYE placeholder is refused.
  SELECT version INTO v FROM public.tournament_matches
    WHERE event_id='b1000000-0000-0000-0000-0000000000e2' AND generation_key='ko:championship:r1:m1';
  r := public.tournament_save_knockout_result(
    (SELECT id FROM public.tournament_matches WHERE event_id='b1000000-0000-0000-0000-0000000000e2' AND generation_key='ko:championship:r1:m1'),
    'b1000000-0000-0000-0000-0000000000e2'::uuid, v,
    '[{"game_number":1,"score_a":21,"score_b":0}]'::jsonb, 'd2000000-0000-0000-0000-0000000000ff'::uuid, '[]'::jsonb, NULL, 'knockout_running');
  IF r->>'code' <> 'not_scoreable' THEN RAISE EXCEPTION 'FAIL: bye must be not_scoreable, got %', r; END IF;
END $$;

-- ── 15. reset with NO results succeeds (matches gone, status setup, seeds kept) ──────────────
DO $$
DECLARE r jsonb; v integer; n integer; st text; ns integer;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'b1000000-0000-0000-0000-0000000000e2';
  r := public.tournament_reset_knockout('b1000000-0000-0000-0000-0000000000e2'::uuid, v);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: reset (no results) not ok: %', r; END IF;
  SELECT count(*) INTO n FROM public.tournament_matches
    WHERE event_id='b1000000-0000-0000-0000-0000000000e2' AND stage='knockout';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: reset left knockout matches, got %', n; END IF;
  SELECT status INTO st FROM public.tournament_events WHERE id='b1000000-0000-0000-0000-0000000000e2';
  IF st <> 'setup' THEN RAISE EXCEPTION 'FAIL: event not back to setup, got %', st; END IF;
END $$;

RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'ALL KNOCKOUT RPC ASSERTIONS PASSED'; END $$;

ROLLBACK;
-- ════════════════════════════════════════════════════════════════════════════════════
-- END tournament_knockout_bracket_tests.sql
-- ════════════════════════════════════════════════════════════════════════════════════
