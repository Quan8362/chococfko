-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT MANAGEMENT SYSTEM — CORE SCHEMA TEST HARNESS
-- CRUD · cross-event integrity (composite FK) · unique/check constraints · BYE · no-tie ·
-- optimistic version bump · RLS (anon / authenticated / service_role) · audit isolation
-- ════════════════════════════════════════════════════════════════════════════════════
-- Run AFTER migration_tournament_core.sql, against an ISOLATED database (local stack /
-- preview branch / SQL editor). The whole script runs in ONE transaction and ROLLs BACK at
-- the end — it persists NOTHING. Any failed assertion RAISEs → the whole run rolls back.
--
-- Setup runs as the connecting superuser (RESET ROLE). RLS sections switch to anon /
-- authenticated / service_role via SET LOCAL ROLE.
--
--   PUB   tournament = published (Guest-visible)          11111111-…
--   DRAFT tournament = draft     (Guest-INVISIBLE)        22222222-…
--   Event A (aaaa…) & Event B (bbbb…) live under PUB; Event D (dddd…) under DRAFT.
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;
RESET ROLE;

-- ── Setup ───────────────────────────────────────────────────────────────────────────────
INSERT INTO public.tournaments (id, slug, name, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'pub-cup',   'Published Cup', 'published'),
  ('22222222-2222-2222-2222-222222222222', 'draft-cup', 'Draft Cup',     'draft');

INSERT INTO public.tournament_events (id, tournament_id, name, format, group_count) VALUES
  ('aaaa1111-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Event A', 'group_knockout', 1),
  ('bbbb1111-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111', 'Event B', 'round_robin',    1),
  ('dddd1111-0000-0000-0000-00000000000d', '22222222-2222-2222-2222-222222222222', 'Event D', 'round_robin',    1);

INSERT INTO public.tournament_competitors (id, event_id, name) VALUES
  ('ca000000-0000-0000-0000-0000000000a1', 'aaaa1111-0000-0000-0000-00000000000a', 'A1'),
  ('ca000000-0000-0000-0000-0000000000a2', 'aaaa1111-0000-0000-0000-00000000000a', 'A2'),
  ('ca000000-0000-0000-0000-0000000000a3', 'aaaa1111-0000-0000-0000-00000000000a', 'A3'),
  ('cb000000-0000-0000-0000-0000000000b1', 'bbbb1111-0000-0000-0000-00000000000b', 'B1'),
  ('cb000000-0000-0000-0000-0000000000b2', 'bbbb1111-0000-0000-0000-00000000000b', 'B2');

INSERT INTO public.tournament_groups (id, event_id, name) VALUES
  ('a1000000-0000-0000-0000-0000000000a1', 'aaaa1111-0000-0000-0000-00000000000a', 'Bảng A'),
  ('b1000000-0000-0000-0000-0000000000b1', 'bbbb1111-0000-0000-0000-00000000000b', 'Bảng A');

INSERT INTO public.tournament_group_memberships (event_id, group_id, competitor_id) VALUES
  ('aaaa1111-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-0000000000a1', 'ca000000-0000-0000-0000-0000000000a1'),
  ('aaaa1111-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-0000000000a1', 'ca000000-0000-0000-0000-0000000000a2');

-- A group match A1 vs A2 with a 2-game score → A1 wins.
INSERT INTO public.tournament_matches
  (id, event_id, group_id, stage, bracket, round_number, match_number,
   competitor_a_id, competitor_b_id, status, winner_competitor_id, generation_key)
VALUES
  ('1a000000-0000-0000-0000-0000000000a1', 'aaaa1111-0000-0000-0000-00000000000a',
   'a1000000-0000-0000-0000-0000000000a1', 'group', NULL, 1, 1,
   'ca000000-0000-0000-0000-0000000000a1', 'ca000000-0000-0000-0000-0000000000a2',
   'completed', 'ca000000-0000-0000-0000-0000000000a1', 'rr:A:1');

INSERT INTO public.tournament_match_games (match_id, game_number, score_a, score_b) VALUES
  ('1a000000-0000-0000-0000-0000000000a1', 1, 21, 15),
  ('1a000000-0000-0000-0000-0000000000a1', 2, 21, 18);

