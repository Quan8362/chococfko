-- ── CARO REALTIME SYNC HARDENING ──────────────────────────────────────────────
-- Forward migration. Run in Supabase SQL Editor. Idempotent — safe to re-run.
-- Does NOT touch RLS, the move RPC, the turn timer, room joining, stale cleanup,
-- game rules, the board UI, the leaderboard, or any other game/table.
--
-- Purpose:
--   1. Guarantee public.caro_rooms is in the supabase_realtime publication so
--      that postgres_changes UPDATE events are broadcast to subscribers.
--   2. Add a monotonic state_version that the client uses to discard out-of-order
--      / stale realtime payloads and stale refetch responses (no state regression).

-- 1. Idempotent publication membership ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'caro_rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.caro_rooms;
  END IF;
END
$$;

-- 2. Monotonic state version ───────────────────────────────────────────────────
-- A small bigint column is never TOASTed, so it always arrives complete in every
-- UPDATE WAL record / realtime payload. The client ignores any payload whose
-- state_version is older than the latest it has applied.
ALTER TABLE public.caro_rooms
  ADD COLUMN IF NOT EXISTS state_version bigint NOT NULL DEFAULT 0;

-- Bump on every authoritative UPDATE. Kept in its own trigger (not folded into
-- update_updated_at_column) so this migration stays self-contained and additive.
CREATE OR REPLACE FUNCTION public.caro_bump_state_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.state_version := COALESCE(OLD.state_version, 0) + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS caro_rooms_state_version ON public.caro_rooms;
CREATE TRIGGER caro_rooms_state_version
  BEFORE UPDATE ON public.caro_rooms
  FOR EACH ROW EXECUTE FUNCTION public.caro_bump_state_version();

-- Replica identity is intentionally left as DEFAULT: the `board` column changes
-- on every move so it is always present in the UPDATE payload, and the client
-- merge logic already preserves prior board on TOAST/partial payloads. No change
-- to replica identity is required for correct sync.

NOTIFY pgrst, 'reload schema';

-- ── Verification (run manually after applying) ────────────────────────────────
-- Publication membership (expect 1 row: public | caro_rooms):
--   SELECT schemaname, tablename
--   FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime'
--     AND schemaname = 'public'
--     AND tablename = 'caro_rooms';
--
-- Replica identity (expect relreplident = 'd'):
--   SELECT c.relname, c.relreplident
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relname = 'caro_rooms';
--
-- state_version column + trigger present:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'caro_rooms'
--     AND column_name = 'state_version';
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.caro_rooms'::regclass AND NOT tgisinternal;
