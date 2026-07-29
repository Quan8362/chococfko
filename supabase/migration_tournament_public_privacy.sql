-- ════════════════════════════════════════════════════════════════════════════════════════════
-- migration_tournament_public_privacy.sql  (Prompt 14B — additive, applies AFTER reset_path)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- PRIVACY FIX for tournament_qualification_overrides.
--
-- Problem (found in the Prompt 14 audit): the base table is public-readable (RLS gated on tournament
-- visibility) AND SELECT is granted to anon/authenticated, so an anonymous client could query it
-- directly over REST — or receive it over Realtime — and read `reason` (an admin's internal note) and
-- `created_by` (an admin auth.users id). RLS is ROW-level, not column-level, so it CANNOT hide just
-- those two columns. Column-level GRANTs also do not help: Supabase Realtime delivers the full row
-- regardless of column privileges.
--
-- Fix: take direct base-table read access away from anon/authenticated entirely, and expose only the
-- minimal public-safe projection (`group_id`, `resolved_order`) through a SECURITY DEFINER RPC that
-- re-checks event visibility. The public page then knows an override EXISTS (→ shows "BTC phân định")
-- and can render the resolved ordering, but never sees `reason`, `created_by`, or any other metadata.
--   • anon/authenticated: NO direct SELECT on the base table (REST + Realtime both closed).
--   • public read: via tournament_public_qualification_overrides(event_id) — DEFINER, pinned
--     search_path, event-visibility guard, EXECUTE granted to anon/authenticated only.
--   • admin/service-role: unchanged — the *_service_all policy still gives full-row access, and the
--     admin read path uses the service-role client.
-- Additive: does not modify any approved migration. Rollback restores the prior grant + policy.

-- ── 1. Public-safe projection RPC ───────────────────────────────────────────────────────────
-- Returns ONLY group_id + resolved_order, ONLY for events belonging to a published/completed
-- tournament. SECURITY DEFINER so it can read the base table after we revoke anon/authenticated;
-- the WHERE clause (not RLS) is the visibility gate, so draft/archived never leak.
CREATE OR REPLACE FUNCTION public.tournament_public_qualification_overrides(p_event_id uuid)
RETURNS TABLE (group_id uuid, resolved_order jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.group_id, o.resolved_order
  FROM public.tournament_qualification_overrides o
  WHERE o.event_id = p_event_id
    AND public.tournament_event_is_public(o.event_id)
$$;

-- ── 2. Remove direct public read of the base table ──────────────────────────────────────────
-- Drop the public SELECT policy and the table-level SELECT grant for anon/authenticated. After this,
-- a direct REST select or a Realtime subscription by an anon/authenticated client returns nothing
-- (permission denied) — the two sensitive columns can no longer travel over either channel. The
-- service-role policy (tqo_service_all) is untouched, so admin writes/reads keep working.
DROP POLICY IF EXISTS tqo_public_select ON public.tournament_qualification_overrides;
REVOKE SELECT ON public.tournament_qualification_overrides FROM anon, authenticated;

-- ── 3. Lock down / expose the RPC ───────────────────────────────────────────────────────────
-- Supabase's default privileges grant EXECUTE on new functions to anon+authenticated; revoke from
-- PUBLIC then grant explicitly to the roles that need it (public read + service-role).
REVOKE ALL ON FUNCTION public.tournament_public_qualification_overrides(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_public_qualification_overrides(uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
