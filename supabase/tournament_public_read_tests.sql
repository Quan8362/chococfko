-- ════════════════════════════════════════════════════════════════════════════════════
-- tournament_public_read_tests.sql — Prompt 10 (Public Guest read layer)
-- Verifies the RLS visibility the public pages rely on, from the ANON and AUTHENTICATED
-- (non-admin) perspectives: Guests see ONLY 'published' + 'completed' tournaments and their
-- children; 'draft'/'archived' are invisible; the audit log is never readable; Guests cannot
-- write. Complements tournament_core_tests.sql (which covers published/draft) by adding the
-- 'completed' and 'archived' cases the public pages must get right.
--
-- Self-contained: wrapped in BEGIN … ROLLBACK — persists NOTHING. Any failed assertion RAISEs
-- → the whole run rolls back. Setup runs as the connecting superuser (RESET ROLE); RLS sections
-- switch to anon / authenticated via SET LOCAL ROLE. Run against Supabase LOCAL only.
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;
RESET ROLE;

-- ── Setup: one tournament of each status ────────────────────────────────────────────────
INSERT INTO public.tournaments (id, slug, name, status) VALUES
  ('f1111111-1111-1111-1111-111111111111', 'pr-published', 'Published',  'published'),
  ('f2222222-2222-2222-2222-222222222222', 'pr-completed', 'Completed',  'completed'),
  ('f3333333-3333-3333-3333-333333333333', 'pr-draft',     'Draft',      'draft'),
  ('f4444444-4444-4444-4444-444444444444', 'pr-archived',  'Archived',   'archived');

INSERT INTO public.tournament_events (id, tournament_id, name, format, group_count, third_place_enabled) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111111', 'RR', 'round_robin', 1, false),
  ('e2000000-0000-0000-0000-000000000002', 'f2222222-2222-2222-2222-222222222222', 'KO', 'knockout',    1, false),
  ('e3000000-0000-0000-0000-000000000003', 'f3333333-3333-3333-3333-333333333333', 'DR', 'round_robin', 1, false),
  ('e4000000-0000-0000-0000-000000000004', 'f4444444-4444-4444-4444-444444444444', 'AR', 'round_robin', 1, false);

INSERT INTO public.tournament_competitors (id, event_id, name) VALUES
  ('10000000-0000-0000-0000-0000000000a1', 'e1000000-0000-0000-0000-000000000001', 'P-A1'),
  ('10000000-0000-0000-0000-0000000000a2', 'e1000000-0000-0000-0000-000000000001', 'P-A2'),
  ('20000000-0000-0000-0000-0000000000c1', 'e2000000-0000-0000-0000-000000000002', 'C-1'),
  ('20000000-0000-0000-0000-0000000000c2', 'e2000000-0000-0000-0000-000000000002', 'C-2'),
  ('30000000-0000-0000-0000-0000000000d1', 'e3000000-0000-0000-0000-000000000003', 'D-1'),
  ('40000000-0000-0000-0000-0000000000e1', 'e4000000-0000-0000-0000-000000000004', 'A-1');

-- Published (round_robin): one completed group match with a 2-game score + a tie-break override.
INSERT INTO public.tournament_groups (id, event_id, name) VALUES
  ('a9000000-0000-0000-0000-000000000091', 'e1000000-0000-0000-0000-000000000001', 'Bảng A');
INSERT INTO public.tournament_group_memberships (event_id, group_id, competitor_id) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000091', '10000000-0000-0000-0000-0000000000a1'),
  ('e1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000091', '10000000-0000-0000-0000-0000000000a2');
INSERT INTO public.tournament_matches
  (id, event_id, group_id, stage, bracket, round_number, match_number,
   competitor_a_id, competitor_b_id, status, winner_competitor_id, generation_key)
VALUES
  ('19000000-0000-0000-0000-000000000091', 'e1000000-0000-0000-0000-000000000001',
   'a9000000-0000-0000-0000-000000000091', 'group', NULL, 1, 1,
   '10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a2',
   'completed', '10000000-0000-0000-0000-0000000000a1', 'rr:A:1');
INSERT INTO public.tournament_match_games (match_id, game_number, score_a, score_b) VALUES
  ('19000000-0000-0000-0000-000000000091', 1, 21, 15),
  ('19000000-0000-0000-0000-000000000091', 2, 21, 18);
INSERT INTO public.tournament_qualification_overrides (event_id, group_id, resolved_order, reason) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000091',
   '["10000000-0000-0000-0000-0000000000a1","10000000-0000-0000-0000-0000000000a2"]'::jsonb, 'internal reason');

-- Completed (knockout): a completed final + podium.
INSERT INTO public.tournament_matches
  (id, event_id, stage, bracket, round_number, match_number,
   competitor_a_id, competitor_b_id, status, winner_competitor_id, generation_key)
VALUES
  ('29000000-0000-0000-0000-000000000092', 'e2000000-0000-0000-0000-000000000002',
   'knockout', 'championship', 1, 1,
   '20000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c2',
   'completed', '20000000-0000-0000-0000-0000000000c1', 'ko:championship:r1:m1');
INSERT INTO public.tournament_match_games (match_id, game_number, score_a, score_b) VALUES
  ('29000000-0000-0000-0000-000000000092', 1, 21, 12),
  ('29000000-0000-0000-0000-000000000092', 2, 21, 19);
INSERT INTO public.tournament_podium (event_id, bracket, rank, competitor_id, is_joint) VALUES
  ('e2000000-0000-0000-0000-000000000002', 'championship', 1, '20000000-0000-0000-0000-0000000000c1', false),
  ('e2000000-0000-0000-0000-000000000002', 'championship', 2, '20000000-0000-0000-0000-0000000000c2', false);

