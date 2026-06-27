-- Tiến Lên Miền Nam — two-mode entry (Practice vs Bots / Multiplayer with real people).
-- Adds a room MODE so the lobby + public "Phòng chờ" list can tell a private practice
-- session (vs 3 bots, no coin stakes, never listed) apart from a real multiplayer room
-- (coin stakes among real players, shareable, listed in the public lobby).
--
--   mode = 'multiplayer' → the existing behaviour: waiting room, invite/code, public
--                          listing, coin entry-gate + ĐẾM LÁ settlement among real players.
--   mode = 'practice'    → MODE A: one-tap solo game vs bots. NO entry-gate, NO coin
--                          settlement, NOT listed publicly, NOT joinable by others.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.tlmn_rooms
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'multiplayer'
    CHECK (mode IN ('multiplayer', 'practice'));

-- Fast lookup for the public "Phòng chờ" list: waiting multiplayer rooms, newest first.
CREATE INDEX IF NOT EXISTS tlmn_rooms_lobby_idx
  ON public.tlmn_rooms (mode, status, updated_at DESC);

NOTIFY pgrst, 'reload schema';
