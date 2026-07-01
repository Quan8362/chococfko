-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — FULL-HAND MULTI-PLAYER · FULL-SESSION COIN-CONSERVATION HARNESS
-- ════════════════════════════════════════════════════════════════════════════════════
-- Authored 2026-07-01 for the Poker QA validation. Drives a COMPLETE hand through the SAME
-- authoritative RPCs the server actions call — poker_sit_down (player) → poker_start_hand →
-- poker_commit_action ×N → poker_settle_hand → poker_stand_up (player) — and asserts the
-- TOTAL-COIN invariant after every step:
--
--     Σ game_wallets.balance + Σ poker_seats.stack + Σ poker_seats.committed_total
--         + Σ poker_seats.pending_topup  ==  INITIAL_TOTAL   (never mints / never loses a coin)
--
-- Run AFTER: poker_core → poker_private → poker_economy → poker_lifecycle → poker_engine.
-- Venue: an ISOLATED database (Supabase preview branch / local stack). ONE transaction, ROLLs
-- BACK — persists nothing. Player RPCs run as role `authenticated` with a JWT `sub` claim;
-- engine/settlement RPCs run as the setup superuser (the service-role path).
--
-- 3 players, table SB50/BB100, buy-in 10_000 each. Preflop everyone calls to 100 (pot 300),
-- seat0 wins. Net deltas: seat0 +200, seat1 −100, seat2 −100 → Σ = 0 (conserved).
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('11111111-1111-1111-1111-111111111111','authenticated','authenticated','a@t.local', now(), now()),
  ('22222222-2222-2222-2222-222222222222','authenticated','authenticated','b@t.local', now(), now()),
  ('33333333-3333-3333-3333-333333333333','authenticated','authenticated','c@t.local', now(), now());
INSERT INTO public.game_wallets (user_id, balance) VALUES
  ('11111111-1111-1111-1111-111111111111', 1000000),
  ('22222222-2222-2222-2222-222222222222', 1000000),
  ('33333333-3333-3333-3333-333333333333', 1000000);

INSERT INTO public.poker_tables (id, name, created_by, small_blind, big_blind, min_buy_in_bb, max_buy_in_bb, capacity)
VALUES ('aaaaaaaa-0000-0000-0000-0000000000f1','Conserve', '11111111-1111-1111-1111-111111111111', 50, 100, 40, 100, 3);
INSERT INTO public.poker_seats (table_id, seat_index)
SELECT 'aaaaaaaa-0000-0000-0000-0000000000f1', g FROM generate_series(0,2) g;

-- ── Invariant helper: total coins across wallets + escrow must never change. ──────────────
CREATE OR REPLACE FUNCTION pg_temp.assert_total(p_label text, p_expected bigint) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_total bigint;
BEGIN
  SELECT
    (SELECT COALESCE(SUM(balance),0) FROM public.game_wallets)
    + (SELECT COALESCE(SUM(stack + committed_total + pending_topup),0) FROM public.poker_seats)
  INTO v_total;
  IF v_total <> p_expected THEN
    RAISE EXCEPTION 'CONSERVATION FAIL @ %: total=% expected=%', p_label, v_total, p_expected;
  END IF;
  RAISE NOTICE 'OK @ %: total coins = %', p_label, v_total;
END;
$$;

DO $$ BEGIN PERFORM pg_temp.assert_total('start (3×1,000,000)', 3000000); END $$;

-- ── 1. Three players buy in 10_000 each (player RPC → role authenticated). ─────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$ BEGIN PERFORM public.poker_sit_down('aaaaaaaa-0000-0000-0000-0000000000f1', 0, 10000); END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
DO $$ BEGIN PERFORM public.poker_sit_down('aaaaaaaa-0000-0000-0000-0000000000f1', 1, 10000); END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
DO $$ BEGIN PERFORM public.poker_sit_down('aaaaaaaa-0000-0000-0000-0000000000f1', 2, 10000); END $$;
RESET ROLE;
DO $$ BEGIN PERFORM pg_temp.assert_total('after 3 buy-ins', 3000000); END $$;

