-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — ACHIEVEMENTS & MISSIONS DATABASE TEST HARNESS
-- ════════════════════════════════════════════════════════════════════════════════════
-- Run AFTER applying: poker_core → poker_private → poker_economy → poker_lifecycle →
-- poker_engine → poker_achievements.
--
-- Venue: an ISOLATED database (Supabase preview branch / local stack / SQL editor). The whole
-- script runs in ONE transaction and ROLLs BACK at the end — it persists NOTHING. Every failed
-- assertion RAISEs and aborts. Asserts:
--   AC1  first recording unlocks the passed achievements + first_hand
--   AC2  recording is IDEMPOTENT at hand granularity (a re-run changes nothing)
--   AC3  hands_played counter increments once per distinct hand; milestones unlock at threshold
--   AC4  mission progress clamps at target and completed_at latches
--   AC5  poker_bump_mission is idempotent past target (no overshoot, no un-complete)
--   AC6  NO coin movement — game_wallets / coin_ledger untouched by any recorder call
--   AC7  player tables are read-own / opaque to the authenticated role (RLS)
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Fixtures ────────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('11111111-1111-1111-1111-111111111111','authenticated','authenticated','a@test.local', now(), now()),
  ('22222222-2222-2222-2222-222222222222','authenticated','authenticated','b@test.local', now(), now());

INSERT INTO public.game_wallets (user_id, balance) VALUES
  ('11111111-1111-1111-1111-111111111111', 1000000),
  ('22222222-2222-2222-2222-222222222222', 1000000);

INSERT INTO public.poker_tables (id, name, created_by, small_blind, big_blind, capacity)
VALUES ('aaaaaaaa-0000-0000-0000-0000000000a1','Ach Test', '11111111-1111-1111-1111-111111111111', 50, 100, 6);

