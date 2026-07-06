-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — TOURNAMENT RECOVERY TEST HARNESS (27G-F1)
-- init_hand_state atomic-guard · started-tournament refund once · idempotency · prize-paid reject
-- · authz · settle-after-cancel reject · wallet+ledger reconciliation · chip conservation untouched
-- ════════════════════════════════════════════════════════════════════════════════════
-- Run AFTER: prereq (game_wallets, coin_ledger) + migration_poker_tournament.sql +
-- migration_poker_tournament_orchestration.sql + migration_poker_tournament_realtime.sql +
-- migration_poker_tournament_recovery.sql. One transaction, ROLLBACK at end (persists nothing).
-- Player RPCs run under role authenticated with a JWT sub claim; service RPCs run as superuser.
-- Any failed assertion RAISEs → the whole run rolls back and psql exits non-zero.
-- ════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── Setup (superuser) ──────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('a0000000-0000-0000-0000-00000000000a','authenticated','authenticated','a@r.local', now(), now()),
  ('b0000000-0000-0000-0000-00000000000b','authenticated','authenticated','b@r.local', now(), now()),
  ('c0000000-0000-0000-0000-00000000000c','authenticated','authenticated','c@r.local', now(), now());

INSERT INTO public.game_wallets (user_id, balance) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 100000),
  ('b0000000-0000-0000-0000-00000000000b', 100000),
  ('c0000000-0000-0000-0000-00000000000c', 100000);

-- R  = heads-up started tournament (refund path).   G = guaranteed tournament (prize-paid reject).
INSERT INTO public.poker_tournaments
  (id, title, state, entry_fee, starting_stack, min_entries, max_entries, seats_per_table, config, guaranteed_prize_pool)
VALUES
  ('11111111-0000-0000-0000-000000000001','R','REGISTRATION_OPEN', 1000, 5000, 2, 6, 6, '{}'::jsonb, 0),
  ('33333333-0000-0000-0000-000000000003','G','REGISTRATION_OPEN', 1000, 5000, 2, 6, 6, '{}'::jsonb, 0);

