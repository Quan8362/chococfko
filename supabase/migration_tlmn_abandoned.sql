-- Tiến Lên Miền Nam Online — abandoned-match lifecycle.
--
-- The whole TLMN turn loop is client-NUDGED (runBotTurn / tickTurnTimer are driven by
-- seated browsers — there is no long-lived server). When EVERY human leaves or
-- disconnects mid-round, nothing drives the bot / AFK-takeover seats and the match is
-- stranded in status='playing' forever (the confirmed YXWLK failure: A:6 / B:11, frozen).
--
-- This adds a terminal 'abandoned' status so the server-side reaper (reapAbandonedGames)
-- can transition such matches OUT of 'playing' — with NO winner, NO settlement, NO stats —
-- distinct from a normally-settled 'ended' round. Until this migration is applied the
-- reaper is degrade-safe: its write fails the CHECK and is skipped (the room simply stays
-- as it is today), so applying this is what activates the cleanup.
--
-- Depends on migration_tlmn.sql (tlmn_rooms) and migration_tlmn_phase3.sql (tlmn_games).

-- ── 1. tlmn_rooms.status — allow 'abandoned' ───────────────────────────────────────
ALTER TABLE public.tlmn_rooms DROP CONSTRAINT IF EXISTS tlmn_rooms_status_check;
ALTER TABLE public.tlmn_rooms
  ADD CONSTRAINT tlmn_rooms_status_check
  CHECK (status IN ('lobby', 'playing', 'ended', 'abandoned'));

-- ── 2. tlmn_games.status — allow 'abandoned' ───────────────────────────────────────
-- The partial unique index tlmn_games_one_active is WHERE status='playing', so moving a
-- game to 'abandoned' releases the "one live round per room" slot automatically.
ALTER TABLE public.tlmn_games DROP CONSTRAINT IF EXISTS tlmn_games_status_check;
ALTER TABLE public.tlmn_games
  ADD CONSTRAINT tlmn_games_status_check
  CHECK (status IN ('playing', 'ended', 'abandoned'));

NOTIFY pgrst, 'reload schema';
