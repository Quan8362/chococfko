-- ════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for migration_poker_economy_config.sql
-- ════════════════════════════════════════════════════════════════════════════════════
-- Drops ONLY the objects that migration created. Non-destructive to any other poker/TLMN/
-- wallet data (this feature never stored balances or coins). Safe to run if the config
-- migration was applied and needs to be fully removed.
--
-- NOTE: the immutable triggers block UPDATE/DELETE on the tables, but DROP TABLE (DDL) is
-- unaffected by row-level triggers, so the tables drop cleanly.
-- ════════════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.poker_activate_economy_config(text, uuid, text, text);
DROP FUNCTION IF EXISTS public.poker_publish_economy_config(text, jsonb, date, uuid, text, text);
DROP FUNCTION IF EXISTS public.poker_get_active_economy_config();

DROP TRIGGER IF EXISTS trg_poker_economy_config_audit_immutable ON public.poker_economy_config_audit;
DROP TRIGGER IF EXISTS trg_poker_economy_config_guard          ON public.poker_economy_config;
DROP FUNCTION IF EXISTS public.poker_economy_config_audit_immutable();
DROP FUNCTION IF EXISTS public.poker_economy_config_guard();

DROP TABLE IF EXISTS public.poker_economy_config_audit;
DROP TABLE IF EXISTS public.poker_economy_config;

NOTIFY pgrst, 'reload schema';
