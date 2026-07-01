-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — DATABASE TEST HARNESS (RLS isolation + coin integrity / idempotency / conservation)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Run AFTER applying poker_core.sql + poker_private.sql + poker_economy.sql.
--
-- Venue: an ISOLATED database (a Supabase preview branch, a local stack, or the SQL editor).
-- The whole script runs inside ONE transaction and ROLLs BACK at the end, so it persists
-- NOTHING — safe to run even against a shared database. Synthetic auth.users / wallets / table
-- exist only for the life of the transaction.
--
-- Impersonation: RLS is exercised by switching to role `authenticated` and setting the JWT
-- `sub` claim that auth.uid() reads. A superuser/service role bypasses RLS, so every RLS test
-- runs under `authenticated`. Any failed assertion RAISEs and aborts (→ rollback).
--
-- Fixed synthetic IDs:
--   uA = 111… (player A, seat 0)   uB = 222… (player B, seat 1)
--   uS = 333… (spectator)          uO = 444… (outsider / non-member)
--   tbl = aaa…001 (public table)   ptbl = aaa…002 (private table)   hnd = bbb…001 (a hand)
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Setup (service role / superuser) ──────────────────────────────────────────────────
-- Synthetic auth users. Minimal columns; rolled back at the end.
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111','authenticated','authenticated','a@test.local', now(), now()),
  ('22222222-2222-2222-2222-222222222222','authenticated','authenticated','b@test.local', now(), now()),
  ('33333333-3333-3333-3333-333333333333','authenticated','authenticated','s@test.local', now(), now()),
  ('44444444-4444-4444-4444-444444444444','authenticated','authenticated','o@test.local', now(), now());

INSERT INTO public.game_wallets (user_id, balance) VALUES
  ('11111111-1111-1111-1111-111111111111', 1000000),
  ('22222222-2222-2222-2222-222222222222', 1000000),
  ('33333333-3333-3333-3333-333333333333', 1000000),
  ('44444444-4444-4444-4444-444444444444', 1000000);

-- Public table (SB 500 / BB 1000 → buy-in range [40_000, 100_000]).
INSERT INTO public.poker_tables (id, name, created_by, small_blind, big_blind, capacity)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001','Public Test', '11111111-1111-1111-1111-111111111111', 500, 1000, 6);
INSERT INTO public.poker_seats (table_id, seat_index)
SELECT 'aaaaaaaa-0000-0000-0000-000000000001', g FROM generate_series(0,5) g;