-- ── 2. Start the hand (service role): button=0, SB=1(50), BB=2(100). Post-blind seats. ────
DO $$
DECLARE r jsonb;
BEGIN
  r := public.poker_start_hand(
    'aaaaaaaa-0000-0000-0000-0000000000f1', 1, 0, 0,
    now() + interval '20 seconds', 100, 100, 100,
    '{"main":{"amount":150,"eligibleSeatIndexes":[0,1,2]},"sides":[]}'::jsonb,
    '{"v":1,"handNo":1,"street":"PREFLOP","actionSeq":0}'::jsonb,
    '[{"seat_index":0,"user_id":"11111111-1111-1111-1111-111111111111","stack":10000,"committed_this_street":0,"committed_total":0,"all_in":false},
      {"seat_index":1,"user_id":"22222222-2222-2222-2222-222222222222","stack":9950,"committed_this_street":50,"committed_total":50,"all_in":false},
      {"seat_index":2,"user_id":"33333333-3333-3333-3333-333333333333","stack":9900,"committed_this_street":100,"committed_total":100,"all_in":false}]'::jsonb,
    '[{"seat_index":0,"user_id":"11111111-1111-1111-1111-111111111111","cards":["As","Kd"]},
      {"seat_index":1,"user_id":"22222222-2222-2222-2222-222222222222","cards":["7c","2d"]},
      {"seat_index":2,"user_id":"33333333-3333-3333-3333-333333333333","cards":["Th","Tc"]}]'::jsonb,
    '{"stub":["9h","9s","9d","9c","8h"],"seed":42,"deal_index":11,"burns":[]}'::jsonb,
    '[{"seat_index":1,"user_id":"22222222-2222-2222-2222-222222222222","type":"post_sb","amount":50},
      {"seat_index":2,"user_id":"33333333-3333-3333-3333-333333333333","type":"post_bb","amount":100}]'::jsonb
  );
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'start failed: %', r; END IF;
  PERFORM pg_temp.assert_total('after start_hand (blinds posted)', 3000000);
END $$;

-- ── 3. Preflop action: seat0 calls 100, seat1 completes to 100, seat2 checks. ─────────────
DO $$
DECLARE v_hand uuid; r jsonb;
BEGIN
  SELECT current_hand_id INTO v_hand FROM public.poker_tables WHERE id='aaaaaaaa-0000-0000-0000-0000000000f1';
  -- seat0 calls 100 (0 → 100 committed; stack 10000 → 9900)
  r := public.poker_commit_action(v_hand, 0, 'c-0',
    '{"action_seq":1,"current_bet":100,"engine_state":{"actionSeq":1}}'::jsonb,
    '[{"seat_index":0,"stack":9900,"committed_this_street":100,"committed_total":100,"all_in":false,"last_action":"call"}]'::jsonb,
    '{"seat_index":0,"user_id":"11111111-1111-1111-1111-111111111111","type":"call","amount":100}'::jsonb);
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'seat0 call failed: %', r; END IF;
  PERFORM pg_temp.assert_total('after seat0 call', 3000000);
  -- seat1 completes SB→100 (50 → 100 committed; stack 9950 → 9900)
  r := public.poker_commit_action(v_hand, 1, 'c-1',
    '{"action_seq":2,"current_bet":100,"engine_state":{"actionSeq":2}}'::jsonb,
    '[{"seat_index":1,"stack":9900,"committed_this_street":100,"committed_total":100,"all_in":false,"last_action":"call"}]'::jsonb,
    '{"seat_index":1,"user_id":"22222222-2222-2222-2222-222222222222","type":"call","amount":50}'::jsonb);
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'seat1 call failed: %', r; END IF;
  PERFORM pg_temp.assert_total('after seat1 call', 3000000);
  -- seat2 checks (BB option; no chip movement)
  r := public.poker_commit_action(v_hand, 2, 'c-2',
    '{"action_seq":3,"current_bet":100,"engine_state":{"actionSeq":3}}'::jsonb,
    '[{"seat_index":2,"stack":9900,"committed_this_street":100,"committed_total":100,"all_in":false,"last_action":"check"}]'::jsonb,
    '{"seat_index":2,"user_id":"33333333-3333-3333-3333-333333333333","type":"check","amount":null}'::jsonb);
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'seat2 check failed: %', r; END IF;
  PERFORM pg_temp.assert_total('after seat2 check (pot=300)', 3000000);
