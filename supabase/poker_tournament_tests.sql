-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — TOURNAMENT DATABASE TEST HARNESS
-- register · idempotency · key-reuse · champion settle · withdrawn-reject · partial-retry ·
-- guarantee overlay · conservation · negative-reject · double-settle · RLS
-- ════════════════════════════════════════════════════════════════════════════════════
-- Run AFTER applying the existing poker migrations + migration_poker_tournament.sql.
--
-- Venue: an ISOLATED database (Supabase preview branch / local stack / SQL editor). The whole
-- script runs in ONE transaction and ROLLs BACK at the end — it persists NOTHING. Player RPCs run
-- under role `authenticated` with a JWT `sub` claim auth.uid() reads; service RPCs (transition /
-- settle) and the simulated-play state UPDATEs run under the setup superuser (RESET ROLE). Any
-- failed assertion RAISEs → the whole run rolls back.
--
-- IMPORTANT (regression): the CHAMPION is left in state ACTIVE and is NEVER marked ELIMINATED. The
-- previous harness pre-eliminated every entry, which MASKED the settlement-state defect where a
-- champion who never entered ELIMINATED could be credited yet never reach PAID.
--
-- Tournaments:  T = happy-path/champion/idempotency   T2 = withdrawn-reject/partial-retry
--               G = guarantee overlay / conservation
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Ids ────────────────────────────────────────────────────────────────────────────────
--   T  = 11111111-… · T2 = 22222222-… · G = 33333333-…
--   uA..uH players.
-- ── Setup (superuser) ──────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('a0000000-0000-0000-0000-00000000000a','authenticated','authenticated','a@t.local', now(), now()),
  ('b0000000-0000-0000-0000-00000000000b','authenticated','authenticated','b@t.local', now(), now()),
  ('c0000000-0000-0000-0000-00000000000c','authenticated','authenticated','c@t.local', now(), now()),
  ('d0000000-0000-0000-0000-00000000000d','authenticated','authenticated','d@t.local', now(), now()),
  ('e0000000-0000-0000-0000-00000000000e','authenticated','authenticated','e@t.local', now(), now()),
  ('f0000000-0000-0000-0000-00000000000f','authenticated','authenticated','f@t.local', now(), now()),
  ('40000000-0000-0000-0000-000000000040','authenticated','authenticated','g@t.local', now(), now()),
  ('50000000-0000-0000-0000-000000000050','authenticated','authenticated','h@t.local', now(), now());

INSERT INTO public.game_wallets (user_id, balance) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 100000),
  ('b0000000-0000-0000-0000-00000000000b', 100000),
  ('c0000000-0000-0000-0000-00000000000c', 100000),
  ('d0000000-0000-0000-0000-00000000000d', 100000),
  ('e0000000-0000-0000-0000-00000000000e', 100000),
  ('f0000000-0000-0000-0000-00000000000f', 100000),
  ('40000000-0000-0000-0000-000000000040', 100000),
  ('50000000-0000-0000-0000-000000000050', 100000);

INSERT INTO public.poker_tournaments
  (id, title, state, entry_fee, starting_stack, min_entries, max_entries, config, guaranteed_prize_pool)
VALUES
  ('11111111-0000-0000-0000-000000000001','T', 'REGISTRATION_OPEN', 1000, 5000, 3, 6, '{}'::jsonb, 0),
  ('22222222-0000-0000-0000-000000000002','T2','REGISTRATION_OPEN', 1000, 5000, 2, 6, '{}'::jsonb, 0),
  ('33333333-0000-0000-0000-000000000003','G', 'REGISTRATION_OPEN', 1000, 5000, 2, 6, '{}'::jsonb, 5000);