-- Private table + secret + a member (uA) and NON-member (uO).
INSERT INTO public.poker_tables (id, name, small_blind, big_blind, is_private)
VALUES ('aaaaaaaa-0000-0000-0000-000000000002','Private Test', 500, 1000, true);
INSERT INTO public.poker_table_secrets (table_id, password_hash)
VALUES ('aaaaaaaa-0000-0000-0000-000000000002','$hash$dummy');
INSERT INTO public.poker_table_members (table_id, user_id, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','player');

-- A hand on the public table, with hole cards for uA (seat0) and uB (seat1) + a deck row.
INSERT INTO public.poker_hands (id, table_id, hand_no, phase, street, board)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001', 1, 'BETTING','FLOP','["As","Kd","2c"]');
INSERT INTO public.poker_hole_cards (hand_id, table_id, seat_index, user_id, cards) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',0,'11111111-1111-1111-1111-111111111111','["Ah","Ad"]'),
  ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',1,'22222222-2222-2222-2222-222222222222','["7c","2d"]');
INSERT INTO public.poker_deck (hand_id, table_id, stub, seed)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','["Qs","Jh","Th"]', 123456);
INSERT INTO public.poker_incidents (table_id, kind, detail)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001','admin_note','{"note":"secret"}');

-- ════════════════════════════════════════════════════════════════════════════════════
-- PART A — RLS / PRIVACY TESTS (run as `authenticated`)
-- ════════════════════════════════════════════════════════════════════════════════════

-- Helper: become a given user.
-- (Inline below via set_config + SET ROLE; RESET ROLE returns to superuser for setup steps.)

-- A1. Player B CANNOT read Player A's hole cards (read-own only). B sees ONLY its own row.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
DO $$
DECLARE n int; mine int;
BEGIN
  SELECT count(*) INTO n FROM public.poker_hole_cards
    WHERE hand_id='bbbbbbbb-0000-0000-0000-000000000001';
  SELECT count(*) INTO mine FROM public.poker_hole_cards
    WHERE hand_id='bbbbbbbb-0000-0000-0000-000000000001' AND seat_index=1;
  IF n <> 1 OR mine <> 1 THEN
    RAISE EXCEPTION 'A1 FAIL: player B saw % hole-card rows (expected 1=own only)', n;
  END IF;
  RAISE NOTICE 'A1 PASS: hole cards are read-own (B sees only its own).';
END $$;
RESET ROLE;

-- A2. Spectator (uS, not seated, not in hand) reads ZERO hole cards.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.poker_hole_cards;
  IF n <> 0 THEN RAISE EXCEPTION 'A2 FAIL: spectator saw % hole-card rows (expected 0)', n; END IF;
  RAISE NOTICE 'A2 PASS: spectator sees no hole cards.';
END $$;
RESET ROLE;

-- A3. NOBODY (authenticated) can read the deck — no SELECT policy at all.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE n int;
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM public.poker_deck;  -- may raise (no privilege) or return 0
  EXCEPTION WHEN insufficient_privilege THEN
    n := 0;
  END;
  IF n <> 0 THEN RAISE EXCEPTION 'A3 FAIL: a player read % deck rows (expected 0)', n; END IF;
  RAISE NOTICE 'A3 PASS: deck is unreadable by clients.';
END $$;
RESET ROLE;

-- A4. Public data IS readable: table + seats + public hand (board) visible to a spectator.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
DO $$
DECLARE nt int; ns int; nh int;
BEGIN
  SELECT count(*) INTO nt FROM public.poker_tables WHERE id='aaaaaaaa-0000-0000-0000-000000000001';
  SELECT count(*) INTO ns FROM public.poker_seats  WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001';
  SELECT count(*) INTO nh FROM public.poker_hands  WHERE id='bbbbbbbb-0000-0000-0000-000000000001';
  IF nt <> 1 OR ns <> 6 OR nh <> 1 THEN
    RAISE EXCEPTION 'A4 FAIL: public read returned t=% s=% h=% (expected 1/6/1)', nt, ns, nh;
  END IF;
  RAISE NOTICE 'A4 PASS: public table/seat/hand data is readable.';
END $$;
RESET ROLE;

-- A5. Normal user CANNOT update a seat stack (REVOKE + no write policy → permission denied).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.poker_seats SET stack = stack + 999999
      WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=0;
    IF NOT FOUND THEN blocked := true; END IF;  -- RLS filtered → 0 rows
  EXCEPTION WHEN insufficient_privilege OR others THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'A5 FAIL: client updated a seat stack!'; END IF;
  RAISE NOTICE 'A5 PASS: client cannot update stack.';
END $$;
RESET ROLE;

-- A6. Normal user CANNOT update the pot / hand state.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.poker_hands SET pots='{"main":{"amount":999999,"eligibleSeatIndexes":[0]},"sides":[]}'
      WHERE id='bbbbbbbb-0000-0000-0000-000000000001';
    IF NOT FOUND THEN blocked := true; END IF;
  EXCEPTION WHEN insufficient_privilege OR others THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'A6 FAIL: client updated the pot!'; END IF;
  RAISE NOTICE 'A6 PASS: client cannot update the pot.';
END $$;
RESET ROLE;

-- A7. Normal user CANNOT insert a winner / settlement row.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.poker_hand_settlements (hand_id, table_id, payouts)
      VALUES ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
              '[{"seatIndex":0,"amount":999999}]');
  EXCEPTION WHEN insufficient_privilege OR others THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'A7 FAIL: client inserted a settlement/winner!'; END IF;
  RAISE NOTICE 'A7 PASS: client cannot insert a winner.';
