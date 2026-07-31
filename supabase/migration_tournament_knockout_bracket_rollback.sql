-- ════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — migration_tournament_knockout_bracket.sql (Prompt 08)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Drops ONLY the six knockout RPCs. Touches no table, column, policy or data — the Prompt-02
-- schema and the Prompt-06/07 RPCs are untouched. Safe to run repeatedly (IF EXISTS).
-- ════════════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.tournament_save_knockout_seeds(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.tournament_clear_knockout_seeds(uuid, integer);
DROP FUNCTION IF EXISTS public.tournament_generate_knockout(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.tournament_reset_knockout(uuid, integer);
DROP FUNCTION IF EXISTS public.tournament_save_knockout_result(uuid, uuid, integer, jsonb, uuid, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS public.tournament_clear_knockout_result(uuid, uuid, integer, jsonb);

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_knockout_bracket_rollback.sql
-- ════════════════════════════════════════════════════════════════════════════════════
