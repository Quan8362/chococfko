-- Tiến Lên Miền Nam Online — Phase 5: bots, disconnect/AFK takeover, reconnect.
--
-- Adds the per-seat columns the resilience layer needs. Bots themselves already
-- work via the Phase-1 `is_bot` flag + NULL user_id; this migration adds:
--   • missed_turns  — consecutive turn timeouts (resets when the human acts)
--   • bot_takeover  — a HUMAN seat currently auto-piloted by a bot (AFK/disconnect);
--                     distinct from a real lobby bot (is_bot + NULL user_id). Cleared
--                     when the human reconnects (heartbeat after an offline gap).
--   • last_seen     — heartbeat timestamp; drives the offline threshold.
--
-- Reuses the existing realtime layer: tlmn_seats is already in supabase_realtime,
-- so these columns stream to clients with the rest of the seat row. No new RLS.
--
-- Depends on migration_tlmn.sql.

ALTER TABLE public.tlmn_seats
  ADD COLUMN IF NOT EXISTS missed_turns int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bot_takeover boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen timestamptz NOT NULL DEFAULT now();

NOTIFY pgrst, 'reload schema';
