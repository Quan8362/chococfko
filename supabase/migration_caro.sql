-- ── CARO MINI GAME ────────────────────────────────────────────────────────────
-- Run in Supabase SQL Editor AFTER migration_confessions.sql
-- (reuses the update_updated_at_column() trigger function)

-- 1. Table
CREATE TABLE IF NOT EXISTS public.caro_rooms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code     text UNIQUE NOT NULL,
  player_x      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  player_o      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  current_turn  text DEFAULT 'X' CHECK (current_turn IN ('X', 'O')),
  board         jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        text DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished', 'cancelled')),
  winner        text CHECK (winner IN ('X', 'O', 'draw') OR winner IS NULL),
  winning_cells jsonb DEFAULT '[]'::jsonb,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  finished_at   timestamptz
);

-- 2. Auto-update updated_at
DROP TRIGGER IF EXISTS caro_rooms_updated_at ON caro_rooms;
CREATE TRIGGER caro_rooms_updated_at
  BEFORE UPDATE ON caro_rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Indexes
CREATE INDEX IF NOT EXISTS caro_rooms_code_idx   ON caro_rooms(room_code);
CREATE INDEX IF NOT EXISTS caro_rooms_status_idx ON caro_rooms(status, created_at DESC);

-- 4. RLS
ALTER TABLE caro_rooms ENABLE ROW LEVEL SECURITY;

-- Public read (required for Realtime subscription with anon key)
DROP POLICY IF EXISTS "caro_rooms_select" ON caro_rooms;
CREATE POLICY "caro_rooms_select" ON caro_rooms
  FOR SELECT USING (true);

-- Authenticated users can create rooms (player_x = own uid)
DROP POLICY IF EXISTS "caro_rooms_insert" ON caro_rooms;
CREATE POLICY "caro_rooms_insert" ON caro_rooms
  FOR INSERT TO authenticated
  WITH CHECK (player_x = auth.uid());

-- Players can update their own room; any authenticated user can join a waiting room
DROP POLICY IF EXISTS "caro_rooms_update" ON caro_rooms;
CREATE POLICY "caro_rooms_update" ON caro_rooms
  FOR UPDATE TO authenticated
  USING (
    player_x = auth.uid() OR
    player_o = auth.uid() OR
    (player_o IS NULL AND status = 'waiting')
  );

-- 5. Enable Realtime broadcasting for this table
-- (also toggle ON in Supabase Dashboard → Database → Replication if needed)
ALTER PUBLICATION supabase_realtime ADD TABLE caro_rooms;

NOTIFY pgrst, 'reload schema';
