-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT — SCORING & OVERRIDE RPC TEST HARNESS (Prompt 07)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Exercises the four RPCs from migration_tournament_scoring.sql:
--   • anon / authenticated CANNOT EXECUTE them (service-role-only DEFINER RPCs).
--   • save records games + winner + status='completed'; multi-game points are stored per game.
--   • the event status is CLAMPED to SQL completion (target knockout_ready is ignored while a match
--     is still ready) and becomes knockout_ready only when every group match is finished.
--   • stale MATCH version → version_conflict, nothing written.
--   • saving a knockout match id → wrong_stage; a cancelled/placeholder group match → not_scoreable.
--   • clear resets a completed match to 'ready' (winner NULL, games gone) and status → group_stage.
--   • a save/clear DROPS the group's qualification override (a result change may stale it).
--   • override save upserts + sets status; delete reverts it.
--   • once a knockout match exists downstream, save/clear/override all return has_knockout.
--
-- Run AFTER migration_tournament_core.sql AND migration_tournament_scoring.sql, against an ISOLATED
-- database. One transaction, ROLLBACK at the end — persists NOTHING.
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;
RESET ROLE;

-- ── Setup ──────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.tournaments (id, slug, name, status) VALUES
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'score-t', 'Scoring Tourney', 'draft');

INSERT INTO public.tournament_events (id, tournament_id, name, format, group_count, winner_qualifiers_per_group) VALUES
  ('a1000000-0000-0000-0000-0000000000e1'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid,
   'GK Event', 'group_knockout', 1, 1);

INSERT INTO public.tournament_competitors (id, event_id, name, display_order) VALUES
  ('c1000000-0000-0000-0000-000000000001'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, 'C1', 0),
  ('c1000000-0000-0000-0000-000000000002'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, 'C2', 1),
  ('c1000000-0000-0000-0000-000000000003'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, 'C3', 2),
  ('c1000000-0000-0000-0000-000000000004'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, 'C4', 3);

INSERT INTO public.tournament_groups (id, event_id, name, display_order) VALUES
  ('90000000-0000-0000-0000-0000000000a0'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, 'A', 0);

INSERT INTO public.tournament_group_memberships (event_id, group_id, competitor_id, display_order) VALUES
  ('a1000000-0000-0000-0000-0000000000e1'::uuid, '90000000-0000-0000-0000-0000000000a0'::uuid, 'c1000000-0000-0000-0000-000000000001'::uuid, 0),
  ('a1000000-0000-0000-0000-0000000000e1'::uuid, '90000000-0000-0000-0000-0000000000a0'::uuid, 'c1000000-0000-0000-0000-000000000002'::uuid, 1),
  ('a1000000-0000-0000-0000-0000000000e1'::uuid, '90000000-0000-0000-0000-0000000000a0'::uuid, 'c1000000-0000-0000-0000-000000000003'::uuid, 2),
  ('a1000000-0000-0000-0000-0000000000e1'::uuid, '90000000-0000-0000-0000-0000000000a0'::uuid, 'c1000000-0000-0000-0000-000000000004'::uuid, 3);

-- Two group matches (C1v C2, C3 v C4) + one cancelled group match (for not_scoreable).
INSERT INTO public.tournament_matches
  (id, event_id, group_id, stage, bracket, round_number, match_number, competitor_a_id, competitor_b_id, status, generation_key) VALUES
  ('11110000-0000-0000-0000-000000000001'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, '90000000-0000-0000-0000-0000000000a0'::uuid,
   'group', NULL, 1, 1, 'c1000000-0000-0000-0000-000000000001'::uuid, 'c1000000-0000-0000-0000-000000000002'::uuid, 'ready', 'rr:a:1'),
  ('11110000-0000-0000-0000-000000000002'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, '90000000-0000-0000-0000-0000000000a0'::uuid,
   'group', NULL, 1, 2, 'c1000000-0000-0000-0000-000000000003'::uuid, 'c1000000-0000-0000-0000-000000000004'::uuid, 'ready', 'rr:a:2'),
  ('11110000-0000-0000-0000-0000000000cc'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, '90000000-0000-0000-0000-0000000000a0'::uuid,
   'group', NULL, 1, 3, 'c1000000-0000-0000-0000-000000000001'::uuid, 'c1000000-0000-0000-0000-000000000003'::uuid, 'cancelled', 'rr:a:3');