-- Audit rows (must never be Guest-readable).
INSERT INTO public.tournament_audit_log (tournament_id, event_id, action, detail) VALUES
  ('f1111111-1111-1111-1111-111111111111', 'e1000000-0000-0000-0000-000000000001', 'seed', '{}'::jsonb),
  ('f2222222-2222-2222-2222-222222222222', 'e2000000-0000-0000-0000-000000000002', 'seed', '{}'::jsonb);

-- ════════════════════════════════════════════════════════════════════════════════════
-- ANON (Guest) VISIBILITY
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE anon;
DO $$
DECLARE n int;
BEGIN
  -- Published + completed tournaments visible; draft + archived invisible.
  SELECT count(*) INTO n FROM public.tournaments
   WHERE id IN ('f1111111-1111-1111-1111-111111111111','f2222222-2222-2222-2222-222222222222');
  IF n <> 2 THEN RAISE EXCEPTION 'P1: anon cannot see published+completed tournaments (n=%)', n; END IF;

  SELECT count(*) INTO n FROM public.tournaments
   WHERE id IN ('f3333333-3333-3333-3333-333333333333','f4444444-4444-4444-4444-444444444444');
  IF n <> 0 THEN RAISE EXCEPTION 'P2: anon can see DRAFT/ARCHIVED tournaments (n=%)', n; END IF;

  -- Events: published + completed visible; draft + archived invisible.
  SELECT count(*) INTO n FROM public.tournament_events
   WHERE id IN ('e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000002');
  IF n <> 2 THEN RAISE EXCEPTION 'P3: anon cannot see published+completed events (n=%)', n; END IF;
  SELECT count(*) INTO n FROM public.tournament_events
   WHERE id IN ('e3000000-0000-0000-0000-000000000003','e4000000-0000-0000-0000-000000000004');
  IF n <> 0 THEN RAISE EXCEPTION 'P4: anon can see DRAFT/ARCHIVED events (n=%)', n; END IF;

  -- Competitors gated by event visibility.
  SELECT count(*) INTO n FROM public.tournament_competitors
   WHERE event_id IN ('e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000002');
  IF n <> 4 THEN RAISE EXCEPTION 'P5: anon cannot see published+completed competitors (n=%)', n; END IF;
  SELECT count(*) INTO n FROM public.tournament_competitors
   WHERE event_id IN ('e3000000-0000-0000-0000-000000000003','e4000000-0000-0000-0000-000000000004');
  IF n <> 0 THEN RAISE EXCEPTION 'P6: anon can see DRAFT/ARCHIVED competitors (n=%)', n; END IF;

  -- Match games of published + completed matches visible (2 each = 4).
  SELECT count(*) INTO n FROM public.tournament_match_games
   WHERE match_id IN ('19000000-0000-0000-0000-000000000091','29000000-0000-0000-0000-000000000092');
  IF n <> 4 THEN RAISE EXCEPTION 'P7: anon cannot see published+completed match games (n=%)', n; END IF;

  -- Qualification override readable (public standings need resolved_order).
  SELECT count(*) INTO n FROM public.tournament_qualification_overrides
   WHERE event_id = 'e1000000-0000-0000-0000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'P8: anon cannot see override for standings (n=%)', n; END IF;

  -- Completed-tournament podium readable.
  SELECT count(*) INTO n FROM public.tournament_podium
   WHERE event_id = 'e2000000-0000-0000-0000-000000000002';
  IF n <> 2 THEN RAISE EXCEPTION 'P9: anon cannot see completed podium (n=%)', n; END IF;

  -- Audit log NEVER visible (no SELECT grant at all → permission denied).
  BEGIN
    SELECT count(*) INTO n FROM public.tournament_audit_log;
    RAISE EXCEPTION 'P10: anon can read audit log (n=%)', n;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- Anon writes denied.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.tournament_competitors (event_id, name)
    VALUES ('e1000000-0000-0000-0000-000000000001', 'anon-injected');
    RAISE EXCEPTION 'P11: anon INSERT competitor was NOT denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    UPDATE public.tournaments SET name = 'x' WHERE id = 'f2222222-2222-2222-2222-222222222222';
    RAISE EXCEPTION 'P12: anon UPDATE tournament was NOT denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════════════
-- AUTHENTICATED NON-ADMIN == GUEST (same read model)
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}', true);
DO $$
DECLARE n int;
BEGIN
  -- Completed visible; draft/archived invisible (parity with anon).
  SELECT count(*) INTO n FROM public.tournaments WHERE id = 'f2222222-2222-2222-2222-222222222222';
  IF n <> 1 THEN RAISE EXCEPTION 'P13: non-admin cannot see completed tournament (n=%)', n; END IF;
  SELECT count(*) INTO n FROM public.tournaments
   WHERE id IN ('f3333333-3333-3333-3333-333333333333','f4444444-4444-4444-4444-444444444444');
  IF n <> 0 THEN RAISE EXCEPTION 'P14: non-admin can see DRAFT/ARCHIVED (n=%)', n; END IF;

  BEGIN
    SELECT count(*) INTO n FROM public.tournament_audit_log;
    RAISE EXCEPTION 'P15: non-admin can read audit log (n=%)', n;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    INSERT INTO public.tournament_competitors (event_id, name)
    VALUES ('e2000000-0000-0000-0000-000000000002', 'auth-injected');
    RAISE EXCEPTION 'P16: non-admin INSERT was NOT denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'ALL PUBLIC-READ RLS ASSERTIONS PASSED'; END $$;

ROLLBACK;
