-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT — RESET DEPENDENCY-PATH RPC TEST HARNESS (Prompt 11)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Exercises tournament_reset_knockout_path + tournament_reset_bracket_complete from
-- migration_tournament_reset_path.sql, on a group_knockout event whose championship bracket
-- (SF1, SF2, Final, Third) AND a one-match consolation bracket are all completed with a podium each:
--   • anon / authenticated CANNOT EXECUTE the reset RPC (service-role-only DEFINER).
--   • correcting SF1 (winner change) resets ONLY the dependency path (Final + Third-place): their
--     games are wiped, they are un-completed, the corrected-path slot is emptied and re-fed with the
--     NEW result, while the sibling slot (fed by SF2) is kept.
--   • SF2 (independent same-round match) is left untouched.
--   • the CONSOLATION branch (matches + podium) is left completely untouched (no cross-branch reset).
--   • the championship podium is cleared; the event returns from 'completed' to 'knockout_running'.
--   • a stale upstream version → version_conflict (data changed after the preview).
--   • wrong bracket / not-a-completed-pairing are refused.
--   • replaying the reset path to a new result re-completes the branch and the event.
--
-- Run AFTER migration_tournament_core.sql, the knockout/group-knockout migrations AND
-- migration_tournament_reset_path.sql, against an ISOLATED database. One transaction, ROLLBACK at the
-- end — persists NOTHING.
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;
RESET ROLE;

-- ── Setup: a group_knockout event, completed championship + consolation brackets ──────────────
INSERT INTO public.tournaments (id, slug, name, status) VALUES
  ('c0000000-0000-0000-0000-000000000001'::uuid, 'reset-t', 'Reset Tourney', 'published');

INSERT INTO public.tournament_events
  (id, tournament_id, name, format, group_count, winner_qualifiers_per_group, consolation_qualifiers_per_group, third_place_enabled, status) VALUES
  ('c1000000-0000-0000-0000-0000000000e1'::uuid, 'c0000000-0000-0000-0000-000000000001'::uuid,
   'Reset Event', 'group_knockout', 2, 1, 1, true, 'completed');

INSERT INTO public.tournament_competitors (id, event_id, name, display_order) VALUES
  ('e1000000-0000-0000-0000-000000000001'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'K1', 0),
  ('e1000000-0000-0000-0000-000000000002'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'K2', 1),
  ('e1000000-0000-0000-0000-000000000003'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'K3', 2),
  ('e1000000-0000-0000-0000-000000000004'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'K4', 3),
  ('e1000000-0000-0000-0000-000000000005'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'K5', 4),
  ('e1000000-0000-0000-0000-000000000006'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'K6', 5);

-- Championship: SF1 (K1>K4), SF2 (K2>K3), Final (K1>K2), Third (K4>K3).
INSERT INTO public.tournament_matches
  (id, event_id, stage, bracket, round_number, match_number, competitor_a_id, competitor_b_id, status, winner_competitor_id, generation_key) VALUES
  ('a1000000-0000-0000-0000-0000000000f1'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'knockout', 'championship', 1, 1,
   'e1000000-0000-0000-0000-000000000001'::uuid, 'e1000000-0000-0000-0000-000000000004'::uuid, 'completed', 'e1000000-0000-0000-0000-000000000001'::uuid, 'ko:championship:r1:m1'),
  ('a1000000-0000-0000-0000-0000000000f2'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'knockout', 'championship', 1, 2,
   'e1000000-0000-0000-0000-000000000002'::uuid, 'e1000000-0000-0000-0000-000000000003'::uuid, 'completed', 'e1000000-0000-0000-0000-000000000002'::uuid, 'ko:championship:r1:m2'),
  ('a1000000-0000-0000-0000-0000000000f3'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'knockout', 'championship', 2, 1,
   'e1000000-0000-0000-0000-000000000001'::uuid, 'e1000000-0000-0000-0000-000000000002'::uuid, 'completed', 'e1000000-0000-0000-0000-000000000001'::uuid, 'ko:championship:r2:m1'),
  ('a1000000-0000-0000-0000-0000000000f4'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'knockout', 'championship', 2, 2,
   'e1000000-0000-0000-0000-000000000004'::uuid, 'e1000000-0000-0000-0000-000000000003'::uuid, 'completed', 'e1000000-0000-0000-0000-000000000004'::uuid, 'ko:championship:third');

-- Wire championship source refs (Final ← SF winners; Third ← SF losers).
UPDATE public.tournament_matches SET source_match_a_id='a1000000-0000-0000-0000-0000000000f1', source_outcome_a='winner',
                                     source_match_b_id='a1000000-0000-0000-0000-0000000000f2', source_outcome_b='winner'
  WHERE id='a1000000-0000-0000-0000-0000000000f3';