-- ── 1. anon & authenticated cannot EXECUTE the RPCs ─────────────────────────────────────────
SET LOCAL ROLE anon;
DO $$
DECLARE ran boolean := false;
BEGIN
  BEGIN
    PERFORM public.tournament_save_match_result(
      '11110000-0000-0000-0000-000000000001'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, 1,
      '[{"game_number":1,"score_a":21,"score_b":10}]'::jsonb, 'c1000000-0000-0000-0000-000000000001'::uuid, 'group_stage');
    ran := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ran THEN RAISE EXCEPTION 'FAIL: anon executed tournament_save_match_result'; END IF;
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE ran boolean := false;
BEGIN
  BEGIN
    PERFORM public.tournament_delete_qualification_override(
      'a1000000-0000-0000-0000-0000000000e1'::uuid, '90000000-0000-0000-0000-0000000000a0'::uuid, 1, 'group_stage');
    ran := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ran THEN RAISE EXCEPTION 'FAIL: authenticated executed tournament_delete_qualification_override'; END IF;
END $$;

SET LOCAL ROLE service_role;

-- ── 2. save m1 with a stale match version → version_conflict (nothing written) ──────────────
DO $$
DECLARE r jsonb; n integer;
BEGIN
  r := public.tournament_save_match_result(
    '11110000-0000-0000-0000-000000000001'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, 999,
    '[{"game_number":1,"score_a":21,"score_b":10}]'::jsonb, 'c1000000-0000-0000-0000-000000000001'::uuid, 'group_stage');
  IF r->>'code' <> 'version_conflict' THEN RAISE EXCEPTION 'FAIL: expected version_conflict, got %', r; END IF;
  SELECT count(*) INTO n FROM public.tournament_match_games WHERE match_id = '11110000-0000-0000-0000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: stale-version save must write nothing, got % games', n; END IF;
END $$;

-- ── 3. cannot score a cancelled match (not_scoreable) ───────────────────────────────────────
DO $$
DECLARE r jsonb; v integer;
BEGIN
  SELECT version INTO v FROM public.tournament_matches WHERE id = '11110000-0000-0000-0000-0000000000cc';
  r := public.tournament_save_match_result(
    '11110000-0000-0000-0000-0000000000cc'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"game_number":1,"score_a":21,"score_b":10}]'::jsonb, 'c1000000-0000-0000-0000-000000000001'::uuid, 'group_stage');
  IF r->>'code' <> 'not_scoreable' THEN RAISE EXCEPTION 'FAIL: expected not_scoreable, got %', r; END IF;
END $$;

-- ── 4. save m1 (multi-game); status CLAMPED to group_stage (m2 still ready); games stored ────
DO $$
DECLARE r jsonb; v integer; st text; won uuid; gn integer; pa integer;
BEGIN
  SELECT version INTO v FROM public.tournament_matches WHERE id = '11110000-0000-0000-0000-000000000001';
  r := public.tournament_save_match_result(
    '11110000-0000-0000-0000-000000000001'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"game_number":1,"score_a":21,"score_b":15},{"game_number":2,"score_a":18,"score_b":21},{"game_number":3,"score_a":21,"score_b":17}]'::jsonb,
    'c1000000-0000-0000-0000-000000000001'::uuid, 'knockout_ready');
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: save m1 not ok: %', r; END IF;
  IF r->>'status' <> 'group_stage' THEN RAISE EXCEPTION 'FAIL: status must clamp to group_stage while m2 ready, got %', r; END IF;

  SELECT status, winner_competitor_id INTO st, won FROM public.tournament_matches WHERE id = '11110000-0000-0000-0000-000000000001';
  IF st <> 'completed' THEN RAISE EXCEPTION 'FAIL: m1 not completed, got %', st; END IF;
  IF won <> 'c1000000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'FAIL: wrong winner, got %', won; END IF;

  SELECT count(*), sum(score_a) INTO gn, pa FROM public.tournament_match_games WHERE match_id = '11110000-0000-0000-0000-000000000001';
  IF gn <> 3 THEN RAISE EXCEPTION 'FAIL: expected 3 games stored, got %', gn; END IF;
  IF pa <> 60 THEN RAISE EXCEPTION 'FAIL: expected total score_a 60, got %', pa; END IF;
