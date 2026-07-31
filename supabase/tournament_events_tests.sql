-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT EVENTS + COMPETITORS — RLS / CONSTRAINT / CONCURRENCY TEST HARNESS (Prompt 05)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Complements tournament_core_tests.sql + tournament_admin_tests.sql. Focuses on the DB-enforced
-- invariants the event/competitor admin CRUD relies on:
--   • Guest (anon / authenticated non-admin) can NEVER write events or competitors.
--   • Guest cannot SELECT competitors under a DRAFT tournament; can under a PUBLISHED one.
--   • Event status defaults to 'setup'; format / group_knockout CHECK constraints hold.
--   • Optimistic concurrency: tournament_events.version bumps on UPDATE; a stale-version guarded
--     UPDATE touches 0 rows. tournament_competitors.updated_at bumps on UPDATE.
--   • Composite FK blocks attaching a competitor of one event to a match of another (cross-event).
--   • A competitor referenced by a match cannot be deleted (FK ON DELETE NO ACTION backstop).
--   • service_role (createAdminClient() after checkIsAdmin()) can full-CRUD events + competitors.
--
-- Run AFTER migration_tournament_core.sql against an ISOLATED database (local stack / preview /
-- SQL editor). Whole script runs in ONE transaction and ROLLs BACK — it persists NOTHING.
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;
RESET ROLE;

-- ── Setup (as superuser) ────────────────────────────────────────────────────────────────
INSERT INTO public.tournaments (id, slug, name, status) VALUES
  ('c0000000-0000-0000-0000-000000000001'::uuid, 'ev-pub',   'Ev Published', 'published'),
  ('c0000000-0000-0000-0000-000000000002'::uuid, 'ev-draft', 'Ev Draft',     'draft');

-- Event under the PUBLISHED tournament (default status should be 'setup').
INSERT INTO public.tournament_events (id, tournament_id, name, format, group_count) VALUES
  ('d0000000-0000-0000-0000-0000000000d1'::uuid, 'c0000000-0000-0000-0000-000000000001'::uuid,
   'Đơn nam', 'group_knockout', 2);
-- A second event (same tournament) to prove cross-event composite-FK isolation.
INSERT INTO public.tournament_events (id, tournament_id, name, format, group_count,
  winner_qualifiers_per_group) VALUES
  ('d0000000-0000-0000-0000-0000000000d2'::uuid, 'c0000000-0000-0000-0000-000000000001'::uuid,
   'Đôi nam', 'group_knockout', 2, 1);
-- Event under the DRAFT tournament (for Guest-visibility check).
INSERT INTO public.tournament_events (id, tournament_id, name, format, group_count) VALUES
  ('d0000000-0000-0000-0000-0000000000d3'::uuid, 'c0000000-0000-0000-0000-000000000002'::uuid,
   'Draft Event', 'round_robin', 1);

INSERT INTO public.tournament_competitors (id, event_id, name, display_order) VALUES
  ('11111111-0000-0000-0000-000000000001'::uuid, 'd0000000-0000-0000-0000-0000000000d1'::uuid, 'VĐV A', 0),
  ('11111111-0000-0000-0000-000000000002'::uuid, 'd0000000-0000-0000-0000-0000000000d1'::uuid, 'VĐV B', 1);
-- Competitor belonging to the OTHER event (d2) — used for the cross-event FK check.
INSERT INTO public.tournament_competitors (id, event_id, name) VALUES
  ('22222222-0000-0000-0000-000000000001'::uuid, 'd0000000-0000-0000-0000-0000000000d2'::uuid, 'Foreign VĐV');
-- Competitor under the DRAFT event — used for the Guest-visibility check.
INSERT INTO public.tournament_competitors (id, event_id, name) VALUES
  ('33333333-0000-0000-0000-000000000001'::uuid, 'd0000000-0000-0000-0000-0000000000d3'::uuid, 'Draft VĐV');

INSERT INTO public.tournament_groups (id, event_id, name) VALUES
  ('44444444-0000-0000-0000-000000000001'::uuid, 'd0000000-0000-0000-0000-0000000000d1'::uuid, 'Bảng A');

-- ── 1. Event status defaults to 'setup' ──────────────────────────────────────────────────
DO $$
DECLARE s text;
BEGIN
  SELECT status INTO s FROM public.tournament_events WHERE id = 'd0000000-0000-0000-0000-0000000000d1';
  IF s <> 'setup' THEN RAISE EXCEPTION 'FAIL: new event status is % not setup', s; END IF;
END $$;

