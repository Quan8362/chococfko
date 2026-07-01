-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — ENGINE RPC TEST HARNESS (start_hand / commit_action / pause — atomicity + CAS)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Run AFTER poker_core → poker_private → poker_economy → poker_lifecycle → poker_engine.
--
-- Venue: an ISOLATED database (Supabase preview branch / local stack / SQL editor). The whole
-- script runs in ONE transaction and ROLLs BACK — it persists NOTHING. These RPCs are service-
-- role (SECURITY DEFINER); the harness runs as superuser/owner, which is the service-role path.
--
-- The TypeScript server (the pure engine) computes every state PATCH; these RPCs only guarantee
-- the transition is applied exactly once. So the harness feeds hand-shaped patches and asserts
-- the persistence INVARIANTS: idempotent start, compare-and-swap on action_seq, idempotency-key
-- dedupe, the per-seat coin-conservation guard, and settlement-retry safety. Any failed
-- assertion RAISEs and aborts (→ rollback).
--
-- Fixed synthetic IDs:  uA=111…  uB=222…  uC=333…   tbl=aaa…001   hnd=bbb…001  hnd2=bbb…002
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Setup ───────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('11111111-1111-1111-1111-111111111111','authenticated','authenticated','a@test.local', now(), now()),
  ('22222222-2222-2222-2222-222222222222','authenticated','authenticated','b@test.local', now(), now()),
  ('33333333-3333-3333-3333-333333333333','authenticated','authenticated','c@test.local', now(), now());
INSERT INTO public.game_wallets (user_id, balance) VALUES
  ('11111111-1111-1111-1111-111111111111', 1000000),
  ('22222222-2222-2222-2222-222222222222', 1000000),
  ('33333333-3333-3333-3333-333333333333', 1000000);

-- Table SB50/BB100, 6 seats; three players sitting in with 1000-coin stacks (set directly).
INSERT INTO public.poker_tables (id, name, created_by, small_blind, big_blind, capacity)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001','Engine Test','11111111-1111-1111-1111-111111111111',50,100,6);
INSERT INTO public.poker_seats (table_id, seat_index)
SELECT 'aaaaaaaa-0000-0000-0000-000000000001', g FROM generate_series(0,5) g;
UPDATE public.poker_seats SET user_id='11111111-1111-1111-1111-111111111111', status='sitting_in', stack=1000
  WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=0;
UPDATE public.poker_seats SET user_id='22222222-2222-2222-2222-222222222222', status='sitting_in', stack=1000
  WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=1;
UPDATE public.poker_seats SET user_id='33333333-3333-3333-3333-333333333333', status='sitting_in', stack=1000, pending_topup=200
  WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=2;