-- A knockout BYE match: A3 auto-advances. NOTE: explicit status='bye', single competitor,
-- winner set, and NO game rows — never a 0–0 score.
INSERT INTO public.tournament_matches
  (id, event_id, stage, bracket, round_number, match_number,
   competitor_a_id, competitor_b_id, status, winner_competitor_id, generation_key)
VALUES
  ('1b000000-0000-0000-0000-0000000000b1', 'aaaa1111-0000-0000-0000-00000000000a',
   'knockout', 'championship', 1, 1,
   'ca000000-0000-0000-0000-0000000000a3', NULL,
   'bye', 'ca000000-0000-0000-0000-0000000000a3', 'ko:champ:r1:m1');

-- Seed slots (championship): a competitor slot + a group-rank slot + a BYE slot.
INSERT INTO public.tournament_knockout_seed_slots
  (event_id, bracket, slot_index, source_type, competitor_id, source_group_id, source_rank) VALUES
  ('aaaa1111-0000-0000-0000-00000000000a', 'championship', 0, 'competitor', 'ca000000-0000-0000-0000-0000000000a3', NULL, NULL),
  ('aaaa1111-0000-0000-0000-00000000000a', 'championship', 1, 'group_rank', NULL, 'a1000000-0000-0000-0000-0000000000a1', 1),
  ('aaaa1111-0000-0000-0000-00000000000a', 'championship', 2, 'bye',        NULL, NULL, NULL);

-- Podium (championship): rank 1 + two joint-3rd (no third-place match).
INSERT INTO public.tournament_podium (event_id, bracket, rank, competitor_id, is_joint) VALUES
  ('aaaa1111-0000-0000-0000-00000000000a', 'championship', 1, 'ca000000-0000-0000-0000-0000000000a1', false),
  ('aaaa1111-0000-0000-0000-00000000000a', 'championship', 3, 'ca000000-0000-0000-0000-0000000000a2', true),
  ('aaaa1111-0000-0000-0000-00000000000a', 'championship', 3, 'ca000000-0000-0000-0000-0000000000a3', true);

INSERT INTO public.tournament_qualification_overrides (event_id, group_id, resolved_order, reason) VALUES
  ('aaaa1111-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-0000000000a1',
   '["ca000000-0000-0000-0000-0000000000a1","ca000000-0000-0000-0000-0000000000a2"]'::jsonb, 'test tie-break');

INSERT INTO public.tournament_audit_log (tournament_id, event_id, action, detail) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaa1111-0000-0000-0000-00000000000a', 'generate_matches', '{"count":1}'::jsonb);

-- Draft tournament children (must stay Guest-invisible).
INSERT INTO public.tournament_competitors (id, event_id, name) VALUES
  ('cd000000-0000-0000-0000-0000000000d1', 'dddd1111-0000-0000-0000-00000000000d', 'D1');