-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT T — registration idempotency, dup reject, cross-tournament key reuse
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- TT-REG-IDEM: register uA once; a retried call with the SAME key charges nothing extra.
DO $$
DECLARE v_e1 uuid; v_e2 uuid; v_bal bigint; v_count int;
BEGIN
  v_e1 := public.poker_tournament_register('11111111-0000-0000-0000-000000000001', 'reg:T:uA');
  v_e2 := public.poker_tournament_register('11111111-0000-0000-0000-000000000001', 'reg:T:uA'); -- retry
  IF v_e1 <> v_e2 THEN RAISE EXCEPTION 'TT-REG-IDEM: retry returned a different entry'; END IF;
  SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = 'a0000000-0000-0000-0000-00000000000a';
  IF v_bal <> 99000 THEN RAISE EXCEPTION 'TT-REG-IDEM: charged twice (balance=%)', v_bal; END IF;
  SELECT COUNT(*) INTO v_count FROM public.poker_tournament_entries
    WHERE tournament_id = '11111111-0000-0000-0000-000000000001' AND user_id = 'a0000000-0000-0000-0000-00000000000a';
  IF v_count <> 1 THEN RAISE EXCEPTION 'TT-REG-IDEM: duplicate entry rows (%)', v_count; END IF;
END $$;

-- TT-REG-DUP: a SECOND registration with a different key is rejected (already registered).
DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.poker_tournament_register('11111111-0000-0000-0000-000000000001', 'reg:T:uA:2');
    RAISE EXCEPTION 'TT-REG-DUP: duplicate registration was allowed';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT LIKE '%already registered%' THEN RAISE EXCEPTION 'TT-REG-DUP: wrong error: %', v_err; END IF;
  END;
END $$;

-- TT-REG-KEYREUSE: reusing uA's T registration key on a DIFFERENT tournament (G) fails loud (the
-- DB reused-key guard), so a cross-tournament key collision can never silently return a wrong entry.
DO $$
DECLARE v_err text; v_bal bigint;
BEGIN
  BEGIN
    PERFORM public.poker_tournament_register('33333333-0000-0000-0000-000000000003', 'reg:T:uA');
    RAISE EXCEPTION 'TT-REG-KEYREUSE: cross-tournament key reuse was allowed';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT LIKE '%reused%' THEN RAISE EXCEPTION 'TT-REG-KEYREUSE: wrong error: %', v_err; END IF;
  END;
  -- Nothing was charged for the rejected reuse.
  SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = 'a0000000-0000-0000-0000-00000000000a';
  IF v_bal <> 99000 THEN RAISE EXCEPTION 'TT-REG-KEYREUSE: charged on rejected reuse (%)', v_bal; END IF;
END $$;