UPDATE public.tournament_matches SET source_match_a_id='a1000000-0000-0000-0000-0000000000f1', source_outcome_a='loser',
                                     source_match_b_id='a1000000-0000-0000-0000-0000000000f2', source_outcome_b='loser'
  WHERE id='a1000000-0000-0000-0000-0000000000f4';

-- Consolation: single final (K5 > K6).
INSERT INTO public.tournament_matches
  (id, event_id, stage, bracket, round_number, match_number, competitor_a_id, competitor_b_id, status, winner_competitor_id, generation_key) VALUES
  ('a2000000-0000-0000-0000-0000000000c1'::uuid, 'c1000000-0000-0000-0000-0000000000e1'::uuid, 'knockout', 'consolation', 1, 1,
   'e1000000-0000-0000-0000-000000000005'::uuid, 'e1000000-0000-0000-0000-000000000006'::uuid, 'completed', 'e1000000-0000-0000-0000-000000000005'::uuid, 'ko:consolation:r1:m1');

-- Games for every completed match.
INSERT INTO public.tournament_match_games (match_id, game_number, score_a, score_b) VALUES
  ('a1000000-0000-0000-0000-0000000000f1'::uuid, 1, 21, 10),
  ('a1000000-0000-0000-0000-0000000000f2'::uuid, 1, 21, 15),
  ('a1000000-0000-0000-0000-0000000000f3'::uuid, 1, 21, 18),
  ('a1000000-0000-0000-0000-0000000000f4'::uuid, 1, 21, 9),
  ('a2000000-0000-0000-0000-0000000000c1'::uuid, 1, 21, 12);

-- Podiums (championship + consolation).
INSERT INTO public.tournament_podium (event_id, bracket, rank, competitor_id, is_joint) VALUES
  ('c1000000-0000-0000-0000-0000000000e1'::uuid, 'championship', 1, 'e1000000-0000-0000-0000-000000000001'::uuid, false),
  ('c1000000-0000-0000-0000-0000000000e1'::uuid, 'championship', 2, 'e1000000-0000-0000-0000-000000000002'::uuid, false),
  ('c1000000-0000-0000-0000-0000000000e1'::uuid, 'championship', 3, 'e1000000-0000-0000-0000-000000000004'::uuid, false),
  ('c1000000-0000-0000-0000-0000000000e1'::uuid, 'consolation', 1, 'e1000000-0000-0000-0000-000000000005'::uuid, false),
  ('c1000000-0000-0000-0000-0000000000e1'::uuid, 'consolation', 2, 'e1000000-0000-0000-0000-000000000006'::uuid, false);

-- ── 1. anon & authenticated cannot EXECUTE the reset RPC ─────────────────────────────────────
SET LOCAL ROLE anon;
DO $$
DECLARE ran boolean := false;
BEGIN
  BEGIN
    PERFORM public.tournament_reset_knockout_path('a1000000-0000-0000-0000-0000000000f1'::uuid,
      'c1000000-0000-0000-0000-0000000000e1'::uuid, 'championship', 1,
      '[]'::jsonb, NULL, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL);
    ran := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ran THEN RAISE EXCEPTION 'FAIL: anon executed tournament_reset_knockout_path'; END IF;
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE ran boolean := false;
BEGIN
  BEGIN
    PERFORM public.tournament_reset_bracket_complete('c1000000-0000-0000-0000-0000000000e1'::uuid, 'championship');
    ran := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ran THEN RAISE EXCEPTION 'FAIL: authenticated executed tournament_reset_bracket_complete'; END IF;
END $$;

SET LOCAL ROLE service_role;

-- ── 2. both brackets report complete before the reset ────────────────────────────────────────
DO $$
BEGIN
  IF NOT public.tournament_reset_bracket_complete('c1000000-0000-0000-0000-0000000000e1'::uuid, 'championship') THEN
    RAISE EXCEPTION 'FAIL: championship should be complete pre-reset'; END IF;
  IF NOT public.tournament_reset_bracket_complete('c1000000-0000-0000-0000-0000000000e1'::uuid, 'consolation') THEN
    RAISE EXCEPTION 'FAIL: consolation should be complete pre-reset'; END IF;
END $$;

-- ── 3. wrong bracket / not-completed guards ──────────────────────────────────────────────────
DO $$
DECLARE r jsonb; v integer;
BEGIN
  SELECT version INTO v FROM public.tournament_matches WHERE id='a1000000-0000-0000-0000-0000000000f1';
  -- claim the consolation bracket for a championship match → invalid
  r := public.tournament_reset_knockout_path('a1000000-0000-0000-0000-0000000000f1'::uuid,
    'c1000000-0000-0000-0000-0000000000e1'::uuid, 'consolation', v,
    '[{"game_number":1,"score_a":10,"score_b":21}]'::jsonb, 'e1000000-0000-0000-0000-000000000004'::uuid,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL);
  IF r->>'code' <> 'invalid' THEN RAISE EXCEPTION 'FAIL: wrong bracket expected invalid, got %', r; END IF;

  -- stale version
  r := public.tournament_reset_knockout_path('a1000000-0000-0000-0000-0000000000f1'::uuid,
    'c1000000-0000-0000-0000-0000000000e1'::uuid, 'championship', 999,
    '[{"game_number":1,"score_a":10,"score_b":21}]'::jsonb, 'e1000000-0000-0000-0000-000000000004'::uuid,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL);
  IF r->>'code' <> 'version_conflict' THEN RAISE EXCEPTION 'FAIL: stale version expected version_conflict, got %', r; END IF;