-- ════════════════════════════════════════════════════════════════════════════════════
-- CROSS-EVENT INTEGRITY (composite FK) — all must be REJECTED
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- 1. competitor of Event A into a Group of Event B
  BEGIN
    INSERT INTO public.tournament_group_memberships (event_id, group_id, competitor_id)
    VALUES ('bbbb1111-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-0000000000b1',
            'ca000000-0000-0000-0000-0000000000a1');
    RAISE EXCEPTION 'X1: cross-event membership (A competitor → B group) was NOT rejected';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  -- 2. competitor of Event A used in a Match of Event B
  BEGIN
    INSERT INTO public.tournament_matches
      (event_id, group_id, stage, round_number, match_number, competitor_a_id, competitor_b_id, status, generation_key)
    VALUES ('bbbb1111-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-0000000000b1', 'group', 1, 9,
            'ca000000-0000-0000-0000-0000000000a1', 'cb000000-0000-0000-0000-0000000000b1', 'pending', 'x:crossA');
    RAISE EXCEPTION 'X2: cross-event match competitor (A competitor in B match) was NOT rejected';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  -- 3. group of Event A used in a Match of Event B
  BEGIN
    INSERT INTO public.tournament_matches
      (event_id, group_id, stage, round_number, match_number, competitor_a_id, competitor_b_id, status, generation_key)
    VALUES ('bbbb1111-0000-0000-0000-00000000000b', 'a1000000-0000-0000-0000-0000000000a1', 'group', 1, 8,
            'cb000000-0000-0000-0000-0000000000b1', 'cb000000-0000-0000-0000-0000000000b2', 'pending', 'x:crossG');
    RAISE EXCEPTION 'X3: cross-event match group (A group in B match) was NOT rejected';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  -- 4. seed slot in Event B referencing a group of Event A
  BEGIN
    INSERT INTO public.tournament_knockout_seed_slots
      (event_id, bracket, slot_index, source_type, source_group_id, source_rank)
    VALUES ('bbbb1111-0000-0000-0000-00000000000b', 'championship', 0, 'group_rank',
            'a1000000-0000-0000-0000-0000000000a1', 1);
    RAISE EXCEPTION 'X4: cross-event seed slot (B slot → A group) was NOT rejected';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- UNIQUE / CHECK CONSTRAINTS — all must be REJECTED
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- slug unique
  BEGIN
    INSERT INTO public.tournaments (slug, name) VALUES ('pub-cup', 'Dup Slug');
    RAISE EXCEPTION 'U1: duplicate slug was NOT rejected';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- group name unique within event
  BEGIN
    INSERT INTO public.tournament_groups (event_id, name)
    VALUES ('aaaa1111-0000-0000-0000-00000000000a', 'Bảng A');
    RAISE EXCEPTION 'U2: duplicate group name in same event was NOT rejected';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- competitor in two groups of same event
  BEGIN
    -- second group in event A
    INSERT INTO public.tournament_groups (id, event_id, name)
      VALUES ('a1000000-0000-0000-0000-0000000000a2', 'aaaa1111-0000-0000-0000-00000000000a', 'Bảng B');
    INSERT INTO public.tournament_group_memberships (event_id, group_id, competitor_id)
      VALUES ('aaaa1111-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-0000000000a2',
              'ca000000-0000-0000-0000-0000000000a1'); -- already in Bảng A
    RAISE EXCEPTION 'U3: competitor in two groups of same event was NOT rejected';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- generation_key unique within event
  BEGIN
    INSERT INTO public.tournament_matches
      (event_id, group_id, stage, round_number, match_number, status, generation_key)
    VALUES ('aaaa1111-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-0000000000a1', 'group', 1, 2, 'pending', 'rr:A:1');
    RAISE EXCEPTION 'U4: duplicate generation_key in event was NOT rejected';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- game_number unique within match
  BEGIN
    INSERT INTO public.tournament_match_games (match_id, game_number, score_a, score_b)
    VALUES ('1a000000-0000-0000-0000-0000000000a1', 1, 10, 5);
    RAISE EXCEPTION 'U5: duplicate game_number in match was NOT rejected';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- seed slot unique per (event, bracket, index)
  BEGIN
    INSERT INTO public.tournament_knockout_seed_slots (event_id, bracket, slot_index, source_type, competitor_id)
    VALUES ('aaaa1111-0000-0000-0000-00000000000a', 'championship', 0, 'competitor', 'ca000000-0000-0000-0000-0000000000a2');
    RAISE EXCEPTION 'U6: duplicate seed slot index was NOT rejected';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- same group-rank source twice in one branch
  BEGIN
    INSERT INTO public.tournament_knockout_seed_slots (event_id, bracket, slot_index, source_type, source_group_id, source_rank)
    VALUES ('aaaa1111-0000-0000-0000-00000000000a', 'championship', 5, 'group_rank', 'a1000000-0000-0000-0000-0000000000a1', 1);
    RAISE EXCEPTION 'U7: duplicate group-rank source in branch was NOT rejected';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- podium rank 1 duplicated in branch
  BEGIN
    INSERT INTO public.tournament_podium (event_id, bracket, rank, competitor_id)
    VALUES ('aaaa1111-0000-0000-0000-00000000000a', 'championship', 1, 'ca000000-0000-0000-0000-0000000000a3');
    RAISE EXCEPTION 'U8: duplicate podium rank 1 was NOT rejected';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- match_games tie
  BEGIN
    INSERT INTO public.tournament_match_games (match_id, game_number, score_a, score_b)
    VALUES ('1a000000-0000-0000-0000-0000000000a1', 3, 20, 20);
    RAISE EXCEPTION 'C1: tied game score was NOT rejected';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- negative score
  BEGIN
    INSERT INTO public.tournament_match_games (match_id, game_number, score_a, score_b)
    VALUES ('1a000000-0000-0000-0000-0000000000a1', 4, -1, 5);
    RAISE EXCEPTION 'C2: negative score was NOT rejected';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- dates order
  BEGIN
    INSERT INTO public.tournaments (slug, name, starts_at, ends_at)
    VALUES ('bad-dates', 'Bad', '2026-02-01', '2026-01-01');
    RAISE EXCEPTION 'C3: ends_at before starts_at was NOT rejected';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- group_knockout with 0 winner qualifiers
  BEGIN
    INSERT INTO public.tournament_events (tournament_id, name, format, winner_qualifiers_per_group)
    VALUES ('11111111-1111-1111-1111-111111111111', 'Bad GK', 'group_knockout', 0);
    RAISE EXCEPTION 'C4: group_knockout with 0 championship qualifiers was NOT rejected';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- BYE with two competitors present
  BEGIN
    INSERT INTO public.tournament_matches
      (event_id, stage, bracket, round_number, match_number, competitor_a_id, competitor_b_id,
       status, winner_competitor_id, generation_key)
    VALUES ('aaaa1111-0000-0000-0000-00000000000a', 'knockout', 'championship', 1, 7,
            'ca000000-0000-0000-0000-0000000000a1', 'ca000000-0000-0000-0000-0000000000a2',
            'bye', 'ca000000-0000-0000-0000-0000000000a1', 'ko:badbye');
    RAISE EXCEPTION 'C5: BYE with two competitors was NOT rejected';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- winner not a participant
  BEGIN
    INSERT INTO public.tournament_matches
      (event_id, group_id, stage, round_number, match_number, competitor_a_id, competitor_b_id,
       status, winner_competitor_id, generation_key)
    VALUES ('aaaa1111-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-0000000000a1', 'group', 1, 6,
            'ca000000-0000-0000-0000-0000000000a1', 'ca000000-0000-0000-0000-0000000000a2',
            'completed', 'ca000000-0000-0000-0000-0000000000a3', 'g:badwinner');
    RAISE EXCEPTION 'C6: winner not among participants was NOT rejected';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- PLACEHOLDER PARTICIPANTS + OPTIMISTIC VERSION BUMP — must SUCCEED