-- ════════════════════════════════════════════════════════════════════════════════════
-- E1. poker_start_hand persists the hand atomically + activates pending top-up + conserves
-- Button=0, SB=seat1(50), BB=seat2(100). Seat2 had a 200 pending top-up → effective stack 1200,
-- post-BB stack 1100. Post-blind: seat0 1000/0, seat1 950/50, seat2 1100/100.
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r jsonb; v_hand uuid; v_seat0 bigint; v_seat2 bigint; v_ct2 bigint; v_cur uuid; v_eng int;
BEGIN
  r := public.poker_start_hand(
    'aaaaaaaa-0000-0000-0000-000000000001', 1, 0, 0,
    now() + interval '20 seconds', 100, 200, 100,
    '{"main":{"amount":150,"eligibleSeatIndexes":[0,1,2]},"sides":[]}'::jsonb,
    '{"v":1,"handNo":1,"street":"PREFLOP","turnSeat":0,"actionSeq":0,"complete":false}'::jsonb,
    '[{"seat_index":0,"user_id":"11111111-1111-1111-1111-111111111111","stack":1000,"committed_this_street":0,"committed_total":0,"all_in":false},
      {"seat_index":1,"user_id":"22222222-2222-2222-2222-222222222222","stack":950,"committed_this_street":50,"committed_total":50,"all_in":false},
      {"seat_index":2,"user_id":"33333333-3333-3333-3333-333333333333","stack":1100,"committed_this_street":100,"committed_total":100,"all_in":false}]'::jsonb,
    '[{"seat_index":0,"user_id":"11111111-1111-1111-1111-111111111111","cards":["As","Kd"]},
      {"seat_index":1,"user_id":"22222222-2222-2222-2222-222222222222","cards":["7c","2d"]},
      {"seat_index":2,"user_id":"33333333-3333-3333-3333-333333333333","cards":["Th","Tc"]}]'::jsonb,
    '{"stub":["As","Kd","7c","2d","Th","Tc","9h","9s","9d","9c","8h","8s"],"seed":123,"deal_index":14,"burns":[]}'::jsonb,
    '[{"seat_index":1,"user_id":"22222222-2222-2222-2222-222222222222","type":"post_sb","amount":50},
      {"seat_index":2,"user_id":"33333333-3333-3333-3333-333333333333","type":"post_bb","amount":100}]'::jsonb
  );
  IF (r->>'ok')::boolean IS NOT TRUE OR (r->>'idempotent')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'E1 FAIL: start did not create a hand: %', r;
  END IF;
  v_hand := (r->>'hand_id')::uuid;

  SELECT current_hand_id INTO v_cur FROM public.poker_tables WHERE id='aaaaaaaa-0000-0000-0000-000000000001';
  IF v_cur IS DISTINCT FROM v_hand THEN RAISE EXCEPTION 'E1 FAIL: current_hand_id not wired'; END IF;

  -- Conservation: each seat's stack+committed_total equals its pre-hand stack(+pending top-up).
  SELECT stack INTO v_seat0 FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=0;
  SELECT stack, committed_total INTO v_seat2, v_ct2 FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=2;
  IF v_seat0 <> 1000 THEN RAISE EXCEPTION 'E1 FAIL: seat0 stack %', v_seat0; END IF;
  IF v_seat2 + v_ct2 <> 1200 THEN RAISE EXCEPTION 'E1 FAIL: seat2 top-up not conserved (% + %)', v_seat2, v_ct2; END IF;
  IF (SELECT pending_topup FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=2) <> 0 THEN
    RAISE EXCEPTION 'E1 FAIL: pending top-up not activated';
  END IF;

  IF (SELECT count(*) FROM public.poker_hole_cards WHERE hand_id=v_hand) <> 3 THEN RAISE EXCEPTION 'E1 FAIL: hole cards'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.poker_deck WHERE hand_id=v_hand) THEN RAISE EXCEPTION 'E1 FAIL: deck row'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.poker_hand_state WHERE hand_id=v_hand) THEN RAISE EXCEPTION 'E1 FAIL: engine_state snapshot'; END IF;
  IF (SELECT count(*) FROM public.poker_actions WHERE hand_id=v_hand AND type IN ('post_sb','post_bb')) <> 2 THEN RAISE EXCEPTION 'E1 FAIL: blind audit'; END IF;
  RAISE NOTICE 'E1 PASS — start_hand atomic + conserved + top-up activated';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- E2. start_hand is IDEMPOTENT (a hand is live → returns it, no second hand)
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r jsonb; v_n int;
BEGIN
  r := public.poker_start_hand(
    'aaaaaaaa-0000-0000-0000-000000000001', 2, 1, 1, now() + interval '20 seconds', 100, 200, 100,
    '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{"stub":[],"seed":0}'::jsonb, '[]'::jsonb);
  IF (r->>'idempotent')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'E2 FAIL: second start not idempotent: %', r; END IF;
  SELECT count(*) INTO v_n FROM public.poker_hands WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001';
  IF v_n <> 1 THEN RAISE EXCEPTION 'E2 FAIL: a second hand was created (count=%)', v_n; END IF;
  RAISE NOTICE 'E2 PASS — start_hand idempotent';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- E3. commit_action happy path — CAS matches, action_seq advances, audit logged
