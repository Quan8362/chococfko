-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — TOURNAMENT ACCESS-HARDENING TEST HARNESS (27G-G1A)
-- anon denial · non-participant denial · participant scope · cross-tournament · operator ·
-- service-role bypass · client no-write · service-role-only RPC rejection · secret seal ·
-- lobby discoverability · realtime pointer scope
-- ════════════════════════════════════════════════════════════════════════════════════
-- Run AFTER applying (in order): migration_poker_tournament.sql, _orchestration.sql,
-- _realtime.sql, _recovery.sql, and migration_poker_tournament_access_hardening.sql.
--
-- Venue: an ISOLATED / disposable database. The whole script runs in ONE transaction and ROLLs
-- BACK at the end — it persists NOTHING. Player reads run under role `authenticated` with a JWT
-- `sub` claim auth.uid() reads; setup + service ops run under the setup superuser (RESET ROLE).
-- Any failed assertion RAISEs → the whole run rolls back.
--
-- Entities:  uOP = operator/creator · uA,uB = participants · uX = authenticated non-participant
--   TR = 10000000-… RUNNING (roster + live hand)   TL = 20000000-… REGISTRATION_OPEN (lobby)
--   TC = 30000000-… COMPLETED (roster + payout result — the sensitive enumeration target)
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Setup (superuser) ────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, aud, role, email) VALUES
  ('0f000000-0000-0000-0000-0000000000f0','authenticated','authenticated','op@t.local'),
  ('00000000-0000-0000-0000-0000000000aa','authenticated','authenticated','a@t.local'),
  ('00000000-0000-0000-0000-0000000000bb','authenticated','authenticated','b@t.local'),
  ('0c000000-0000-0000-0000-0000000000cc','authenticated','authenticated','x@t.local');

INSERT INTO public.profiles (id, display_name) VALUES
  ('00000000-0000-0000-0000-0000000000aa','Alice Real Name'),
  ('00000000-0000-0000-0000-0000000000bb','Bob Real Name');

INSERT INTO public.game_wallets (user_id, balance) VALUES
  ('00000000-0000-0000-0000-0000000000aa', 100000),
  ('00000000-0000-0000-0000-0000000000bb', 100000),
  ('0c000000-0000-0000-0000-0000000000cc', 100000);

INSERT INTO public.poker_tournaments (id, title, state, entry_fee, starting_stack, min_entries, max_entries, config, created_by) VALUES
  ('10000000-0000-0000-0000-000000000001','Running Cup','RUNNING',           1, 6000, 2, 6, '{}'::jsonb, '0f000000-0000-0000-0000-0000000000f0'),
  ('20000000-0000-0000-0000-000000000002','Open Lobby Cup','REGISTRATION_OPEN',1, 6000, 2, 6, '{}'::jsonb, '0f000000-0000-0000-0000-0000000000f0'),
  ('30000000-0000-0000-0000-000000000003','Completed Cup','COMPLETED',        1, 6000, 2, 6, '{}'::jsonb, '0f000000-0000-0000-0000-0000000000f0');

-- Roster for TR (running) and TC (completed) — uA, uB. uX is in NOTHING.
INSERT INTO public.poker_tournament_entries (id, tournament_id, user_id, entry_fee, state, chips, finishing_place) VALUES
  ('e1000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000aa', 1, 'ACTIVE', 6000, NULL),
  ('e1000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000bb', 1, 'ACTIVE', 6000, NULL),
  ('e3000000-0000-0000-0000-0000000000a3','30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000aa', 1, 'PAID',   0,    1),
  ('e3000000-0000-0000-0000-0000000000b3','30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000bb', 1, 'PAID',   0,    2);

INSERT INTO public.poker_tournament_seats (id, tournament_id, entry_id, user_id, table_no, seat_index, stack, state) VALUES
  ('50000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000aa',1,0,6000,'active'),
  ('50000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000bb',1,1,6000,'active');

INSERT INTO public.poker_tournament_payouts (tournament_id, entry_id, user_id, place, amount, kind) VALUES
  ('30000000-0000-0000-0000-000000000003','e3000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000aa',1,2,'prize');