-- ── 2. CHECK constraints: bad format, and group_knockout needs winner>=1 & group>=1 ───────
DO $$
DECLARE failed boolean;
BEGIN
  failed := false;
  BEGIN
    INSERT INTO public.tournament_events (tournament_id, name, format)
      VALUES ('c0000000-0000-0000-0000-000000000001', 'Bad', 'swiss');
    failed := true;
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF failed THEN RAISE EXCEPTION 'FAIL: invalid format accepted'; END IF;

  failed := false;
  BEGIN
    INSERT INTO public.tournament_events (tournament_id, name, format, group_count, winner_qualifiers_per_group)
      VALUES ('c0000000-0000-0000-0000-000000000001', 'GK0', 'group_knockout', 2, 0);
    failed := true;
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF failed THEN RAISE EXCEPTION 'FAIL: group_knockout with 0 winner qualifiers accepted'; END IF;
END $$;

-- ── 3. Optimistic concurrency: version bumps; stale-version guarded UPDATE = 0 rows ───────
DO $$
DECLARE v0 int; v1 int;
BEGIN
  SELECT version INTO v0 FROM public.tournament_events WHERE id = 'd0000000-0000-0000-0000-0000000000d1';

  UPDATE public.tournament_events SET name = 'Đơn nam (v2)'
    WHERE id = 'd0000000-0000-0000-0000-0000000000d1' AND version = v0;
  SELECT version INTO v1 FROM public.tournament_events WHERE id = 'd0000000-0000-0000-0000-0000000000d1';
  IF v1 <> v0 + 1 THEN RAISE EXCEPTION 'FAIL: event version did not bump (% -> %)', v0, v1; END IF;

  -- A guarded UPDATE with the now-stale token must touch 0 rows.
  UPDATE public.tournament_events SET name = 'stale write'
    WHERE id = 'd0000000-0000-0000-0000-0000000000d1' AND version = v0;
  IF FOUND THEN RAISE EXCEPTION 'FAIL: stale-version UPDATE overwrote the row'; END IF;
END $$;

