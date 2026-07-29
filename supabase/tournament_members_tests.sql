-- ════════════════════════════════════════════════════════════════════════════════════════════
-- tournament_members_tests.sql — Prompt 15B-1 (scoped tournament membership + invitations)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Verifies migration_tournament_members.sql (#9):
--   • email normalization + shape CHECKs; unique (tournament_id, email_normalized);
--   • role/status enum CHECKs; pending may be unbound; active requires user_id + accepted_at;
--     revoked requires revoked_at;
--   • claim RPC: the RIGHT email claims (pending → active, user bound), a WRONG email claims
--     nothing, a REVOKED invitation is never claimed;
--   • RLS/grants: anon cannot read; an authenticated user reads ONLY its own bound rows;
--     authenticated cannot write directly; service-role reads/writes fully.
--
-- Self-contained: BEGIN … ROLLBACK, persists nothing. Superuser setup (RESET ROLE); RLS / claim
-- sections via SET LOCAL ROLE + request.jwt.claims. Run against Supabase LOCAL only, AFTER all
-- tournament migrations (core 1 … rule_engine 8 … members 9) have been applied.
--
-- Migration idempotency (#13), rollback→reapply→retest (#14) and the migrations-1–8 regression
-- (#15) are exercised by the LOCAL DATABASE GATE procedure (runbook §"Members — local gate"),
-- since they require re-running whole migration files (not possible inside one transaction).
-- ════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;
RESET ROLE;

-- ── Fixtures ────────────────────────────────────────────────────────────────────────────────
-- Users: an inviter (site admin), two claimers (matching a pending / a revoked email), an outsider.
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('99999999-9999-9999-9999-999999999999','authenticated','authenticated','admin@test.local',  now(), now()),
  ('a0000000-0000-0000-0000-0000000000a1','authenticated','authenticated','inv@test.local',    now(), now()),
  ('a0000000-0000-0000-0000-0000000000a2','authenticated','authenticated','rev@test.local',    now(), now()),
  ('a0000000-0000-0000-0000-0000000000a3','authenticated','authenticated','outsider@test.local',now(), now());

INSERT INTO public.tournaments (id, slug, name, status) VALUES
  ('11111111-1111-1111-1111-111111111111','mem-t1','Members T1','draft'),
  ('22222222-2222-2222-2222-222222222222','mem-t2','Members T2','draft');

-- Pending manager invite for inv@ in T1, pending scorekeeper invite for inv@ in T2 (same email,
-- two tournaments → one claim binds BOTH). A revoked manager invite for rev@ in T1 (never claimed).
-- A pending invite for someone-else in T1 (must NOT be claimed by inv@).
INSERT INTO public.tournament_members
  (id, tournament_id, email_normalized, role, status, invited_by, invited_at, revoked_at) VALUES
  ('c0000000-0000-0000-0000-0000000000c1','11111111-1111-1111-1111-111111111111','inv@test.local',     'manager',    'pending','99999999-9999-9999-9999-999999999999', now(), NULL),
  ('c0000000-0000-0000-0000-0000000000c2','22222222-2222-2222-2222-222222222222','inv@test.local',     'scorekeeper','pending','99999999-9999-9999-9999-999999999999', now(), NULL),
  ('c0000000-0000-0000-0000-0000000000c3','11111111-1111-1111-1111-111111111111','rev@test.local',     'manager',    'revoked','99999999-9999-9999-9999-999999999999', now(), now()),
  ('c0000000-0000-0000-0000-0000000000c4','11111111-1111-1111-1111-111111111111','someoneelse@test.local','scorekeeper','pending','99999999-9999-9999-9999-999999999999', now(), NULL);

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- SCHEMA / CONSTRAINT ASSERTIONS (superuser)
-- ════════════════════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- (1) Email must be already normalized (lowercase + trimmed) and non-empty.
  BEGIN
    INSERT INTO public.tournament_members (tournament_id, email_normalized, role)
    VALUES ('11111111-1111-1111-1111-111111111111','INV@Test.Local','manager');
    RAISE EXCEPTION 'T1a: non-normalized email was allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.tournament_members (tournament_id, email_normalized, role)
    VALUES ('11111111-1111-1111-1111-111111111111','  spaced@test.local  ','manager');
    RAISE EXCEPTION 'T1b: untrimmed email was allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.tournament_members (tournament_id, email_normalized, role)
    VALUES ('11111111-1111-1111-1111-111111111111','','manager');
    RAISE EXCEPTION 'T1c: empty email was allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.tournament_members (tournament_id, email_normalized, role)
    VALUES ('11111111-1111-1111-1111-111111111111','not-an-email','manager');
    RAISE EXCEPTION 'T1d: malformed email was allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- (2) Unique (tournament_id, email_normalized) — a duplicate invite for the same pair is rejected.
  BEGIN
    INSERT INTO public.tournament_members (tournament_id, email_normalized, role)
    VALUES ('11111111-1111-1111-1111-111111111111','inv@test.local','scorekeeper');
    RAISE EXCEPTION 'T2: duplicate (tournament, email) was allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- (3) Role/status only accept the valid enums (NO 'admin' membership role).
  BEGIN
    INSERT INTO public.tournament_members (tournament_id, email_normalized, role)
    VALUES ('22222222-2222-2222-2222-222222222222','role-bad@test.local','admin');
    RAISE EXCEPTION 'T3a: role=admin was allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.tournament_members (tournament_id, email_normalized, role, status)
    VALUES ('22222222-2222-2222-2222-222222222222','status-bad@test.local','manager','deleted');
    RAISE EXCEPTION 'T3b: status=deleted was allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- (4) A PENDING invitation may be unbound (user_id NULL, accepted_at NULL) — this is the
  -- normal invite state; the fixture rows c1/c2/c4 already prove it inserted cleanly.
  PERFORM 1 FROM public.tournament_members
    WHERE id = 'c0000000-0000-0000-0000-0000000000c1' AND user_id IS NULL AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'T4: pending unbound invitation did not persist'; END IF;

  -- (8) An ACTIVE membership requires BOTH user_id and accepted_at.
  BEGIN
    INSERT INTO public.tournament_members (tournament_id, email_normalized, role, status)
    VALUES ('22222222-2222-2222-2222-222222222222','active-nouser@test.local','manager','active');
    RAISE EXCEPTION 'T8a: active membership without user_id was allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.tournament_members (tournament_id, email_normalized, role, status, user_id)
    VALUES ('22222222-2222-2222-2222-222222222222','active-noacc@test.local','manager','active',
            'a0000000-0000-0000-0000-0000000000a3');
    RAISE EXCEPTION 'T8b: active membership without accepted_at was allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- (3c) A REVOKED membership requires revoked_at.
  BEGIN
    INSERT INTO public.tournament_members (tournament_id, email_normalized, role, status)
    VALUES ('22222222-2222-2222-2222-222222222222','revoked-nostamp@test.local','manager','revoked');
    RAISE EXCEPTION 'T3c: revoked membership without revoked_at was allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- CLAIM RPC — correct email binds, wrong email / revoked are never claimed.
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- (5) The RIGHT email (inv@) claims BOTH pending invitations (T1 manager + T2 scorekeeper).
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a1","email":"inv@test.local"}';
DO $$
DECLARE n int;
BEGIN
  -- First claim binds exactly the two pending inv@ invitations.
  SELECT count(*) INTO n FROM public.tournament_claim_member_invitations();
  IF n <> 2 THEN RAISE EXCEPTION 'T5a: first claim bound % invitations (expected 2)', n; END IF;
  -- Second call is idempotent (already active → nothing pending to claim).
  SELECT count(*) INTO n FROM public.tournament_claim_member_invitations();
  IF n <> 0 THEN RAISE EXCEPTION 'T5c: claim was not idempotent (second call claimed %)', n; END IF;
END $$;

RESET ROLE;
DO $$
DECLARE r record;
BEGIN
  -- Both inv@ rows are now ACTIVE, bound to inv@'s user, with accepted_at set.
  FOR r IN SELECT * FROM public.tournament_members
             WHERE email_normalized = 'inv@test.local' LOOP
    IF r.status <> 'active' OR r.user_id <> 'a0000000-0000-0000-0000-0000000000a1'
       OR r.accepted_at IS NULL THEN
      RAISE EXCEPTION 'T5: inv@ membership % not properly activated (status=%, user=%)', r.id, r.status, r.user_id;
    END IF;
  END LOOP;

  -- (6) The pending invite for someone else was NOT claimed by inv@.
  PERFORM 1 FROM public.tournament_members
    WHERE id = 'c0000000-0000-0000-0000-0000000000c4' AND status = 'pending' AND user_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'T6: inv@ wrongly claimed someone else''s pending invite'; END IF;

  -- A 'tournament_member_claimed' audit row was written per claimed membership (2 rows).
  PERFORM 1 FROM public.tournament_audit_log
    WHERE action = 'tournament_member_claimed' AND actor_id = 'a0000000-0000-0000-0000-0000000000a1';
  IF NOT FOUND THEN RAISE EXCEPTION 'T5b: claim did not write an audit row'; END IF;
END $$;

-- (7) A REVOKED invitation is never claimed, even by the matching email.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a2","email":"rev@test.local"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.tournament_claim_member_invitations();
  IF n <> 0 THEN RAISE EXCEPTION 'T7a: revoked invitation was claimed (n=%)', n; END IF;
END $$;
RESET ROLE;
DO $$
BEGIN
  PERFORM 1 FROM public.tournament_members
    WHERE id = 'c0000000-0000-0000-0000-0000000000c3' AND status = 'revoked' AND user_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'T7b: revoked invitation changed after a claim attempt'; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- ANON (Guest): no read, no write.
-- ════════════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE anon;
DO $$
DECLARE n int;
BEGIN
  -- (9) Anon cannot read the membership table at all.
  BEGIN
    SELECT count(*) INTO n FROM public.tournament_members;
    RAISE EXCEPTION 'T9a: anon can SELECT tournament_members (n=%)', n;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- Anon cannot write.
  BEGIN
    INSERT INTO public.tournament_members (tournament_id, email_normalized, role)
    VALUES ('11111111-1111-1111-1111-111111111111','anon-hack@test.local','manager');
    RAISE EXCEPTION 'T9b: anon could INSERT a membership';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- AUTHENTICATED (signed-in): reads ONLY own rows; cannot write directly.
-- ════════════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a1","email":"inv@test.local"}';
DO $$
DECLARE n int; bad int;
BEGIN
  -- (10) inv@ sees exactly their own two ACTIVE rows — never other members' rows.
  SELECT count(*) INTO n FROM public.tournament_members;
  IF n <> 2 THEN RAISE EXCEPTION 'T10a: self-read returned % rows (expected 2)', n; END IF;
  SELECT count(*) INTO bad FROM public.tournament_members
    WHERE user_id IS DISTINCT FROM 'a0000000-0000-0000-0000-0000000000a1';
  IF bad <> 0 THEN RAISE EXCEPTION 'T10b: self-read leaked % foreign rows', bad; END IF;

  -- (11) A member (even a manager) cannot write the table directly — every mutation is service-role.
  BEGIN
    INSERT INTO public.tournament_members (tournament_id, email_normalized, role)
    VALUES ('22222222-2222-2222-2222-222222222222','self-escalate@test.local','manager');
    RAISE EXCEPTION 'T11a: authenticated could INSERT a membership';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.tournament_members SET role = 'manager'
      WHERE id = 'c0000000-0000-0000-0000-0000000000c1';
    RAISE EXCEPTION 'T11b: authenticated could UPDATE a membership';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- Another authenticated user (outsider) sees NONE of the memberships (no bound rows).
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","email":"outsider@test.local"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.tournament_members;
  IF n <> 0 THEN RAISE EXCEPTION 'T10c: outsider self-read returned % rows (expected 0)', n; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- SERVICE ROLE (admin backend): full read/write.
-- ════════════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE service_role;
DO $$
DECLARE n int;
BEGIN
  -- (12) Service-role reads all rows and performs mutations (invite / role-change / revoke).
  SELECT count(*) INTO n FROM public.tournament_members;
  IF n < 4 THEN RAISE EXCEPTION 'T12a: service-role cannot read all memberships (n=%)', n; END IF;

  INSERT INTO public.tournament_members (tournament_id, email_normalized, role)
  VALUES ('22222222-2222-2222-2222-222222222222','svc-invite@test.local','scorekeeper');

  UPDATE public.tournament_members SET role = 'manager'
    WHERE tournament_id = '22222222-2222-2222-2222-222222222222'
      AND email_normalized = 'svc-invite@test.local';

  UPDATE public.tournament_members SET status = 'revoked', revoked_at = now()
    WHERE tournament_id = '22222222-2222-2222-2222-222222222222'
      AND email_normalized = 'svc-invite@test.local';

  PERFORM 1 FROM public.tournament_members
    WHERE email_normalized = 'svc-invite@test.local' AND status = 'revoked' AND role = 'manager';
  IF NOT FOUND THEN RAISE EXCEPTION 'T12b: service-role mutation did not take effect'; END IF;

  -- The version column was bumped by the trigger across the two UPDATEs (starts 1 → ≥3).
  PERFORM 1 FROM public.tournament_members
    WHERE email_normalized = 'svc-invite@test.local' AND version >= 3;
  IF NOT FOUND THEN RAISE EXCEPTION 'T12c: version was not bumped on UPDATE'; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- GRANTS / FUNCTION SHAPE (superuser)
-- ════════════════════════════════════════════════════════════════════════════════════════════
RESET ROLE;
DO $$
BEGIN
  -- anon has NO privilege; authenticated has SELECT only.
  IF has_table_privilege('anon', 'public.tournament_members', 'SELECT') THEN
    RAISE EXCEPTION 'G1: anon has SELECT on tournament_members'; END IF;
  IF NOT has_table_privilege('authenticated', 'public.tournament_members', 'SELECT') THEN
    RAISE EXCEPTION 'G2: authenticated lacks SELECT on tournament_members'; END IF;
  IF has_table_privilege('authenticated', 'public.tournament_members', 'INSERT') THEN
    RAISE EXCEPTION 'G3: authenticated has INSERT on tournament_members'; END IF;

  -- Claim RPC is executable by authenticated (never anon), and is SECURITY DEFINER + pinned path.
  IF NOT has_function_privilege('authenticated', 'public.tournament_claim_member_invitations()', 'execute') THEN
    RAISE EXCEPTION 'G4: authenticated cannot execute the claim RPC'; END IF;
  IF has_function_privilege('anon', 'public.tournament_claim_member_invitations()', 'execute') THEN
    RAISE EXCEPTION 'G5: anon can execute the claim RPC'; END IF;
  PERFORM 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = 'tournament_claim_member_invitations'
      AND p.prosecdef = true
      AND array_to_string(coalesce(p.proconfig, '{}'), ',') LIKE '%search_path=public, pg_temp%';
  IF NOT FOUND THEN RAISE EXCEPTION 'G6: claim RPC is not SECURITY DEFINER with pinned search_path'; END IF;

  -- RLS enabled on the base table.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tournament_members'::regclass) THEN
    RAISE EXCEPTION 'G7: RLS not enabled on tournament_members'; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'tournament_members_tests: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
