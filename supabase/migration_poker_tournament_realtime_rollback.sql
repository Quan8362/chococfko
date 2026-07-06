-- ════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — POKER TOURNAMENT REALTIME + PRIVATE-STATE SEAL
-- (migration_poker_tournament_realtime.sql)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Reverses the realtime enablement. IDEMPOTENT. Note: the private-state SEAL (revoking the seed
-- column + the raw hand row from clients) is intentionally NOT undone here — restoring the seed to
-- clients would re-open the hole-card leak. Rollback only detaches realtime + drops the pointer.
-- ════════════════════════════════════════════════════════════════════════════════════

-- Detach the published tables from realtime + restore default (PK-only) replica identity.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'poker_tournament_seats',
    'poker_tournament_entries',
    'poker_tournament_table_state'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.poker_tournament_seats   REPLICA IDENTITY DEFAULT;
ALTER TABLE public.poker_tournament_entries REPLICA IDENTITY DEFAULT;

DROP FUNCTION IF EXISTS public.poker_tournament_touch_table(uuid, int, int, text, int);
DROP TABLE IF EXISTS public.poker_tournament_table_state;

-- Seal is deliberately preserved (see header). To fully undo it (NOT recommended):
--   GRANT SELECT (seed) ON public.poker_tournaments TO anon, authenticated;
--   GRANT SELECT ON public.poker_tournament_hands TO anon, authenticated;
--   CREATE POLICY "hands public read" ON public.poker_tournament_hands FOR SELECT USING (true);