END $$;

-- ── 4. reset the dependency path: correct SF1 so K4 wins instead of K1 ────────────────────────
DO $$
DECLARE r jsonb; v integer;
        f_a uuid; f_b uuid; f_st text; f_w uuid; f_ng integer;
        t_a uuid; t_b uuid; t_st text; t_w uuid;
        sf2_st text; sf2_w uuid;
        sf1_w uuid; sf1_sa integer;
        champ_podium integer; conso_podium integer; conso_st text; ev_st text;
BEGIN
  SELECT version INTO v FROM public.tournament_matches WHERE id='a1000000-0000-0000-0000-0000000000f1';
  r := public.tournament_reset_knockout_path('a1000000-0000-0000-0000-0000000000f1'::uuid,
    'c1000000-0000-0000-0000-0000000000e1'::uuid, 'championship', v,
    '[{"game_number":1,"score_a":10,"score_b":21}]'::jsonb, 'e1000000-0000-0000-0000-000000000004'::uuid,
    '["a1000000-0000-0000-0000-0000000000f3","a1000000-0000-0000-0000-0000000000f4"]'::jsonb,
    '[{"match_id":"a1000000-0000-0000-0000-0000000000f3","slot":"A"},
      {"match_id":"a1000000-0000-0000-0000-0000000000f4","slot":"A"}]'::jsonb,
    '[{"match_id":"a1000000-0000-0000-0000-0000000000f3","slot":"A","competitor_id":"e1000000-0000-0000-0000-000000000004"},
      {"match_id":"a1000000-0000-0000-0000-0000000000f4","slot":"A","competitor_id":"e1000000-0000-0000-0000-000000000001"}]'::jsonb,
    NULL);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: reset path not ok: %', r; END IF;
  IF (r->>'completed')::boolean <> false THEN RAISE EXCEPTION 'FAIL: event must not be complete after reset, got %', r; END IF;

  -- SF1 now completed with the new winner + new games.
  SELECT winner_competitor_id INTO sf1_w FROM public.tournament_matches WHERE id='a1000000-0000-0000-0000-0000000000f1';
  IF sf1_w <> 'e1000000-0000-0000-0000-000000000004' THEN RAISE EXCEPTION 'FAIL: SF1 winner not updated, got %', sf1_w; END IF;
  SELECT score_a INTO sf1_sa FROM public.tournament_match_games WHERE match_id='a1000000-0000-0000-0000-0000000000f1' AND game_number=1;
  IF sf1_sa <> 10 THEN RAISE EXCEPTION 'FAIL: SF1 games not replaced, got %', sf1_sa; END IF;

  -- Final: reset, slot A re-fed with new winner K4, slot B kept K2, ready, no winner, no games.
  SELECT competitor_a_id, competitor_b_id, status, winner_competitor_id INTO f_a, f_b, f_st, f_w
    FROM public.tournament_matches WHERE id='a1000000-0000-0000-0000-0000000000f3';
  IF f_a <> 'e1000000-0000-0000-0000-000000000004' THEN RAISE EXCEPTION 'FAIL: final slot A not re-fed with K4, got %', f_a; END IF;
  IF f_b <> 'e1000000-0000-0000-0000-000000000002' THEN RAISE EXCEPTION 'FAIL: final slot B (kept) not K2, got %', f_b; END IF;
  IF f_st <> 'ready' THEN RAISE EXCEPTION 'FAIL: final not ready, got %', f_st; END IF;
  IF f_w IS NOT NULL THEN RAISE EXCEPTION 'FAIL: final winner not cleared, got %', f_w; END IF;
  SELECT count(*) INTO f_ng FROM public.tournament_match_games WHERE match_id='a1000000-0000-0000-0000-0000000000f3';
  IF f_ng <> 0 THEN RAISE EXCEPTION 'FAIL: final games not deleted, got %', f_ng; END IF;

  -- Third: reset, slot A re-fed with new loser K1, slot B kept K3, ready.
  SELECT competitor_a_id, competitor_b_id, status, winner_competitor_id INTO t_a, t_b, t_st, t_w
    FROM public.tournament_matches WHERE id='a1000000-0000-0000-0000-0000000000f4';
  IF t_a <> 'e1000000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'FAIL: third slot A not re-fed with K1, got %', t_a; END IF;
  IF t_b <> 'e1000000-0000-0000-0000-000000000003' THEN RAISE EXCEPTION 'FAIL: third slot B (kept) not K3, got %', t_b; END IF;
  IF t_st <> 'ready' THEN RAISE EXCEPTION 'FAIL: third not ready, got %', t_st; END IF;
  IF t_w IS NOT NULL THEN RAISE EXCEPTION 'FAIL: third winner not cleared, got %', t_w; END IF;

  -- SF2 (independent) untouched.
  SELECT status, winner_competitor_id INTO sf2_st, sf2_w FROM public.tournament_matches WHERE id='a1000000-0000-0000-0000-0000000000f2';
  IF sf2_st <> 'completed' OR sf2_w <> 'e1000000-0000-0000-0000-000000000002' THEN
    RAISE EXCEPTION 'FAIL: SF2 was disturbed, status=% winner=%', sf2_st, sf2_w; END IF;

  -- Consolation branch untouched (match completed, podium intact).
  SELECT status INTO conso_st FROM public.tournament_matches WHERE id='a2000000-0000-0000-0000-0000000000c1';
  IF conso_st <> 'completed' THEN RAISE EXCEPTION 'FAIL: consolation match disturbed, got %', conso_st; END IF;
  SELECT count(*) INTO conso_podium FROM public.tournament_podium
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND bracket='consolation';
  IF conso_podium <> 2 THEN RAISE EXCEPTION 'FAIL: consolation podium changed, got %', conso_podium; END IF;

  -- Championship podium cleared; event back to knockout_running.
  SELECT count(*) INTO champ_podium FROM public.tournament_podium
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND bracket='championship';
  IF champ_podium <> 0 THEN RAISE EXCEPTION 'FAIL: championship podium not cleared, got %', champ_podium; END IF;
  SELECT status INTO ev_st FROM public.tournament_events WHERE id='c1000000-0000-0000-0000-0000000000e1';
  IF ev_st <> 'knockout_running' THEN RAISE EXCEPTION 'FAIL: event not reopened, got %', ev_st; END IF;
