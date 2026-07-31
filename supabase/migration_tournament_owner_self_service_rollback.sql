-- ════════════════════════════════════════════════════════════════════════════════════════════
-- migration_tournament_owner_self_service_rollback.sql  (Prompt 15F-1 — reverses MIGRATION #12)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Symmetric, idempotent reversal of migration_tournament_owner_self_service.sql. Restores the #9
-- two-role CHECK, drops the one-active-owner index and the self-service create RPC.
--
-- ⚠️ Precondition: no 'owner' rows may remain, or re-adding the two-role CHECK will fail. In a fresh
--    self-service DB every tournament has an owner row, so run this ONLY on a DB where self-service
--    was never used (or after re-homing owners). This is a DEV rollback — production has no data yet.

-- Drop the RPC (both would-be signatures are the same; drop by exact signature).
DROP FUNCTION IF EXISTS public.tournament_create_self_service(text, text, timestamptz, timestamptz, text, text);

-- Drop the one-active-owner index.
DROP INDEX IF EXISTS public.tmem_one_active_owner_uq;

-- Restore the original #9 two-role CHECK (owner no longer valid).
ALTER TABLE public.tournament_members DROP CONSTRAINT IF EXISTS tmem_role_valid;
ALTER TABLE public.tournament_members
  ADD CONSTRAINT tmem_role_valid CHECK (role IN ('manager','scorekeeper'));

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_owner_self_service_rollback.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════