-- ════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v0 int; v1 int;
BEGIN
  -- Placeholder knockout match: both competitors NULL (later round), sources point to earlier matches.
  INSERT INTO public.tournament_matches
    (id, event_id, stage, bracket, round_number, match_number,
     source_match_a_id, source_outcome_a, status, generation_key)
  VALUES ('1c000000-0000-0000-0000-0000000000c1', 'aaaa1111-0000-0000-0000-00000000000a',
          'knockout', 'championship', 2, 1,
          '1b000000-0000-0000-0000-0000000000b1', 'winner', 'pending', 'ko:champ:r2:m1');

  SELECT version INTO v0 FROM public.tournament_matches WHERE id = '1a000000-0000-0000-0000-0000000000a1';
  UPDATE public.tournament_matches SET status = 'completed'
    WHERE id = '1a000000-0000-0000-0000-0000000000a1' AND version = v0;
  IF NOT FOUND THEN RAISE EXCEPTION 'V1: version-guarded update did not match'; END IF;
  SELECT version INTO v1 FROM public.tournament_matches WHERE id = '1a000000-0000-0000-0000-0000000000a1';
  IF v1 <> v0 + 1 THEN RAISE EXCEPTION 'V2: version did not bump (%->%)', v0, v1; END IF;

  -- A stale-version update (simulating a second Admin) must affect 0 rows.
  UPDATE public.tournament_matches SET status = 'ready'
    WHERE id = '1a000000-0000-0000-0000-0000000000a1' AND version = v0;
  IF FOUND THEN RAISE EXCEPTION 'V3: stale-version update unexpectedly succeeded'; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- RLS — GUEST (anon) VISIBILITY
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE anon;
DO $$
DECLARE n int;
BEGIN
  -- Published tournament visible.
  SELECT count(*) INTO n FROM public.tournaments WHERE id = '11111111-1111-1111-1111-111111111111';
  IF n <> 1 THEN RAISE EXCEPTION 'R1: anon cannot see published tournament (n=%)', n; END IF;

  -- Draft tournament INVISIBLE.
  SELECT count(*) INTO n FROM public.tournaments WHERE id = '22222222-2222-2222-2222-222222222222';
  IF n <> 0 THEN RAISE EXCEPTION 'R2: anon can see DRAFT tournament (n=%)', n; END IF;

  -- Published children visible.
  SELECT count(*) INTO n FROM public.tournament_events WHERE tournament_id = '11111111-1111-1111-1111-111111111111';
  IF n <> 2 THEN RAISE EXCEPTION 'R3: anon cannot see published events (n=%)', n; END IF;
  SELECT count(*) INTO n FROM public.tournament_competitors WHERE event_id = 'aaaa1111-0000-0000-0000-00000000000a';
  IF n <> 3 THEN RAISE EXCEPTION 'R4: anon cannot see published competitors (n=%)', n; END IF;
  SELECT count(*) INTO n FROM public.tournament_match_games WHERE match_id = '1a000000-0000-0000-0000-0000000000a1';
  IF n <> 2 THEN RAISE EXCEPTION 'R5: anon cannot see published match games (n=%)', n; END IF;
  SELECT count(*) INTO n FROM public.tournament_podium WHERE event_id = 'aaaa1111-0000-0000-0000-00000000000a';
  IF n <> 3 THEN RAISE EXCEPTION 'R6: anon cannot see published podium (n=%)', n; END IF;

  -- DRAFT child (competitor D1) INVISIBLE even by direct query.
  SELECT count(*) INTO n FROM public.tournament_competitors WHERE event_id = 'dddd1111-0000-0000-0000-00000000000d';
  IF n <> 0 THEN RAISE EXCEPTION 'R7: anon can see DRAFT competitor by direct query (n=%)', n; END IF;

  -- Audit log NEVER visible: anon has no SELECT privilege at all → permission denied.
  BEGIN
    SELECT count(*) INTO n FROM public.tournament_audit_log;
    RAISE EXCEPTION 'R8: anon can read audit log (n=%)', n;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- anon writes must be DENIED (no write grant / no write policy).