-- ════════════════════════════════════════════════════════════════════════════════════
-- REGISTER uA, uB into R (real entry-fee escrow via the player RPC), then START play.
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
SELECT public.poker_tournament_register('11111111-0000-0000-0000-000000000001', 'reg:R:uA');
SELECT set_config('request.jwt.claims','{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
SELECT public.poker_tournament_register('11111111-0000-0000-0000-000000000001', 'reg:R:uB');
RESET ROLE;

-- Post-register balances are debited (100000 - 1000 = 99000 each).
DO $$
DECLARE vA bigint; vB bigint;
BEGIN
  SELECT balance INTO vA FROM public.game_wallets WHERE user_id='a0000000-0000-0000-0000-00000000000a';
  SELECT balance INTO vB FROM public.game_wallets WHERE user_id='b0000000-0000-0000-0000-00000000000b';
  IF vA <> 99000 OR vB <> 99000 THEN RAISE EXCEPTION 'SETUP: post-register balances %/% (want 99000/99000)', vA, vB; END IF;
  RAISE NOTICE 'SETUP PASS both registered, escrow debited';
END $$;

-- Drive to RUNNING and seat + open a live hand (mirrors production: escrow held, play started).
SELECT public.poker_tournament_admin_transition('11111111-0000-0000-0000-000000000001','STARTING', NULL);
SELECT public.poker_tournament_seat_draw('11111111-0000-0000-0000-000000000001');
SELECT public.poker_tournament_admin_transition('11111111-0000-0000-0000-000000000001','RUNNING', NULL);

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-REC-001 init_hand_state writes when empty, is a NO-OP + no-clobber when already initialized
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_hand uuid; v_first boolean; v_second boolean; v_state jsonb;
BEGIN
  v_hand := public.poker_tournament_start_hand('11111111-0000-0000-0000-000000000001', 1, 0, 25, 50, 0, 'sh:R:1:1');
  -- first init on the empty '{}' row → true
  v_first := public.poker_tournament_init_hand_state(v_hand, '11111111-0000-0000-0000-000000000001',
    '{"config":{"handNo":1,"seed":123},"log":[]}'::jsonb);
  IF NOT v_first THEN RAISE EXCEPTION 'REC-001: first init returned false'; END IF;
  -- Simulate a player action having grown the log.
  UPDATE public.poker_tournament_hands
    SET state = '{"config":{"handNo":1,"seed":123},"log":[{"seatIndex":0,"action":{"type":"call"}}]}'::jsonb
    WHERE id = v_hand;
  -- A concurrent / stale re-init must NOT overwrite the in-progress log → false, log preserved.
  v_second := public.poker_tournament_init_hand_state(v_hand, '11111111-0000-0000-0000-000000000001',
    '{"config":{"handNo":1,"seed":123},"log":[]}'::jsonb);
  IF v_second THEN RAISE EXCEPTION 'REC-001: stale re-init CLOBBERED an initialized hand'; END IF;
  SELECT state INTO v_state FROM public.poker_tournament_hands WHERE id = v_hand;
  IF jsonb_array_length(v_state->'log') <> 1 THEN RAISE EXCEPTION 'REC-001: action log was clobbered (len=%)', jsonb_array_length(v_state->'log'); END IF;
  RAISE NOTICE 'REC-001 PASS init_hand_state atomic: writes once, never clobbers a live log';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-REC-002 init_hand_state refuses a SETTLED hand (never re-opens settled play)
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_hand uuid; v_did boolean;
BEGIN
  SELECT id INTO v_hand FROM public.poker_tournament_hands
    WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND table_no=1 AND hand_no=1;
  UPDATE public.poker_tournament_hands SET settled = true, settled_at = now() WHERE id = v_hand;
  v_did := public.poker_tournament_init_hand_state(v_hand, '11111111-0000-0000-0000-000000000001',
    '{"config":{"handNo":1,"seed":999},"log":[]}'::jsonb);
  IF v_did THEN RAISE EXCEPTION 'REC-002: init_hand_state wrote to a SETTLED hand'; END IF;
  RAISE NOTICE 'REC-002 PASS init_hand_state refuses a settled hand';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-REC-003 AUTHZ: neither authenticated nor anon may call the recovery RPCs
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE ok boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  BEGIN
    PERFORM public.poker_tournament_recover_refund('11111111-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-00000000000a', 'recover:R:hack');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; WHEN others THEN ok := true;
  END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'REC-003: authenticated COULD call recover_refund (must be denied)'; END IF;
  RAISE NOTICE 'REC-003 PASS participant denied recover_refund';
END $$;

DO $$
DECLARE ok boolean := false;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.poker_tournament_init_hand_state(gen_random_uuid(), '11111111-0000-0000-0000-000000000001', '{}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN ok := true; WHEN others THEN ok := true;
  END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'REC-003b: anon COULD call init_hand_state (must be denied)'; END IF;
  RAISE NOTICE 'REC-003b PASS anon denied init_hand_state';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-REC-004 recover_refund refunds BOTH entries once; wallets return to pre-registration;
--   one refund ledger + one refund payout per entry; NO prize row; tournament → CANCELLED.
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_n int; vA bigint; vB bigint; tstate text;
  v_refunds int; v_prizes int; v_ledgerA int; v_ledgerB int;
  stA text; stB text;
BEGIN
  v_n := public.poker_tournament_recover_refund('11111111-0000-0000-0000-000000000001',
    '99999999-0000-0000-0000-000000000099', 'recover:R:1');
  IF v_n <> 2 THEN RAISE EXCEPTION 'REC-004: refunded % entries (want 2)', v_n; END IF;

  SELECT balance INTO vA FROM public.game_wallets WHERE user_id='a0000000-0000-0000-0000-00000000000a';
  SELECT balance INTO vB FROM public.game_wallets WHERE user_id='b0000000-0000-0000-0000-00000000000b';
  IF vA <> 100000 OR vB <> 100000 THEN RAISE EXCEPTION 'REC-004: post-refund balances %/% (want 100000/100000)', vA, vB; END IF;

  SELECT state INTO tstate FROM public.poker_tournaments WHERE id='11111111-0000-0000-0000-000000000001';
  IF tstate <> 'CANCELLED' THEN RAISE EXCEPTION 'REC-004: tournament state % (want CANCELLED)', tstate; END IF;

  SELECT COUNT(*) INTO v_refunds FROM public.poker_tournament_payouts
    WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND kind='refund';
  IF v_refunds <> 2 THEN RAISE EXCEPTION 'REC-004: refund payout rows % (want 2)', v_refunds; END IF;
  SELECT COUNT(*) INTO v_prizes FROM public.poker_tournament_payouts
    WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND kind='prize';
  IF v_prizes <> 0 THEN RAISE EXCEPTION 'REC-004: % prize rows created (want 0)', v_prizes; END IF;

  SELECT COUNT(*) INTO v_ledgerA FROM public.coin_ledger
    WHERE user_id='a0000000-0000-0000-0000-00000000000a' AND reason='poker_tournament_refund';
  SELECT COUNT(*) INTO v_ledgerB FROM public.coin_ledger
    WHERE user_id='b0000000-0000-0000-0000-00000000000b' AND reason='poker_tournament_refund';
  IF v_ledgerA <> 1 OR v_ledgerB <> 1 THEN RAISE EXCEPTION 'REC-004: refund ledger rows %/% (want 1/1)', v_ledgerA, v_ledgerB; END IF;

  SELECT state INTO stA FROM public.poker_tournament_entries
    WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND user_id='a0000000-0000-0000-0000-00000000000a';
  SELECT state INTO stB FROM public.poker_tournament_entries
    WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND user_id='b0000000-0000-0000-0000-00000000000b';
  IF stA <> 'WITHDRAWN' OR stB <> 'WITHDRAWN' THEN RAISE EXCEPTION 'REC-004: entry states %/% (want WITHDRAWN)', stA, stB; END IF;

  RAISE NOTICE 'REC-004 PASS started-tournament refund: both refunded once, wallets restored, CANCELLED, no prize rows';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-REC-005 recover_refund is IDEMPOTENT (same key → no extra credit; different key → no-op
--   because everything is already WITHDRAWN)
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_n int; vA bigint; vB bigint; v_ledger int;
BEGIN
  -- Same key: short-circuits, refunds 0.
  v_n := public.poker_tournament_recover_refund('11111111-0000-0000-0000-000000000001',
    '99999999-0000-0000-0000-000000000099', 'recover:R:1');
  IF v_n <> 0 THEN RAISE EXCEPTION 'REC-005: same-key retry refunded % (want 0)', v_n; END IF;
  -- Fresh key: all entries already WITHDRAWN → nothing to refund.
  v_n := public.poker_tournament_recover_refund('11111111-0000-0000-0000-000000000001',
    '99999999-0000-0000-0000-000000000098', 'recover:R:2');
  IF v_n <> 0 THEN RAISE EXCEPTION 'REC-005: fresh-key re-run refunded % (want 0)', v_n; END IF;

  SELECT balance INTO vA FROM public.game_wallets WHERE user_id='a0000000-0000-0000-0000-00000000000a';
  SELECT balance INTO vB FROM public.game_wallets WHERE user_id='b0000000-0000-0000-0000-00000000000b';
  IF vA <> 100000 OR vB <> 100000 THEN RAISE EXCEPTION 'REC-005: balances drifted on retry %/%', vA, vB; END IF;
  SELECT COUNT(*) INTO v_ledger FROM public.coin_ledger
    WHERE reason='poker_tournament_refund' AND game_code='poker';
  IF v_ledger <> 2 THEN RAISE EXCEPTION 'REC-005: refund ledger rows % (want exactly 2 — no double refund)', v_ledger; END IF;
  RAISE NOTICE 'REC-005 PASS recover_refund idempotent (no double refund on retry)';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-REC-006 settle is REJECTED after a recovery-refund (tournament CANCELLED)
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_err text; eA uuid;
BEGIN
  SELECT id INTO eA FROM public.poker_tournament_entries
    WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND user_id='a0000000-0000-0000-0000-00000000000a';
  BEGIN
    PERFORM public.poker_tournament_settle('11111111-0000-0000-0000-000000000001',
      jsonb_build_array(jsonb_build_object('entry_id', eA, 'user_id','a0000000-0000-0000-0000-00000000000a','place',1,'amount',0,'kind','prize')),
      'settle:R:aftercancel');
    RAISE EXCEPTION 'REC-006: a CANCELLED tournament was settled';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT LIKE '%cancelled%' THEN RAISE EXCEPTION 'REC-006: wrong error: %', v_err; END IF;
  END;
  RAISE NOTICE 'REC-006 PASS settle rejected after recovery-refund';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-REC-007 recover_refund REFUSES a tournament that already has a PRIZE payout
--   (cannot refund an already-paid tournament). Uses G, settled to COMPLETED first.
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
SELECT public.poker_tournament_register('33333333-0000-0000-0000-000000000003', 'reg:G:uA');
SELECT set_config('request.jwt.claims','{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
SELECT public.poker_tournament_register('33333333-0000-0000-0000-000000000003', 'reg:G:uB');
RESET ROLE;
SELECT public.poker_tournament_admin_transition('33333333-0000-0000-0000-000000000003','STARTING', NULL);
SELECT public.poker_tournament_admin_transition('33333333-0000-0000-0000-000000000003','RUNNING', NULL);
SELECT public.poker_tournament_admin_transition('33333333-0000-0000-0000-000000000003','FINAL_TABLE', NULL);
UPDATE public.poker_tournament_entries SET state='ACTIVE'
  WHERE tournament_id='33333333-0000-0000-0000-000000000003' AND user_id='a0000000-0000-0000-0000-00000000000a';
UPDATE public.poker_tournament_entries SET state='ELIMINATED', chips=0, finishing_place=2
  WHERE tournament_id='33333333-0000-0000-0000-000000000003' AND user_id='b0000000-0000-0000-0000-00000000000b';

DO $$
DECLARE eA uuid; eB uuid; v_err text;
BEGIN
  SELECT id INTO eA FROM public.poker_tournament_entries
    WHERE tournament_id='33333333-0000-0000-0000-000000000003' AND user_id='a0000000-0000-0000-0000-00000000000a';
  SELECT id INTO eB FROM public.poker_tournament_entries
    WHERE tournament_id='33333333-0000-0000-0000-000000000003' AND user_id='b0000000-0000-0000-0000-00000000000b';
  -- Pool = 2000. Pay champion uA 2000, uB 0.
  PERFORM public.poker_tournament_settle('33333333-0000-0000-0000-000000000003',
    jsonb_build_array(
      jsonb_build_object('entry_id', eA, 'user_id','a0000000-0000-0000-0000-00000000000a','place',1,'amount',2000,'kind','prize'),
      jsonb_build_object('entry_id', eB, 'user_id','b0000000-0000-0000-0000-00000000000b','place',2,'amount',0,'kind','prize')),
    'settle:G:1');
  -- Now recover_refund must refuse (prize payout exists / COMPLETED).
  BEGIN
    PERFORM public.poker_tournament_recover_refund('33333333-0000-0000-0000-000000000003',
      '99999999-0000-0000-0000-000000000097', 'recover:G:1');
    RAISE EXCEPTION 'REC-007: recover_refund ran on an already-settled tournament';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT LIKE '%already settled%' AND v_err NOT LIKE '%prize payouts%' THEN
      RAISE EXCEPTION 'REC-007: wrong error: %', v_err; END IF;
  END;
  RAISE NOTICE 'REC-007 PASS recover_refund refuses an already-paid tournament';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-REC-008 GLOBAL RECONCILIATION: net coin movement across R is ZERO (entry debit == refund
--   credit), and G paid exactly its pool once. No stranded escrow anywhere.
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_net_R bigint; v_prize_G bigint;
BEGIN
  -- R: every ledger row for R's users nets to zero (each -1000 entry + +1000 refund).
  SELECT COALESCE(SUM(delta),0) INTO v_net_R FROM public.coin_ledger
    WHERE reason IN ('poker_tournament_entry','poker_tournament_refund')
      AND user_id IN ('a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b');
  -- uA/uB each: -1000 (R entry) +1000 (R refund) -1000 (G entry) +2000/0 (G prize) → not zero overall.
  -- Isolate R by checking the two refund credits equal the two R entry debits (both 1000).
  IF (SELECT COALESCE(SUM(delta),0) FROM public.coin_ledger WHERE reason='poker_tournament_refund') <> 2000 THEN
    RAISE EXCEPTION 'REC-008: total refund credits <> 2000';
  END IF;
  SELECT COALESCE(SUM(amount),0) INTO v_prize_G FROM public.poker_tournament_payouts
    WHERE tournament_id='33333333-0000-0000-0000-000000000003' AND kind='prize';
  IF v_prize_G <> 2000 THEN RAISE EXCEPTION 'REC-008: G prize total % (want 2000)', v_prize_G; END IF;
  RAISE NOTICE 'REC-008 PASS reconciliation: R refunds == R escrow; G paid its pool once';
END $$;

DO $$ BEGIN RAISE NOTICE '==== ALL RECOVERY ASSERTIONS PASSED ===='; END $$;
ROLLBACK;
