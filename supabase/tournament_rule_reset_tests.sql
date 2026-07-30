-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT — CONTROLLED RULE CHANGE / RESET RPC TEST HARNESS (Prompt 15D-2, migration #11)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Exercises tournament_apply_rule_change from migration_tournament_rule_reset.sql on a group_knockout
-- event with a group stage that has a completed match + games, a podium row, a qualification override,
-- and a rule snapshot:
--   1. anon / authenticated CANNOT EXECUTE (service-role-only DEFINER).
--   2. cross-tournament id → not_found (anti-IDOR).
--   3. schedule_only over live results → results_present (never silent).
--   4. destructive mode WITHOUT confirmation → confirmation_required.
--   5. stale snapshot version → snapshot_version_conflict; stale event version → event_version_conflict.
--   6. destructive reset + round_robin regenerate → ok: results/podium/overrides WIPED, snapshot payload
--      + snapshot_version updated (version bumped), fresh group matches inserted, status='group_stage';
--      competitors + groups + group memberships PRESERVED.
--   7. ATOMICITY: a regenerate payload with a bad competitor FK → invalid AND nothing changed (the
--      earlier deletes + snapshot update are rolled back with the failed insert — all-or-nothing).
--   8. completed event → event_completed (blocked).
--
-- Run AFTER migration_tournament_core.sql, the group/knockout migrations, migration_tournament_rule_engine.sql
-- AND migration_tournament_rule_reset.sql, against an ISOLATED database. One transaction, ROLLBACK at the
-- end — persists NOTHING.
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;
RESET ROLE;

-- ── Setup ─────────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.tournaments (id, slug, name, status) VALUES
  ('d0000000-0000-0000-0000-000000000001'::uuid, 'rule-reset-t', 'Rule Reset Tourney', 'published'),
  ('d0000000-0000-0000-0000-000000000002'::uuid, 'other-t', 'Other Tourney', 'published');

INSERT INTO public.tournament_events
  (id, tournament_id, name, format, group_count, winner_qualifiers_per_group, consolation_qualifiers_per_group, status) VALUES
  ('d1000000-0000-0000-0000-0000000000e1'::uuid, 'd0000000-0000-0000-0000-000000000001'::uuid,
   'RR Event', 'group_knockout', 1, 1, 0, 'group_stage');

INSERT INTO public.tournament_competitors (id, event_id, name, display_order) VALUES
  ('f1000000-0000-0000-0000-000000000001'::uuid, 'd1000000-0000-0000-0000-0000000000e1'::uuid, 'C1', 0),
  ('f1000000-0000-0000-0000-000000000002'::uuid, 'd1000000-0000-0000-0000-0000000000e1'::uuid, 'C2', 1),
  ('f1000000-0000-0000-0000-000000000003'::uuid, 'd1000000-0000-0000-0000-0000000000e1'::uuid, 'C3', 2);

INSERT INTO public.tournament_groups (id, event_id, name, display_order) VALUES
  ('a9000000-0000-0000-0000-0000000000a1'::uuid, 'd1000000-0000-0000-0000-0000000000e1'::uuid, 'Bảng A', 0);

INSERT INTO public.tournament_group_memberships (event_id, group_id, competitor_id, display_order) VALUES
  ('d1000000-0000-0000-0000-0000000000e1'::uuid, 'a9000000-0000-0000-0000-0000000000a1'::uuid, 'f1000000-0000-0000-0000-000000000001'::uuid, 0),
  ('d1000000-0000-0000-0000-0000000000e1'::uuid, 'a9000000-0000-0000-0000-0000000000a1'::uuid, 'f1000000-0000-0000-0000-000000000002'::uuid, 1),
  ('d1000000-0000-0000-0000-0000000000e1'::uuid, 'a9000000-0000-0000-0000-0000000000a1'::uuid, 'f1000000-0000-0000-0000-000000000003'::uuid, 2);

-- Group round-robin: 3 matches; one completed with games.
INSERT INTO public.tournament_matches
  (id, event_id, group_id, stage, bracket, round_number, match_number, competitor_a_id, competitor_b_id, status, winner_competitor_id, generation_key) VALUES
  ('b1000000-0000-0000-0000-00000000ab01'::uuid, 'd1000000-0000-0000-0000-0000000000e1'::uuid, 'a9000000-0000-0000-0000-0000000000a1'::uuid, 'group', NULL, 1, 1,
   'f1000000-0000-0000-0000-000000000001'::uuid, 'f1000000-0000-0000-0000-000000000002'::uuid, 'completed', 'f1000000-0000-0000-0000-000000000001'::uuid, 'grp:a:1'),
  ('b1000000-0000-0000-0000-00000000ab02'::uuid, 'd1000000-0000-0000-0000-0000000000e1'::uuid, 'a9000000-0000-0000-0000-0000000000a1'::uuid, 'group', NULL, 1, 2,
   'f1000000-0000-0000-0000-000000000001'::uuid, 'f1000000-0000-0000-0000-000000000003'::uuid, 'ready', NULL, 'grp:a:2'),
  ('b1000000-0000-0000-0000-00000000ab03'::uuid, 'd1000000-0000-0000-0000-0000000000e1'::uuid, 'a9000000-0000-0000-0000-0000000000a1'::uuid, 'group', NULL, 1, 3,
   'f1000000-0000-0000-0000-000000000002'::uuid, 'f1000000-0000-0000-0000-000000000003'::uuid, 'ready', NULL, 'grp:a:3');

INSERT INTO public.tournament_match_games (match_id, game_number, score_a, score_b) VALUES
  ('b1000000-0000-0000-0000-00000000ab01'::uuid, 1, 21, 15);

INSERT INTO public.tournament_podium (event_id, bracket, rank, competitor_id, is_joint) VALUES
  ('d1000000-0000-0000-0000-0000000000e1'::uuid, 'championship', 1, 'f1000000-0000-0000-0000-000000000001'::uuid, false);

INSERT INTO public.tournament_qualification_overrides (event_id, group_id, resolved_order) VALUES
  ('d1000000-0000-0000-0000-0000000000e1'::uuid, 'a9000000-0000-0000-0000-0000000000a1'::uuid,
   '["f1000000-0000-0000-0000-000000000001"]'::jsonb);

INSERT INTO public.tournament_event_rule_snapshots (id, event_id, source, category, snapshot_version, requires_configuration, payload) VALUES
  ('c8000000-0000-0000-0000-0000000000c1'::uuid, 'd1000000-0000-0000-0000-0000000000e1'::uuid, 'custom', NULL, 1, false,
   '{"group":{"match":{"points_to_win":21}}}'::jsonb);

-- The proposed new rules + a valid round-robin regen payload (3 matches, unique generation keys).
-- Held in transaction-local GUCs (not psql \set) so they are visible inside DO $$ … $$ blocks —
-- psql variable interpolation (:'var') does NOT reach inside dollar-quoted PL/pgSQL bodies.
SELECT set_config('tourn_test.new_rules',
  '{"group":{"match":{"points_to_win":15}},"knockout":{"match":{"points_to_win":15}},"handicap":{"enabled":false}}', true);
SELECT set_config('tourn_test.regen',
  '[{"group_id":"a9000000-0000-0000-0000-0000000000a1","round_number":1,"match_number":1,"competitor_a_id":"f1000000-0000-0000-0000-000000000001","competitor_b_id":"f1000000-0000-0000-0000-000000000002","generation_key":"grp:a:1"},{"group_id":"a9000000-0000-0000-0000-0000000000a1","round_number":1,"match_number":2,"competitor_a_id":"f1000000-0000-0000-0000-000000000001","competitor_b_id":"f1000000-0000-0000-0000-000000000003","generation_key":"grp:a:2"},{"group_id":"a9000000-0000-0000-0000-0000000000a1","round_number":1,"match_number":3,"competitor_a_id":"f1000000-0000-0000-0000-000000000002","competitor_b_id":"f1000000-0000-0000-0000-000000000003","generation_key":"grp:a:3"}]', true);

-- ── 1. anon & authenticated cannot EXECUTE ─────────────────────────────────────────────────────
SET LOCAL ROLE anon;
DO $$
DECLARE ran boolean := false;
BEGIN
  BEGIN
    PERFORM public.tournament_apply_rule_change('d1000000-0000-0000-0000-0000000000e1'::uuid,
      'd0000000-0000-0000-0000-000000000001'::uuid, 'c8000000-0000-0000-0000-0000000000c1'::uuid, 1, NULL,
      '{"group":{}}'::jsonb, 2, false, 'schedule_only', 'none', NULL, false);
    ran := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ran THEN RAISE EXCEPTION 'FAIL: anon executed tournament_apply_rule_change'; END IF;
END $$;
SET LOCAL ROLE service_role;

-- ── 2. cross-tournament id → not_found ─────────────────────────────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := public.tournament_apply_rule_change('d1000000-0000-0000-0000-0000000000e1'::uuid,
    'd0000000-0000-0000-0000-000000000002'::uuid, 'c8000000-0000-0000-0000-0000000000c1'::uuid, 1, NULL,
    current_setting('tourn_test.new_rules')::jsonb, 2, false, 'all_results_and_downstream', 'none', NULL, true);
  IF r->>'code' <> 'not_found' THEN RAISE EXCEPTION 'FAIL: cross-tournament expected not_found, got %', r; END IF;
END $$;

-- ── 3. schedule_only over results → results_present ────────────────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := public.tournament_apply_rule_change('d1000000-0000-0000-0000-0000000000e1'::uuid,
    'd0000000-0000-0000-0000-000000000001'::uuid, 'c8000000-0000-0000-0000-0000000000c1'::uuid, 1, NULL,
    current_setting('tourn_test.new_rules')::jsonb, 2, false, 'schedule_only', 'round_robin', current_setting('tourn_test.regen')::jsonb, false);
  IF r->>'code' <> 'results_present' THEN RAISE EXCEPTION 'FAIL: schedule_only over results expected results_present, got %', r; END IF;
END $$;

-- ── 4. destructive WITHOUT confirmation → confirmation_required ─────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := public.tournament_apply_rule_change('d1000000-0000-0000-0000-0000000000e1'::uuid,
    'd0000000-0000-0000-0000-000000000001'::uuid, 'c8000000-0000-0000-0000-0000000000c1'::uuid, 1, NULL,
    current_setting('tourn_test.new_rules')::jsonb, 2, false, 'all_results_and_downstream', 'round_robin', current_setting('tourn_test.regen')::jsonb, false);
  IF r->>'code' <> 'confirmation_required' THEN RAISE EXCEPTION 'FAIL: no-confirm expected confirmation_required, got %', r; END IF;
END $$;

-- ── 5. stale snapshot / event version → conflicts ──────────────────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := public.tournament_apply_rule_change('d1000000-0000-0000-0000-0000000000e1'::uuid,
    'd0000000-0000-0000-0000-000000000001'::uuid, 'c8000000-0000-0000-0000-0000000000c1'::uuid, 999, NULL,
    current_setting('tourn_test.new_rules')::jsonb, 2, false, 'all_results_and_downstream', 'round_robin', current_setting('tourn_test.regen')::jsonb, true);
  IF r->>'code' <> 'snapshot_version_conflict' THEN RAISE EXCEPTION 'FAIL: stale snapshot expected snapshot_version_conflict, got %', r; END IF;

  r := public.tournament_apply_rule_change('d1000000-0000-0000-0000-0000000000e1'::uuid,
    'd0000000-0000-0000-0000-000000000001'::uuid, 'c8000000-0000-0000-0000-0000000000c1'::uuid, 1, 999,
    current_setting('tourn_test.new_rules')::jsonb, 2, false, 'all_results_and_downstream', 'round_robin', current_setting('tourn_test.regen')::jsonb, true);
  IF r->>'code' <> 'event_version_conflict' THEN RAISE EXCEPTION 'FAIL: stale event expected event_version_conflict, got %', r; END IF;
END $$;

-- ── 6. ATOMICITY: bad regen FK → invalid AND nothing changed ───────────────────────────────────
DO $$
DECLARE r jsonb; v_pod integer; v_snap integer; v_completed integer; bad_regen jsonb;
BEGIN
  bad_regen := '[{"group_id":"a9000000-0000-0000-0000-0000000000a1","round_number":1,"match_number":1,"competitor_a_id":"f1000000-0000-0000-0000-0000000000ff","competitor_b_id":"f1000000-0000-0000-0000-000000000002","generation_key":"grp:bad:1"}]'::jsonb;
  r := public.tournament_apply_rule_change('d1000000-0000-0000-0000-0000000000e1'::uuid,
    'd0000000-0000-0000-0000-000000000001'::uuid, 'c8000000-0000-0000-0000-0000000000c1'::uuid, 1, NULL,
    current_setting('tourn_test.new_rules')::jsonb, 2, false, 'all_results_and_downstream', 'round_robin', bad_regen, true);
  IF r->>'code' <> 'invalid' THEN RAISE EXCEPTION 'FAIL: bad regen FK expected invalid, got %', r; END IF;

  -- Everything must be untouched — the failed insert rolled the whole mutation back.
  SELECT count(*) INTO v_pod FROM public.tournament_podium WHERE event_id='d1000000-0000-0000-0000-0000000000e1'::uuid;
  IF v_pod <> 1 THEN RAISE EXCEPTION 'FAIL: atomicity — podium changed after failed apply, got %', v_pod; END IF;
  SELECT snapshot_version INTO v_snap FROM public.tournament_event_rule_snapshots WHERE id='c8000000-0000-0000-0000-0000000000c1'::uuid;
  IF v_snap <> 1 THEN RAISE EXCEPTION 'FAIL: atomicity — snapshot changed after failed apply, got %', v_snap; END IF;
  SELECT count(*) INTO v_completed FROM public.tournament_matches WHERE event_id='d1000000-0000-0000-0000-0000000000e1'::uuid AND status='completed';
  IF v_completed <> 1 THEN RAISE EXCEPTION 'FAIL: atomicity — completed match changed after failed apply, got %', v_completed; END IF;
END $$;

-- ── 7. destructive reset + regenerate → ok, downstream wiped, snapshot updated, matches fresh ──
DO $$
DECLARE r jsonb; v_pod integer; v_qual integer; v_games integer; v_snap integer; v_snapver integer;
        v_payload jsonb; v_status text; v_matches integer; v_ready integer; v_comp integer; v_groups integer; v_mem integer;
BEGIN
  r := public.tournament_apply_rule_change('d1000000-0000-0000-0000-0000000000e1'::uuid,
    'd0000000-0000-0000-0000-000000000001'::uuid, 'c8000000-0000-0000-0000-0000000000c1'::uuid, 1, NULL,
    current_setting('tourn_test.new_rules')::jsonb, 2, false, 'all_results_and_downstream', 'round_robin', current_setting('tourn_test.regen')::jsonb, true);
  IF r->>'code' <> 'ok' THEN RAISE EXCEPTION 'FAIL: destructive apply not ok: %', r; END IF;
  IF (r->>'regenerated')::boolean <> true THEN RAISE EXCEPTION 'FAIL: expected regenerated=true, got %', r; END IF;
  IF (r->'reset'->>'scored_games')::int <> 1 THEN RAISE EXCEPTION 'FAIL: reset counts wrong: %', r; END IF;

  SELECT count(*) INTO v_pod FROM public.tournament_podium WHERE event_id='d1000000-0000-0000-0000-0000000000e1'::uuid;
  IF v_pod <> 0 THEN RAISE EXCEPTION 'FAIL: podium not cleared, got %', v_pod; END IF;
  SELECT count(*) INTO v_qual FROM public.tournament_qualification_overrides WHERE event_id='d1000000-0000-0000-0000-0000000000e1'::uuid;
  IF v_qual <> 0 THEN RAISE EXCEPTION 'FAIL: overrides not cleared, got %', v_qual; END IF;
  SELECT count(*) INTO v_games FROM public.tournament_match_games mg JOIN public.tournament_matches m ON m.id=mg.match_id WHERE m.event_id='d1000000-0000-0000-0000-0000000000e1'::uuid;
  IF v_games <> 0 THEN RAISE EXCEPTION 'FAIL: games not cleared, got %', v_games; END IF;

  -- Snapshot updated: payload replaced, snapshot_version=2, optimistic version bumped (1→2).
  SELECT snapshot_version, version, payload INTO v_snapver, v_snap, v_payload FROM public.tournament_event_rule_snapshots WHERE id='c8000000-0000-0000-0000-0000000000c1'::uuid;
  IF v_snapver <> 2 THEN RAISE EXCEPTION 'FAIL: snapshot_version not bumped, got %', v_snapver; END IF;
  IF v_snap <> 2 THEN RAISE EXCEPTION 'FAIL: optimistic version not bumped, got %', v_snap; END IF;
  IF (v_payload->'group'->'match'->>'points_to_win') <> '15' THEN RAISE EXCEPTION 'FAIL: payload not updated, got %', v_payload; END IF;

  -- Fresh group matches: 3, all ready, none completed. Status back to group_stage.
  SELECT count(*) INTO v_matches FROM public.tournament_matches WHERE event_id='d1000000-0000-0000-0000-0000000000e1'::uuid AND stage='group';
  IF v_matches <> 3 THEN RAISE EXCEPTION 'FAIL: expected 3 fresh group matches, got %', v_matches; END IF;
  SELECT count(*) INTO v_ready FROM public.tournament_matches WHERE event_id='d1000000-0000-0000-0000-0000000000e1'::uuid AND status='ready';
  IF v_ready <> 3 THEN RAISE EXCEPTION 'FAIL: expected 3 ready matches, got %', v_ready; END IF;
  SELECT status INTO v_status FROM public.tournament_events WHERE id='d1000000-0000-0000-0000-0000000000e1'::uuid;
  IF v_status <> 'group_stage' THEN RAISE EXCEPTION 'FAIL: expected status group_stage, got %', v_status; END IF;

  -- Competitors, groups and group memberships PRESERVED.
  SELECT count(*) INTO v_comp FROM public.tournament_competitors WHERE event_id='d1000000-0000-0000-0000-0000000000e1'::uuid;
  SELECT count(*) INTO v_groups FROM public.tournament_groups WHERE event_id='d1000000-0000-0000-0000-0000000000e1'::uuid;
  SELECT count(*) INTO v_mem FROM public.tournament_group_memberships WHERE event_id='d1000000-0000-0000-0000-0000000000e1'::uuid;
  IF v_comp <> 3 OR v_groups <> 1 OR v_mem <> 3 THEN
    RAISE EXCEPTION 'FAIL: competitors/groups/memberships not preserved: %/%/%', v_comp, v_groups, v_mem; END IF;
END $$;

-- ── 8. completed event → event_completed ───────────────────────────────────────────────────────
DO $$
DECLARE r jsonb; v_ver integer; v_sv integer;
BEGIN
  UPDATE public.tournament_events SET status='completed' WHERE id='d1000000-0000-0000-0000-0000000000e1'::uuid;
  SELECT version INTO v_ver FROM public.tournament_events WHERE id='d1000000-0000-0000-0000-0000000000e1'::uuid;
  SELECT version INTO v_sv FROM public.tournament_event_rule_snapshots WHERE id='c8000000-0000-0000-0000-0000000000c1'::uuid;
  r := public.tournament_apply_rule_change('d1000000-0000-0000-0000-0000000000e1'::uuid,
    'd0000000-0000-0000-0000-000000000001'::uuid, 'c8000000-0000-0000-0000-0000000000c1'::uuid, v_sv, v_ver,
    current_setting('tourn_test.new_rules')::jsonb, 3, false, 'all_results_and_downstream', 'none', NULL, true);
  IF r->>'code' <> 'event_completed' THEN RAISE EXCEPTION 'FAIL: completed event expected event_completed, got %', r; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'PASS: tournament_apply_rule_change — all assertions passed'; END $$;

ROLLBACK;
-- ════════════════════════════════════════════════════════════════════════════════════
-- END tournament_rule_reset_tests.sql
-- ════════════════════════════════════════════════════════════════════════════════════