-- A seed-bearing hand row on TR (the secret table must stay fully denied to clients).
INSERT INTO public.poker_tournament_hands (tournament_id, table_no, hand_no, level_index, small_blind, big_blind, ante, state)
  VALUES ('10000000-0000-0000-0000-000000000001',1,1,0,50,100,0,'{"seed":"TOP-SECRET-SEED","deck":["As","Kd"]}'::jsonb);

-- Realtime pointer for TR.
SELECT public.poker_tournament_touch_table('10000000-0000-0000-0000-000000000001', 1, 1, 'RUNNING', 0);

-- ════════════════════════════════════════════════════════════════════════════════════
-- AH-1  ANON is fully denied on every game-state table (grant revoked → 42501).
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}', true);
DO $$
DECLARE t text; ok boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['poker_tournaments','poker_tournament_entries','poker_tournament_seats',
                           'poker_tournament_moves','poker_tournament_payouts','poker_tournament_table_state'] LOOP
    ok := false;
    BEGIN
      EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', t);
    EXCEPTION WHEN insufficient_privilege THEN ok := true;
    END;
    IF NOT ok THEN RAISE EXCEPTION 'AH-1: anon SELECT on % was NOT denied', t; END IF;
  END LOOP;
  RAISE NOTICE 'AH-1 PASS anon denied on all six game-state tables';
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════════════
-- AH-2  AUTHENTICATED NON-PARTICIPANT (uX) cannot enumerate roster/result data.
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"0c000000-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
DO $$
DECLARE n int;
BEGIN
  -- No entries visible for ANY tournament uX is not in (running roster).
  SELECT count(*) INTO n FROM public.poker_tournament_entries; IF n <> 0 THEN RAISE EXCEPTION 'AH-2a: non-participant saw % entry rows', n; END IF;
  SELECT count(*) INTO n FROM public.poker_tournament_seats;   IF n <> 0 THEN RAISE EXCEPTION 'AH-2b: non-participant saw % seat rows', n; END IF;
  -- No payout/result rows (the completed-tournament identity+result leak is closed).
  SELECT count(*) INTO n FROM public.poker_tournament_payouts; IF n <> 0 THEN RAISE EXCEPTION 'AH-2c: non-participant saw % payout rows', n; END IF;
  -- The COMPLETED tournament itself must be invisible to a non-participant.
  SELECT count(*) INTO n FROM public.poker_tournaments WHERE id='30000000-0000-0000-0000-000000000003';
  IF n <> 0 THEN RAISE EXCEPTION 'AH-2d: non-participant saw the COMPLETED tournament'; END IF;
  RAISE NOTICE 'AH-2 PASS authenticated non-participant cannot enumerate roster/results/completed';
