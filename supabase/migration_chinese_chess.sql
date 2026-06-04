-- Chinese Chess (Cờ Tướng) rooms
CREATE TABLE IF NOT EXISTS public.chinese_chess_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code text UNIQUE NOT NULL,
  player_red uuid REFERENCES auth.users(id),
  player_black uuid REFERENCES auth.users(id),
  current_turn text DEFAULT 'red' CHECK (current_turn IN ('red', 'black')),
  board jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished', 'cancelled')),
  winner text CHECK (winner IN ('red', 'black', 'draw') OR winner IS NULL),
  end_reason text CHECK (end_reason IN ('checkmate', 'resign', 'draw', 'general_captured') OR end_reason IS NULL),
  last_move jsonb DEFAULT NULL,
  move_count int DEFAULT 0,
  red_offered_draw boolean DEFAULT false,
  black_offered_draw boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  finished_at timestamptz
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_chinese_chess_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_chinese_chess_updated_at ON public.chinese_chess_rooms;
CREATE TRIGGER trg_chinese_chess_updated_at
  BEFORE UPDATE ON public.chinese_chess_rooms
  FOR EACH ROW EXECUTE FUNCTION update_chinese_chess_updated_at();

-- RLS
ALTER TABLE public.chinese_chess_rooms ENABLE ROW LEVEL SECURITY;

-- Everyone can read rooms (needed for join by code)
CREATE POLICY "chinese_chess_rooms_read" ON public.chinese_chess_rooms
  FOR SELECT USING (true);

-- Authenticated users can insert (create room)
CREATE POLICY "chinese_chess_rooms_insert" ON public.chinese_chess_rooms
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Players can update their own rooms
CREATE POLICY "chinese_chess_rooms_update" ON public.chinese_chess_rooms
  FOR UPDATE USING (
    auth.uid() = player_red OR auth.uid() = player_black
  );

-- History view (finished games)
CREATE OR REPLACE VIEW public.chinese_chess_history AS
SELECT
  r.id,
  r.room_code,
  r.winner,
  r.end_reason,
  r.player_red,
  r.player_black,
  r.move_count,
  COALESCE(pr.display_name, split_part(ur.email, '@', 1), 'Đỏ') AS player_red_name,
  COALESCE(pb.display_name, split_part(ub.email, '@', 1), 'Đen') AS player_black_name,
  r.finished_at,
  r.created_at
FROM public.chinese_chess_rooms r
LEFT JOIN public.profiles pr ON pr.id = r.player_red
LEFT JOIN auth.users ur ON ur.id = r.player_red
LEFT JOIN public.profiles pb ON pb.id = r.player_black
LEFT JOIN auth.users ub ON ub.id = r.player_black
WHERE r.status = 'finished'
ORDER BY r.finished_at DESC;
