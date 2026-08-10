-- ════════════════════════════════════════════════════════════════════════════════════
-- tournament_home_promo_tests.sql — admin-controlled home-promo flag
-- Verifies:
--   • the column exists with the correct default (false) and NOT NULL;
--   • existing/new tournaments default to NON-promoted;
--   • anon (public promo path) CAN read the flag for a published tournament, but still cannot
--     read a draft one (RLS visibility unchanged), and CANNOT write it;
--   • service-role (the Admin write path) can toggle it.
-- Self-contained: BEGIN … ROLLBACK, persists nothing. Run against Supabase LOCAL only, AFTER
-- migration_tournament_core.sql AND migration_tournament_home_promo.sql are applied.
-- ════════════════════════════════════════════════════════════════════════════════════

BEGIN;
RESET ROLE;

-- (0) Column shape: exists, boolean, NOT NULL, default false.
DO $$
DECLARE v_default text; v_nullable text; v_type text;
BEGIN
  SELECT column_default, is_nullable, data_type
    INTO v_default, v_nullable, v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'home_promo_enabled';
  IF NOT FOUND THEN RAISE EXCEPTION 'C0: home_promo_enabled column missing'; END IF;
  IF v_type <> 'boolean' THEN RAISE EXCEPTION 'C0a: wrong type % (want boolean)', v_type; END IF;
  IF v_nullable <> 'NO' THEN RAISE EXCEPTION 'C0b: column is nullable (want NOT NULL)'; END IF;
  IF v_default IS NULL OR v_default NOT LIKE 'false%' THEN
    RAISE EXCEPTION 'C0c: default is % (want false)', v_default;
  END IF;
END $$;

-- One PUBLISHED (promo ON) and one DRAFT (promo ON but never public) tournament, plus one
-- published row created WITHOUT specifying the flag (proves the default).
INSERT INTO public.tournaments (id, slug, name, status, home_promo_enabled) VALUES
  ('d1111111-1111-1111-1111-111111111111', 'hp-published', 'HP Published', 'published', true),
  ('d3333333-3333-3333-3333-333333333333', 'hp-draft',     'HP Draft',     'draft',     true);

INSERT INTO public.tournaments (id, slug, name, status) VALUES
  ('d2222222-2222-2222-2222-222222222222', 'hp-default', 'HP Default', 'published');

-- (1) The row inserted without the flag defaults to false.
DO $$
DECLARE v boolean;
BEGIN
  SELECT home_promo_enabled INTO v FROM public.tournaments WHERE id = 'd2222222-2222-2222-2222-222222222222';
  IF v IS DISTINCT FROM false THEN RAISE EXCEPTION 'C1: new tournament did not default to false (got %)', v; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ANON (public promo path — RLS-gated read)
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE anon;
DO $$
DECLARE v boolean; n int;
BEGIN
  -- (2) Anon reads the flag for a PUBLISHED tournament (this is exactly what the promo query does).
  SELECT home_promo_enabled INTO v FROM public.tournaments WHERE id = 'd1111111-1111-1111-1111-111111111111';
  IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'C2: anon cannot read the promo flag of a published tournament'; END IF;

  -- (3) A DRAFT tournament is invisible to anon even with the flag on (RLS visibility unchanged).
  SELECT count(*) INTO n FROM public.tournaments WHERE id = 'd3333333-3333-3333-3333-333333333333';
  IF n <> 0 THEN RAISE EXCEPTION 'C3: draft tournament visible to anon (n=%)', n; END IF;

  -- (4) Anon cannot flip the flag (writes are service-role only; core REVOKEd UPDATE from anon).
  BEGIN
    UPDATE public.tournaments SET home_promo_enabled = false
      WHERE id = 'd1111111-1111-1111-1111-111111111111';
    RAISE EXCEPTION 'C4: anon was able to UPDATE home_promo_enabled';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- AUTHENTICATED (signed-in, non-admin) — also cannot write.
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    UPDATE public.tournaments SET home_promo_enabled = true
      WHERE id = 'd2222222-2222-2222-2222-222222222222';
    RAISE EXCEPTION 'C5: authenticated was able to UPDATE home_promo_enabled';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- SERVICE ROLE (the Admin write path) — can toggle the flag.
-- ════════════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE service_role;
DO $$
DECLARE v boolean;
BEGIN
  UPDATE public.tournaments SET home_promo_enabled = true
    WHERE id = 'd2222222-2222-2222-2222-222222222222';
  SELECT home_promo_enabled INTO v FROM public.tournaments WHERE id = 'd2222222-2222-2222-2222-222222222222';
  IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'C6: service-role could not enable the promo flag'; END IF;

  UPDATE public.tournaments SET home_promo_enabled = false
    WHERE id = 'd2222222-2222-2222-2222-222222222222';
  SELECT home_promo_enabled INTO v FROM public.tournaments WHERE id = 'd2222222-2222-2222-2222-222222222222';
  IF v IS DISTINCT FROM false THEN RAISE EXCEPTION 'C6b: service-role could not disable the promo flag'; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'tournament_home_promo_tests: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
