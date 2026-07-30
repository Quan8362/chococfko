-- ════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — migration_tournament_rule_reset.sql (Prompt 15D-2, migration #11)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Drops the single orchestrator function added by the controlled rule-change migration. Purely
-- additive migration ⇒ symmetric one-line rollback. No data is touched; no other object depends on it.
-- ════════════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.tournament_apply_rule_change(
  uuid, uuid, uuid, integer, integer, jsonb, integer, boolean, text, text, jsonb, boolean
);

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_rule_reset_rollback.sql
-- ════════════════════════════════════════════════════════════════════════════════════
