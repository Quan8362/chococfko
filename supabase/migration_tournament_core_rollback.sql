-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT MANAGEMENT SYSTEM — CORE SCHEMA — ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════════════
-- Drops ONLY the objects migration_tournament_core.sql created. Non-destructive to every
-- existing Poker / TLMN / Caro / wallet / places object. Order: children → parents so FKs
-- (incl. composite FKs) drop cleanly. CASCADE on the tables also removes their policies,
-- triggers, indexes and constraints.
--
-- The shared update_updated_at_column() trigger fn is NOT dropped (owned by earlier migrations).
-- ════════════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.tournament_audit_log               CASCADE;
DROP TABLE IF EXISTS public.tournament_podium                  CASCADE;
DROP TABLE IF EXISTS public.tournament_qualification_overrides CASCADE;
DROP TABLE IF EXISTS public.tournament_knockout_seed_slots     CASCADE;
DROP TABLE IF EXISTS public.tournament_match_games             CASCADE;
DROP TABLE IF EXISTS public.tournament_matches                 CASCADE;
DROP TABLE IF EXISTS public.tournament_group_memberships       CASCADE;
DROP TABLE IF EXISTS public.tournament_groups                  CASCADE;
DROP TABLE IF EXISTS public.tournament_competitors             CASCADE;
DROP TABLE IF EXISTS public.tournament_events                  CASCADE;
DROP TABLE IF EXISTS public.tournaments                        CASCADE;

DROP FUNCTION IF EXISTS public.tournament_bump_version()       CASCADE;
DROP FUNCTION IF EXISTS public.tournament_match_is_public(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tournament_event_is_public(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tournament_is_public(uuid)       CASCADE;

NOTIFY pgrst, 'reload schema';
