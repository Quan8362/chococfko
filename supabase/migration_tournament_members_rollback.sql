-- ════════════════════════════════════════════════════════════════════════════════════════════
-- migration_tournament_members_rollback.sql  (reverse of migration_tournament_members #9)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Drops everything migration_tournament_members.sql created, in reverse dependency order.
-- SAFE ONLY while the membership table holds no data you need to keep (DROP TABLE ... CASCADE
-- removes all membership rows). Idempotent: every DROP uses IF EXISTS. Touches no other module and
-- no approved migration (1–8).

-- Claim RPC first.
DROP FUNCTION IF EXISTS public.tournament_claim_member_invitations();

-- Triggers (dropped implicitly with the table; explicit for a clean reverse).
DROP TRIGGER IF EXISTS tmem_bump_version ON public.tournament_members;
DROP TRIGGER IF EXISTS tmem_updated_at   ON public.tournament_members;

-- Policies (also dropped with the table; explicit for clarity).
DROP POLICY IF EXISTS tmem_self_select ON public.tournament_members;
DROP POLICY IF EXISTS tmem_service_all ON public.tournament_members;

-- Table (CASCADE clears the tournament_id / user_id FK dependencies cleanly).
DROP TABLE IF EXISTS public.tournament_members CASCADE;

NOTIFY pgrst, 'reload schema';
