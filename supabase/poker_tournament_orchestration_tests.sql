-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — TOURNAMENT ORCHESTRATION TEST HARNESS
-- seating · chip conservation · WALLET ISOLATION · apply-hand idempotency · non-conservation reject
-- · elimination-once + places · move-seat stack carry · level monotonicity · service-role authz
-- ════════════════════════════════════════════════════════════════════════════════════
-- Run AFTER: prereq (game_wallets, coin_ledger) + migration_poker_tournament.sql +
-- migration_poker_tournament_orchestration.sql. One transaction, ROLLBACK at end (persists nothing).
-- Any failed assertion RAISEs → whole run rolls back and psql exits non-zero.
-- ════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── Setup (superuser) ──────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('a0000000-0000-0000-0000-00000000000a','authenticated','authenticated','a@o.local', now(), now()),
  ('b0000000-0000-0000-0000-00000000000b','authenticated','authenticated','b@o.local', now(), now()),
  ('c0000000-0000-0000-0000-00000000000c','authenticated','authenticated','c@o.local', now(), now()),
  ('d0000000-0000-0000-0000-00000000000d','authenticated','authenticated','d@o.local', now(), now()),
  ('e0000000-0000-0000-0000-00000000000e','authenticated','authenticated','e@o.local', now(), now()),
  ('f0000000-0000-0000-0000-00000000000f','authenticated','authenticated','f@o.local', now(), now());

INSERT INTO public.game_wallets (user_id, balance) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 100000),
  ('b0000000-0000-0000-0000-00000000000b', 100000),
  ('c0000000-0000-0000-0000-00000000000c', 100000),
  ('d0000000-0000-0000-0000-00000000000d', 100000),
  ('e0000000-0000-0000-0000-00000000000e', 100000),
  ('f0000000-0000-0000-0000-00000000000f', 100000);

-- Tournament in STARTING; seats_per_table 3, starting_stack 5000 → 6 entries = 2 tables of 3.
INSERT INTO public.poker_tournaments
  (id, title, state, entry_fee, starting_stack, min_entries, max_entries, seats_per_table, config, guaranteed_prize_pool)
VALUES
  ('11111111-0000-0000-0000-000000000001','O','STARTING', 1000, 5000, 2, 6, 3, '{}'::jsonb, 0);

