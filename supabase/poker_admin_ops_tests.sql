-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — ADMIN / OPS DATABASE TEST HARNESS
-- ════════════════════════════════════════════════════════════════════════════════════
-- Run AFTER applying: poker_core → poker_private → poker_economy → poker_lifecycle →
-- poker_engine → poker_admin_ops.
--
-- Venue: an ISOLATED database (Supabase preview branch / local stack / SQL editor). The whole
-- script runs in ONE transaction and ROLLs BACK at the end — it persists NOTHING. Every failed
-- assertion RAISEs and aborts. Asserts the four gated guarantees + supporting invariants:
--   AO1  audit log is append-only (UPDATE/DELETE blocked)
--   AO2  every admin command requires a reason
--   AO3  pause/resume table: idempotent, audited, bumps state_version
--   AO4  freeze hand → PAUSED_FOR_REVIEW + admin-audit row
--   AO5  refund: idempotent, audited, conserves coins, advances linked case → REFUNDED
--   AO6  incident state machine: terminal contract + REFUNDED not generically reachable
--   AO7  restrict / lift player + poker_is_restricted; unique active restriction
--   AO8  hole-card reveal: refused on a LIVE hand; allowed on terminal; audit carries NO cards
--   AO9  ops-event recorder inserts
--   AO10 admin/ops tables are OPAQUE to the authenticated role (RLS, no policy)
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Fixtures (service role / superuser) ─────────────────────────────────────────────────
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('99999999-9999-9999-9999-999999999999','authenticated','authenticated','admin@test.local', now(), now()),
  ('11111111-1111-1111-1111-111111111111','authenticated','authenticated','a@test.local', now(), now()),
  ('22222222-2222-2222-2222-222222222222','authenticated','authenticated','b@test.local', now(), now());

INSERT INTO public.game_wallets (user_id, balance) VALUES
  ('11111111-1111-1111-1111-111111111111', 1000000),
  ('22222222-2222-2222-2222-222222222222', 1000000);

INSERT INTO public.poker_tables (id, name, created_by, small_blind, big_blind, capacity)
VALUES ('aaaaaaaa-0000-0000-0000-0000000000a1','Ops Test', '11111111-1111-1111-1111-111111111111', 50, 100, 6);
INSERT INTO public.poker_seats (table_id, seat_index)
SELECT 'aaaaaaaa-0000-0000-0000-0000000000a1', g FROM generate_series(0,5) g;
UPDATE public.poker_seats SET user_id='11111111-1111-1111-1111-111111111111', status='sitting_in',
  stack=700, committed_total=300 WHERE table_id='aaaaaaaa-0000-0000-0000-0000000000a1' AND seat_index=0;
UPDATE public.poker_seats SET user_id='22222222-2222-2222-2222-222222222222', status='sitting_in',
  stack=700, committed_total=300 WHERE table_id='aaaaaaaa-0000-0000-0000-0000000000a1' AND seat_index=1;

INSERT INTO public.poker_hands (id, table_id, hand_no, phase, street, current_bet)
VALUES ('bbbbbbbb-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-0000000000a1', 1, 'BETTING', 'PREFLOP', 300);

INSERT INTO public.poker_hole_cards (hand_id, table_id, seat_index, user_id, cards) VALUES
  ('bbbbbbbb-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-0000000000a1',0,'11111111-1111-1111-1111-111111111111','["As","Kd"]'::jsonb),
  ('bbbbbbbb-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-0000000000a1',1,'22222222-2222-2222-2222-222222222222','["Qh","Qs"]'::jsonb);

