-- ════════════════════════════════════════════════════════════════════════════════════════════
-- migration_tournament_public_privacy_rollback.sql  (reverse of migration_tournament_public_privacy)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Restores the pre-Prompt-14B state: direct anon/authenticated SELECT on the override base table
-- (gated by the public-visibility RLS policy) and removes the public-safe projection RPC.
-- NOTE: reapplying this rollback re-opens the reason/created_by exposure that the migration closed —
-- it exists only for a controlled undo, not as a desired end state.

DROP FUNCTION IF EXISTS public.tournament_public_qualification_overrides(uuid);

-- Restore the table-level SELECT grant and the public RLS policy exactly as core defined them.
GRANT SELECT ON public.tournament_qualification_overrides TO anon, authenticated;

DROP POLICY IF EXISTS tqo_public_select ON public.tournament_qualification_overrides;
CREATE POLICY tqo_public_select ON public.tournament_qualification_overrides
  FOR SELECT USING (public.tournament_event_is_public(event_id));

NOTIFY pgrst, 'reload schema';
