-- ════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — migration_tournament_scoring.sql (Prompt 07)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Drops ONLY the four scoring/override RPCs. Touches no table, column, policy or data — the
-- Prompt-02 schema and the Prompt-06 RPCs are untouched. Safe to run repeatedly (IF EXISTS).
-- ════════════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.tournament_save_match_result(uuid, uuid, integer, jsonb, uuid, text);
DROP FUNCTION IF EXISTS public.tournament_clear_match_result(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.tournament_save_qualification_override(uuid, uuid, integer, jsonb, text, uuid, text);
DROP FUNCTION IF EXISTS public.tournament_delete_qualification_override(uuid, uuid, integer, text);

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_scoring_rollback.sql
-- ════════════════════════════════════════════════════════════════════════════════════