-- 12 completed hands so the hands_10 milestone can be exercised.
INSERT INTO public.poker_hands (id, table_id, hand_no, phase, street)
SELECT ('cccccccc-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       'aaaaaaaa-0000-0000-0000-0000000000a1', g, 'COMPLETED', 'SHOWDOWN'
FROM generate_series(1, 12) g;

DO $$
DECLARE
  UA   uuid := '11111111-1111-1111-1111-111111111111';
  UB   uuid := '22222222-2222-2222-2222-222222222222';
  H1   uuid := 'cccccccc-0000-0000-0000-000000000001';
  v_res jsonb;
  v_cnt int;
  v_hands bigint;
  v_prog int;
  v_done timestamptz;
  v_wallet_before bigint;
  v_wallet_after  bigint;
  v_ledger_before bigint;
  v_ledger_after  bigint;
  g int;
  hid uuid;
BEGIN
  SELECT balance INTO v_wallet_before FROM public.game_wallets WHERE user_id = UA;
  SELECT count(*) INTO v_ledger_before FROM public.coin_ledger WHERE user_id = UA;

  -- ── AC1: first recording unlocks the passed achievements + first_hand ─────────────────
  v_res := public.poker_record_hand_progress(H1, jsonb_build_array(
    jsonb_build_object(
      'user_id', UA,
      'achievements', jsonb_build_array('first_hand','first_pot','first_showdown_win','win_flush'),
      'counts_hand', true,
      'reached_showdown', true,
      'milestones', jsonb_build_array(jsonb_build_object('key','hands_10','at',10),
                                      jsonb_build_object('key','hands_100','at',100)),
      'missions', jsonb_build_array(jsonb_build_object('key','complete_3_hands','inc',1,'target',3),
                                    jsonb_build_object('key','reach_showdown','inc',1,'target',1))
    ),
    jsonb_build_object('user_id', UB, 'achievements', jsonb_build_array('first_hand'),
                       'counts_hand', true, 'milestones', '[]'::jsonb, 'missions', '[]'::jsonb)
  ));
  IF (v_res->>'recorded') <> 'true' THEN RAISE EXCEPTION 'AC1 first record should return recorded=true'; END IF;
  SELECT count(*) INTO v_cnt FROM public.poker_achievements WHERE user_id = UA;
  IF v_cnt <> 4 THEN RAISE EXCEPTION 'AC1 expected 4 achievements for UA, got %', v_cnt; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.poker_achievements WHERE user_id=UA AND achievement_key='win_flush') THEN
    RAISE EXCEPTION 'AC1 win_flush not unlocked'; END IF;

  -- ── AC2: idempotent at hand granularity — the SAME hand re-run does nothing ────────────
  v_res := public.poker_record_hand_progress(H1, jsonb_build_array(
    jsonb_build_object('user_id', UA, 'achievements', jsonb_build_array('win_straight_flush'),
                       'counts_hand', true, 'milestones', '[]'::jsonb, 'missions', '[]'::jsonb)
  ));
  IF (v_res->>'recorded') <> 'false' THEN RAISE EXCEPTION 'AC2 re-record should return recorded=false'; END IF;
  IF EXISTS (SELECT 1 FROM public.poker_achievements WHERE user_id=UA AND achievement_key='win_straight_flush') THEN
    RAISE EXCEPTION 'AC2 re-run must NOT unlock a new achievement'; END IF;
  SELECT hands_played INTO v_hands FROM public.poker_player_progress WHERE user_id = UA;
  IF v_hands <> 1 THEN RAISE EXCEPTION 'AC2 counter must stay 1 after re-run, got %', v_hands; END IF;

  -- ── AC3: counter increments once per distinct hand; milestone unlocks at threshold ─────
  FOR g IN 2..10 LOOP
    hid := ('cccccccc-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    PERFORM public.poker_record_hand_progress(hid, jsonb_build_array(
      jsonb_build_object('user_id', UA, 'achievements', '[]'::jsonb, 'counts_hand', true,
        'milestones', jsonb_build_array(jsonb_build_object('key','hands_10','at',10)), 'missions', '[]'::jsonb)
    ));
  END LOOP;
  SELECT hands_played INTO v_hands FROM public.poker_player_progress WHERE user_id = UA;
  IF v_hands <> 10 THEN RAISE EXCEPTION 'AC3 expected 10 hands, got %', v_hands; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.poker_achievements WHERE user_id=UA AND achievement_key='hands_10') THEN
    RAISE EXCEPTION 'AC3 hands_10 milestone should unlock at 10'; END IF;
  IF EXISTS (SELECT 1 FROM public.poker_achievements WHERE user_id=UA AND achievement_key='hands_100') THEN
    RAISE EXCEPTION 'AC3 hands_100 must NOT unlock at 10'; END IF;

  -- ── AC4: mission progress clamps + latches ────────────────────────────────────────────
  -- complete_3_hands got +1 from H1. Push it well past target and confirm clamp + completion.
  hid := 'cccccccc-0000-0000-0000-000000000011';
  PERFORM public.poker_record_hand_progress(hid, jsonb_build_array(
    jsonb_build_object('user_id', UA, 'achievements','[]'::jsonb, 'counts_hand', false, 'milestones','[]'::jsonb,
      'missions', jsonb_build_array(jsonb_build_object('key','complete_3_hands','inc',9,'target',3)))
  ));
  SELECT progress, completed_at INTO v_prog, v_done FROM public.poker_missions
    WHERE user_id=UA AND mission_key='complete_3_hands';
  IF v_prog <> 3 THEN RAISE EXCEPTION 'AC4 progress must clamp to 3, got %', v_prog; END IF;
  IF v_done IS NULL THEN RAISE EXCEPTION 'AC4 completed_at must latch when target reached'; END IF;

  -- reach_showdown was target 1, inc 1 → already complete.
  SELECT completed_at INTO v_done FROM public.poker_missions WHERE user_id=UA AND mission_key='reach_showdown';
  IF v_done IS NULL THEN RAISE EXCEPTION 'AC4 reach_showdown should be complete'; END IF;

  -- ── AC5: poker_bump_mission idempotent past target ────────────────────────────────────
  PERFORM public.poker_bump_mission(UA, 'review_rules', 1, 1);
  SELECT completed_at INTO v_done FROM public.poker_missions WHERE user_id=UA AND mission_key='review_rules';
  IF v_done IS NULL THEN RAISE EXCEPTION 'AC5 review_rules should complete on first bump'; END IF;
  PERFORM public.poker_bump_mission(UA, 'review_rules', 5, 1); -- overshoot
  SELECT progress INTO v_prog FROM public.poker_missions WHERE user_id=UA AND mission_key='review_rules';
  IF v_prog <> 1 THEN RAISE EXCEPTION 'AC5 review_rules must stay clamped at 1, got %', v_prog; END IF;
  -- a zero/negative bump on a brand-new mission creates NO row
  PERFORM public.poker_bump_mission(UA, 'complete_training', 0, 1);
  IF EXISTS (SELECT 1 FROM public.poker_missions WHERE user_id=UA AND mission_key='complete_training') THEN
    RAISE EXCEPTION 'AC5 a zero increment must not create a mission row'; END IF;

  -- ── AC6: NO coin movement ─────────────────────────────────────────────────────────────
  SELECT balance INTO v_wallet_after FROM public.game_wallets WHERE user_id = UA;
  SELECT count(*) INTO v_ledger_after FROM public.coin_ledger WHERE user_id = UA;
  IF v_wallet_after <> v_wallet_before THEN
    RAISE EXCEPTION 'AC6 wallet balance changed (% -> %) — the social layer must move NO coins', v_wallet_before, v_wallet_after; END IF;
  IF v_ledger_after <> v_ledger_before THEN
    RAISE EXCEPTION 'AC6 coin_ledger rows changed (% -> %) — the social layer must write NO ledger rows', v_ledger_before, v_ledger_after; END IF;

  RAISE NOTICE 'poker_achievements: AC1..AC6 PASSED (UA hands=%, achievements ok, wallet untouched)', v_hands;
END $$;

-- ── AC7: player tables are read-own / opaque to the authenticated role (RLS) ─────────────
DO $$
DECLARE v_cnt int;
BEGIN
  SET LOCAL ROLE authenticated;
  -- No auth.uid() set → read-own policies match nothing.
  SELECT count(*) INTO v_cnt FROM public.poker_achievements;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'AC7 authenticated must not read others'' achievements (got %)', v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM public.poker_missions;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'AC7 authenticated must not read others'' missions (got %)', v_cnt; END IF;
  -- The lock table is fully opaque (RLS on, no policy).
  BEGIN
    SELECT count(*) INTO v_cnt FROM public.poker_hand_progress_records;
    IF v_cnt <> 0 THEN RAISE EXCEPTION 'AC7 lock table must be opaque (got %)', v_cnt; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; -- also acceptable
  END;
  RESET ROLE;
  RAISE NOTICE 'poker_achievements: AC7 RLS PASSED';
END $$;

ROLLBACK;
