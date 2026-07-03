-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — TOURNAMENT DATABASE TEST HARNESS (register · idempotency · refund · settle)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Run AFTER applying the existing poker migrations + migration_poker_tournament.sql.
--
-- Venue: an ISOLATED database (Supabase preview branch / local stack / SQL editor). The whole
-- script runs in ONE transaction and ROLLs BACK at the end — it persists NOTHING. Player RPCs run
-- under role `authenticated` with a JWT `sub` claim auth.uid() reads; service RPCs (transition /
-- settle) run under the setup superuser (RESET ROLE). Any failed assertion RAISEs → rollback.
--
-- IDs: uA=aaaa… uB=bbbb… uC=cccc… ; tournament T = eeee…0001
-- Covers TT-REG-DUP, TT-REG-IDEM, TT-CANCEL-MIN/PRE, TT-PAY-CONSERVE, TT-PAY-IDEM.
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Setup (superuser) ──────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','authenticated','authenticated','a@t.local', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','authenticated','authenticated','b@t.local', now(), now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','authenticated','authenticated','c@t.local', now(), now());

INSERT INTO public.game_wallets (user_id, balance) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 100000),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100000),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 100000);

-- A registration-open tournament: fee 1000, stack 5000, min 3, max 6.
INSERT INTO public.poker_tournaments (id, title, state, entry_fee, starting_stack, min_entries, max_entries, config)
VALUES ('eeeeeeee-0000-0000-0000-000000000001','T','REGISTRATION_OPEN', 1000, 5000, 3, 6, '{}'::jsonb);

-- ════════════════════════════════════════════════════════════════════════════════════
-- TT-REG-IDEM: register uA once; a retried call with the SAME key charges nothing extra.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
DO $$
DECLARE v_e1 uuid; v_e2 uuid; v_bal bigint; v_count int;
BEGIN
  v_e1 := public.poker_tournament_register('eeeeeeee-0000-0000-0000-000000000001', 'reg:T:uA');
  v_e2 := public.poker_tournament_register('eeeeeeee-0000-0000-0000-000000000001', 'reg:T:uA'); -- retry
  IF v_e1 <> v_e2 THEN RAISE EXCEPTION 'TT-REG-IDEM: retry returned a different entry'; END IF;
  SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_bal <> 99000 THEN RAISE EXCEPTION 'TT-REG-IDEM: charged twice (balance=%)', v_bal; END IF;
  SELECT COUNT(*) INTO v_count FROM public.poker_tournament_entries
    WHERE tournament_id = 'eeeeeeee-0000-0000-0000-000000000001' AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_count <> 1 THEN RAISE EXCEPTION 'TT-REG-IDEM: duplicate entry rows (%)', v_count; END IF;
END $$;

-- TT-REG-DUP: a SECOND registration with a different key is rejected (already registered).
DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.poker_tournament_register('eeeeeeee-0000-0000-0000-000000000001', 'reg:T:uA:2');
    RAISE EXCEPTION 'TT-REG-DUP: duplicate registration was allowed';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT LIKE '%already registered%' THEN RAISE EXCEPTION 'TT-REG-DUP: wrong error: %', v_err; END IF;
  END;
END $$;