-- (seat0 acts with no chip movement; conservation holds: stack+ct unchanged.)
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r jsonb; v_hand uuid;
BEGIN
  SELECT current_hand_id INTO v_hand FROM public.poker_tables WHERE id='aaaaaaaa-0000-0000-0000-000000000001';
  r := public.poker_commit_action(
    v_hand, 0, 'cmd-1',
    '{"phase":"BETTING","street":"PREFLOP","action_seq":1,"current_bet":100,"engine_state":{"v":1,"actionSeq":1}}'::jsonb,
    '[{"seat_index":0,"stack":1000,"committed_this_street":0,"committed_total":0,"all_in":false,"last_action":"call"}]'::jsonb,
    '{"seat_index":0,"user_id":"11111111-1111-1111-1111-111111111111","street":"PREFLOP","type":"call","amount":null}'::jsonb
  );
  IF (r->>'ok')::boolean IS NOT TRUE OR (r->>'action_seq')::int <> 1 THEN RAISE EXCEPTION 'E3 FAIL: %', r; END IF;
  IF (SELECT action_seq FROM public.poker_hands WHERE id=v_hand) <> 1 THEN RAISE EXCEPTION 'E3 FAIL: hand seq not 1'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.poker_actions WHERE hand_id=v_hand AND type='call' AND idempotency_key='cmd-1') THEN
    RAISE EXCEPTION 'E3 FAIL: action not logged';
  END IF;
  RAISE NOTICE 'E3 PASS — commit_action applied + audited';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- E4. commit_action CAS rejects a STALE command (expected_seq no longer current)
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r jsonb; v_hand uuid; v_seq_before int;
BEGIN
  SELECT current_hand_id INTO v_hand FROM public.poker_tables WHERE id='aaaaaaaa-0000-0000-0000-000000000001';
  SELECT action_seq INTO v_seq_before FROM public.poker_hands WHERE id=v_hand;
  r := public.poker_commit_action(
    v_hand, 0, 'cmd-stale',
    '{"action_seq":2,"engine_state":{"v":1}}'::jsonb,
    '[{"seat_index":1,"stack":950,"committed_this_street":50,"committed_total":50}]'::jsonb,
    '{"seat_index":1,"user_id":"22222222-2222-2222-2222-222222222222","type":"call"}'::jsonb
  );
  IF (r->>'ok')::boolean IS NOT FALSE OR (r->>'code') <> 'stale' THEN RAISE EXCEPTION 'E4 FAIL: stale not rejected: %', r; END IF;
  IF (SELECT action_seq FROM public.poker_hands WHERE id=v_hand) <> v_seq_before THEN RAISE EXCEPTION 'E4 FAIL: stale mutated state'; END IF;
  RAISE NOTICE 'E4 PASS — CAS rejects stale command';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- E5. commit_action IDEMPOTENCY key — a duplicate of the same command is a no-op
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r1 jsonb; r2 jsonb; v_hand uuid; v_rows int;
BEGIN
  SELECT current_hand_id INTO v_hand FROM public.poker_tables WHERE id='aaaaaaaa-0000-0000-0000-000000000001';
  r1 := public.poker_commit_action(
    v_hand, 1, 'cmd-2',
    '{"action_seq":2,"engine_state":{"v":1}}'::jsonb,
    '[{"seat_index":0,"stack":1000,"committed_this_street":0,"committed_total":0,"last_action":"check"}]'::jsonb,
    '{"seat_index":0,"user_id":"11111111-1111-1111-1111-111111111111","type":"check"}'::jsonb
  );
  -- Replay the SAME command (same key). expected_seq is now stale, but the idem check wins first.
  r2 := public.poker_commit_action(
    v_hand, 1, 'cmd-2',
    '{"action_seq":2,"engine_state":{"v":1}}'::jsonb,
    '[{"seat_index":0,"stack":1000,"committed_this_street":0,"committed_total":0,"last_action":"check"}]'::jsonb,
    '{"seat_index":0,"user_id":"11111111-1111-1111-1111-111111111111","type":"check"}'::jsonb
  );
  IF (r1->>'ok')::boolean IS NOT TRUE OR (r1->>'idempotent')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'E5 FAIL: first call: %', r1; END IF;
  IF (r2->>'idempotent')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'E5 FAIL: replay not idempotent: %', r2; END IF;
  SELECT count(*) INTO v_rows FROM public.poker_actions WHERE hand_id=v_hand AND idempotency_key='cmd-2';
  IF v_rows <> 1 THEN RAISE EXCEPTION 'E5 FAIL: duplicate logged % rows', v_rows; END IF;
  RAISE NOTICE 'E5 PASS — idempotency key dedupes a replayed command';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- E6. commit_action CONSERVATION guard rejects a patch that would mint coins
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_hand uuid; v_seq int; v_caught boolean := false;
BEGIN
  SELECT id, action_seq INTO v_hand, v_seq FROM public.poker_hands
    WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND hand_no=1;
  BEGIN
    PERFORM public.poker_commit_action(
      v_hand, v_seq, NULL,
      '{"action_seq":99,"engine_state":{"v":1}}'::jsonb,
      '[{"seat_index":0,"stack":999999,"committed_this_street":0,"committed_total":0}]'::jsonb,
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'commit_not_conserved%' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'E6 FAIL: conservation guard did not fire'; END IF;
  RAISE NOTICE 'E6 PASS — conservation guard blocks coin minting';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- E7. Settlement RETRY safety — settle a finished hand twice; coins move exactly once
-- A fresh hand (hnd2) with a 300 pot (seat0/1/2 each committed 100); seat0 wins it all.
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r1 jsonb; r2 jsonb; v_stack0 bigint;
BEGIN
  INSERT INTO public.poker_hands (id, table_id, hand_no, phase, street)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001', 2, 'SETTLEMENT','RIVER');
  UPDATE public.poker_tables SET current_hand_id='bbbbbbbb-0000-0000-0000-000000000002' WHERE id='aaaaaaaa-0000-0000-0000-000000000001';
  -- Put each seat at stack 900 / committed_total 100 (they paid 100 into the 300 pot).
  UPDATE public.poker_seats SET stack=900, committed_total=100, committed_this_street=0
    WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index IN (0,1,2);

  r1 := public.poker_settle_hand('bbbbbbbb-0000-0000-0000-000000000002',
        '[{"seatIndex":0,"amount":300}]'::jsonb, '[]'::jsonb, 300);
  r2 := public.poker_settle_hand('bbbbbbbb-0000-0000-0000-000000000002',
        '[{"seatIndex":0,"amount":300}]'::jsonb, '[]'::jsonb, 300);

  IF (r1->>'settled')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'E7 FAIL: first settle: %', r1; END IF;
  IF (r2->>'settled')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'E7 FAIL: retry paid twice: %', r2; END IF;
  SELECT stack INTO v_stack0 FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=0;
  -- 900 + 300 pot = 1200, committed reset by finalize.
  IF v_stack0 <> 1200 THEN RAISE EXCEPTION 'E7 FAIL: winner stack % (expected 1200)', v_stack0; END IF;
  IF (SELECT phase FROM public.poker_hands WHERE id='bbbbbbbb-0000-0000-0000-000000000002') <> 'COMPLETED' THEN
    RAISE EXCEPTION 'E7 FAIL: hand not COMPLETED';
  END IF;
  RAISE NOTICE 'E7 PASS — settlement retry pays exactly once';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- E8. poker_pause_hand freezes a hand for review + records an incident (never guesses)
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r jsonb;
BEGIN
  INSERT INTO public.poker_hands (id, table_id, hand_no, phase, street)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001', 3, 'BETTING','FLOP');
  r := public.poker_pause_hand('bbbbbbbb-0000-0000-0000-000000000003','showdown_inconsistent');
  IF (r->>'phase') <> 'PAUSED_FOR_REVIEW' THEN RAISE EXCEPTION 'E8 FAIL: %', r; END IF;
  IF (SELECT phase FROM public.poker_hands WHERE id='bbbbbbbb-0000-0000-0000-000000000003') <> 'PAUSED_FOR_REVIEW' THEN
    RAISE EXCEPTION 'E8 FAIL: phase not frozen';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.poker_incidents WHERE hand_id='bbbbbbbb-0000-0000-0000-000000000003' AND kind='pause_for_review') THEN
    RAISE EXCEPTION 'E8 FAIL: no incident recorded';
  END IF;
  RAISE NOTICE 'E8 PASS — pause_hand freezes + audits';
END $$;

DO $$ BEGIN RAISE NOTICE '✅ ALL ENGINE RPC ASSERTIONS PASSED (E1–E8)'; END $$;

ROLLBACK;
