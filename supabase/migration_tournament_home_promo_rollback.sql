-- ════════════════════════════════════════════════════════════════════════════════════════════
-- migration_tournament_home_promo_rollback.sql  (reverse of migration_tournament_home_promo)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Removes the admin-controlled home-promo flag. Dropping the column also drops the partial index.
-- After this, no tournament can be marked for the home promo (the strip reads the column → any code
-- still referencing it must be reverted alongside this rollback).

DROP INDEX IF EXISTS public.tournaments_home_promo_idx;
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS home_promo_enabled;

NOTIFY pgrst, 'reload schema';