-- Register uB and uC so T's field meets the minimum (3).
SELECT set_config('request.jwt.claims','{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
SELECT public.poker_tournament_register('11111111-0000-0000-0000-000000000001', 'reg:T:uB');
SELECT set_config('request.jwt.claims','{"sub":"c0000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
SELECT public.poker_tournament_register('11111111-0000-0000-0000-000000000001', 'reg:T:uC');

-- ── Simulate a played-out tournament. CHAMPION uA stays ACTIVE and is NEVER eliminated. ──
RESET ROLE;
SELECT public.poker_tournament_admin_transition('11111111-0000-0000-0000-000000000001','STARTING', NULL);
SELECT public.poker_tournament_admin_transition('11111111-0000-0000-0000-000000000001','RUNNING', NULL);
SELECT public.poker_tournament_admin_transition('11111111-0000-0000-0000-000000000001','FINAL_TABLE', NULL);
UPDATE public.poker_tournament_entries SET state = 'ACTIVE'
  WHERE tournament_id = '11111111-0000-0000-0000-000000000001' AND user_id = 'a0000000-0000-0000-0000-00000000000a';
UPDATE public.poker_tournament_entries SET state = 'ELIMINATED', chips = 0
  WHERE tournament_id = '11111111-0000-0000-0000-000000000001'
    AND user_id IN ('b0000000-0000-0000-0000-00000000000b','c0000000-0000-0000-0000-00000000000c');

-- TT-PAY-CHAMPION + TT-PAY-CONSERVE + TT-PAY-IDEM + final-states.
-- Pool = 3 * 1000 = 3000. Pay champion uA 2000 (1st), uB 1000 (2nd), uC 0 (3rd). sum == pool.
DO $$
DECLARE
  eA uuid; eB uuid; eC uuid;
  v_payload jsonb; v_balA bigint; v_balB bigint; v_balC bigint; v_pool bigint;
  stA text; stB text; stC text; tstate text;
BEGIN
  SELECT id INTO eA FROM public.poker_tournament_entries
    WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND user_id='a0000000-0000-0000-0000-00000000000a';
  SELECT id INTO eB FROM public.poker_tournament_entries
    WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND user_id='b0000000-0000-0000-0000-00000000000b';
  SELECT id INTO eC FROM public.poker_tournament_entries
    WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND user_id='c0000000-0000-0000-0000-00000000000c';

  v_pool := public.poker_tournament_prize_pool('11111111-0000-0000-0000-000000000001');
  IF v_pool <> 3000 THEN RAISE EXCEPTION 'TT-PAY: pool wrong (%)', v_pool; END IF;

  v_payload := jsonb_build_array(
    jsonb_build_object('entry_id', eA, 'user_id', 'a0000000-0000-0000-0000-00000000000a', 'place', 1, 'amount', 2000, 'kind', 'prize'),
    jsonb_build_object('entry_id', eB, 'user_id', 'b0000000-0000-0000-0000-00000000000b', 'place', 2, 'amount', 1000, 'kind', 'prize'),
    jsonb_build_object('entry_id', eC, 'user_id', 'c0000000-0000-0000-0000-00000000000c', 'place', 3, 'amount', 0,    'kind', 'prize')
  );

  PERFORM public.poker_tournament_settle('11111111-0000-0000-0000-000000000001', v_payload, 'settle:T:1');
  PERFORM public.poker_tournament_settle('11111111-0000-0000-0000-000000000001', v_payload, 'settle:T:1'); -- retry

  SELECT balance INTO v_balA FROM public.game_wallets WHERE user_id = 'a0000000-0000-0000-0000-00000000000a';
  SELECT balance INTO v_balB FROM public.game_wallets WHERE user_id = 'b0000000-0000-0000-0000-00000000000b';
  SELECT balance INTO v_balC FROM public.game_wallets WHERE user_id = 'c0000000-0000-0000-0000-00000000000c';
  -- uA: 99000 entry + 2000 prize = 101000 ; uB 99000 + 1000 = 100000 ; uC 99000 + 0 = 99000.
  IF v_balA <> 101000 THEN RAISE EXCEPTION 'TT-PAY-CHAMPION: uA balance wrong (%)', v_balA; END IF;
  IF v_balB <> 100000 THEN RAISE EXCEPTION 'TT-PAY-IDEM: uB double-paid (%)', v_balB; END IF;
  IF v_balC <> 99000  THEN RAISE EXCEPTION 'TT-PAY: uC (0 prize) balance wrong (%)', v_balC; END IF;

  -- THE regression: the champion never entered ELIMINATED yet MUST end PAID.
  SELECT state INTO stA FROM public.poker_tournament_entries WHERE id = eA;
  SELECT state INTO stB FROM public.poker_tournament_entries WHERE id = eB;
  SELECT state INTO stC FROM public.poker_tournament_entries WHERE id = eC;
  IF stA <> 'PAID' THEN RAISE EXCEPTION 'TT-PAY-CHAMPION: champion (never ELIMINATED) not PAID (state=%)', stA; END IF;
  IF stB <> 'PAID' THEN RAISE EXCEPTION 'TT-PAY: eliminated uB not PAID (state=%)', stB; END IF;
  IF stC <> 'PAID' THEN RAISE EXCEPTION 'TT-PAY: eliminated uC (0 prize) not PAID (state=%)', stC; END IF;

  SELECT state INTO tstate FROM public.poker_tournaments WHERE id='11111111-0000-0000-0000-000000000001';
  IF tstate <> 'COMPLETED' THEN RAISE EXCEPTION 'TT-PAY: settle did not complete the tournament (%)', tstate; END IF;
END $$;

-- TT-SETTLE-TWICE: a completed tournament rejects a FRESH settle request (different key).
DO $$
DECLARE v_err text; eA uuid;
BEGIN
  SELECT id INTO eA FROM public.poker_tournament_entries
    WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND user_id='a0000000-0000-0000-0000-00000000000a';
  BEGIN
    PERFORM public.poker_tournament_settle('11111111-0000-0000-0000-000000000001',
      jsonb_build_array(jsonb_build_object('entry_id', eA, 'user_id', 'a0000000-0000-0000-0000-00000000000a', 'place', 1, 'amount', 3000, 'kind', 'prize')),
      'settle:T:2');
    RAISE EXCEPTION 'TT-SETTLE-TWICE: a completed tournament settled again';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT LIKE '%already settled%' THEN RAISE EXCEPTION 'TT-SETTLE-TWICE: wrong error: %', v_err; END IF;
  END;
END $$;

-- TT-STATE: an illegal transition (from COMPLETED) is rejected by the DB FSM helper.
DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.poker_tournament_admin_transition('11111111-0000-0000-0000-000000000001','RUNNING', NULL);
    RAISE EXCEPTION 'TT-STATE: illegal transition from COMPLETED allowed';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT LIKE '%illegal transition%' THEN RAISE EXCEPTION 'TT-STATE: wrong error: %', v_err; END IF;
  END;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT T2 — withdrawn entry can never be paid + partial-retry idempotency
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
SELECT public.poker_tournament_register('22222222-0000-0000-0000-000000000002', 'reg:T2:uD');
SELECT set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-00000000000e","role":"authenticated"}', true);
SELECT public.poker_tournament_register('22222222-0000-0000-0000-000000000002', 'reg:T2:uE');
SELECT set_config('request.jwt.claims','{"sub":"f0000000-0000-0000-0000-00000000000f","role":"authenticated"}', true);
SELECT public.poker_tournament_register('22222222-0000-0000-0000-000000000002', 'reg:T2:uF');

-- TT-CANCEL-PRE: uF unregisters pre-start → full refund (WITHDRAWN); retry refunds nothing extra.
DO $$
DECLARE v_bal bigint; st text;
BEGIN
  PERFORM public.poker_tournament_unregister('22222222-0000-0000-0000-000000000002', 'unreg:T2:uF');
  PERFORM public.poker_tournament_unregister('22222222-0000-0000-0000-000000000002', 'unreg:T2:uF'); -- retry
  SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = 'f0000000-0000-0000-0000-00000000000f';
  IF v_bal <> 100000 THEN RAISE EXCEPTION 'TT-CANCEL-PRE: refund wrong (balance=%)', v_bal; END IF;
  SELECT state INTO st FROM public.poker_tournament_entries
    WHERE tournament_id='22222222-0000-0000-0000-000000000002' AND user_id='f0000000-0000-0000-0000-00000000000f';
  IF st <> 'WITHDRAWN' THEN RAISE EXCEPTION 'TT-CANCEL-PRE: uF not WITHDRAWN (%)', st; END IF;
END $$;

RESET ROLE;
SELECT public.poker_tournament_admin_transition('22222222-0000-0000-0000-000000000002','STARTING', NULL);
SELECT public.poker_tournament_admin_transition('22222222-0000-0000-0000-000000000002','RUNNING', NULL);
SELECT public.poker_tournament_admin_transition('22222222-0000-0000-0000-000000000002','FINAL_TABLE', NULL);
UPDATE public.poker_tournament_entries SET state = 'ACTIVE'
  WHERE tournament_id = '22222222-0000-0000-0000-000000000002' AND user_id = 'd0000000-0000-0000-0000-00000000000d';
UPDATE public.poker_tournament_entries SET state = 'ELIMINATED', chips = 0
  WHERE tournament_id = '22222222-0000-0000-0000-000000000002' AND user_id = 'e0000000-0000-0000-0000-00000000000e';

-- TT-PAY-WITHDRAWN: a payload that pays the WITHDRAWN entry (uF) is rejected even though its sum
-- equals the pool — a refunded entry's fee is out of the pool, so paying it would steal from the
-- field. Confirm nothing was credited.
DO $$
DECLARE v_err text; eD uuid; eF uuid; v_balD bigint; v_balF bigint;
BEGIN
  SELECT id INTO eD FROM public.poker_tournament_entries
    WHERE tournament_id='22222222-0000-0000-0000-000000000002' AND user_id='d0000000-0000-0000-0000-00000000000d';
  SELECT id INTO eF FROM public.poker_tournament_entries
    WHERE tournament_id='22222222-0000-0000-0000-000000000002' AND user_id='f0000000-0000-0000-0000-00000000000f';
  SELECT balance INTO v_balD FROM public.game_wallets WHERE user_id='d0000000-0000-0000-0000-00000000000d';
  BEGIN
    PERFORM public.poker_tournament_settle('22222222-0000-0000-0000-000000000002',
      jsonb_build_array(
        jsonb_build_object('entry_id', eD, 'user_id', 'd0000000-0000-0000-0000-00000000000d', 'place', 1, 'amount', 1500, 'kind', 'prize'),
        jsonb_build_object('entry_id', eF, 'user_id', 'f0000000-0000-0000-0000-00000000000f', 'place', null, 'amount', 500, 'kind', 'prize')),
      'settle:T2:bad');
    RAISE EXCEPTION 'TT-PAY-WITHDRAWN: a WITHDRAWN entry was paid';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT LIKE '%WITHDRAWN%' THEN RAISE EXCEPTION 'TT-PAY-WITHDRAWN: wrong error: %', v_err; END IF;
  END;
  -- The rejected settle rolled back entirely: uD not credited, uF still at its refunded balance.
  SELECT balance INTO v_balF FROM public.game_wallets WHERE user_id='f0000000-0000-0000-0000-00000000000f';
  IF v_balD <> (SELECT balance FROM public.game_wallets WHERE user_id='d0000000-0000-0000-0000-00000000000d') THEN
    RAISE EXCEPTION 'TT-PAY-WITHDRAWN: uD was credited by a rejected settle'; END IF;
  IF v_balF <> 100000 THEN RAISE EXCEPTION 'TT-PAY-WITHDRAWN: uF balance moved (%)', v_balF; END IF;
END $$;

-- TT-PARTIAL-RETRY: a forward-fix settle (new key) whose payout row for one entry ALREADY exists
-- credits only the missing entries — the pre-existing one is never double-credited.
DO $$
DECLARE eD uuid; eE uuid; v_balD0 bigint; v_balE0 bigint; v_balD1 bigint; v_balE1 bigint; stE text; tstate text;
BEGIN
  SELECT id INTO eD FROM public.poker_tournament_entries
    WHERE tournament_id='22222222-0000-0000-0000-000000000002' AND user_id='d0000000-0000-0000-0000-00000000000d';
  SELECT id INTO eE FROM public.poker_tournament_entries
    WHERE tournament_id='22222222-0000-0000-0000-000000000002' AND user_id='e0000000-0000-0000-0000-00000000000e';
  SELECT balance INTO v_balD0 FROM public.game_wallets WHERE user_id='d0000000-0000-0000-0000-00000000000d';
  SELECT balance INTO v_balE0 FROM public.game_wallets WHERE user_id='e0000000-0000-0000-0000-00000000000e';

  -- Simulate a crashed prior settle that had already RECORDED uD's payout row (but we deliberately
  -- do not credit here) — the forward-fix must NOT credit uD again.
  INSERT INTO public.poker_tournament_payouts (tournament_id, entry_id, user_id, place, amount, kind)
    VALUES ('22222222-0000-0000-0000-000000000002', eD, 'd0000000-0000-0000-0000-00000000000d', 1, 1500, 'prize');

  PERFORM public.poker_tournament_settle('22222222-0000-0000-0000-000000000002',
    jsonb_build_array(
      jsonb_build_object('entry_id', eD, 'user_id', 'd0000000-0000-0000-0000-00000000000d', 'place', 1, 'amount', 1500, 'kind', 'prize'),
      jsonb_build_object('entry_id', eE, 'user_id', 'e0000000-0000-0000-0000-00000000000e', 'place', 2, 'amount', 500,  'kind', 'prize')),
    'settle:T2:fix');

  SELECT balance INTO v_balD1 FROM public.game_wallets WHERE user_id='d0000000-0000-0000-0000-00000000000d';
  SELECT balance INTO v_balE1 FROM public.game_wallets WHERE user_id='e0000000-0000-0000-0000-00000000000e';
  IF v_balD1 <> v_balD0 THEN RAISE EXCEPTION 'TT-PARTIAL-RETRY: uD double-credited (% -> %)', v_balD0, v_balD1; END IF;
  IF v_balE1 <> v_balE0 + 500 THEN RAISE EXCEPTION 'TT-PARTIAL-RETRY: uE not credited (% -> %)', v_balE0, v_balE1; END IF;
  SELECT state INTO stE FROM public.poker_tournament_entries WHERE id = eE;
  IF stE <> 'PAID' THEN RAISE EXCEPTION 'TT-PARTIAL-RETRY: uE not PAID (%)', stE; END IF;
  SELECT state INTO tstate FROM public.poker_tournaments WHERE id='22222222-0000-0000-0000-000000000002';
  IF tstate <> 'COMPLETED' THEN RAISE EXCEPTION 'TT-PARTIAL-RETRY: not completed (%)', tstate; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT G — guarantee overlay: guarantee > collected fees mints extra play-money coins
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"40000000-0000-0000-0000-000000000040","role":"authenticated"}', true);
SELECT public.poker_tournament_register('33333333-0000-0000-0000-000000000003', 'reg:G:uG');
SELECT set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000050","role":"authenticated"}', true);
SELECT public.poker_tournament_register('33333333-0000-0000-0000-000000000003', 'reg:G:uH');