END $$;
RESET ROLE;

-- A8. Normal user CANNOT call the trusted settle RPC (REVOKEd from authenticated).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.poker_settle_hand('bbbbbbbb-0000-0000-0000-000000000001','[]'::jsonb);
  EXCEPTION WHEN insufficient_privilege OR others THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'A8 FAIL: client executed poker_settle_hand!'; END IF;
  RAISE NOTICE 'A8 PASS: client cannot call settle RPC.';
END $$;
-- A8b. Normal user CANNOT call the trusted refund RPC either.
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.poker_refund_hand('bbbbbbbb-0000-0000-0000-000000000001');
  EXCEPTION WHEN insufficient_privilege OR others THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'A8b FAIL: client executed poker_refund_hand!'; END IF;
  RAISE NOTICE 'A8b PASS: client cannot call refund RPC.';
END $$;
RESET ROLE;

-- A9. Normal user CANNOT read admin incidents (no policy → 0 rows or denied).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE n int;
BEGIN
  BEGIN SELECT count(*) INTO n FROM public.poker_incidents;
  EXCEPTION WHEN insufficient_privilege THEN n := 0; END;
  IF n <> 0 THEN RAISE EXCEPTION 'A9 FAIL: client read % incident rows', n; END IF;
  RAISE NOTICE 'A9 PASS: client cannot read incidents.';
END $$;
RESET ROLE;

-- A10. Private-table membership enforced: a NON-member (uO) sees NO member rows for ptbl;
--      a member (uA) sees them.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.poker_table_members
    WHERE table_id='aaaaaaaa-0000-0000-0000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'A10a FAIL: non-member saw % private member rows', n; END IF;
  RAISE NOTICE 'A10a PASS: non-member cannot read private membership.';
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.poker_table_members
    WHERE table_id='aaaaaaaa-0000-0000-0000-000000000002';
  IF n < 1 THEN RAISE EXCEPTION 'A10b FAIL: member could not read own membership'; END IF;
  RAISE NOTICE 'A10b PASS: member can read private membership.';
END $$;
RESET ROLE;

-- A11. Private-table password hash is NEVER readable by a client (no policy / no privilege).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE n int;
BEGIN
  BEGIN SELECT count(*) INTO n FROM public.poker_table_secrets;
  EXCEPTION WHEN insufficient_privilege THEN n := 0; END;
  IF n <> 0 THEN RAISE EXCEPTION 'A11 FAIL: client read % password-secret rows', n; END IF;
  RAISE NOTICE 'A11 PASS: password hash is unreadable by clients.';
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════════════
-- PART B — COIN INTEGRITY / IDEMPOTENCY / CONSERVATION TESTS (RPCs)
-- ════════════════════════════════════════════════════════════════════════════════════

