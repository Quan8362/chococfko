-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — TOURNAMENT REALTIME + PRIVATE-STATE SEAL TEST HARNESS (E3A-3C)
-- pointer bump monotonicity · non-secret mirror · service-role-only touch · seed/hand SEAL
-- (client cannot read seed or hand state) · realtime publication membership · WALLET ISOLATION
-- across a full live mini-flow (seat_draw → start_hand → touch → apply_hand_result → eliminate →
-- advance_level).
-- ════════════════════════════════════════════════════════════════════════════════════
-- Run AFTER: migration_poker_tournament.sql + migration_poker_tournament_orchestration.sql +
-- migration_poker_tournament_realtime.sql. One transaction, ROLLBACK at end (persists nothing).
-- Any failed assertion RAISEs → whole run rolls back and psql exits non-zero.
-- ════════════════════════════════════════════════════════════════════════════════════
BEGIN;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('a0000000-0000-0000-0000-0000000000a1','authenticated','authenticated','rt-a@o.local', now(), now()),
  ('b0000000-0000-0000-0000-0000000000b1','authenticated','authenticated','rt-b@o.local', now(), now());

INSERT INTO public.game_wallets (user_id, balance) VALUES
  ('a0000000-0000-0000-0000-0000000000a1', 100000),
  ('b0000000-0000-0000-0000-0000000000b1', 100000);

-- Heads-up tournament in STARTING (so seat_draw is legal): seats_per_table 2, starting_stack 5000.
-- RT-006 flips it to RUNNING after seating, mirroring the real operator lifecycle.
INSERT INTO public.poker_tournaments
  (id, title, state, entry_fee, starting_stack, min_entries, max_entries, seats_per_table, config, guaranteed_prize_pool)
VALUES
  ('22222222-0000-0000-0000-000000000002','RT','STARTING', 1000, 5000, 2, 2, 2, '{}'::jsonb, 0);

INSERT INTO public.poker_tournament_entries (tournament_id, user_id, seq, state, chips, entry_fee)
VALUES
  ('22222222-0000-0000-0000-000000000002','a0000000-0000-0000-0000-0000000000a1',0,'REGISTERED',0,1000),
  ('22222222-0000-0000-0000-000000000002','b0000000-0000-0000-0000-0000000000b1',0,'REGISTERED',0,1000);

-- ════════════════════════════════════════════════════════════════════════════════════
-- RT-001 touch_table bumps version monotonically + refreshes the non-secret mirror
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v1 bigint; v2 bigint; v3 bigint; m_state text; m_level int; m_hand int;
BEGIN
  v1 := public.poker_tournament_touch_table('22222222-0000-0000-0000-000000000002', 1, 1, 'RUNNING', 0);
  v2 := public.poker_tournament_touch_table('22222222-0000-0000-0000-000000000002', 1, 1, 'RUNNING', 0);
  v3 := public.poker_tournament_touch_table('22222222-0000-0000-0000-000000000002', 1, 2, 'BREAK', 3);
  IF NOT (v1 = 1 AND v2 = 2 AND v3 = 3) THEN RAISE EXCEPTION 'RT-001: versions %/%/% (want 1/2/3)', v1,v2,v3; END IF;
  SELECT tournament_state, level_index, hand_no INTO m_state, m_level, m_hand
    FROM public.poker_tournament_table_state
    WHERE tournament_id='22222222-0000-0000-0000-000000000002' AND table_no=1;
  IF m_state <> 'BREAK' OR m_level <> 3 OR m_hand <> 2 THEN
    RAISE EXCEPTION 'RT-001: mirror state=%/level=%/hand=% (want BREAK/3/2)', m_state, m_level, m_hand;
  END IF;
  -- hand_no never regresses (GREATEST guard)
  PERFORM public.poker_tournament_touch_table('22222222-0000-0000-0000-000000000002', 1, 1, 'RUNNING', 4);
  SELECT hand_no INTO m_hand FROM public.poker_tournament_table_state
    WHERE tournament_id='22222222-0000-0000-0000-000000000002' AND table_no=1;
  IF m_hand <> 2 THEN RAISE EXCEPTION 'RT-001: hand_no regressed to %', m_hand; END IF;
  RAISE NOTICE 'RT-001 PASS touch bumps monotonically + mirrors non-secret state';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- RT-002 the pointer carries NO secret column (only version/hand/state/level/updated_at)
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_bad int;
BEGIN
  SELECT COUNT(*) INTO v_bad FROM information_schema.columns
   WHERE table_schema='public' AND table_name='poker_tournament_table_state'
     AND column_name IN ('seed','state','hole','cards','deck','public_view');
  IF v_bad <> 0 THEN RAISE EXCEPTION 'RT-002: pointer table exposes % secret-ish column(s)', v_bad; END IF;
  RAISE NOTICE 'RT-002 PASS pointer table has no secret column';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- RT-003 SEAL: authenticated/anon cannot read the tournament seed nor any hand row, but CAN