DO $$
BEGIN
  BEGIN
    INSERT INTO public.tournaments (slug, name) VALUES ('anon-hack', 'Hack');
    RAISE EXCEPTION 'R9: anon INSERT into tournaments was NOT denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    UPDATE public.tournaments SET name = 'x' WHERE id = '11111111-1111-1111-1111-111111111111';
    RAISE EXCEPTION 'R10: anon UPDATE tournaments was NOT denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    DELETE FROM public.tournament_matches WHERE id = '1a000000-0000-0000-0000-0000000000a1';
    RAISE EXCEPTION 'R11: anon DELETE matches was NOT denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════════════
-- RLS — LOGGED-IN NON-ADMIN (authenticated) == GUEST
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.tournaments WHERE id = '22222222-2222-2222-2222-222222222222';
  IF n <> 0 THEN RAISE EXCEPTION 'R12: authenticated non-admin can see DRAFT (n=%)', n; END IF;
  BEGIN
    SELECT count(*) INTO n FROM public.tournament_audit_log;
    RAISE EXCEPTION 'R13: authenticated non-admin can read audit log (n=%)', n;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.tournament_competitors (event_id, name)
    VALUES ('aaaa1111-0000-0000-0000-00000000000a', 'Injected');
    RAISE EXCEPTION 'R14: authenticated non-admin INSERT was NOT denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════════════
-- RLS — SERVICE ROLE sees everything and can write
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE service_role;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.tournaments;              -- both PUB + DRAFT
  IF n <> 2 THEN RAISE EXCEPTION 'S1: service_role cannot see all tournaments (n=%)', n; END IF;
  SELECT count(*) INTO n FROM public.tournament_audit_log;     -- audit visible to service
  IF n <> 1 THEN RAISE EXCEPTION 'S2: service_role cannot read audit log (n=%)', n; END IF;

  INSERT INTO public.tournament_audit_log (tournament_id, action) VALUES
    ('22222222-2222-2222-2222-222222222222', 'publish');
  SELECT count(*) INTO n FROM public.tournament_audit_log;
  IF n <> 2 THEN RAISE EXCEPTION 'S3: service_role cannot write audit log (n=%)', n; END IF;
END $$;
RESET ROLE;

-- ── All assertions passed. Persist nothing. ────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'tournament_core_tests: ALL ASSERTIONS PASSED'; END $$;
ROLLBACK;
