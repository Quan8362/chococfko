-- ════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — migration_tournament_reset_path.sql (Prompt 11)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Drops the two functions added by the reset-path migration and removes the six tournament tables
-- from the supabase_realtime publication (idempotent). REPLICA IDENTITY is left as FULL — it is a
-- harmless storage setting and reverting it is unnecessary; nothing else depends on it.
-- ════════════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.tournament_reset_knockout_path(uuid, uuid, text, integer, jsonb, uuid, jsonb, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.tournament_reset_bracket_complete(uuid, text);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tournaments',
    'tournament_events',
    'tournament_matches',
    'tournament_match_games',
    'tournament_qualification_overrides',
    'tournament_podium'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_reset_path_rollback.sql
-- ════════════════════════════════════════════════════════════════════════════════════