END $$;
-- AH-3 lobby discoverability: uX CAN see the REGISTRATION_OPEN tournament metadata (to self-register)
-- but STILL sees none of its entries.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.poker_tournaments WHERE id='20000000-0000-0000-0000-000000000002';
  IF n <> 1 THEN RAISE EXCEPTION 'AH-3a: open-lobby tournament not discoverable by authenticated user'; END IF;
  SELECT count(*) INTO n FROM public.poker_tournament_entries WHERE tournament_id='20000000-0000-0000-0000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'AH-3b: non-participant saw lobby entries'; END IF;
  RAISE NOTICE 'AH-3 PASS lobby tournament discoverable, its roster still hidden';
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════════════
-- AH-4  PARTICIPANT A sees ONLY her own tournament's roster; not a foreign one.
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.poker_tournament_entries WHERE tournament_id='10000000-0000-0000-0000-000000000001';
  IF n <> 2 THEN RAISE EXCEPTION 'AH-4a: participant should see 2 roster rows in her tournament, saw %', n; END IF;
  -- She IS in the completed tournament too → sees its result rows (legitimate own history).
  SELECT count(*) INTO n FROM public.poker_tournament_payouts WHERE tournament_id='30000000-0000-0000-0000-000000000003';
  IF n <> 1 THEN RAISE EXCEPTION 'AH-4b: participant should see her own completed payout, saw %', n; END IF;
  -- The realtime pointer for her table is readable.
  SELECT count(*) INTO n FROM public.poker_tournament_table_state WHERE tournament_id='10000000-0000-0000-0000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'AH-4c: participant cannot read her table realtime pointer'; END IF;
  RAISE NOTICE 'AH-4 PASS participant sees own roster/results/pointer only';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- AH-5  SECRET SEAL under a participant JWT: seed column + hands table stay denied.
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM seed FROM public.poker_tournaments WHERE id='10000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'AH-5a: participant read the tournament seed column'; END IF;
  ok := false;
  BEGIN PERFORM 1 FROM public.poker_tournament_hands LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'AH-5b: participant read the seed-bearing hands table'; END IF;
  RAISE NOTICE 'AH-5 PASS seed column + hands table denied to participant';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- AH-6  CLIENT cannot write, and cannot execute service-role-only RPCs.
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE ok boolean := false;
BEGIN
  -- direct INSERT into a roster table is denied (no write policy + REVOKE).
  BEGIN INSERT INTO public.poker_tournament_entries (tournament_id,user_id,entry_fee) VALUES ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000aa',1);
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'AH-6a: authenticated INSERTed an entry directly'; END IF;
  ok := false;
  BEGIN UPDATE public.poker_tournament_seats SET stack = 999999 WHERE tournament_id='10000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'AH-6b: authenticated UPDATEd a seat directly'; END IF;
  ok := false;
  BEGIN PERFORM public.poker_tournament_settle('30000000-0000-0000-0000-000000000003','[]'::jsonb,'k');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'AH-6c: authenticated executed the service-role-only settle RPC'; END IF;
  ok := false;
  BEGIN PERFORM public.poker_tournament_touch_table('10000000-0000-0000-0000-000000000001',1,1,'RUNNING',0);
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'AH-6d: authenticated executed the service-role-only pointer RPC'; END IF;
  RAISE NOTICE 'AH-6 PASS client cannot write tables or call service-role RPCs';
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════════════
-- AH-7  OPERATOR / CREATOR (uOP) reads its tournament roster via the creator clause.
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"0f000000-0000-0000-0000-0000000000f0","role":"authenticated"}', true);
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.poker_tournament_entries WHERE tournament_id='30000000-0000-0000-0000-000000000003';
  IF n <> 2 THEN RAISE EXCEPTION 'AH-7a: creator/operator should read the completed roster (2), saw %', n; END IF;
  SELECT count(*) INTO n FROM public.poker_tournaments WHERE id='30000000-0000-0000-0000-000000000003';
  IF n <> 1 THEN RAISE EXCEPTION 'AH-7b: creator/operator cannot see the tournament they created'; END IF;
  RAISE NOTICE 'AH-7 PASS operator/creator reads created-tournament data';
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════════════
-- AH-8  SERVICE ROLE bypasses RLS (server-authoritative reads); realtime pointer NOT secret.
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE service_role;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.poker_tournament_entries; IF n < 4 THEN RAISE EXCEPTION 'AH-8a: service_role could not read all entries'; END IF;
  SELECT count(*) INTO n FROM public.poker_tournament_hands;   IF n < 1 THEN RAISE EXCEPTION 'AH-8b: service_role could not read hands'; END IF;
  RAISE NOTICE 'AH-8 PASS service_role bypasses RLS as designed';
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════════════
-- AH-9  Realtime publication unchanged: exactly the three NON-SECRET tables; no secret table.
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public'
      AND tablename IN ('poker_tournament_seats','poker_tournament_entries','poker_tournament_table_state');
  IF v <> 3 THEN RAISE EXCEPTION 'AH-9a: expected 3 published non-secret tables, got %', v; END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public'
             AND tablename IN ('poker_tournaments','poker_tournament_hands')) THEN
    RAISE EXCEPTION 'AH-9b: a seed-bearing table is published to realtime';
  END IF;
  RAISE NOTICE 'AH-9 PASS realtime publication still non-secret-only';
END $$;

DO $$ BEGIN RAISE NOTICE '════ ALL ACCESS-HARDENING TESTS PASSED (AH-1..AH-9) ════'; END $$;

ROLLBACK;