-- B1. sit_down escrow: wallet → stack. uA buys in 50_000 on the PUBLIC table seat 2.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE r jsonb; bal bigint; stk bigint;
BEGIN
  r := public.poker_sit_down('aaaaaaaa-0000-0000-0000-000000000001', 2, 50000);
  SELECT balance INTO bal FROM public.game_wallets WHERE user_id='11111111-1111-1111-1111-111111111111';
  SELECT stack   INTO stk FROM public.poker_seats
    WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=2;
  IF bal <> 950000 OR stk <> 50000 OR (r->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'B1 FAIL: bal=% stk=% r=%', bal, stk, r;
  END IF;
  RAISE NOTICE 'B1 PASS: sit-down escrow wallet→stack (bal 950k / stack 50k).';
END $$;

-- B2. sit_down retry is idempotent: a second call moves NOTHING.
DO $$
DECLARE r jsonb; bal bigint; stk bigint;
BEGIN
  r := public.poker_sit_down('aaaaaaaa-0000-0000-0000-000000000001', 2, 50000);
  SELECT balance INTO bal FROM public.game_wallets WHERE user_id='11111111-1111-1111-1111-111111111111';
  SELECT stack   INTO stk FROM public.poker_seats
    WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=2;
  IF bal <> 950000 OR stk <> 50000 OR (r->>'idempotent')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'B2 FAIL: double-escrow! bal=% stk=% r=%', bal, stk, r;
  END IF;
  RAISE NOTICE 'B2 PASS: sit-down retry does not double-escrow.';
END $$;

-- B3. buy-in bounds enforced: below 40 BB (=40_000) is rejected.
DO $$
DECLARE raised boolean := false;
BEGIN
  BEGIN PERFORM public.poker_sit_down('aaaaaaaa-0000-0000-0000-000000000001', 3, 1000);
  EXCEPTION WHEN others THEN raised := true; END;
  IF NOT raised THEN RAISE EXCEPTION 'B3 FAIL: under-min buy-in accepted'; END IF;
  RAISE NOTICE 'B3 PASS: under-min buy-in rejected.';
END $$;
RESET ROLE;

-- B4. stand_up round-trip conserves wallet + stack (uA leaves seat 2 → back to wallet).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE r jsonb; bal bigint; stk bigint;
BEGIN
  r := public.poker_stand_up('aaaaaaaa-0000-0000-0000-000000000001', 2);
  SELECT balance INTO bal FROM public.game_wallets WHERE user_id='11111111-1111-1111-1111-111111111111';
  SELECT stack   INTO stk FROM public.poker_seats
    WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=2;
  IF bal <> 1000000 OR stk <> 0 THEN
    RAISE EXCEPTION 'B4 FAIL: escrow not conserved bal=% stk=%', bal, stk;
  END IF;
  RAISE NOTICE 'B4 PASS: escrow round-trip conserved (wallet back to 1.0M).';
END $$;

-- B5. stand_up idempotent: second call moves nothing, no error.
DO $$
DECLARE r jsonb; bal bigint;
BEGIN
  r := public.poker_stand_up('aaaaaaaa-0000-0000-0000-000000000001', 2);
  SELECT balance INTO bal FROM public.game_wallets WHERE user_id='11111111-1111-1111-1111-111111111111';
  IF bal <> 1000000 OR (r->>'moved')::bigint <> 0 THEN
    RAISE EXCEPTION 'B5 FAIL: idempotent stand-up moved coins r=%', r;
  END IF;
  RAISE NOTICE 'B5 PASS: stand-up is idempotent.';
END $$;
RESET ROLE;

-- B6. Multiway settlement (service role): build a 3-way all-in side-pot scenario by hand.
--   uA seat0 contributes 30_000 (short all-in), uB seat1 100_000, uS seat... we need a 3rd seat.
--   Seat uS at seat 4 with 100_000. Contributions already removed from stacks (simulating bets
--   the server applied). Stacks set to post-bet values; committed_total holds the pot inputs.
RESET ROLE;  -- ensure service role / superuser for setup
-- Seat uA(0) & uB(1) already empty seats; seat them via direct setup (post-contribution state):
UPDATE public.poker_seats SET user_id='11111111-1111-1111-1111-111111111111', status='sitting_in',
  stack=0, committed_total=30000, all_in=true
  WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=0;
UPDATE public.poker_seats SET user_id='22222222-2222-2222-2222-222222222222', status='sitting_in',
  stack=0, committed_total=100000, all_in=true
  WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=1;
UPDATE public.poker_seats SET user_id='33333333-3333-3333-3333-333333333333', status='sitting_in',
  stack=0, committed_total=100000, all_in=true
  WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=4;
-- Pot inputs: 30k + 100k + 100k = 230_000.
--   Main pot (all three eligible): 30k×3 = 90_000.
--   Side pot (uB,uS only):        70k×2 = 140_000.
-- Suppose uA wins main (best hand), uB wins side. Payouts: seat0=90_000, seat1=140_000.
-- Conservation: 90_000 + 140_000 = 230_000 == total contributed. uS gets 0.
DO $$
DECLARE r jsonb; s0 bigint; s1 bigint; s4 bigint;
BEGIN
  r := public.poker_settle_hand(
    'bbbbbbbb-0000-0000-0000-000000000001',
    '[{"seatIndex":0,"amount":90000},{"seatIndex":1,"amount":140000}]'::jsonb,
    '[]'::jsonb,
    230000);
  IF (r->>'settled')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'B6 FAIL: not settled r=%', r; END IF;
  SELECT stack INTO s0 FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=0;
  SELECT stack INTO s1 FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=1;
  SELECT stack INTO s4 FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=4;
  IF s0 <> 90000 OR s1 <> 140000 OR s4 <> 0 THEN
    RAISE EXCEPTION 'B6 FAIL: side-pot payout wrong s0=% s1=% s4=%', s0, s1, s4;
  END IF;
  RAISE NOTICE 'B6 PASS: multiway side-pot settlement sums to pot (90k/140k/0).';
END $$;

-- B7. Settlement idempotency: a SECOND settle of the same hand applies NOTHING.
DO $$
DECLARE r jsonb; s0 bigint;
BEGIN
  r := public.poker_settle_hand(
    'bbbbbbbb-0000-0000-0000-000000000001',
    '[{"seatIndex":0,"amount":90000},{"seatIndex":1,"amount":140000}]'::jsonb,
    '[]'::jsonb, 230000);
  SELECT stack INTO s0 FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=0;
  IF (r->>'settled')::boolean IS NOT FALSE OR s0 <> 90000 THEN
    RAISE EXCEPTION 'B7 FAIL: double settlement! r=% s0=%', r, s0;
  END IF;
  RAISE NOTICE 'B7 PASS: settling twice applies coins once.';
END $$;

-- B8. Conservation guard: a non-conserving payout (sum ≠ total) is REJECTED on a fresh hand.
INSERT INTO public.poker_hands (id, table_id, hand_no, phase)
VALUES ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001', 2, 'SHOWDOWN');
DO $$
DECLARE raised boolean := false; locked int;
BEGIN
  BEGIN
    PERFORM public.poker_settle_hand(
      'bbbbbbbb-0000-0000-0000-000000000002',
      '[{"seatIndex":0,"amount":999999}]'::jsonb, '[]'::jsonb, 230000);
  EXCEPTION WHEN others THEN raised := true; END;
  -- The bad call must raise AND leave NO settlement lock (so a correct retry can still settle).
  SELECT count(*) INTO locked FROM public.poker_hand_settlements
    WHERE hand_id='bbbbbbbb-0000-0000-0000-000000000002';
  IF NOT raised OR locked <> 0 THEN
    RAISE EXCEPTION 'B8 FAIL: non-conserving settle accepted/locked raised=% locked=%', raised, locked;
  END IF;
  RAISE NOTICE 'B8 PASS: non-conserving payout rejected, no lock left behind.';
END $$;

-- B9. Negative stack is structurally impossible (CHECK stack >= 0).
DO $$
DECLARE raised boolean := false;
BEGIN
  BEGIN
    UPDATE public.poker_seats SET stack = -1
      WHERE table_id='aaaaaaaa-0000-0000-0000-000000000001' AND seat_index=0;
  EXCEPTION WHEN check_violation THEN raised := true; END;
  IF NOT raised THEN RAISE EXCEPTION 'B9 FAIL: negative stack allowed'; END IF;
  RAISE NOTICE 'B9 PASS: negative stack blocked by CHECK.';
END $$;

-- B10. Refund idempotency + conservation on a cancelled hand.
--   Fresh table + seats with live contributions; refund returns committed_total to stacks.
INSERT INTO public.poker_tables (id, name, small_blind, big_blind)
VALUES ('aaaaaaaa-0000-0000-0000-000000000003','Refund Test', 500, 1000);
INSERT INTO public.poker_seats (table_id, seat_index, user_id, status, stack, committed_total) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000003', 0, '11111111-1111-1111-1111-111111111111','sitting_in', 0, 5000),
  ('aaaaaaaa-0000-0000-0000-000000000003', 1, '22222222-2222-2222-2222-222222222222','sitting_in', 0, 5000);
INSERT INTO public.poker_hands (id, table_id, hand_no, phase)
VALUES ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000003', 1, 'BETTING');
DO $$
DECLARE r1 jsonb; r2 jsonb; s0 bigint; s1 bigint;
BEGIN
  r1 := public.poker_refund_hand('bbbbbbbb-0000-0000-0000-000000000003');
  r2 := public.poker_refund_hand('bbbbbbbb-0000-0000-0000-000000000003');  -- retry
  SELECT stack INTO s0 FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000003' AND seat_index=0;
  SELECT stack INTO s1 FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000003' AND seat_index=1;
  IF (r1->>'refunded')::boolean IS NOT TRUE OR (r2->>'refunded')::boolean IS NOT FALSE
     OR s0 <> 5000 OR s1 <> 5000 THEN
    RAISE EXCEPTION 'B10 FAIL: refund not idempotent/conserved r1=% r2=% s0=% s1=%', r1, r2, s0, s1;
  END IF;
  RAISE NOTICE 'B10 PASS: refund returns contributions once (idempotent + conserved).';
END $$;

-- B11. Pending top-up: wallet debits NOW, stack unchanged until hand-end finalize folds it in.
--   Fresh table 4 with uB seated (stack 50_000, balance already 1.0M). Top up 20_000.
INSERT INTO public.poker_tables (id, name, small_blind, big_blind)
VALUES ('aaaaaaaa-0000-0000-0000-000000000004','TopUp Test', 500, 1000);
INSERT INTO public.poker_seats (table_id, seat_index, user_id, status, stack) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000004', 1, '22222222-2222-2222-2222-222222222222','sitting_in', 50000);
INSERT INTO public.poker_hands (id, table_id, hand_no, phase)
VALUES ('bbbbbbbb-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000004', 1, 'BETTING');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
DO $$
DECLARE r jsonb; pend bigint; stk bigint; bal bigint;
BEGIN
  r := public.poker_top_up('aaaaaaaa-0000-0000-0000-000000000004', 1, 20000);
  SELECT pending_topup, stack INTO pend, stk FROM public.poker_seats
    WHERE table_id='aaaaaaaa-0000-0000-0000-000000000004' AND seat_index=1;
  SELECT balance INTO bal FROM public.game_wallets WHERE user_id='22222222-2222-2222-2222-222222222222';
  IF pend <> 20000 OR stk <> 50000 OR bal <> 980000 THEN
    RAISE EXCEPTION 'B11a FAIL: top-up not deferred pend=% stk=% bal=%', pend, stk, bal;
  END IF;
  RAISE NOTICE 'B11a PASS: top-up debits wallet now, stack deferred (pending 20k).';
END $$;
RESET ROLE;
-- Finalize the hand (refund path) → pending_topup folds into the stack.
DO $$
DECLARE stk bigint; pend bigint;
BEGIN
  PERFORM public.poker_refund_hand('bbbbbbbb-0000-0000-0000-000000000004');
  SELECT stack, pending_topup INTO stk, pend FROM public.poker_seats
    WHERE table_id='aaaaaaaa-0000-0000-0000-000000000004' AND seat_index=1;
  IF stk <> 70000 OR pend <> 0 THEN
    RAISE EXCEPTION 'B11b FAIL: pending top-up not folded stk=% pend=%', stk, pend;
  END IF;
  RAISE NOTICE 'B11b PASS: pending top-up folds into stack at hand end (70k).';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
SELECT 'ALL POKER DB TESTS PASSED ✅ (transaction will roll back; nothing persists)' AS result;

ROLLBACK;
