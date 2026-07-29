-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT ADMIN CRUD — RLS / AUDIT TEST HARNESS (Prompt 04)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Complements tournament_core_tests.sql. Focuses on the admin-CRUD security invariants:
--   • Guest (anon / authenticated non-admin) can NEVER write tournaments (RLS + REVOKE).
--   • Guest cannot SELECT a draft tournament; can SELECT a published one.
--   • Guest cannot read the audit log at all.
--   • service_role (used by createAdminClient() after checkIsAdmin()) can full-CRUD + audit.
--   • Deleting a draft tournament cascades child events; a tournament_deleted audit row written
--     with tournament_id = NULL SURVIVES the cascade (id kept inside detail).
--
-- Run AFTER migration_tournament_core.sql against an ISOLATED database (local stack / preview /
-- SQL editor). Whole script runs in ONE transaction and ROLLs BACK — it persists NOTHING.
-- Any failed assertion RAISEs and rolls the run back. The "guest write denied" checks use a
-- success flag raised OUTSIDE the protected block so the FAIL can never be self-caught.
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;
RESET ROLE;

-- ── Setup (as superuser) ────────────────────────────────────────────────────────────────
INSERT INTO public.tournaments (id, slug, name, status) VALUES
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'admin-pub',   'Admin Published', 'published'),
  ('a0000000-0000-0000-0000-000000000002'::uuid, 'admin-draft', 'Admin Draft',     'draft');

INSERT INTO public.tournament_events (id, tournament_id, name, format, group_count) VALUES
  ('e0000000-0000-0000-0000-0000000000e1'::uuid, 'a0000000-0000-0000-0000-000000000002'::uuid,
   'Draft Event', 'round_robin', 1);

-- ── 1. Guest writes are denied (anon) ─────────────────────────────────────────────────────
SET LOCAL ROLE anon;
DO $$
DECLARE wrote boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.tournaments (slug, name, status) VALUES ('hack-anon', 'Hack', 'published');
    wrote := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF wrote THEN RAISE EXCEPTION 'FAIL: anon was able to INSERT a tournament'; END IF;

  UPDATE public.tournaments SET name = 'x' WHERE slug = 'admin-pub';
  IF FOUND THEN RAISE EXCEPTION 'FAIL: anon was able to UPDATE a tournament'; END IF;

  DELETE FROM public.tournaments WHERE slug = 'admin-pub';
  IF FOUND THEN RAISE EXCEPTION 'FAIL: anon was able to DELETE a tournament'; END IF;
EXCEPTION WHEN insufficient_privilege THEN
  -- REVOKE makes UPDATE/DELETE a privilege error before any row is touched — also acceptable.
  NULL;
END $$;

-- ── 2. Guest visibility: published yes, draft no ─────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.tournaments WHERE slug = 'admin-pub';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: anon cannot see a PUBLISHED tournament'; END IF;

  SELECT count(*) INTO n FROM public.tournaments WHERE slug = 'admin-draft';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: anon can see a DRAFT tournament'; END IF;

  SELECT count(*) INTO n FROM public.tournament_events WHERE name = 'Draft Event';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: anon can see an event under a DRAFT tournament'; END IF;
END $$;

-- ── 3. Guest cannot read the audit log ───────────────────────────────────────────────────
DO $$
DECLARE readable boolean := false;
BEGIN
  BEGIN
    PERFORM 1 FROM public.tournament_audit_log;
    readable := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF readable THEN RAISE EXCEPTION 'FAIL: anon can read the audit log'; END IF;
END $$;

-- ── 4. Same denials for a logged-in non-admin (authenticated) ────────────────────────────
SET LOCAL ROLE authenticated;
DO $$
DECLARE wrote boolean := false; readable boolean := false; n int;
BEGIN
  BEGIN
    INSERT INTO public.tournaments (slug, name, status) VALUES ('hack-auth', 'Hack', 'published');
    wrote := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF wrote THEN RAISE EXCEPTION 'FAIL: authenticated was able to INSERT a tournament'; END IF;

  SELECT count(*) INTO n FROM public.tournaments WHERE slug = 'admin-draft';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: authenticated can see a DRAFT tournament'; END IF;

  BEGIN
    PERFORM 1 FROM public.tournament_audit_log;
    readable := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF readable THEN RAISE EXCEPTION 'FAIL: authenticated can read the audit log'; END IF;
END $$;

-- ── 5. service_role full-CRUD + audit (mirrors createAdminClient() writes) ────────────────
SET LOCAL ROLE service_role;
DO $$
DECLARE new_id uuid; n int;
BEGIN
  INSERT INTO public.tournaments (slug, name, status)
    VALUES ('svc-created', 'Service Created', 'draft')
    RETURNING id INTO new_id;

  INSERT INTO public.tournament_audit_log (tournament_id, action, detail)
    VALUES (new_id, 'tournament_created', jsonb_build_object('name', 'Service Created'));

  UPDATE public.tournaments SET name = 'Service Renamed' WHERE id = new_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: service_role UPDATE affected 0 rows'; END IF;

  SELECT count(*) INTO n FROM public.tournament_audit_log WHERE tournament_id = new_id;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: service_role could not create/read audit row'; END IF;

  DELETE FROM public.tournaments WHERE id = new_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: service_role DELETE affected 0 rows'; END IF;
END $$;

-- ── 6. Delete-draft cascade + surviving tournament_deleted audit (tournament_id NULL) ─────
DO $$
DECLARE n int;
BEGIN
  -- Audit written BEFORE delete, decoupled from the FK via tournament_id NULL.
  INSERT INTO public.tournament_audit_log (tournament_id, action, detail)
    VALUES (NULL, 'tournament_deleted',
      jsonb_build_object('tournament_id', 'a0000000-0000-0000-0000-000000000002', 'slug', 'admin-draft'));

  DELETE FROM public.tournaments WHERE id = 'a0000000-0000-0000-0000-000000000002'::uuid;

  SELECT count(*) INTO n FROM public.tournament_events WHERE name = 'Draft Event';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: draft events not cascaded on delete'; END IF;

  SELECT count(*) INTO n FROM public.tournament_audit_log WHERE action = 'tournament_deleted';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: tournament_deleted audit did not survive the cascade'; END IF;
END $$;

RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'ALL ADMIN CRUD RLS/AUDIT ASSERTIONS PASSED'; END $$;

ROLLBACK;
-- ════════════════════════════════════════════════════════════════════════════════════
-- END tournament_admin_tests.sql
-- ════════════════════════════════════════════════════════════════════════════════════
