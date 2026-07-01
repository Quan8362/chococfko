-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — LIFECYCLE DATABASE TEST HARNESS (seat lifecycle · buy-in · top-up · leave · close)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Run AFTER applying poker_core.sql + poker_private.sql + poker_economy.sql + poker_lifecycle.sql.
--
-- Venue: an ISOLATED database (Supabase preview branch / local stack / SQL editor). The whole
-- script runs in ONE transaction and ROLLs BACK at the end — it persists NOTHING (safe even on
-- a shared DB). Player RPCs run under role `authenticated` with a JWT `sub` claim that
-- auth.uid() reads; service/reaper RPCs run under the setup superuser (RESET ROLE). Any failed
-- assertion RAISEs and aborts → rollback.
--
-- Concurrency note: true parallel races can't run in one session; "simultaneous seat attempts"
-- is exercised as the SERIALIZED outcome the engine guarantees (SELECT … FOR UPDATE + status
-- recheck → exactly one winner). The production guard is the row lock inside each RPC.
--
-- IDs: uA=111… uB=222… uC=333… uO=444… uBroke=555… ;
--      tcap2=…010 (public, capacity 2)  tpriv=…011 (private)  thand=…012 (live-hand)  tclose=…013
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Setup (superuser) ──────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('11111111-1111-1111-1111-111111111111','authenticated','authenticated','a@t.local', now(), now()),
  ('22222222-2222-2222-2222-222222222222','authenticated','authenticated','b@t.local', now(), now()),
  ('33333333-3333-3333-3333-333333333333','authenticated','authenticated','c@t.local', now(), now()),
  ('44444444-4444-4444-4444-444444444444','authenticated','authenticated','o@t.local', now(), now()),
  ('55555555-5555-5555-5555-555555555555','authenticated','authenticated','broke@t.local', now(), now()),
  ('66666666-6666-6666-6666-666666666666','authenticated','authenticated','hand@t.local', now(), now());

INSERT INTO public.game_wallets (user_id, balance) VALUES
  ('11111111-1111-1111-1111-111111111111', 1000000),
  ('22222222-2222-2222-2222-222222222222', 1000000),
  ('33333333-3333-3333-3333-333333333333', 1000000),
  ('44444444-4444-4444-4444-444444444444', 1000000),
  ('55555555-5555-5555-5555-555555555555', 5000),   -- below entry gate (10_000)
  ('66666666-6666-6666-6666-666666666666', 1000000); -- dedicated to L12 (untouched elsewhere)

-- Public capacity-2 table, host = uA. Buy-in range [40_000, 100_000].
INSERT INTO public.poker_tables (id, name, created_by, small_blind, big_blind, capacity)
VALUES ('aaaaaaaa-0000-0000-0000-000000000010','Cap2', '11111111-1111-1111-1111-111111111111', 500, 1000, 2);
INSERT INTO public.poker_seats (table_id, seat_index)
SELECT 'aaaaaaaa-0000-0000-0000-000000000010', g FROM generate_series(0,1) g;

-- Private table (membership-gated).
INSERT INTO public.poker_tables (id, name, small_blind, big_blind, is_private)
VALUES ('aaaaaaaa-0000-0000-0000-000000000011','Priv', 500, 1000, true);
INSERT INTO public.poker_seats (table_id, seat_index)
SELECT 'aaaaaaaa-0000-0000-0000-000000000011', g FROM generate_series(0,5) g;

