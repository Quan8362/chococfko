-- ════════════════════════════════════════════════════════════════════════════════════════════
-- migration_tournament_rule_engine_rollback.sql  (reverse of migration_tournament_rule_engine)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Drops everything migration_tournament_rule_engine.sql created, in reverse dependency order.
-- SAFE ONLY while the rule-engine tables hold no data you need to keep (DROP TABLE ... CASCADE
-- removes any preset/snapshot rows). Idempotent: every DROP uses IF EXISTS. Touches no other module
-- and no approved migration (1–7).

-- Public-safe RPC first.
DROP FUNCTION IF EXISTS public.tournament_public_event_rule_summary(uuid);

-- Triggers (dropped implicitly with the tables, but drop explicitly for a clean reverse).
DROP TRIGGER IF EXISTS ters_bump_version ON public.tournament_event_rule_snapshots;
DROP TRIGGER IF EXISTS ters_updated_at   ON public.tournament_event_rule_snapshots;
DROP TRIGGER IF EXISTS trp_updated_at    ON public.tournament_rule_presets;

-- Policies (also dropped with the tables; explicit for clarity).
DROP POLICY IF EXISTS ters_service_all ON public.tournament_event_rule_snapshots;
DROP POLICY IF EXISTS trp_service_all  ON public.tournament_rule_presets;

-- Tables (snapshots reference nothing rule-side; presets are standalone). CASCADE clears the
-- snapshot→event FK dependency cleanly.
DROP TABLE IF EXISTS public.tournament_event_rule_snapshots CASCADE;
DROP TABLE IF EXISTS public.tournament_rule_presets         CASCADE;

NOTIFY pgrst, 'reload schema';