RESET ROLE;
SELECT public.poker_tournament_admin_transition('33333333-0000-0000-0000-000000000003','STARTING', NULL);
SELECT public.poker_tournament_admin_transition('33333333-0000-0000-0000-000000000003','RUNNING', NULL);
SELECT public.poker_tournament_admin_transition('33333333-0000-0000-0000-000000000003','FINAL_TABLE', NULL);
UPDATE public.poker_tournament_entries SET state = 'ACTIVE'
  WHERE tournament_id = '33333333-0000-0000-0000-000000000003' AND user_id = '40000000-0000-0000-0000-000000000040';
UPDATE public.poker_tournament_entries SET state = 'ELIMINATED', chips = 0
  WHERE tournament_id = '33333333-0000-0000-0000-000000000003' AND user_id = '50000000-0000-0000-0000-000000000050';

-- TT-GUARANTEE-CONSERVE: a payload conserving only the COLLECTED fees (2000) — not the guaranteed
-- effective pool (5000) — is rejected. TT-PAY-NEG: a negative payout amount is rejected.
DO $$
DECLARE v_err text; eG uuid; eH uuid; v_pool bigint;
BEGIN
  SELECT id INTO eG FROM public.poker_tournament_entries
    WHERE tournament_id='33333333-0000-0000-0000-000000000003' AND user_id='40000000-0000-0000-0000-000000000040';
  SELECT id INTO eH FROM public.poker_tournament_entries
    WHERE tournament_id='33333333-0000-0000-0000-000000000003' AND user_id='50000000-0000-0000-0000-000000000050';
  v_pool := public.poker_tournament_prize_pool('33333333-0000-0000-0000-000000000003');
  IF v_pool <> 5000 THEN RAISE EXCEPTION 'TT-GUARANTEE: pool should be the 5000 guarantee, got %', v_pool; END IF;

  BEGIN  -- conserves only collected fees (2000) → rejected against the 5000 pool
    PERFORM public.poker_tournament_settle('33333333-0000-0000-0000-000000000003',
      jsonb_build_array(
        jsonb_build_object('entry_id', eG, 'user_id', '40000000-0000-0000-0000-000000000040', 'place', 1, 'amount', 1500, 'kind', 'prize'),
        jsonb_build_object('entry_id', eH, 'user_id', '50000000-0000-0000-0000-000000000050', 'place', 2, 'amount', 500,  'kind', 'prize')),
      'settle:G:under');
    RAISE EXCEPTION 'TT-GUARANTEE-CONSERVE: under-pool payout accepted';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT LIKE '%conserve%' THEN RAISE EXCEPTION 'TT-GUARANTEE-CONSERVE: wrong error: %', v_err; END IF;
  END;

  BEGIN  -- negative amount (sum still 5000) → rejected
    PERFORM public.poker_tournament_settle('33333333-0000-0000-0000-000000000003',
      jsonb_build_array(
        jsonb_build_object('entry_id', eH, 'user_id', '50000000-0000-0000-0000-000000000050', 'place', 2, 'amount', -1000, 'kind', 'prize'),
        jsonb_build_object('entry_id', eG, 'user_id', '40000000-0000-0000-0000-000000000040', 'place', 1, 'amount', 6000,  'kind', 'prize')),
      'settle:G:neg');
    RAISE EXCEPTION 'TT-PAY-NEG: negative payout accepted';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT LIKE '%negative payout%' THEN RAISE EXCEPTION 'TT-PAY-NEG: wrong error: %', v_err; END IF;
  END;