END $$;

-- ── 5. save m2 → all group matches complete → status becomes knockout_ready ──────────────────
DO $$
DECLARE r jsonb; v integer; st text;
BEGIN
  SELECT version INTO v FROM public.tournament_matches WHERE id = '11110000-0000-0000-0000-000000000002';
  r := public.tournament_save_match_result(
    '11110000-0000-0000-0000-000000000002'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"game_number":1,"score_a":21,"score_b":10}]'::jsonb, 'c1000000-0000-0000-0000-000000000003'::uuid, 'knockout_ready');
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: save m2 not ok: %', r; END IF;
  IF r->>'status' <> 'knockout_ready' THEN RAISE EXCEPTION 'FAIL: expected knockout_ready, got %', r; END IF;
  SELECT status INTO st FROM public.tournament_events WHERE id = 'a1000000-0000-0000-0000-0000000000e1';
  IF st <> 'knockout_ready' THEN RAISE EXCEPTION 'FAIL: event status not knockout_ready, got %', st; END IF;
END $$;

-- ── 6. override save upserts + sets status; delete reverts ───────────────────────────────────
DO $$
DECLARE r jsonb; v integer; n integer;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'a1000000-0000-0000-0000-0000000000e1';
  r := public.tournament_save_qualification_override(
    'a1000000-0000-0000-0000-0000000000e1'::uuid, '90000000-0000-0000-0000-0000000000a0'::uuid, v,
    '["c1000000-0000-0000-0000-000000000001","c1000000-0000-0000-0000-000000000002","c1000000-0000-0000-0000-000000000003","c1000000-0000-0000-0000-000000000004"]'::jsonb,
    'BTC quyết định', NULL, 'knockout_ready');
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: override save not ok: %', r; END IF;
  SELECT count(*) INTO n FROM public.tournament_qualification_overrides
    WHERE event_id='a1000000-0000-0000-0000-0000000000e1' AND group_id='90000000-0000-0000-0000-0000000000a0';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: override not stored, got %', n; END IF;

  -- stale event version → version_conflict
  r := public.tournament_delete_qualification_override(
    'a1000000-0000-0000-0000-0000000000e1'::uuid, '90000000-0000-0000-0000-0000000000a0'::uuid, 1, 'knockout_ready');
  IF r->>'code' <> 'version_conflict' THEN RAISE EXCEPTION 'FAIL: expected version_conflict on override delete, got %', r; END IF;

  SELECT version INTO v FROM public.tournament_events WHERE id = 'a1000000-0000-0000-0000-0000000000e1';
  r := public.tournament_delete_qualification_override(
    'a1000000-0000-0000-0000-0000000000e1'::uuid, '90000000-0000-0000-0000-0000000000a0'::uuid, v, 'group_stage_completed');
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: override delete not ok: %', r; END IF;
  SELECT count(*) INTO n FROM public.tournament_qualification_overrides
    WHERE event_id='a1000000-0000-0000-0000-0000000000e1' AND group_id='90000000-0000-0000-0000-0000000000a0';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: override not deleted, got %', n; END IF;
END $$;

-- ── 7. a match-result save DROPS the group's stale override (test 16) ────────────────────────
DO $$
DECLARE r jsonb; v integer; n integer;
BEGIN
  SELECT version INTO v FROM public.tournament_events WHERE id = 'a1000000-0000-0000-0000-0000000000e1';
  r := public.tournament_save_qualification_override(
    'a1000000-0000-0000-0000-0000000000e1'::uuid, '90000000-0000-0000-0000-0000000000a0'::uuid, v,
    '["c1000000-0000-0000-0000-000000000001","c1000000-0000-0000-0000-000000000002","c1000000-0000-0000-0000-000000000003","c1000000-0000-0000-0000-000000000004"]'::jsonb,
    NULL, NULL, 'knockout_ready');
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: override re-save not ok: %', r; END IF;

  -- Re-save m1 with a different score → its group's override must be dropped.
  SELECT version INTO v FROM public.tournament_matches WHERE id = '11110000-0000-0000-0000-000000000001';
  r := public.tournament_save_match_result(
    '11110000-0000-0000-0000-000000000001'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"game_number":1,"score_a":15,"score_b":21}]'::jsonb, 'c1000000-0000-0000-0000-000000000002'::uuid, 'knockout_ready');
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: m1 re-save not ok: %', r; END IF;
  SELECT count(*) INTO n FROM public.tournament_qualification_overrides
    WHERE event_id='a1000000-0000-0000-0000-0000000000e1' AND group_id='90000000-0000-0000-0000-0000000000a0';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: match save must drop the stale override, got %', n; END IF;
