-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT — FJP HANDICAP TEST HARNESS (Prompt 15D-1B, migration #10)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Verifies the DB half of the official FJP gender handicap:
--   • competitor composition columns + CHECKs (partial / bad-total rejected; valid pair accepted).
--   • per-game starting-score columns + the tmg_scores_ge_starting backstop (final < starting fails).
--   • tournament_save_match_result persists the starting scores + handicap provenance ATOMICALLY.
--   • FJP preset v2 is seeded CONFIGURED (female_count_difference, points_per_difference 2), v1 is
--     deprecated (so the picker offers v2).
--
-- Run AFTER migration_tournament_fjp_handicap.sql against an ISOLATED database. The whole script runs
-- in ONE transaction and ROLLs BACK — it persists NOTHING (the preset rows it reads were committed by
-- the migration itself).
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;
RESET ROLE;

-- ── Setup (as superuser) ──────────────────────────────────────────────────────────────────
INSERT INTO public.tournaments (id, slug, name, status) VALUES
  ('e0000000-0000-0000-0000-0000000000f1'::uuid, 'fjp-hcap', 'FJP Handicap', 'published');

INSERT INTO public.tournament_events (id, tournament_id, name, format, group_count, winner_qualifiers_per_group) VALUES
  ('e0000000-0000-0000-0000-0000000000f2'::uuid, 'e0000000-0000-0000-0000-0000000000f1'::uuid,
   'Đôi', 'group_knockout', 1, 1);

-- Competitor A = Nữ + Nữ (2 women), B = Nam + Nam (0 women).
INSERT INTO public.tournament_competitors (id, event_id, name, competitor_kind, male_count, female_count) VALUES
  ('e1111111-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-0000000000f2'::uuid, 'FF', 'pair', 0, 2),
  ('e1111111-0000-0000-0000-000000000002'::uuid, 'e0000000-0000-0000-0000-0000000000f2'::uuid, 'MM', 'pair', 2, 0);

INSERT INTO public.tournament_groups (id, event_id, name) VALUES
  ('e2222222-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-0000000000f2'::uuid, 'Bảng A');

INSERT INTO public.tournament_group_memberships (event_id, group_id, competitor_id) VALUES
  ('e0000000-0000-0000-0000-0000000000f2'::uuid, 'e2222222-0000-0000-0000-000000000001'::uuid, 'e1111111-0000-0000-0000-000000000001'::uuid),
  ('e0000000-0000-0000-0000-0000000000f2'::uuid, 'e2222222-0000-0000-0000-000000000001'::uuid, 'e1111111-0000-0000-0000-000000000002'::uuid);

INSERT INTO public.tournament_matches
  (id, event_id, group_id, stage, bracket, round_number, match_number, competitor_a_id, competitor_b_id, status, generation_key, version)
VALUES
  ('e3333333-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-0000000000f2'::uuid,
   'e2222222-0000-0000-0000-000000000001'::uuid, 'group', NULL, 1, 1,
   'e1111111-0000-0000-0000-000000000001'::uuid, 'e1111111-0000-0000-0000-000000000002'::uuid, 'ready', 'g-r1-m1', 1);

-- ── 1. Composition CHECK: a PARTIAL composition (kind set, counts null) is rejected ─────────
DO $$
DECLARE failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.tournament_competitors (event_id, name, competitor_kind)
      VALUES ('e0000000-0000-0000-0000-0000000000f2'::uuid, 'Partial', 'pair');
    failed := true;
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF failed THEN RAISE EXCEPTION 'FAIL 1: partial composition was accepted'; END IF;
END $$;

-- ── 2. Composition CHECK: a pair whose members do not total 2 is rejected ───────────────────
DO $$
DECLARE failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.tournament_competitors (event_id, name, competitor_kind, male_count, female_count)
      VALUES ('e0000000-0000-0000-0000-0000000000f2'::uuid, 'BadTotal', 'pair', 2, 1);
    failed := true;
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF failed THEN RAISE EXCEPTION 'FAIL 2: a pair totalling 3 was accepted'; END IF;
END $$;

-- ── 3. A game whose FINAL score is below its starting score is rejected (backstop) ──────────
DO $$
DECLARE failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.tournament_match_games (match_id, game_number, score_a, score_b, starting_score_a, starting_score_b)
      VALUES ('e3333333-0000-0000-0000-000000000001'::uuid, 9, 3, 10, 4, 0); -- score_a 3 < starting 4
    failed := true;
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF failed THEN RAISE EXCEPTION 'FAIL 3: a final score below the starting score was accepted'; END IF;
END $$;

-- ── 4. tournament_save_match_result persists starting scores + handicap provenance atomically ─
DO $$
DECLARE
  v_res jsonb;
  v_sa integer; v_sb integer; v_mode text; v_ver integer; v_score_a integer;
BEGIN
  v_res := public.tournament_save_match_result(
    'e3333333-0000-0000-0000-000000000001'::uuid,
    'e0000000-0000-0000-0000-0000000000f2'::uuid,
    1,
    '[{"game_number":1,"score_a":21,"score_b":15,"starting_score_a":4,"starting_score_b":0,"handicap_mode":"female_count_difference","handicap_version":2}]'::jsonb,
    'e1111111-0000-0000-0000-000000000001'::uuid,
    'group_stage_completed'
  );
  IF (v_res->>'code') <> 'ok' THEN RAISE EXCEPTION 'FAIL 4a: save returned %', v_res; END IF;

  SELECT score_a, starting_score_a, starting_score_b, handicap_mode, handicap_version
    INTO v_score_a, v_sa, v_sb, v_mode, v_ver
    FROM public.tournament_match_games
    WHERE match_id = 'e3333333-0000-0000-0000-000000000001'::uuid AND game_number = 1;

  IF v_score_a <> 21 THEN RAISE EXCEPTION 'FAIL 4b: final score not stored (%).', v_score_a; END IF;
  IF v_sa <> 4 OR v_sb <> 0 THEN RAISE EXCEPTION 'FAIL 4c: starting score not stored (% / %).', v_sa, v_sb; END IF;
  IF v_mode <> 'female_count_difference' THEN RAISE EXCEPTION 'FAIL 4d: handicap_mode not stored (%).', v_mode; END IF;
  IF v_ver <> 2 THEN RAISE EXCEPTION 'FAIL 4e: handicap_version not stored (%).', v_ver; END IF;
END $$;

-- ── 5. FJP preset v2 is seeded CONFIGURED; v1 is deprecated ─────────────────────────────────
DO $$
DECLARE
  v2_req boolean; v2_status text; v2_mode text; v2_ppd integer; v1_status text;
BEGIN
  SELECT requires_configuration, status,
         payload->0->'rules'->'handicap'->>'mode',
         (payload->0->'rules'->'handicap'->>'points_per_difference')::integer
    INTO v2_req, v2_status, v2_mode, v2_ppd
    FROM public.tournament_rule_presets
    WHERE preset_key = 'fjp_olympiad_2026' AND version = 2;

  IF v2_req IS DISTINCT FROM false THEN RAISE EXCEPTION 'FAIL 5a: v2 requires_configuration is not false'; END IF;
  IF v2_status <> 'active' THEN RAISE EXCEPTION 'FAIL 5b: v2 is not active (%).', v2_status; END IF;
  IF v2_mode <> 'female_count_difference' THEN RAISE EXCEPTION 'FAIL 5c: v2 handicap mode is % ', v2_mode; END IF;
  IF v2_ppd <> 2 THEN RAISE EXCEPTION 'FAIL 5d: v2 points_per_difference is % ', v2_ppd; END IF;

  SELECT status INTO v1_status FROM public.tournament_rule_presets
    WHERE preset_key = 'fjp_olympiad_2026' AND version = 1;
  IF v1_status <> 'deprecated' THEN RAISE EXCEPTION 'FAIL 5e: v1 is not deprecated (%).', v1_status; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL FJP HANDICAP TESTS PASSED'; END $$;

ROLLBACK;
