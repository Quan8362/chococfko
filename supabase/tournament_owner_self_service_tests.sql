-- ════════════════════════════════════════════════════════════════════════════════════════════
-- tournament_owner_self_service_tests.sql — Prompt 15F-1 (self-service create + owner role)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Verifies migration_tournament_owner_self_service.sql (#12):
--   • 'owner' is now a valid tournament_members role; 'admin' still rejected.
--   • the create RPC is SECURITY DEFINER, pinned search_path, executable by authenticated (never anon).
--   • an authenticated user creates a DRAFT tournament and becomes its ACTIVE owner, atomically
--     (tournament + owner membership + 2 audit rows), with identity from auth.uid()/JWT — a
--     client-supplied owner id is impossible (the RPC takes no such argument).
--   • at most one active owner per tournament (partial unique index).
--   • anon cannot call the RPC.
--   • a slug clash returns 'slug_taken' and writes NOTHING (no orphan tournament, no owner row).
--
-- Self-contained: BEGIN … ROLLBACK, persists nothing. Superuser setup (RESET ROLE); RPC sections via
-- SET LOCAL ROLE + request.jwt.claims. Run against Supabase LOCAL only, AFTER all tournament
-- migrations (core 1 … members 9 … owner_self_service 12) are applied.
-- ════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;
RESET ROLE;

-- ── Fixtures: one creator, plus an existing tournament to force a slug clash ────────────────────
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('d0000000-0000-0000-0000-0000000000d1','authenticated','authenticated','creator@test.local', now(), now()),
  ('d0000000-0000-0000-0000-0000000000d2','authenticated','authenticated','second@test.local',  now(), now());

INSERT INTO public.tournaments (id, slug, name, status) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddd01','taken-slug','Existing','draft');

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- SCHEMA: owner role valid, admin still invalid, one-active-owner index exists.
-- ════════════════════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- (1) owner is now an accepted role (insert a bound active owner directly as superuser).
  INSERT INTO public.tournament_members
    (tournament_id, user_id, email_normalized, role, status, invited_by, invited_at, accepted_at)
  VALUES
    ('dddddddd-dddd-dddd-dddd-dddddddddd01','d0000000-0000-0000-0000-0000000000d1',
     'creator@test.local','owner','active','d0000000-0000-0000-0000-0000000000d1', now(), now());

  -- (2) a SECOND active owner for the same tournament is rejected by the partial unique index.
  BEGIN
    INSERT INTO public.tournament_members
      (tournament_id, user_id, email_normalized, role, status, invited_by, invited_at, accepted_at)
    VALUES
      ('dddddddd-dddd-dddd-dddd-dddddddddd01','d0000000-0000-0000-0000-0000000000d2',
       'second@test.local','owner','active','d0000000-0000-0000-0000-0000000000d2', now(), now());
    RAISE EXCEPTION 'S2: a second active owner was allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- (3) 'admin' is still not a valid membership role.
  BEGIN
    INSERT INTO public.tournament_members (tournament_id, email_normalized, role)
    VALUES ('dddddddd-dddd-dddd-dddd-dddddddddd01','role-bad@test.local','admin');
    RAISE EXCEPTION 'S3: role=admin was allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- (4) the one-active-owner partial unique index exists.
  PERFORM 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'tmem_one_active_owner_uq';
  IF NOT FOUND THEN RAISE EXCEPTION 'S4: tmem_one_active_owner_uq index missing'; END IF;
END $$;

-- Clear the manual owner row so the RPC path below starts clean for a NEW tournament.
DELETE FROM public.tournament_members WHERE tournament_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01';

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- GRANTS / FUNCTION SHAPE (superuser)
-- ════════════════════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated',
      'public.tournament_create_self_service(text, text, timestamptz, timestamptz, text, text)', 'execute') THEN
    RAISE EXCEPTION 'G1: authenticated cannot execute the create RPC'; END IF;
  IF has_function_privilege('anon',
      'public.tournament_create_self_service(text, text, timestamptz, timestamptz, text, text)', 'execute') THEN
    RAISE EXCEPTION 'G2: anon can execute the create RPC'; END IF;
  PERFORM 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = 'tournament_create_self_service'
      AND p.prosecdef = true
      AND array_to_string(coalesce(p.proconfig, '{}'), ',') LIKE '%search_path=public, pg_temp%';
  IF NOT FOUND THEN RAISE EXCEPTION 'G3: create RPC is not SECURITY DEFINER with pinned search_path'; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- ANON: cannot create.