END $$;

-- ── 8. clear m1 → ready, winner NULL, games gone, status group_stage ─────────────────────────
DO $$
DECLARE r jsonb; v integer; st text; won uuid; n integer;
BEGIN
  SELECT version INTO v FROM public.tournament_matches WHERE id = '11110000-0000-0000-0000-000000000001';
  r := public.tournament_clear_match_result(
    '11110000-0000-0000-0000-000000000001'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, v);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: clear not ok: %', r; END IF;
  SELECT status, winner_competitor_id INTO st, won FROM public.tournament_matches WHERE id = '11110000-0000-0000-0000-000000000001';
  IF st <> 'ready' OR won IS NOT NULL THEN RAISE EXCEPTION 'FAIL: clear did not reset match, status=% winner=%', st, won; END IF;
  SELECT count(*) INTO n FROM public.tournament_match_games WHERE match_id = '11110000-0000-0000-0000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: clear left games behind, got %', n; END IF;
  SELECT status INTO st FROM public.tournament_events WHERE id = 'a1000000-0000-0000-0000-0000000000e1';
  IF st <> 'group_stage' THEN RAISE EXCEPTION 'FAIL: event status not group_stage after clear, got %', st; END IF;
END $$;

-- ── 9. saving a knockout match id → wrong_stage ─────────────────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  INSERT INTO public.tournament_matches
    (id, event_id, stage, bracket, round_number, match_number, generation_key, status)
    VALUES ('22220000-0000-0000-0000-00000000f001'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid,
            'knockout', 'championship', 1, 1, 'ko:1', 'pending');
  r := public.tournament_save_match_result(
    '22220000-0000-0000-0000-00000000f001'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, 1,
    '[{"game_number":1,"score_a":21,"score_b":10}]'::jsonb, NULL, 'group_stage');
  IF r->>'code' <> 'wrong_stage' THEN RAISE EXCEPTION 'FAIL: expected wrong_stage, got %', r; END IF;
END $$;

-- ── 10. once knockout exists, save/clear/override on the group return has_knockout ──────────
DO $$
DECLARE r jsonb; v integer;
BEGIN
  SELECT version INTO v FROM public.tournament_matches WHERE id = '11110000-0000-0000-0000-000000000002';
  r := public.tournament_save_match_result(
    '11110000-0000-0000-0000-000000000002'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, v,
    '[{"game_number":1,"score_a":21,"score_b":10}]'::jsonb, 'c1000000-0000-0000-0000-000000000003'::uuid, 'group_stage');
  IF r->>'code' <> 'has_knockout' THEN RAISE EXCEPTION 'FAIL: expected has_knockout on save, got %', r; END IF;

  SELECT version INTO v FROM public.tournament_matches WHERE id = '11110000-0000-0000-0000-000000000002';
  r := public.tournament_clear_match_result(
    '11110000-0000-0000-0000-000000000002'::uuid, 'a1000000-0000-0000-0000-0000000000e1'::uuid, v);
  IF r->>'code' <> 'has_knockout' THEN RAISE EXCEPTION 'FAIL: expected has_knockout on clear, got %', r; END IF;

  SELECT version INTO v FROM public.tournament_events WHERE id = 'a1000000-0000-0000-0000-0000000000e1';
  r := public.tournament_save_qualification_override(
    'a1000000-0000-0000-0000-0000000000e1'::uuid, '90000000-0000-0000-0000-0000000000a0'::uuid, v,
    '["c1000000-0000-0000-0000-000000000001"]'::jsonb, NULL, NULL, 'group_stage');
  IF r->>'code' <> 'has_knockout' THEN RAISE EXCEPTION 'FAIL: expected has_knockout on override, got %', r; END IF;
END $$;

RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'ALL SCORING/OVERRIDE RPC ASSERTIONS PASSED'; END $$;

ROLLBACK;
-- ════════════════════════════════════════════════════════════════════════════════════
-- END tournament_scoring_tests.sql
-- ════════════════════════════════════════════════════════════════════════════════════
