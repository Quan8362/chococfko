-- ── CHINESE CHESS CHAT ────────────────────────────────────────────────────────
-- Run after migration_chinese_chess.sql

CREATE TABLE IF NOT EXISTS public.chinese_chess_chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid NOT NULL REFERENCES chinese_chess_rooms(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  side        text CHECK (side IN ('red', 'black', 'spectator')),
  player_name text NOT NULL,
  message     text NOT NULL CHECK (length(message) <= 300),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cc_chat_room_idx
  ON chinese_chess_chat_messages(room_id, created_at ASC);

ALTER TABLE chinese_chess_chat_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can read chat messages
DROP POLICY IF EXISTS "cc_chat_select" ON chinese_chess_chat_messages;
CREATE POLICY "cc_chat_select" ON chinese_chess_chat_messages
  FOR SELECT USING (true);

-- Only players in the room (player_red or player_black) can send messages
-- Spectators are blocked at RLS level, not just client-side
DROP POLICY IF EXISTS "cc_chat_insert" ON chinese_chess_chat_messages;
CREATE POLICY "cc_chat_insert" ON chinese_chess_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM chinese_chess_rooms r
      WHERE r.id = room_id
        AND (r.player_red = auth.uid() OR r.player_black = auth.uid())
    )
  );

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE chinese_chess_chat_messages;

NOTIFY pgrst, 'reload schema';