END $$;

-- ── 4. Settle the 300 pot to seat0 (service role). Conservation guard enforces 300==300. ──
DO $$
DECLARE v_hand uuid; r jsonb; s0 bigint; s1 bigint; s2 bigint;
BEGIN
  SELECT current_hand_id INTO v_hand FROM public.poker_tables WHERE id='aaaaaaaa-0000-0000-0000-0000000000f1';
  r := public.poker_settle_hand(v_hand, '[{"seatIndex":0,"amount":300}]'::jsonb, '[]'::jsonb, 300);
  IF (r->>'settled')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'settle failed: %', r; END IF;
  SELECT stack INTO s0 FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-0000000000f1' AND seat_index=0;
  SELECT stack INTO s1 FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-0000000000f1' AND seat_index=1;
  SELECT stack INTO s2 FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-0000000000f1' AND seat_index=2;
  -- winner: 9900 + 300 = 10200 ; losers: 9900 each ; committed reset by finalize.
  IF s0 <> 10200 OR s1 <> 9900 OR s2 <> 9900 THEN RAISE EXCEPTION 'wrong stacks s0=% s1=% s2=%', s0, s1, s2; END IF;
  PERFORM pg_temp.assert_total('after settlement (winner +300 in stack)', 3000000);
END $$;

-- ── 5. All three cash out (player RPC). Session end. ──────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$ BEGIN PERFORM public.poker_stand_up('aaaaaaaa-0000-0000-0000-0000000000f1', 0); END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
DO $$ BEGIN PERFORM public.poker_stand_up('aaaaaaaa-0000-0000-0000-0000000000f1', 1); END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
DO $$ BEGIN PERFORM public.poker_stand_up('aaaaaaaa-0000-0000-0000-0000000000f1', 2); END $$;
RESET ROLE;

-- ── 6. Final: total conserved AND per-player deltas sum to zero. ───────────────────────────
DO $$
DECLARE w0 bigint; w1 bigint; w2 bigint;
BEGIN
  PERFORM pg_temp.assert_total('after all cash-outs (session end)', 3000000);
  SELECT balance INTO w0 FROM public.game_wallets WHERE user_id='11111111-1111-1111-1111-111111111111';
  SELECT balance INTO w1 FROM public.game_wallets WHERE user_id='22222222-2222-2222-2222-222222222222';
  SELECT balance INTO w2 FROM public.game_wallets WHERE user_id='33333333-3333-3333-3333-333333333333';
  IF w0 <> 1000200 OR w1 <> 999900 OR w2 <> 999900 THEN
    RAISE EXCEPTION 'wrong final wallets w0=% w1=% w2=%', w0, w1, w2;
  END IF;
  IF (w0-1000000) + (w1-1000000) + (w2-1000000) <> 0 THEN
    RAISE EXCEPTION 'net deltas do not sum to zero';
  END IF;
  RAISE NOTICE 'SESSION CONSERVED: winner +200, losers -100/-100, Σdelta=0, total=3,000,000';
END $$;

SELECT 'FULL-HAND MULTI-PLAYER SESSION CONSERVATION PASSED' AS result;
ROLLBACK;