-- ── 4. Competitor optimistic concurrency: trigger installed + stale-token guard = 0 rows ──
-- NOTE: updated_at is driven by now() (transaction timestamp), which is CONSTANT within one
-- transaction — so we cannot observe it advance inside this single-txn harness. Instead we prove
-- (a) the updated_at trigger is attached (bumps the token in real, per-request transactions) and
-- (b) the app's guard — UPDATE ... WHERE id = ? AND updated_at = <token> — rejects a stale token.
DO $$
DECLARE has_trigger boolean; token timestamptz;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
    WHERE c.relname = 'tournament_competitors' AND tg.tgname = 'tournament_competitors_updated_at'
  ) INTO has_trigger;
  IF NOT has_trigger THEN RAISE EXCEPTION 'FAIL: competitor updated_at trigger is missing'; END IF;

  SELECT updated_at INTO token FROM public.tournament_competitors
    WHERE id = '11111111-0000-0000-0000-000000000001';

  -- Correct token → 1 row; stale/wrong token → 0 rows (mirrors updateCompetitor's guard).
  UPDATE public.tournament_competitors SET name = 'VĐV A2'
    WHERE id = '11111111-0000-0000-0000-000000000001' AND updated_at = token;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: guarded UPDATE with the current token affected 0 rows'; END IF;

  UPDATE public.tournament_competitors SET name = 'stale write'
    WHERE id = '11111111-0000-0000-0000-000000000001'
      AND updated_at = TIMESTAMPTZ '2000-01-01 00:00:00+00';
  IF FOUND THEN RAISE EXCEPTION 'FAIL: stale-token UPDATE overwrote the competitor'; END IF;
END $$;

-- ── 5. Cross-event composite FK: a match of event d1 cannot reference d2's competitor ─────
DO $$
DECLARE failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.tournament_matches
      (event_id, group_id, stage, round_number, match_number, competitor_a_id, competitor_b_id,
       status, generation_key)
      VALUES ('d0000000-0000-0000-0000-0000000000d1', '44444444-0000-0000-0000-000000000001', 'group',
              1, 1, '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002',
              'pending', 'xk-cross');
    failed := true;
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  IF failed THEN RAISE EXCEPTION 'FAIL: a match referenced a competitor from another event'; END IF;
END $$;

-- ── 6. A competitor referenced by a match cannot be deleted (FK ON DELETE NO ACTION) ─────
DO $$
DECLARE failed boolean := false;
BEGIN
  INSERT INTO public.tournament_matches
    (event_id, group_id, stage, round_number, match_number, competitor_a_id, competitor_b_id,
     status, generation_key)
    VALUES ('d0000000-0000-0000-0000-0000000000d1', '44444444-0000-0000-0000-000000000001', 'group',
            1, 1, '11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002',
            'pending', 'gk-1');

  BEGIN
    DELETE FROM public.tournament_competitors WHERE id = '11111111-0000-0000-0000-000000000001';
    failed := true;
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  IF failed THEN RAISE EXCEPTION 'FAIL: deleted a competitor still referenced by a match'; END IF;
END $$;

-- ── 7. Guest writes denied (anon) for events + competitors ───────────────────────────────
SET LOCAL ROLE anon;
DO $$
DECLARE wrote boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.tournament_events (tournament_id, name, format)
      VALUES ('c0000000-0000-0000-0000-000000000001', 'Hack', 'round_robin');
    wrote := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF wrote THEN RAISE EXCEPTION 'FAIL: anon inserted an event'; END IF;

  wrote := false;
  BEGIN
    INSERT INTO public.tournament_competitors (event_id, name)
      VALUES ('d0000000-0000-0000-0000-0000000000d1', 'Hack VĐV');
    wrote := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF wrote THEN RAISE EXCEPTION 'FAIL: anon inserted a competitor'; END IF;

  UPDATE public.tournament_competitors SET name = 'x' WHERE id = '11111111-0000-0000-0000-000000000002';
  IF FOUND THEN RAISE EXCEPTION 'FAIL: anon updated a competitor'; END IF;
EXCEPTION WHEN insufficient_privilege THEN
  NULL; -- REVOKE turns UPDATE into a privilege error before any row is touched — also acceptable.
END $$;

-- ── 8. Guest visibility: competitors under published yes, under draft no ─────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.tournament_competitors
    WHERE event_id = 'd0000000-0000-0000-0000-0000000000d1';
  IF n < 1 THEN RAISE EXCEPTION 'FAIL: anon cannot see competitors under a PUBLISHED tournament'; END IF;

  SELECT count(*) INTO n FROM public.tournament_competitors
    WHERE id = '33333333-0000-0000-0000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: anon can see a competitor under a DRAFT tournament'; END IF;

  SELECT count(*) INTO n FROM public.tournament_events WHERE id = 'd0000000-0000-0000-0000-0000000000d3';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: anon can see an event under a DRAFT tournament'; END IF;
END $$;

-- ── 9. Same write denials for a logged-in non-admin (authenticated) ──────────────────────
SET LOCAL ROLE authenticated;
DO $$
DECLARE wrote boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.tournament_competitors (event_id, name)
      VALUES ('d0000000-0000-0000-0000-0000000000d1', 'Hack VĐV2');
    wrote := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF wrote THEN RAISE EXCEPTION 'FAIL: authenticated inserted a competitor'; END IF;
END $$;

-- ── 10. service_role full-CRUD events + competitors + audit ──────────────────────────────
SET LOCAL ROLE service_role;
DO $$
DECLARE new_event uuid; new_comp uuid; n int;
BEGIN
  INSERT INTO public.tournament_events (tournament_id, name, format, group_count)
    VALUES ('c0000000-0000-0000-0000-000000000001', 'Svc Event', 'round_robin', 1)
    RETURNING id INTO new_event;

  INSERT INTO public.tournament_competitors (event_id, name)
    VALUES (new_event, 'Svc VĐV') RETURNING id INTO new_comp;

  INSERT INTO public.tournament_audit_log (tournament_id, event_id, action, detail)
    VALUES ('c0000000-0000-0000-0000-000000000001', new_event, 'event_created',
            jsonb_build_object('name', 'Svc Event'));

  UPDATE public.tournament_competitors SET name = 'Svc VĐV renamed' WHERE id = new_comp;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: service_role competitor UPDATE affected 0 rows'; END IF;

  DELETE FROM public.tournament_competitors WHERE id = new_comp;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: service_role competitor DELETE affected 0 rows'; END IF;

  DELETE FROM public.tournament_events WHERE id = new_event;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: service_role event DELETE affected 0 rows'; END IF;

  SELECT count(*) INTO n FROM public.tournament_audit_log WHERE event_id IS NULL AND action = 'event_created';
  -- (event_id was SET NULL by the cascade above; the audit row itself survives.)
  IF n < 1 THEN RAISE EXCEPTION 'FAIL: event_created audit row did not survive the event delete'; END IF;
END $$;

RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'ALL EVENT/COMPETITOR RLS/CONSTRAINT/CONCURRENCY ASSERTIONS PASSED'; END $$;

ROLLBACK;
-- ════════════════════════════════════════════════════════════════════════════════════
-- END tournament_events_tests.sql
-- ════════════════════════════════════════════════════════════════════════════════════