END $$;

-- TT-GUARANTEE-OVERLAY: settle at the guaranteed pool (5000). Winners receive guarantee-funded
-- coins; the audit records the overlay so monitoring can split guarantee- vs player-funded value.
DO $$
DECLARE
  eG uuid; eH uuid; v_balG bigint; v_balH bigint; v_detail jsonb; v_ledger int;
BEGIN
  SELECT id INTO eG FROM public.poker_tournament_entries
    WHERE tournament_id='33333333-0000-0000-0000-000000000003' AND user_id='40000000-0000-0000-0000-000000000040';
  SELECT id INTO eH FROM public.poker_tournament_entries
    WHERE tournament_id='33333333-0000-0000-0000-000000000003' AND user_id='50000000-0000-0000-0000-000000000050';

  PERFORM public.poker_tournament_settle('33333333-0000-0000-0000-000000000003',
    jsonb_build_array(
      jsonb_build_object('entry_id', eG, 'user_id', '40000000-0000-0000-0000-000000000040', 'place', 1, 'amount', 3500, 'kind', 'prize'),
      jsonb_build_object('entry_id', eH, 'user_id', '50000000-0000-0000-0000-000000000050', 'place', 2, 'amount', 1500, 'kind', 'prize')),
    'settle:G:1');

  SELECT balance INTO v_balG FROM public.game_wallets WHERE user_id='40000000-0000-0000-0000-000000000040';
  SELECT balance INTO v_balH FROM public.game_wallets WHERE user_id='50000000-0000-0000-0000-000000000050';
  -- uG 99000 + 3500 = 102500 ; uH 99000 + 1500 = 100500. Collected was 2000, paid 5000 → 3000 minted.
  IF v_balG <> 102500 THEN RAISE EXCEPTION 'TT-GUARANTEE-OVERLAY: uG balance wrong (%)', v_balG; END IF;
  IF v_balH <> 100500 THEN RAISE EXCEPTION 'TT-GUARANTEE-OVERLAY: uH balance wrong (%)', v_balH; END IF;

  -- Ledger reason for guarantee prizes is explicit ('poker_tournament_prize').
  SELECT COUNT(*) INTO v_ledger FROM public.coin_ledger
    WHERE user_id='40000000-0000-0000-0000-000000000040' AND reason='poker_tournament_prize' AND delta=3500;
  IF v_ledger <> 1 THEN RAISE EXCEPTION 'TT-GUARANTEE-OVERLAY: missing explicit prize ledger row'; END IF;

  -- The audit distinguishes guarantee-funded (overlay) from player-funded (collected_fees) value.
  SELECT detail INTO v_detail FROM public.poker_tournament_audit
    WHERE tournament_id='33333333-0000-0000-0000-000000000003' AND event='settle' ORDER BY id DESC LIMIT 1;
  IF (v_detail->>'pool')::bigint <> 5000 THEN RAISE EXCEPTION 'TT-GUARANTEE-OVERLAY: audit pool wrong (%)', v_detail; END IF;
  IF (v_detail->>'collected_fees')::bigint <> 2000 THEN RAISE EXCEPTION 'TT-GUARANTEE-OVERLAY: audit collected_fees wrong (%)', v_detail; END IF;
  IF (v_detail->>'overlay')::bigint <> 3000 THEN RAISE EXCEPTION 'TT-GUARANTEE-OVERLAY: audit overlay wrong (%)', v_detail; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TT-RLS: a client (authenticated) cannot write any tournament table directly.
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
DO $$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    UPDATE public.poker_tournament_entries SET chips = 999999
      WHERE tournament_id = '11111111-0000-0000-0000-000000000001';
    IF (SELECT MAX(chips) FROM public.poker_tournament_entries
        WHERE tournament_id='11111111-0000-0000-0000-000000000001') = 999999 THEN
      RAISE EXCEPTION 'TT-RLS: client wrote entries directly';
    END IF;
    v_ok := true;
  EXCEPTION WHEN insufficient_privilege THEN
    v_ok := true; -- REVOKE blocked it — also acceptable
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TT-RLS: unexpected'; END IF;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'poker_tournament_tests: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
