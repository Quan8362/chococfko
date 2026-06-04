-- ── CARO CHAT ─────────────────────────────────────────────────────────────────
-- Run in Supabase SQL Editor after migration_caro.sql

CREATE TABLE IF NOT EXISTS public.caro_chat (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid NOT NULL REFERENCES caro_rooms(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  symbol      text CHECK (symbol IN ('X', 'O', 'spectator')),
  player_name text NOT NULL,
  message     text NOT NULL CHECK (length(message) <= 200),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS caro_chat_room_idx ON caro_chat(room_id, created_at ASC);

ALTER TABLE caro_chat ENABLE ROW LEVEL SECURITY;

-- Anyone can read chat
DROP POLICY IF EXISTS "caro_chat_select" ON caro_chat;
CREATE POLICY "caro_chat_select" ON caro_chat FOR SELECT USING (true);

-- Authenticated users can insert their own messages
DROP POLICY IF EXISTS "caro_chat_insert" ON caro_chat;
CREATE POLICY "caro_chat_insert" ON caro_chat
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE caro_chat;

NOTIFY pgrst, 'reload schema';
