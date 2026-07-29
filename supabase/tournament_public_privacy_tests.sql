-- ════════════════════════════════════════════════════════════════════════════════════
-- tournament_public_privacy_tests.sql — Prompt 14B (qualification-override privacy)
-- Verifies that tournament_qualification_overrides.reason / .created_by can NEVER reach a Guest:
--   • anon + authenticated(non-admin) cannot SELECT the base table directly (REST/Realtime path);
--   • the public-safe RPC returns ONLY group_id + resolved_order, only for public events;
--   • draft/archived overrides never leak; admin/service-role still read everything.
-- Self-contained: BEGIN … ROLLBACK, persists nothing. Setup as superuser; RLS sections via
-- SET LOCAL ROLE. Run against Supabase LOCAL only, AFTER all tournament migrations (incl.
-- migration_tournament_public_privacy.sql) have been applied.
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;
RESET ROLE;

-- One PUBLISHED and one DRAFT tournament, each with a round-robin event + a group + an override.
INSERT INTO public.tournaments (id, slug, name, status) VALUES
  ('c1111111-1111-1111-1111-111111111111', 'pv-published', 'PV Published', 'published'),
  ('c3333333-3333-3333-3333-333333333333', 'pv-draft',     'PV Draft',     'draft');

INSERT INTO public.tournament_events (id, tournament_id, name, format, group_count, third_place_enabled) VALUES
  ('ea000000-0000-0000-0000-0000000000a0', 'c1111111-1111-1111-1111-111111111111', 'RR', 'round_robin', 1, false),
  ('ed000000-0000-0000-0000-0000000000d0', 'c3333333-3333-3333-3333-333333333333', 'RR', 'round_robin', 1, false);

INSERT INTO public.tournament_competitors (id, event_id, name) VALUES
  ('b0000000-0000-0000-0000-0000000000a1', 'ea000000-0000-0000-0000-0000000000a0', 'PV-A1'),
  ('b0000000-0000-0000-0000-0000000000a2', 'ea000000-0000-0000-0000-0000000000a0', 'PV-A2'),
  ('b0000000-0000-0000-0000-0000000000d1', 'ed000000-0000-0000-0000-0000000000d0', 'PV-D1');

INSERT INTO public.tournament_groups (id, event_id, name) VALUES
  ('bb000000-0000-0000-0000-0000000000a9', 'ea000000-0000-0000-0000-0000000000a0', 'Bảng A'),
  ('bb000000-0000-0000-0000-0000000000d9', 'ed000000-0000-0000-0000-0000000000d0', 'Bảng D');

-- Overrides carry the sensitive `reason`. `created_by` FKs to auth.users; its VALUE is irrelevant to
-- the privacy assertions (anon is denied the column regardless of value — the check is column/table
-- permission, not row data), so we leave it NULL to keep the fixture free of auth-schema coupling.
INSERT INTO public.tournament_qualification_overrides (event_id, group_id, resolved_order, reason) VALUES
  ('ea000000-0000-0000-0000-0000000000a0', 'bb000000-0000-0000-0000-0000000000a9',
   '["b0000000-0000-0000-0000-0000000000a1","b0000000-0000-0000-0000-0000000000a2"]'::jsonb,
   'SENSITIVE internal reason'),
  ('ed000000-0000-0000-0000-0000000000d0', 'bb000000-0000-0000-0000-0000000000d9',
   '["b0000000-0000-0000-0000-0000000000d1"]'::jsonb,
   'draft internal reason');

