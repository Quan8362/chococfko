-- ════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — migration_tournament_group_assignment.sql (Prompt 06)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Drops ONLY the four RPCs added by that migration. Touches no tables, columns, or data — the
-- Prompt-02 core schema is untouched by the forward migration, so there is nothing else to undo.
-- ════════════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.tournament_regenerate_group_matches(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.tournament_generate_group_matches(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.tournament_save_group_assignments(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.tournament_initialize_groups(uuid, integer, text[]);

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_group_assignment_rollback.sql
-- ════════════════════════════════════════════════════════════════════════════════════