-- read the non-secret lobby columns + the pointer.
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF has_column_privilege('authenticated','public.poker_tournaments','seed','SELECT') THEN
    RAISE EXCEPTION 'RT-003: authenticated can read tournaments.seed'; END IF;
  IF has_column_privilege('anon','public.poker_tournaments','seed','SELECT') THEN
    RAISE EXCEPTION 'RT-003: anon can read tournaments.seed'; END IF;
  IF NOT has_column_privilege('authenticated','public.poker_tournaments','title','SELECT') THEN
    RAISE EXCEPTION 'RT-003: authenticated lost lobby read (title)'; END IF;
  IF has_table_privilege('authenticated','public.poker_tournament_hands','SELECT') THEN
    RAISE EXCEPTION 'RT-003: authenticated can read hand rows (seed leak)'; END IF;
  IF has_table_privilege('anon','public.poker_tournament_hands','SELECT') THEN
    RAISE EXCEPTION 'RT-003: anon can read hand rows (seed leak)'; END IF;
  IF NOT has_table_privilege('authenticated','public.poker_tournament_table_state','SELECT') THEN
    RAISE EXCEPTION 'RT-003: authenticated cannot read the pointer'; END IF;
  RAISE NOTICE 'RT-003 PASS seed + hand rows sealed; lobby + pointer readable';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- RT-004 service-role-only authority: touch + writes to the pointer are denied to clients
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF has_function_privilege('anon','public.poker_tournament_touch_table(uuid,int,int,text,int)','EXECUTE')
     OR has_function_privilege('authenticated','public.poker_tournament_touch_table(uuid,int,int,text,int)','EXECUTE') THEN
    RAISE EXCEPTION 'RT-004: touch_table executable by a client role'; END IF;
  IF NOT has_function_privilege('service_role','public.poker_tournament_touch_table(uuid,int,int,text,int)','EXECUTE') THEN
    RAISE EXCEPTION 'RT-004: service_role cannot execute touch_table'; END IF;
  IF has_table_privilege('authenticated','public.poker_tournament_table_state','INSERT')
     OR has_table_privilege('authenticated','public.poker_tournament_table_state','UPDATE')
     OR has_table_privilege('authenticated','public.poker_tournament_table_state','DELETE') THEN
    RAISE EXCEPTION 'RT-004: authenticated can write the pointer'; END IF;
  RAISE NOTICE 'RT-004 PASS pointer + touch are service-role only';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- RT-005 realtime publication membership: exactly the NON-SECRET tables are published; the
-- seed-bearing tournament + hand rows are NOT.
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v int;
BEGIN
  SELECT COUNT(*) INTO v FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public'
      AND tablename IN ('poker_tournament_seats','poker_tournament_entries','poker_tournament_table_state');
  IF v <> 3 THEN RAISE EXCEPTION 'RT-005: expected 3 published non-secret tables, got %', v; END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname='supabase_realtime' AND schemaname='public'
               AND tablename IN ('poker_tournaments','poker_tournament_hands')) THEN
    RAISE EXCEPTION 'RT-005: a seed-bearing table is published to realtime';
  END IF;
  RAISE NOTICE 'RT-005 PASS only non-secret tables published';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- RT-006 FULL LIVE MINI-FLOW under WALLET ISOLATION: seat_draw → start_hand → touch →
-- apply_hand_result → eliminate → advance_level. game_wallets + coin_ledger MUST be untouched;
-- chips conserve; elimination assigns place + frees the seat; pointer version advances.
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  w_before bigint; w_after bigint; l_before bigint; l_after bigint;
  v_hand uuid; v0 bigint; v1 bigint; s_win bigint; s_lose int; place int; live int;
  pv_before bigint; pv_after bigint;