DO $$
DECLARE
  ADM   uuid := '99999999-9999-9999-9999-999999999999';
  TBL   uuid := 'aaaaaaaa-0000-0000-0000-0000000000a1';
  HND   uuid := 'bbbbbbbb-0000-0000-0000-0000000000b1';
  UA    uuid := '11111111-1111-1111-1111-111111111111';
  UB    uuid := '22222222-2222-2222-2222-222222222222';
  v_aid    uuid;
  v_case   uuid;
  v_rid    uuid;
  v_res    jsonb;
  v_int    int;
  v_big    bigint;
  v_sv1    bigint;
  v_sv2    bigint;
  v_bool   boolean;
  v_detail jsonb;
BEGIN
  -- ── AO2: reason required ──────────────────────────────────────────────────────────────
  BEGIN
    PERFORM public.poker_admin_pause_table(ADM, TBL, '   ');
    RAISE EXCEPTION 'AO2 FAIL: empty reason accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%reason_required%' THEN RAISE EXCEPTION 'AO2 FAIL: %', SQLERRM; END IF;
  END;

  -- ── AO3: pause/resume table idempotent + audited + bumps state_version ────────────────
  SELECT state_version INTO v_sv1 FROM public.poker_tables WHERE id = TBL;
  PERFORM public.poker_admin_pause_table(ADM, TBL, 'suspicious activity');
  SELECT paused, state_version INTO STRICT v_bool, v_sv2 FROM public.poker_tables WHERE id = TBL;
  IF NOT v_bool THEN RAISE EXCEPTION 'AO3 FAIL: pause did not set paused'; END IF;
  IF v_sv2 <= v_sv1 THEN RAISE EXCEPTION 'AO3 FAIL: state_version not bumped on pause'; END IF;
  SELECT count(*) INTO v_int FROM public.poker_admin_audit WHERE action='pause_table' AND table_id=TBL;
  IF v_int <> 1 THEN RAISE EXCEPTION 'AO3 FAIL: pause audit row missing/dup (%).', v_int; END IF;
  -- idempotent: second pause writes NO new audit row.
  PERFORM public.poker_admin_pause_table(ADM, TBL, 'again');
  SELECT count(*) INTO v_int FROM public.poker_admin_audit WHERE action='pause_table' AND table_id=TBL;
  IF v_int <> 1 THEN RAISE EXCEPTION 'AO3 FAIL: idempotent pause double-audited'; END IF;
  -- resume.
  PERFORM public.poker_admin_resume_table(ADM, TBL, 'cleared');
  SELECT paused INTO v_bool FROM public.poker_tables WHERE id = TBL;
  IF v_bool THEN RAISE EXCEPTION 'AO3 FAIL: resume did not clear paused'; END IF;

  -- ── AO1: audit log is append-only ─────────────────────────────────────────────────────
  SELECT id INTO v_aid FROM public.poker_admin_audit WHERE action='pause_table' LIMIT 1;
  BEGIN
    UPDATE public.poker_admin_audit SET reason='tampered' WHERE id = v_aid;
    RAISE EXCEPTION 'AO1 FAIL: audit UPDATE allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%append-only%' THEN RAISE EXCEPTION 'AO1 FAIL update: %', SQLERRM; END IF;
  END;
  BEGIN
    DELETE FROM public.poker_admin_audit WHERE id = v_aid;
    RAISE EXCEPTION 'AO1 FAIL: audit DELETE allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%append-only%' THEN RAISE EXCEPTION 'AO1 FAIL delete: %', SQLERRM; END IF;
  END;

  -- ── AO6: incident state machine ───────────────────────────────────────────────────────
  v_res := public.poker_admin_open_incident(ADM, 'Chip dump review', 'opening', 'error', 'chip_dumping', TBL, HND,
            ARRAY[UA, UB]::uuid[], '{"net_flow":1000}'::jsonb);
  v_case := (v_res->>'incident_case_id')::uuid;
  IF v_case IS NULL THEN RAISE EXCEPTION 'AO6 FAIL: open returned no case id'; END IF;
  -- note (audit row, no state change)
  PERFORM public.poker_admin_add_incident_note(ADM, v_case, 'reviewing transfer flow');
  -- OPEN → INVESTIGATING ok
  PERFORM public.poker_admin_transition_incident(ADM, v_case, 'INVESTIGATING', 'digging in');
  -- RESOLVED requires resolution
  BEGIN
    PERFORM public.poker_admin_transition_incident(ADM, v_case, 'RESOLVED', 'closing', NULL);
    RAISE EXCEPTION 'AO6 FAIL: RESOLVED accepted without resolution';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%resolution_required%' THEN RAISE EXCEPTION 'AO6 FAIL: %', SQLERRM; END IF;
  END;
  -- REFUNDED not reachable generically
  BEGIN
    PERFORM public.poker_admin_transition_incident(ADM, v_case, 'REFUNDED', 'x', 'y');
    RAISE EXCEPTION 'AO6 FAIL: REFUNDED reachable generically';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%bad_status%' THEN RAISE EXCEPTION 'AO6 FAIL: %', SQLERRM; END IF;
  END;

  -- ── AO7: restrict / lift + poker_is_restricted + unique active ────────────────────────
  v_res := public.poker_admin_restrict_player(ADM, UB, 'no_sit', 'colluding', NULL, v_case);
  v_rid := (v_res->>'restriction_id')::uuid;
  IF NOT public.poker_is_restricted(UB, 'no_sit') THEN RAISE EXCEPTION 'AO7 FAIL: not restricted'; END IF;
  IF public.poker_is_restricted(UA, 'no_sit') THEN RAISE EXCEPTION 'AO7 FAIL: wrong user restricted'; END IF;
  -- duplicate active restriction is idempotent
  v_res := public.poker_admin_restrict_player(ADM, UB, 'no_sit', 'again', NULL, v_case);
  IF (v_res->>'idempotent') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'AO7 FAIL: dup not idempotent'; END IF;
  -- full_ban covers any kind
  PERFORM public.poker_admin_restrict_player(ADM, UA, 'full_ban', 'banned', NULL, NULL);
  IF NOT public.poker_is_restricted(UA, 'no_join') THEN RAISE EXCEPTION 'AO7 FAIL: full_ban not covering'; END IF;
  -- lift
  PERFORM public.poker_admin_lift_restriction(ADM, v_rid, 'appeal granted');
  IF public.poker_is_restricted(UB, 'no_sit') THEN RAISE EXCEPTION 'AO7 FAIL: lift did not clear'; END IF;

  -- ── AO4: freeze hand → PAUSED_FOR_REVIEW + admin audit ────────────────────────────────
  PERFORM public.poker_admin_freeze_hand(ADM, HND, 'investigate disconnect');
  IF (SELECT phase FROM public.poker_hands WHERE id = HND) <> 'PAUSED_FOR_REVIEW' THEN
    RAISE EXCEPTION 'AO4 FAIL: hand not frozen';
  END IF;
  SELECT count(*) INTO v_int FROM public.poker_admin_audit WHERE action='freeze_hand' AND hand_id=HND;
  IF v_int <> 1 THEN RAISE EXCEPTION 'AO4 FAIL: freeze audit missing'; END IF;

  -- ── AO5: refund idempotent + conserves coins + advances case → REFUNDED ───────────────
  v_res := public.poker_admin_refund_hand(ADM, HND, 'frozen hand void', v_case);
  IF (v_res->>'refunded') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'AO5 FAIL: refund did not run'; END IF;
  -- stacks restored to 1000 each (700 + 300 committed)
  SELECT stack INTO v_big FROM public.poker_seats WHERE table_id=TBL AND seat_index=0;
  IF v_big <> 1000 THEN RAISE EXCEPTION 'AO5 FAIL: seat0 stack % (expected 1000)', v_big; END IF;
  SELECT stack INTO v_big FROM public.poker_seats WHERE table_id=TBL AND seat_index=1;
  IF v_big <> 1000 THEN RAISE EXCEPTION 'AO5 FAIL: seat1 stack % (expected 1000)', v_big; END IF;
  -- case advanced
  IF (SELECT status FROM public.poker_incident_cases WHERE id=v_case) <> 'REFUNDED' THEN
    RAISE EXCEPTION 'AO5 FAIL: case not REFUNDED';
  END IF;
  -- idempotent second refund: stacks unchanged, no double credit
  v_res := public.poker_admin_refund_hand(ADM, HND, 'retry', v_case);
  IF (v_res->>'refunded') IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'AO5 FAIL: second refund moved coins'; END IF;
  SELECT stack INTO v_big FROM public.poker_seats WHERE table_id=TBL AND seat_index=0;
  IF v_big <> 1000 THEN RAISE EXCEPTION 'AO5 FAIL: double refund'; END IF;

  -- ── AO8: hole-card reveal — terminal allowed, audit carries NO card values ────────────
  -- (hand is now CANCELLED → terminal, so reveal is permitted and explicitly audited.)
  v_res := public.poker_admin_reveal_hole_cards(ADM, HND, 'showdown audit for collusion case', v_case);
  IF (v_res->>'ok') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'AO8 FAIL: reveal failed on terminal hand'; END IF;
  IF jsonb_array_length(v_res->'hole') <> 2 THEN RAISE EXCEPTION 'AO8 FAIL: expected 2 hole rows'; END IF;
  SELECT detail INTO v_detail FROM public.poker_admin_audit
    WHERE action='reveal_hole_cards' AND hand_id=HND ORDER BY created_at DESC LIMIT 1;
  IF v_detail ? 'cards' OR v_detail ? 'hole' OR v_detail::text LIKE '%As%' THEN
    RAISE EXCEPTION 'AO8 FAIL: reveal audit leaked card values: %', v_detail;
  END IF;

  -- ── AO8b: reveal REFUSED on a live hand ───────────────────────────────────────────────
  UPDATE public.poker_hands SET phase='BETTING' WHERE id = HND; -- pretend live again
  BEGIN
    PERFORM public.poker_admin_reveal_hole_cards(ADM, HND, 'peek', NULL);
    RAISE EXCEPTION 'AO8 FAIL: reveal allowed on live hand';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%hand_still_live%' THEN RAISE EXCEPTION 'AO8 FAIL: %', SQLERRM; END IF;
  END;

  -- ── AO9: ops-event recorder ───────────────────────────────────────────────────────────
  PERFORM public.poker_record_ops_event('settlement_failure','critical', TBL, HND, NULL,
            '{"code":"not_conserved"}'::jsonb);
  SELECT count(*) INTO v_int FROM public.poker_ops_events WHERE kind='settlement_failure' AND table_id=TBL;
  IF v_int <> 1 THEN RAISE EXCEPTION 'AO9 FAIL: ops event not recorded'; END IF;

  RAISE NOTICE 'ALL ADMIN/OPS DB ASSERTIONS PASSED (AO1–AO9).';
END $$;

-- ── AO10: RLS opacity — authenticated sees/writes NOTHING in admin/ops tables ───────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
DO $$
DECLARE v_int int; t text;
BEGIN
  -- Opacity is satisfied EITHER by a hard permission-denied (REVOKE ALL) OR by RLS returning
  -- zero rows. Both are a PASS; any visible row is a FAIL.
  FOREACH t IN ARRAY ARRAY['poker_admin_audit','poker_incident_cases','poker_player_restrictions','poker_ops_events'] LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO v_int;
      IF v_int <> 0 THEN RAISE EXCEPTION 'AO10 FAIL: authenticated read % (% rows)', t, v_int; END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;  -- permission denied → opaque, as intended
    END;
  END LOOP;
  RAISE NOTICE 'AO10 PASSED: admin/ops tables opaque to authenticated.';
END $$;
RESET ROLE;

ROLLBACK;