-- ════════════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.tournament_create_self_service('anon-x','Anon X', NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'A1: anon could execute the create RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- AUTHENTICATED: creates a DRAFT tournament + becomes ACTIVE owner, atomically.
-- NOTE: the CREATE runs as the authenticated caller (RLS/DEFINER path), but the post-create DB
-- verification runs as SUPERUSER — a draft is invisible to the caller's own RLS (public_select only
-- exposes published/completed), so asserting draft state under the authenticated role would wrongly
-- find nothing. The new id is passed across the role boundary via a temp table.
-- ════════════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-0000000000d1","email":"creator@test.local"}';
DO $$
DECLARE res jsonb;
BEGIN
  -- (5) A regular authenticated user creates successfully → code ok. The new id is stashed in a
  -- custom session GUC (role-agnostic) so the superuser verification block below can read it.
  res := public.tournament_create_self_service('my-first-cup','My First Cup', NULL, NULL, 'Hanoi', NULL);
  IF res->>'code' <> 'ok' THEN RAISE EXCEPTION 'C5a: create failed: %', res; END IF;
  PERFORM set_config('tests.created_id', res->>'id', false);

  -- (8) A slug clash returns slug_taken.
  res := public.tournament_create_self_service('taken-slug','Clash', NULL, NULL, NULL, NULL);
  IF res->>'code' <> 'slug_taken' THEN RAISE EXCEPTION 'C8a: slug clash did not return slug_taken: %', res; END IF;

  -- (9) Empty name / slug are rejected as invalid.
  res := public.tournament_create_self_service('', 'No Slug', NULL, NULL, NULL, NULL);
  IF res->>'code' <> 'invalid' THEN RAISE EXCEPTION 'C9a: empty slug not rejected: %', res; END IF;
  res := public.tournament_create_self_service('has-slug', '   ', NULL, NULL, NULL, NULL);
  IF res->>'code' <> 'invalid' THEN RAISE EXCEPTION 'C9b: empty name not rejected: %', res; END IF;
END $$;

-- (10) A caller with NO email claim cannot create (identity is the JWT, not an argument).
SET LOCAL request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-0000000000d1"}';
DO $$
DECLARE res jsonb;
BEGIN
  res := public.tournament_create_self_service('no-email','No Email', NULL, NULL, NULL, NULL);
  IF res->>'code' <> 'not_authenticated' THEN RAISE EXCEPTION 'C10: missing email claim was allowed: %', res; END IF;
END $$;

RESET ROLE;

-- Verify the created state as SUPERUSER (drafts are hidden from the caller's RLS).
DO $$
DECLARE v_id uuid;
BEGIN
  v_id := current_setting('tests.created_id')::uuid;

  -- (5b) The created tournament is a DRAFT owned by the creator.
  PERFORM 1 FROM public.tournaments
    WHERE id = v_id AND status = 'draft' AND created_by = 'd0000000-0000-0000-0000-0000000000d1';
  IF NOT FOUND THEN RAISE EXCEPTION 'C5b: created tournament is not a draft owned by the creator'; END IF;

  -- (6) The creator is now the ACTIVE owner, bound to their own user id + email.
  PERFORM 1 FROM public.tournament_members
    WHERE tournament_id = v_id AND role = 'owner' AND status = 'active'
      AND user_id = 'd0000000-0000-0000-0000-0000000000d1'
      AND email_normalized = 'creator@test.local' AND accepted_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'C6: creator is not the active owner'; END IF;

  -- (7) Both audit rows were written (tournament_created + tournament_owner_assigned).
  PERFORM 1 FROM public.tournament_audit_log
    WHERE tournament_id = v_id AND action = 'tournament_created'
      AND actor_id = 'd0000000-0000-0000-0000-0000000000d1';
  IF NOT FOUND THEN RAISE EXCEPTION 'C7a: tournament_created audit row missing'; END IF;
  PERFORM 1 FROM public.tournament_audit_log
    WHERE tournament_id = v_id AND action = 'tournament_owner_assigned';
  IF NOT FOUND THEN RAISE EXCEPTION 'C7b: tournament_owner_assigned audit row missing'; END IF;

  -- (8b) The slug clash wrote NOTHING extra: exactly ONE self-service tournament exists here, and
  --      exactly ONE owner row for the creator (no orphan tournament, no orphan owner membership).
  PERFORM 1 FROM public.tournaments WHERE created_by = 'd0000000-0000-0000-0000-0000000000d1'
    HAVING count(*) = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'C8b: slug clash left an orphan tournament'; END IF;
  PERFORM 1 FROM public.tournament_members
    WHERE user_id = 'd0000000-0000-0000-0000-0000000000d1' AND role = 'owner'
    HAVING count(*) = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'C8c: slug clash left an orphan owner row'; END IF;
END $$;
DO $$ BEGIN RAISE NOTICE 'tournament_owner_self_service_tests: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