BEGIN
  SELECT COALESCE(SUM(balance),0) INTO w_before FROM public.game_wallets;
  SELECT COUNT(*) INTO l_before FROM public.coin_ledger;

  IF public.poker_tournament_seat_draw('22222222-0000-0000-0000-000000000002') <> 2 THEN
    RAISE EXCEPTION 'RT-006: seat_draw did not seat 2'; END IF;
  -- Operator begins play (STARTING → RUNNING) before hands may run.
  UPDATE public.poker_tournaments SET state='RUNNING' WHERE id='22222222-0000-0000-0000-000000000002';

  SELECT version INTO pv_before FROM public.poker_tournament_table_state
    WHERE tournament_id='22222222-0000-0000-0000-000000000002' AND table_no=1;

  v_hand := public.poker_tournament_start_hand('22222222-0000-0000-0000-000000000002', 1, 0, 25, 50, 0, 'sh:RT:1:1');
  PERFORM public.poker_tournament_touch_table('22222222-0000-0000-0000-000000000002', 1, 1, 'RUNNING', 0);

  -- seat 0 busts seat 1 (heads-up): winner +5000, loser -5000 (conserving).
  PERFORM public.poker_tournament_apply_hand_result('22222222-0000-0000-0000-000000000002', v_hand,
    '[{"seat_index":0,"delta":5000},{"seat_index":1,"delta":-5000}]'::jsonb, 'ah:RT:1:1');
  SELECT stack INTO s_win FROM public.poker_tournament_seats
    WHERE tournament_id='22222222-0000-0000-0000-000000000002' AND table_no=1 AND seat_index=0;
  IF s_win <> 10000 THEN RAISE EXCEPTION 'RT-006: winner stack=% (want 10000)', s_win; END IF;

  -- eliminate: seat 1 (stack 0) → ELIMINATED with finishing_place=2, seat vacated.
  PERFORM public.poker_tournament_eliminate('22222222-0000-0000-0000-000000000002');
  SELECT finishing_place INTO place FROM public.poker_tournament_entries
    WHERE tournament_id='22222222-0000-0000-0000-000000000002' AND user_id='b0000000-0000-0000-0000-0000000000b1';
  IF place <> 2 THEN RAISE EXCEPTION 'RT-006: eliminated place=% (want 2)', place; END IF;
  SELECT COUNT(*) INTO s_lose FROM public.poker_tournament_seats
    WHERE tournament_id='22222222-0000-0000-0000-000000000002' AND seat_index=1;
  IF s_lose <> 0 THEN RAISE EXCEPTION 'RT-006: busted seat not vacated'; END IF;
  -- champion remains ACTIVE (not paid yet — payout is a separate settle step).
  SELECT COUNT(*) INTO live FROM public.poker_tournament_entries
    WHERE tournament_id='22222222-0000-0000-0000-000000000002' AND state='ACTIVE' AND finishing_place IS NULL;
  IF live <> 1 THEN RAISE EXCEPTION 'RT-006: expected exactly 1 live ACTIVE survivor, got %', live; END IF;

  PERFORM public.poker_tournament_advance_level('22222222-0000-0000-0000-000000000002', 1);
  PERFORM public.poker_tournament_touch_table('22222222-0000-0000-0000-000000000002', 1, 1, 'RUNNING', 1);
  SELECT version INTO pv_after FROM public.poker_tournament_table_state
    WHERE tournament_id='22222222-0000-0000-0000-000000000002' AND table_no=1;
  IF pv_after <= pv_before THEN RAISE EXCEPTION 'RT-006: pointer version did not advance (% -> %)', pv_before, pv_after; END IF;

  -- WALLET ISOLATION: not one coin moved and not one ledger row was written during live play.
  SELECT COALESCE(SUM(balance),0) INTO w_after FROM public.game_wallets;
  SELECT COUNT(*) INTO l_after FROM public.coin_ledger;
  IF w_after <> w_before THEN RAISE EXCEPTION 'RT-006: game_wallets changed % -> % during live play', w_before, w_after; END IF;
  IF l_after <> l_before THEN RAISE EXCEPTION 'RT-006: coin_ledger rows changed % -> % during live play', l_before, l_after; END IF;

  RAISE NOTICE 'RT-006 PASS full live flow conserves chips + touches wallet/ledger ZERO times';
END $$;

DO $$ BEGIN RAISE NOTICE '════ ALL POKER TOURNAMENT REALTIME TESTS PASSED ════'; END $$;

ROLLBACK;
