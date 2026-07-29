-- ════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — migration_tournament_group_knockout.sql (Prompt 09)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Drops ONLY the group_knockout RPCs (and the internal completion helper). Touches no table,
-- column, policy or data — the Prompt-02 schema and the Prompt-06/07/08 RPCs are untouched. Safe to
-- run repeatedly (IF EXISTS).
-- ════════════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.tournament_save_group_knockout_seeds(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.tournament_clear_group_knockout_seeds(uuid, integer);
DROP FUNCTION IF EXISTS public.tournament_generate_group_knockout(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.tournament_reset_group_knockout(uuid, integer);
DROP FUNCTION IF EXISTS public.tournament_save_group_knockout_result(uuid, uuid, integer, jsonb, uuid, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.tournament_clear_group_knockout_result(uuid, uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.tournament_gk_branch_complete(uuid, text);

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_group_knockout_rollback.sql
-- ════════════════════════════════════════════════════════════════════════════════════