-- ════════════════════════════════════════════════════════════════════════════════════
-- L1. Reserve a seat → RESERVED + membership row.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE r jsonb; st text; m int;
BEGIN
  r := public.poker_reserve_seat('aaaaaaaa-0000-0000-0000-000000000010', 0);
  SELECT status INTO st FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000010' AND seat_index=0;
  SELECT count(*) INTO m FROM public.poker_table_members WHERE table_id='aaaaaaaa-0000-0000-0000-000000000010' AND user_id='11111111-1111-1111-1111-111111111111';
  IF st <> 'reserved' OR m <> 1 OR (r->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'L1 FAIL: st=% m=% r=%', st, m, r;
  END IF;
  RAISE NOTICE 'L1 PASS: reserve seat → reserved + member.';
END $$;
RESET ROLE;

-- L2. Simultaneous seat attempt (serialized): uB tries the seat uA already holds → rejected.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
DO $$
DECLARE raised boolean := false;
BEGIN
  BEGIN PERFORM public.poker_reserve_seat('aaaaaaaa-0000-0000-0000-000000000010', 0);
  EXCEPTION WHEN others THEN raised := true; END;
  IF NOT raised THEN RAISE EXCEPTION 'L2 FAIL: two players reserved the same seat'; END IF;
  RAISE NOTICE 'L2 PASS: contended seat → exactly one winner.';
END $$;
RESET ROLE;

-- L3. Duplicate join / multi-seat: uA (already on seat 0) cannot reserve seat 1 too.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE raised boolean := false;
BEGIN
  BEGIN PERFORM public.poker_reserve_seat('aaaaaaaa-0000-0000-0000-000000000010', 1);
  EXCEPTION WHEN others THEN raised := true; END;
  IF NOT raised THEN RAISE EXCEPTION 'L3 FAIL: one user took two seats at one table'; END IF;
  RAISE NOTICE 'L3 PASS: one seat per user per table enforced.';
END $$;
RESET ROLE;

-- L4. Buy-in bounds + full table.
--   uA sits (buy-in below min → reject; exact min ok). uB takes the last seat → table full.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE raised boolean := false; r jsonb; stk bigint;
BEGIN
  BEGIN PERFORM public.poker_sit_down('aaaaaaaa-0000-0000-0000-000000000010', 0, 39999);  -- < 40 BB
  EXCEPTION WHEN others THEN raised := true; END;
  IF NOT raised THEN RAISE EXCEPTION 'L4a FAIL: under-min buy-in accepted'; END IF;
  raised := false;
  BEGIN PERFORM public.poker_sit_down('aaaaaaaa-0000-0000-0000-000000000010', 0, 100001); -- > 100 BB
  EXCEPTION WHEN others THEN raised := true; END;
  IF NOT raised THEN RAISE EXCEPTION 'L4b FAIL: over-max buy-in accepted'; END IF;
  r := public.poker_sit_down('aaaaaaaa-0000-0000-0000-000000000010', 0, 40000);            -- exact min ok
  SELECT stack INTO stk FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000010' AND seat_index=0;
  IF stk <> 40000 THEN RAISE EXCEPTION 'L4c FAIL: exact-min buy-in stack=%', stk; END IF;
  RAISE NOTICE 'L4 PASS: buy-in bounds enforced (min/max).';
END $$;
RESET ROLE;
-- uB fills the last seat; then uC cannot find a free seat (full table).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
DO $$ BEGIN PERFORM public.poker_sit_down('aaaaaaaa-0000-0000-0000-000000000010', 1, 50000); END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
DO $$
DECLARE freecnt int; raised boolean := false;
BEGIN
  SELECT count(*) INTO freecnt FROM public.poker_seats
    WHERE table_id='aaaaaaaa-0000-0000-0000-000000000010' AND status='empty';
  IF freecnt <> 0 THEN RAISE EXCEPTION 'L4d FAIL: table not full (free=%)', freecnt; END IF;
  BEGIN PERFORM public.poker_reserve_seat('aaaaaaaa-0000-0000-0000-000000000010', 0);
  EXCEPTION WHEN others THEN raised := true; END;
  IF NOT raised THEN RAISE EXCEPTION 'L4e FAIL: joined a full table'; END IF;
  RAISE NOTICE 'L4 PASS: full table rejects new players.';
END $$;
RESET ROLE;

-- L5. Insufficient wallet: uBroke (balance 5_000) below entry gate (10_000) → rejected.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
DO $$
DECLARE raised boolean := false;
BEGIN
  BEGIN PERFORM public.poker_sit_down('aaaaaaaa-0000-0000-0000-000000000011', 0, 40000);
  EXCEPTION WHEN others THEN raised := true; END;
  IF NOT raised THEN RAISE EXCEPTION 'L5 FAIL: below-entry-gate sit-down accepted'; END IF;
  RAISE NOTICE 'L5 PASS: insufficient wallet / entry gate enforced.';
END $$;
RESET ROLE;

-- L6. Duplicate buy-in: a second sit_down on an already-funded seat moves NOTHING.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE r jsonb; bal bigint; stk bigint;
BEGIN
  r := public.poker_sit_down('aaaaaaaa-0000-0000-0000-000000000010', 0, 40000);  -- retry
  SELECT balance INTO bal FROM public.game_wallets WHERE user_id='11111111-1111-1111-1111-111111111111';
  SELECT stack INTO stk FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000010' AND seat_index=0;
  IF bal <> 960000 OR stk <> 40000 OR (r->>'idempotent')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'L6 FAIL: double buy-in! bal=% stk=% r=%', bal, stk, r;
  END IF;
  RAISE NOTICE 'L6 PASS: duplicate buy-in does not double-debit.';
END $$;

-- L7. Pending top-up + duplicate top-up idempotency (same client token → debit once).
DO $$
DECLARE r jsonb; pend bigint; bal bigint;
BEGIN
  r := public.poker_top_up('aaaaaaaa-0000-0000-0000-000000000010', 0, 20000, 'idem-key-1');
  SELECT pending_topup INTO pend FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000010' AND seat_index=0;
  SELECT balance INTO bal FROM public.game_wallets WHERE user_id='11111111-1111-1111-1111-111111111111';
  IF pend <> 20000 OR bal <> 940000 THEN RAISE EXCEPTION 'L7a FAIL: top-up pend=% bal=%', pend, bal; END IF;

  r := public.poker_top_up('aaaaaaaa-0000-0000-0000-000000000010', 0, 20000, 'idem-key-1');  -- duplicate
  SELECT pending_topup INTO pend FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000010' AND seat_index=0;
  SELECT balance INTO bal FROM public.game_wallets WHERE user_id='11111111-1111-1111-1111-111111111111';
  IF pend <> 20000 OR bal <> 940000 OR (r->>'idempotent')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'L7b FAIL: duplicate top-up debited twice pend=% bal=% r=%', pend, bal, r;
  END IF;
  RAISE NOTICE 'L7 PASS: top-up pending + duplicate token debits once.';
END $$;

-- L7c. Top-up over the table cap (100×BB = 100_000) rejected (stack 40k + pending 20k + 50k > cap).
DO $$
DECLARE raised boolean := false;
BEGIN
  BEGIN PERFORM public.poker_top_up('aaaaaaaa-0000-0000-0000-000000000010', 0, 50000, 'idem-key-2');
  EXCEPTION WHEN others THEN raised := true; END;
  IF NOT raised THEN RAISE EXCEPTION 'L7c FAIL: top-up over cap accepted'; END IF;
  RAISE NOTICE 'L7c PASS: top-up cannot exceed table cap.';
END $$;

-- L8. Sit out → sitting_out; return → sitting_in.
DO $$
DECLARE st text;
BEGIN
  PERFORM public.poker_sit_out('aaaaaaaa-0000-0000-0000-000000000010', 0);
  SELECT status INTO st FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000010' AND seat_index=0;
  IF st <> 'sitting_out' THEN RAISE EXCEPTION 'L8a FAIL: sit-out st=%', st; END IF;
  PERFORM public.poker_return_from_sit_out('aaaaaaaa-0000-0000-0000-000000000010', 0);
  SELECT status INTO st FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000010' AND seat_index=0;
  IF st <> 'sitting_in' THEN RAISE EXCEPTION 'L8b FAIL: return st=%', st; END IF;
  RAISE NOTICE 'L8 PASS: sit-out / return round-trip.';
END $$;

-- L9. Disconnect keeps the seat + stack; reconnect clears the flag (no coin movement).
DO $$
DECLARE dc timestamptz; st text; stk bigint;
BEGIN
  PERFORM public.poker_set_seat_connection('aaaaaaaa-0000-0000-0000-000000000010', 0, false);
  SELECT disconnected_at, status, stack INTO dc, st, stk FROM public.poker_seats
    WHERE table_id='aaaaaaaa-0000-0000-0000-000000000010' AND seat_index=0;
  IF dc IS NULL OR st <> 'sitting_in' OR stk <> 40000 THEN
    RAISE EXCEPTION 'L9a FAIL: disconnect changed seat dc=% st=% stk=%', dc, st, stk;
  END IF;
  PERFORM public.poker_set_seat_connection('aaaaaaaa-0000-0000-0000-000000000010', 0, true);
  SELECT disconnected_at, status, stack INTO dc, st, stk FROM public.poker_seats
    WHERE table_id='aaaaaaaa-0000-0000-0000-000000000010' AND seat_index=0;
  IF dc IS NOT NULL OR st <> 'sitting_in' OR stk <> 40000 THEN
    RAISE EXCEPTION 'L9b FAIL: reconnect not clean dc=% st=% stk=%', dc, st, stk;
  END IF;
  RAISE NOTICE 'L9 PASS: disconnect/reconnect preserves seat + escrow.';
END $$;

-- L10. Post-BB policy: wait ↔ post.
DO $$
DECLARE p text;
BEGIN
  PERFORM public.poker_set_post_bb_policy('aaaaaaaa-0000-0000-0000-000000000010', 0, 'wait');
  SELECT post_bb_policy INTO p FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000010' AND seat_index=0;
  IF p <> 'wait' THEN RAISE EXCEPTION 'L10a FAIL: policy=%', p; END IF;
  PERFORM public.poker_set_post_bb_policy('aaaaaaaa-0000-0000-0000-000000000010', 0, 'post');
  SELECT post_bb_policy INTO p FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000010' AND seat_index=0;
  IF p <> 'post' THEN RAISE EXCEPTION 'L10b FAIL: policy=%', p; END IF;
  RAISE NOTICE 'L10 PASS: post-BB policy wait/post.';
END $$;

-- L11. Leave before a hand: stand-up returns stack+pending to wallet; duplicate cash-out moves 0.
DO $$
DECLARE r jsonb; bal bigint; st text;
BEGIN
  r := public.poker_stand_up('aaaaaaaa-0000-0000-0000-000000000010', 0);   -- stack 40k + pending 20k
  SELECT balance INTO bal FROM public.game_wallets WHERE user_id='11111111-1111-1111-1111-111111111111';
  SELECT status INTO st FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000010' AND seat_index=0;
  IF bal <> 1000000 OR st <> 'empty' THEN RAISE EXCEPTION 'L11a FAIL: leave bal=% st=%', bal, st; END IF;
  r := public.poker_stand_up('aaaaaaaa-0000-0000-0000-000000000010', 0);   -- duplicate cash-out
  SELECT balance INTO bal FROM public.game_wallets WHERE user_id='11111111-1111-1111-1111-111111111111';
  IF bal <> 1000000 OR (r->>'moved')::bigint <> 0 THEN
    RAISE EXCEPTION 'L11b FAIL: duplicate cash-out credited twice bal=% r=%', bal, r;
  END IF;
  RAISE NOTICE 'L11 PASS: leave before hand returns escrow once (idempotent).';
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════════════
-- L12. Leave DURING a hand → LEAVING (queued); stack stays escrowed until settlement, then
--      finalize cashes it out. Build a live hand on a fresh table with hole cards for the seat.
INSERT INTO public.poker_tables (id, name, small_blind, big_blind, capacity, current_hand_id)
VALUES ('aaaaaaaa-0000-0000-0000-000000000012','Hand', 500, 1000, 2, NULL);
INSERT INTO public.poker_seats (table_id, seat_index, user_id, status, stack) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000012', 0, '66666666-6666-6666-6666-666666666666','sitting_in', 60000);
INSERT INTO public.poker_hands (id, table_id, hand_no, phase, street)
VALUES ('bbbbbbbb-0000-0000-0000-000000000012','aaaaaaaa-0000-0000-0000-000000000012', 1, 'BETTING','PREFLOP');
UPDATE public.poker_tables SET current_hand_id='bbbbbbbb-0000-0000-0000-000000000012'
  WHERE id='aaaaaaaa-0000-0000-0000-000000000012';
INSERT INTO public.poker_hole_cards (hand_id, table_id, seat_index, user_id, cards)
VALUES ('bbbbbbbb-0000-0000-0000-000000000012','aaaaaaaa-0000-0000-0000-000000000012',0,'66666666-6666-6666-6666-666666666666','["Ah","Kh"]');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
DO $$
DECLARE r jsonb; st text; stk bigint; bal bigint;
BEGIN
  r := public.poker_stand_up('aaaaaaaa-0000-0000-0000-000000000012', 0);  -- mid-hand → queued
  SELECT status, stack INTO st, stk FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000012' AND seat_index=0;
  SELECT balance INTO bal FROM public.game_wallets WHERE user_id='66666666-6666-6666-6666-666666666666';
  IF st <> 'leaving' OR stk <> 60000 OR (r->>'queued')::boolean IS NOT TRUE OR bal <> 1000000 THEN
    RAISE EXCEPTION 'L12a FAIL: mid-hand leave not queued st=% stk=% bal=% r=%', st, stk, bal, r;
  END IF;
  RAISE NOTICE 'L12a PASS: leave during hand → LEAVING, stack still escrowed.';
END $$;
RESET ROLE;
-- Settle/refund the hand → finalize executes the queued stand-up (stack → wallet, seat freed).
DO $$
DECLARE st text; bal bigint;
BEGIN
  PERFORM public.poker_refund_hand('bbbbbbbb-0000-0000-0000-000000000012');
  SELECT status INTO st FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000012' AND seat_index=0;
  SELECT balance INTO bal FROM public.game_wallets WHERE user_id='66666666-6666-6666-6666-666666666666';
  IF st <> 'empty' OR bal <> 1060000 THEN
    RAISE EXCEPTION 'L12b FAIL: queued leave not cashed out at settlement st=% bal=%', st, bal;
  END IF;
  RAISE NOTICE 'L12b PASS: queued leave cashes out at settlement (escrow conserved).';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- L13. Safe table closure: host closes a table with a seated player (no live hand) → every
--      stack returns to its wallet, table → CLOSED.
INSERT INTO public.poker_tables (id, name, created_by, small_blind, big_blind, capacity)
VALUES ('aaaaaaaa-0000-0000-0000-000000000013','Close', '33333333-3333-3333-3333-333333333333', 500, 1000, 2);
INSERT INTO public.poker_seats (table_id, seat_index, user_id, status, stack) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000013', 0, '33333333-3333-3333-3333-333333333333','sitting_in', 50000);
INSERT INTO public.poker_seats (table_id, seat_index) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000013', 1);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
DO $$
DECLARE r jsonb; tstat text; bal bigint; occ int;
BEGIN
  r := public.poker_close_table('aaaaaaaa-0000-0000-0000-000000000013');
  SELECT status INTO tstat FROM public.poker_tables WHERE id='aaaaaaaa-0000-0000-0000-000000000013';
  SELECT balance INTO bal FROM public.game_wallets WHERE user_id='33333333-3333-3333-3333-333333333333';
  SELECT count(*) INTO occ FROM public.poker_seats WHERE table_id='aaaaaaaa-0000-0000-0000-000000000013' AND user_id IS NOT NULL;
  IF tstat <> 'closed' OR bal <> 1050000 OR occ <> 0 THEN
    RAISE EXCEPTION 'L13 FAIL: close not safe tstat=% bal=% occ=% r=%', tstat, bal, occ, r;
  END IF;
  RAISE NOTICE 'L13 PASS: safe closure returns all stacks → CLOSED.';
END $$;
RESET ROLE;

-- L13b. A non-host cannot close someone else's table.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
DO $$
DECLARE raised boolean := false;
BEGIN
  BEGIN PERFORM public.poker_close_table('aaaaaaaa-0000-0000-0000-000000000010');
  EXCEPTION WHEN others THEN raised := true; END;
  IF NOT raised THEN RAISE EXCEPTION 'L13b FAIL: non-host closed a table'; END IF;
  RAISE NOTICE 'L13b PASS: only the host may close.';
END $$;
RESET ROLE;

-- L14a. Reservation cleanup releases an expired RESERVED seat (own table, no reap).
-- NOTE: the updated_at trigger refreshes seat.updated_at on this cleanup UPDATE, so this table
-- is intentionally NOT reaped here (that would reset its idle clock). Reaping is L14b, separately.
INSERT INTO public.poker_tables (id, name, small_blind, big_blind, capacity)
VALUES ('aaaaaaaa-0000-0000-0000-000000000016','CleanOnly', 500, 1000, 2);
INSERT INTO public.poker_seats (table_id, seat_index, status, reserved_by, reserved_until) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000016', 0, 'reserved', '44444444-4444-4444-4444-444444444444', now() - interval '5 minutes');
INSERT INTO public.poker_seats (table_id, seat_index) VALUES ('aaaaaaaa-0000-0000-0000-000000000016', 1);
DO $$
DECLARE r jsonb; freecnt int;
BEGIN
  r := public.poker_clean_expired_reservations('aaaaaaaa-0000-0000-0000-000000000016');
  IF (r->>'released')::int <> 1 THEN RAISE EXCEPTION 'L14a FAIL: released=%', r->>'released'; END IF;
  SELECT count(*) INTO freecnt FROM public.poker_seats
    WHERE table_id='aaaaaaaa-0000-0000-0000-000000000016' AND status='empty';
  IF freecnt <> 2 THEN RAISE EXCEPTION 'L14a FAIL: expired reservation not released free=%', freecnt; END IF;
  RAISE NOTICE 'L14a PASS: expired reservation released.';
END $$;

-- L14b. Idle-table reap on a SEPARATE empty, hand-free, idle table. The reaper cleans its own
-- expired reservation internally (measured BEFORE cleanup) and closes — no external pre-clean.
INSERT INTO public.poker_tables (id, name, small_blind, big_blind, capacity, updated_at)
VALUES ('aaaaaaaa-0000-0000-0000-000000000014','Idle', 500, 1000, 2, now() - interval '2 hours');
INSERT INTO public.poker_seats (table_id, seat_index, status, reserved_by, reserved_until, updated_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000014', 0, 'reserved', '44444444-4444-4444-4444-444444444444', now() - interval '5 minutes', now() - interval '2 hours');
INSERT INTO public.poker_seats (table_id, seat_index, updated_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000014', 1, now() - interval '2 hours');
DO $$
DECLARE r jsonb; tstat text; freecnt int;
BEGIN
  r := public.poker_reap_idle_table('aaaaaaaa-0000-0000-0000-000000000014', 600);
  SELECT status INTO tstat FROM public.poker_tables WHERE id='aaaaaaaa-0000-0000-0000-000000000014';
  SELECT count(*) INTO freecnt FROM public.poker_seats
    WHERE table_id='aaaaaaaa-0000-0000-0000-000000000014' AND status='empty';
  IF tstat <> 'closed' OR freecnt <> 2 THEN
    RAISE EXCEPTION 'L14b FAIL: idle empty table not reaped tstat=% free=%', tstat, freecnt;
  END IF;
  RAISE NOTICE 'L14b PASS: idle empty table reaped → CLOSED + reservation cleaned.';
END $$;

-- L15. Closure refuses to cash out under a LIVE hand (must settle first — E1).
DO $$
DECLARE r jsonb; tstat text;
BEGIN
  -- table …012 still references a hand row; reuse by re-pointing to a fresh live hand.
  -- Realistic precondition: resolve_closing only ever runs on a table the host/reaper has already
  -- put into 'closing' (settle_hand no-ops it on any other status — see migration_poker_resolve_
  -- closing_fix.sql). A live hand on a *closing* table must still refuse to cash out (E1).
  INSERT INTO public.poker_hands (id, table_id, hand_no, phase)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000015','aaaaaaaa-0000-0000-0000-000000000012', 2, 'BETTING');
  UPDATE public.poker_tables SET status='closing', current_hand_id='bbbbbbbb-0000-0000-0000-000000000015'
    WHERE id='aaaaaaaa-0000-0000-0000-000000000012';
  r := public.poker_resolve_closing('aaaaaaaa-0000-0000-0000-000000000012');
  SELECT status INTO tstat FROM public.poker_tables WHERE id='aaaaaaaa-0000-0000-0000-000000000012';
  IF (r->>'ok')::boolean IS NOT FALSE OR tstat = 'closed' THEN
    RAISE EXCEPTION 'L15 FAIL: closed a table mid-hand r=% tstat=%', r, tstat;
  END IF;
  RAISE NOTICE 'L15 PASS: closure refuses to abandon a live hand.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
SELECT 'ALL POKER LIFECYCLE DB TESTS PASSED ✅ (transaction will roll back; nothing persists)' AS result;

ROLLBACK;