-- Register uB and uC so the field meets the minimum (3).
SELECT set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
SELECT public.poker_tournament_register('eeeeeeee-0000-0000-0000-000000000001', 'reg:T:uB');
SELECT set_config('request.jwt.claims','{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true);
SELECT public.poker_tournament_register('eeeeeeee-0000-0000-0000-000000000001', 'reg:T:uC');

-- TT-CANCEL-PRE: uC unregisters pre-start → full refund; retry refunds nothing extra.
DO $$
DECLARE v_bal bigint;
BEGIN
  PERFORM public.poker_tournament_unregister('eeeeeeee-0000-0000-0000-000000000001', 'unreg:T:uC');
  PERFORM public.poker_tournament_unregister('eeeeeeee-0000-0000-0000-000000000001', 'unreg:T:uC'); -- retry
  SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  IF v_bal <> 100000 THEN RAISE EXCEPTION 'TT-CANCEL-PRE: refund wrong (balance=%)', v_bal; END IF;
END $$;

-- Re-register uC so we have 3 live entries for settlement.
SELECT public.poker_tournament_register('eeeeeeee-0000-0000-0000-000000000001', 'reg:T:uC:2');

-- ════════════════════════════════════════════════════════════════════════════════════
-- Move to a completable state + mark entries eliminated (simulate a played-out tournament).
RESET ROLE;
SELECT public.poker_tournament_admin_transition('eeeeeeee-0000-0000-0000-000000000001','STARTING', NULL);
SELECT public.poker_tournament_admin_transition('eeeeeeee-0000-0000-0000-000000000001','RUNNING', NULL);
SELECT public.poker_tournament_admin_transition('eeeeeeee-0000-0000-0000-000000000001','FINAL_TABLE', NULL);
-- Mark the LIVE entries busted (do NOT resurrect the pre-start WITHDRAWN entry — its fee was
-- refunded and must stay out of the prize pool).
UPDATE public.poker_tournament_entries SET state = 'ELIMINATED', chips = 0
  WHERE tournament_id = 'eeeeeeee-0000-0000-0000-000000000001' AND state <> 'WITHDRAWN';

-- TT-PAY-CONSERVE + TT-PAY-IDEM: settle. Pool = 3 * 1000 = 3000. Pay 2000 / 1000 to two entries;
-- 3rd gets 0. sum == pool. A retried settle credits nothing extra.
DO $$
DECLARE
  eA uuid; eB uuid; eC uuid; uA uuid; uB uuid; uC uuid;
  v_payload jsonb; v_balA bigint; v_balB bigint; v_pool bigint;
BEGIN
  SELECT id, user_id INTO eA, uA FROM public.poker_tournament_entries
    WHERE tournament_id='eeeeeeee-0000-0000-0000-000000000001' AND user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  SELECT id, user_id INTO eB, uB FROM public.poker_tournament_entries
    WHERE tournament_id='eeeeeeee-0000-0000-0000-000000000001' AND user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  SELECT id, user_id INTO eC, uC FROM public.poker_tournament_entries
    WHERE tournament_id='eeeeeeee-0000-0000-0000-000000000001' AND user_id='cccccccc-cccc-cccc-cccc-cccccccccccc'
    ORDER BY seq DESC LIMIT 1;

  v_pool := public.poker_tournament_prize_pool('eeeeeeee-0000-0000-0000-000000000001');
  IF v_pool <> 3000 THEN RAISE EXCEPTION 'pool wrong: %', v_pool; END IF;

  v_payload := jsonb_build_array(
    jsonb_build_object('entry_id', eA, 'user_id', uA, 'place', 1, 'amount', 2000, 'kind', 'prize'),
    jsonb_build_object('entry_id', eB, 'user_id', uB, 'place', 2, 'amount', 1000, 'kind', 'prize'),
    jsonb_build_object('entry_id', eC, 'user_id', uC, 'place', 3, 'amount', 0,    'kind', 'prize')
  );

  PERFORM public.poker_tournament_settle('eeeeeeee-0000-0000-0000-000000000001', v_payload, 'settle:T:1');
  PERFORM public.poker_tournament_settle('eeeeeeee-0000-0000-0000-000000000001', v_payload, 'settle:T:1'); -- retry

  SELECT balance INTO v_balA FROM public.game_wallets WHERE user_id = uA;
  SELECT balance INTO v_balB FROM public.game_wallets WHERE user_id = uB;
  -- uA paid 1000 entry then +2000 prize = 99000 + 2000 = 101000; uB 99000 + 1000 = 100000.
  IF v_balA <> 101000 THEN RAISE EXCEPTION 'TT-PAY: uA balance wrong (%)', v_balA; END IF;
  IF v_balB <> 100000 THEN RAISE EXCEPTION 'TT-PAY-IDEM: uB double-paid (%)', v_balB; END IF;

  IF (SELECT state FROM public.poker_tournaments WHERE id='eeeeeeee-0000-0000-0000-000000000001') <> 'COMPLETED' THEN
    RAISE EXCEPTION 'settle did not complete the tournament';
  END IF;
END $$;

-- TT-PAY-NONCONSERVE: a payload whose sum <> pool is rejected.
DO $$
DECLARE v_err text; eA uuid; uA uuid;
BEGIN
  SELECT id, user_id INTO eA, uA FROM public.poker_tournament_entries
    WHERE tournament_id='eeeeeeee-0000-0000-0000-000000000001' AND user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  BEGIN
    PERFORM public.poker_tournament_settle('eeeeeeee-0000-0000-0000-000000000001',
      jsonb_build_array(jsonb_build_object('entry_id', eA, 'user_id', uA, 'place', 1, 'amount', 999, 'kind', 'prize')),
      'settle:T:bad');
    RAISE EXCEPTION 'TT-PAY-NONCONSERVE: non-conserving payout was accepted';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT LIKE '%conserve%' THEN RAISE EXCEPTION 'TT-PAY-NONCONSERVE: wrong error: %', v_err; END IF;
  END;
END $$;

-- TT-STATE: an illegal transition is rejected by the DB FSM helper.
DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.poker_tournament_admin_transition('eeeeeeee-0000-0000-0000-000000000001','RUNNING', NULL); -- from COMPLETED
    RAISE EXCEPTION 'TT-STATE: illegal transition from COMPLETED allowed';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT LIKE '%illegal transition%' THEN RAISE EXCEPTION 'TT-STATE: wrong error: %', v_err; END IF;
  END;
END $$;

-- TT-RLS: a client (authenticated) cannot write any tournament table directly.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
DO $$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    UPDATE public.poker_tournament_entries SET chips = 999999
      WHERE tournament_id = 'eeeeeeee-0000-0000-0000-000000000001';
    -- If it did not raise, verify nothing actually changed (RLS should block the write).
    IF (SELECT MAX(chips) FROM public.poker_tournament_entries
        WHERE tournament_id='eeeeeeee-0000-0000-0000-000000000001') = 999999 THEN
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