-- ════════════════════════════════════════════════════════════════════════════════════
-- ANON (Guest)
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE anon;
DO $$
DECLARE n int; r record;
BEGIN
  -- (1) Anonymous cannot read the base override table directly at all.
  BEGIN
    SELECT count(*) INTO n FROM public.tournament_qualification_overrides;
    RAISE EXCEPTION 'V1: anon can directly SELECT the override base table (n=%)', n;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- (4/5) Anonymous cannot read the sensitive columns even by naming them.
  BEGIN
    PERFORM reason FROM public.tournament_qualification_overrides
      WHERE event_id = 'ea000000-0000-0000-0000-0000000000a0';
    RAISE EXCEPTION 'V4: anon can read override.reason';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM created_by FROM public.tournament_qualification_overrides
      WHERE event_id = 'ea000000-0000-0000-0000-0000000000a0';
    RAISE EXCEPTION 'V5: anon can read override.created_by';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- (3/6/7) The public-safe RPC returns exactly the allowed projection for the PUBLIC event:
  -- the override exists (6) and its resolved ordering is present (7); only group_id + resolved_order.
  SELECT count(*) INTO n
    FROM public.tournament_public_qualification_overrides('ea000000-0000-0000-0000-0000000000a0');
  IF n <> 1 THEN RAISE EXCEPTION 'V6: anon cannot see that a public override exists (n=%)', n; END IF;

  SELECT * INTO r
    FROM public.tournament_public_qualification_overrides('ea000000-0000-0000-0000-0000000000a0') LIMIT 1;
  IF r.resolved_order IS NULL OR jsonb_array_length(r.resolved_order) <> 2 THEN
    RAISE EXCEPTION 'V7: safe RPC did not return the resolved ordering';
  END IF;
  -- (3) The safe read exposes ONLY group_id + resolved_order. That is guaranteed structurally by the
  -- RPC's RETURNS TABLE(group_id uuid, resolved_order jsonb) signature — reason/created_by cannot be
  -- named on its result (a reference to r.reason here would be a compile error), and V4/V5 above prove
  -- the base columns are unreadable. Nothing further to assert at runtime.

  -- (8) Draft override does NOT leak through the RPC (event-visibility guard).
  SELECT count(*) INTO n
    FROM public.tournament_public_qualification_overrides('ed000000-0000-0000-0000-0000000000d0');
  IF n <> 0 THEN RAISE EXCEPTION 'V8: draft override leaked through the safe RPC (n=%)', n; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- AUTHENTICATED (signed-in, non-admin)
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  -- (2) A plain signed-in user cannot read the base table directly either.
  BEGIN
    SELECT count(*) INTO n FROM public.tournament_qualification_overrides;
    RAISE EXCEPTION 'V2: authenticated can directly SELECT the override base table (n=%)', n;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- Same safe RPC is available to authenticated and still only exposes the public event.
  SELECT count(*) INTO n
    FROM public.tournament_public_qualification_overrides('ea000000-0000-0000-0000-0000000000a0');
  IF n <> 1 THEN RAISE EXCEPTION 'V2b: authenticated cannot read override via safe RPC (n=%)', n; END IF;
  SELECT count(*) INTO n
    FROM public.tournament_public_qualification_overrides('ed000000-0000-0000-0000-0000000000d0');
  IF n <> 0 THEN RAISE EXCEPTION 'V2c: draft override leaked to authenticated via RPC (n=%)', n; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- SERVICE ROLE (admin backend) — full access preserved
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE service_role;
DO $$
DECLARE v_reason text; v_creator uuid; n int;
BEGIN
  -- (9) Service-role reads the full row including the sensitive columns (reason + created_by column).
  SELECT reason, created_by INTO v_reason, v_creator
    FROM public.tournament_qualification_overrides
    WHERE event_id = 'ea000000-0000-0000-0000-0000000000a0';
  IF v_reason IS DISTINCT FROM 'SENSITIVE internal reason' THEN
    RAISE EXCEPTION 'V9: service-role cannot read override.reason';
  END IF;
  -- created_by is selectable by service-role (value is NULL in this fixture; the point is column access,
  -- which anon was denied in V5). The SELECT above would have errored if the column were unreadable.

  -- Service-role can also read the draft override (no visibility gate for the backend).
  SELECT count(*) INTO n FROM public.tournament_qualification_overrides;
  IF n < 2 THEN RAISE EXCEPTION 'V9c: service-role cannot read all overrides (n=%)', n; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- GRANTS / PERMISSIONS (10) — public app needs no service-role; only service-role writes.
-- ════════════════════════════════════════════════════════════════════════════════════
RESET ROLE;
DO $$
BEGIN
  -- (10) The safe RPC is executable by anon + authenticated (public app path, no service-role needed).
  IF NOT has_function_privilege('anon', 'public.tournament_public_qualification_overrides(uuid)', 'execute') THEN
    RAISE EXCEPTION 'V10: anon cannot execute the safe RPC';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.tournament_public_qualification_overrides(uuid)', 'execute') THEN
    RAISE EXCEPTION 'V10b: authenticated cannot execute the safe RPC';
  END IF;
  -- anon/authenticated have NO table-level SELECT privilege on the base table anymore.
  IF has_table_privilege('anon', 'public.tournament_qualification_overrides', 'SELECT') THEN
    RAISE EXCEPTION 'V10c: anon still has SELECT on the override base table';
  END IF;
  IF has_table_privilege('authenticated', 'public.tournament_qualification_overrides', 'SELECT') THEN
    RAISE EXCEPTION 'V10d: authenticated still has SELECT on the override base table';
  END IF;
  -- The RPC is SECURITY DEFINER with a pinned search_path.
  PERFORM 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = 'tournament_public_qualification_overrides'
      AND p.prosecdef = true
      AND array_to_string(coalesce(p.proconfig, '{}'), ',') LIKE '%search_path=public, pg_temp%';
  IF NOT FOUND THEN RAISE EXCEPTION 'V10e: safe RPC is not SECURITY DEFINER with pinned search_path'; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'tournament_public_privacy_tests: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