END $$;

-- ── 5. replay the reset path → re-complete the branch and the event ──────────────────────────
DO $$
DECLARE r jsonb; v integer; ev_st text; np integer;
BEGIN
  -- group_knockout event → replay via the branch-aware result RPC. Final: K4 beats K2 (winner K4).
  SELECT version INTO v FROM public.tournament_matches WHERE id='a1000000-0000-0000-0000-0000000000f3';
  r := public.tournament_save_group_knockout_result('a1000000-0000-0000-0000-0000000000f3'::uuid,
    'c1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"game_number":1,"score_a":21,"score_b":16}]'::jsonb, 'e1000000-0000-0000-0000-000000000004'::uuid,
    'championship', '[]'::jsonb, NULL);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: replay final not ok: %', r; END IF;

  -- Third-place: K1 beats K3 → branch complete → podium + event completed.
  SELECT version INTO v FROM public.tournament_matches WHERE id='a1000000-0000-0000-0000-0000000000f4';
  r := public.tournament_save_group_knockout_result('a1000000-0000-0000-0000-0000000000f4'::uuid,
    'c1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"game_number":1,"score_a":21,"score_b":13}]'::jsonb, 'e1000000-0000-0000-0000-000000000001'::uuid,
    'championship', '[]'::jsonb,
    '[{"rank":1,"competitor_id":"e1000000-0000-0000-0000-000000000004","is_joint":false},
      {"rank":2,"competitor_id":"e1000000-0000-0000-0000-000000000002","is_joint":false},
      {"rank":3,"competitor_id":"e1000000-0000-0000-0000-000000000001","is_joint":false}]'::jsonb);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: replay third not ok: %', r; END IF;

  SELECT status INTO ev_st FROM public.tournament_events WHERE id='c1000000-0000-0000-0000-0000000000e1';
  IF ev_st <> 'completed' THEN RAISE EXCEPTION 'FAIL: event not re-completed, got %', ev_st; END IF;
  SELECT count(*) INTO np FROM public.tournament_podium
    WHERE event_id='c1000000-0000-0000-0000-0000000000e1' AND bracket='championship' AND rank=1
      AND competitor_id='e1000000-0000-0000-0000-000000000004';
  IF np <> 1 THEN RAISE EXCEPTION 'FAIL: new champion K4 not on podium, got %', np; END IF;
END $$;

RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'ALL RESET-PATH RPC ASSERTIONS PASSED'; END $$;

ROLLBACK;
-- ════════════════════════════════════════════════════════════════════════════════════
-- END tournament_reset_path_tests.sql
-- ════════════════════════════════════════════════════════════════════════════════════