INSERT INTO public.poker_tournament_entries (tournament_id, user_id, seq, state, chips, entry_fee)
SELECT '11111111-0000-0000-0000-000000000001', u, 0, 'REGISTERED', 0, 1000
FROM (VALUES
  ('a0000000-0000-0000-0000-00000000000a'::uuid),('b0000000-0000-0000-0000-00000000000b'::uuid),
  ('c0000000-0000-0000-0000-00000000000c'::uuid),('d0000000-0000-0000-0000-00000000000d'::uuid),
  ('e0000000-0000-0000-0000-00000000000e'::uuid),('f0000000-0000-0000-0000-00000000000f'::uuid)) v(u);

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-ORCH-001 seat_draw seats all 6, conserves chips (6*5000=30000), balances tables ≤1
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_seated int; v_sum bigint; v_tbls int; v_min int; v_max int;
BEGIN
  v_seated := public.poker_tournament_seat_draw('11111111-0000-0000-0000-000000000001');
  IF v_seated <> 6 THEN RAISE EXCEPTION 'ORCH-001: seated=% (want 6)', v_seated; END IF;
  SELECT COUNT(*), SUM(stack) INTO v_tbls, v_sum FROM public.poker_tournament_seats
    WHERE tournament_id='11111111-0000-0000-0000-000000000001';
  IF v_tbls <> 6 THEN RAISE EXCEPTION 'ORCH-001: seat rows=% (want 6)', v_tbls; END IF;
  IF v_sum <> 30000 THEN RAISE EXCEPTION 'ORCH-001: chip sum=% (want 30000)', v_sum; END IF;
  SELECT MIN(c), MAX(c) INTO v_min, v_max FROM (
    SELECT COUNT(*) c FROM public.poker_tournament_seats
    WHERE tournament_id='11111111-0000-0000-0000-000000000001' GROUP BY table_no) q;
  IF v_max - v_min > 1 THEN RAISE EXCEPTION 'ORCH-001: table imbalance min=% max=%', v_min, v_max; END IF;
  IF EXISTS (SELECT 1 FROM public.poker_tournament_entries
             WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND (state<>'SEATED' OR chips<>5000)) THEN
    RAISE EXCEPTION 'ORCH-001: entries not all SEATED with 5000 chips';
  END IF;
  RAISE NOTICE 'ORCH-001 PASS seat_draw seats=6 sum=30000 balanced';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-ORCH-002 seat_draw idempotent (re-run seats nobody new)
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v int;
BEGIN
  PERFORM public.poker_tournament_seat_draw('11111111-0000-0000-0000-000000000001');
  SELECT COUNT(*) INTO v FROM public.poker_tournament_seats WHERE tournament_id='11111111-0000-0000-0000-000000000001';
  IF v <> 6 THEN RAISE EXCEPTION 'ORCH-002: seat rows changed to %', v; END IF;
  RAISE NOTICE 'ORCH-002 PASS seat_draw idempotent';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-ORCH-003 start_hand + apply_hand_result move chips within a table (conserving)
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_hand uuid; s0 bigint; s1 bigint; s2 bigint; tsum bigint;
BEGIN
  v_hand := public.poker_tournament_start_hand('11111111-0000-0000-0000-000000000001', 1, 0, 25, 50, 0, 'sh:T:1:1');
  PERFORM public.poker_tournament_apply_hand_result('11111111-0000-0000-0000-000000000001', v_hand,
    '[{"seat_index":0,"delta":100},{"seat_index":1,"delta":-50},{"seat_index":2,"delta":-50}]'::jsonb, 'ah:T:1:1');
  SELECT stack INTO s0 FROM public.poker_tournament_seats WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND table_no=1 AND seat_index=0;
  SELECT stack INTO s1 FROM public.poker_tournament_seats WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND table_no=1 AND seat_index=1;
  SELECT stack INTO s2 FROM public.poker_tournament_seats WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND table_no=1 AND seat_index=2;
  IF s0<>5100 OR s1<>4950 OR s2<>4950 THEN RAISE EXCEPTION 'ORCH-003: stacks %/%/% (want 5100/4950/4950)', s0,s1,s2; END IF;
  SELECT SUM(stack) INTO tsum FROM public.poker_tournament_seats WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND table_no=1;
  IF tsum <> 15000 THEN RAISE EXCEPTION 'ORCH-003: table1 sum=% (want 15000)', tsum; END IF;
  IF NOT (SELECT settled FROM public.poker_tournament_hands WHERE id=v_hand) THEN RAISE EXCEPTION 'ORCH-003: hand not settled'; END IF;
  RAISE NOTICE 'ORCH-003 PASS apply_hand_result conserves + settles';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-ORCH-004 apply_hand_result idempotent (retry same key does NOT move chips again)
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_hand uuid; s0 bigint;
BEGIN
  SELECT id INTO v_hand FROM public.poker_tournament_hands WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND table_no=1 AND hand_no=1;
  PERFORM public.poker_tournament_apply_hand_result('11111111-0000-0000-0000-000000000001', v_hand,
    '[{"seat_index":0,"delta":100},{"seat_index":1,"delta":-50},{"seat_index":2,"delta":-50}]'::jsonb, 'ah:T:1:1');
  SELECT stack INTO s0 FROM public.poker_tournament_seats WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND table_no=1 AND seat_index=0;
  IF s0 <> 5100 THEN RAISE EXCEPTION 'ORCH-004: idempotency broke, seat0=% (want 5100)', s0; END IF;
  RAISE NOTICE 'ORCH-004 PASS apply_hand_result idempotent';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-ORCH-005 non-conserving deltas are REJECTED
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_hand uuid; ok boolean := false;
BEGIN
  v_hand := public.poker_tournament_start_hand('11111111-0000-0000-0000-000000000001', 1, 0, 25, 50, 0, 'sh:T:1:2');
  BEGIN
    PERFORM public.poker_tournament_apply_hand_result('11111111-0000-0000-0000-000000000001', v_hand,
      '[{"seat_index":0,"delta":100},{"seat_index":1,"delta":-50}]'::jsonb, 'ah:T:1:2');
  EXCEPTION WHEN others THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'ORCH-005: non-conserving deltas were NOT rejected'; END IF;
  RAISE NOTICE 'ORCH-005 PASS non-conserving deltas rejected';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-ORCH-006 eliminate: bust a seat to 0 → ELIMINATED with finishing place (once)
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_hand uuid; v_elim int; v_place int; v_state text; s1 bigint; v_again int; v_busted uuid; v_freed int;
BEGIN
  -- Capture the entry that will bust BEFORE it is vacated (table1 seat1).
  SELECT entry_id INTO v_busted FROM public.poker_tournament_seats
    WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND table_no=1 AND seat_index=1;
  -- Move all of table1 seat1's chips (4950) to seat0 → seat1 busts.
  v_hand := public.poker_tournament_start_hand('11111111-0000-0000-0000-000000000001', 1, 0, 25, 50, 0, 'sh:T:1:3');
  PERFORM public.poker_tournament_apply_hand_result('11111111-0000-0000-0000-000000000001', v_hand,
    '[{"seat_index":0,"delta":4950},{"seat_index":1,"delta":-4950}]'::jsonb, 'ah:T:1:3');
  SELECT stack INTO s1 FROM public.poker_tournament_seats WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND table_no=1 AND seat_index=1;
  IF s1 <> 0 THEN RAISE EXCEPTION 'ORCH-006: seat1 stack=% (want 0)', s1; END IF;
  v_elim := public.poker_tournament_eliminate('11111111-0000-0000-0000-000000000001');
  IF v_elim < 1 THEN RAISE EXCEPTION 'ORCH-006: eliminate returned %', v_elim; END IF;
  -- Verify the busted ENTRY (authoritative record) is ELIMINATED with place 6.
  SELECT state, finishing_place INTO v_state, v_place FROM public.poker_tournament_entries WHERE id=v_busted;
  IF v_state <> 'ELIMINATED' THEN RAISE EXCEPTION 'ORCH-006: busted entry state=% (want ELIMINATED)', v_state; END IF;
  IF v_place <> 6 THEN RAISE EXCEPTION 'ORCH-006: finishing_place=% (want 6)', v_place; END IF;
  -- The physical seat is vacated (freed for balancing).
  SELECT COUNT(*) INTO v_freed FROM public.poker_tournament_seats
    WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND table_no=1 AND seat_index=1;
  IF v_freed <> 0 THEN RAISE EXCEPTION 'ORCH-006: busted seat not vacated (rows=%)', v_freed; END IF;
  -- idempotent: a second eliminate assigns no new place to that entry
  v_again := public.poker_tournament_eliminate('11111111-0000-0000-0000-000000000001');
  IF v_again <> 0 THEN RAISE EXCEPTION 'ORCH-006: re-eliminate added % (want 0)', v_again; END IF;
  RAISE NOTICE 'ORCH-006 PASS eliminate place=6 once, seat vacated, idempotent';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-ORCH-007 move_seat carries the chip stack to a new (table,seat)
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_entry uuid; v_stack bigint; v_newtbl int; v_newseat int; v_newstack bigint;
BEGIN
  SELECT entry_id, stack INTO v_entry, v_stack FROM public.poker_tournament_seats
    WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND table_no=2 AND seat_index=2;
  PERFORM public.poker_tournament_move_seat('11111111-0000-0000-0000-000000000001', v_entry, 1, 1, 'mv:T:1');
  SELECT table_no, seat_index, stack INTO v_newtbl, v_newseat, v_newstack FROM public.poker_tournament_seats
    WHERE tournament_id='11111111-0000-0000-0000-000000000001' AND entry_id=v_entry;
  IF v_newtbl<>1 OR v_newseat<>1 OR v_newstack<>v_stack THEN
    RAISE EXCEPTION 'ORCH-007: move landed %/%/% (want 1/1/%)', v_newtbl,v_newseat,v_newstack,v_stack; END IF;
  RAISE NOTICE 'ORCH-007 PASS move_seat carries stack';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-ORCH-008 advance_level monotonic (forward ok, backward rejected)
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE ok boolean := false; v_lvl int;
BEGIN
  PERFORM public.poker_tournament_advance_level('11111111-0000-0000-0000-000000000001', 1);
  SELECT current_level_index INTO v_lvl FROM public.poker_tournaments WHERE id='11111111-0000-0000-0000-000000000001';
  IF v_lvl <> 1 THEN RAISE EXCEPTION 'ORCH-008: level=% (want 1)', v_lvl; END IF;
  BEGIN
    PERFORM public.poker_tournament_advance_level('11111111-0000-0000-0000-000000000001', 0);
  EXCEPTION WHEN others THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'ORCH-008: backward level NOT rejected'; END IF;
  RAISE NOTICE 'ORCH-008 PASS advance_level monotonic';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-ORCH-009 AUTHZ: neither authenticated nor anon may execute orchestration RPCs
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE ok boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  BEGIN
    PERFORM public.poker_tournament_seat_draw('11111111-0000-0000-0000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; WHEN others THEN ok := true;
  END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'ORCH-009: authenticated COULD call seat_draw (must be denied)'; END IF;
  RAISE NOTICE 'ORCH-009 PASS authenticated denied orchestration RPC';
END $$;

DO $$
DECLARE ok boolean := false;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.poker_tournament_eliminate('11111111-0000-0000-0000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; WHEN others THEN ok := true;
  END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'ORCH-009b: anon COULD call eliminate (must be denied)'; END IF;
  RAISE NOTICE 'ORCH-009b PASS anon denied orchestration RPC';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TNMT-ORCH-010 WALLET ISOLATION: no hand/seat/eliminate/move touched wallets or ledger
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_bad int; v_ledger int; v_totchips bigint;
BEGIN
  SELECT COUNT(*) INTO v_bad FROM public.game_wallets WHERE balance <> 100000;
  IF v_bad <> 0 THEN RAISE EXCEPTION 'ORCH-010: % wallet balances changed (must be 0 — hands never touch wallets)', v_bad; END IF;
  SELECT COUNT(*) INTO v_ledger FROM public.coin_ledger;
  IF v_ledger <> 0 THEN RAISE EXCEPTION 'ORCH-010: coin_ledger has % rows (must be 0 — no hand writes coins)', v_ledger; END IF;
  -- Global chip conservation preserved across every op: 6 seats * 5000 = 30000.
  SELECT SUM(stack) INTO v_totchips FROM public.poker_tournament_seats WHERE tournament_id='11111111-0000-0000-0000-000000000001';
  IF v_totchips <> 30000 THEN RAISE EXCEPTION 'ORCH-010: total chips=% (want 30000 conserved)', v_totchips; END IF;
  RAISE NOTICE 'ORCH-010 PASS WALLET ISOLATION — wallets & ledger untouched; chips conserved 30000';
END $$;

DO $$ BEGIN RAISE NOTICE '==== ALL ORCHESTRATION ASSERTIONS PASSED ===='; END $$;
ROLLBACK;
