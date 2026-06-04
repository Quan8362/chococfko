-- Chinese Chess — Step 2: moves table · Realtime · RPC functions
-- Run AFTER migration_chinese_chess.sql

-- ── 1. Move history table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chinese_chess_moves (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id        uuid NOT NULL REFERENCES public.chinese_chess_rooms(id) ON DELETE CASCADE,
  player_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  side           text NOT NULL CHECK (side IN ('red', 'black')),
  from_row       int  NOT NULL,
  from_col       int  NOT NULL,
  to_row         int  NOT NULL,
  to_col         int  NOT NULL,
  piece          text,
  captured_piece text,
  move_number    int  NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chess_moves_room_idx ON public.chinese_chess_moves (room_id, move_number);

ALTER TABLE public.chinese_chess_moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chess_moves_read"   ON public.chinese_chess_moves;
DROP POLICY IF EXISTS "chess_moves_insert" ON public.chinese_chess_moves;

CREATE POLICY "chess_moves_read" ON public.chinese_chess_moves
  FOR SELECT USING (true);

CREATE POLICY "chess_moves_insert" ON public.chinese_chess_moves
  FOR INSERT TO authenticated
  WITH CHECK (player_id = auth.uid());

-- ── 2. Realtime publication ────────────────────────────────────────────────────

-- Enable Realtime broadcasting for chinese_chess_rooms
-- (also toggle ON in Supabase Dashboard → Database → Replication if needed)
ALTER PUBLICATION supabase_realtime ADD TABLE public.chinese_chess_rooms;

-- ── 3. Fix RLS on chinese_chess_rooms ─────────────────────────────────────────
-- Replace the broad INSERT policy from migration_chinese_chess.sql

DROP POLICY IF EXISTS "chinese_chess_rooms_insert" ON public.chinese_chess_rooms;
CREATE POLICY "chinese_chess_rooms_insert" ON public.chinese_chess_rooms
  FOR INSERT TO authenticated
  WITH CHECK (player_red = auth.uid());

DROP POLICY IF EXISTS "chinese_chess_rooms_update" ON public.chinese_chess_rooms;
CREATE POLICY "chinese_chess_rooms_update" ON public.chinese_chess_rooms
  FOR UPDATE TO authenticated
  USING (
    player_red   = auth.uid() OR
    player_black = auth.uid() OR
    (player_black IS NULL AND status = 'waiting')
  );

-- ── 4. RPC: make_chinese_chess_move ───────────────────────────────────────────
-- Security: SECURITY DEFINER + auth.uid() checks + FOR UPDATE row lock.
-- The TypeScript rules engine (server action) validates move legality first;
-- this function validates auth, turn, and applies the atomic DB update.

CREATE OR REPLACE FUNCTION public.make_chinese_chess_move(
  p_room_code TEXT,
  p_from_row  INT,
  p_from_col  INT,
  p_to_row    INT,
  p_to_col    INT,
  p_new_board JSONB,
  p_new_turn  TEXT,
  p_captured  TEXT    DEFAULT NULL,
  p_finished  BOOLEAN DEFAULT false,
  p_winner    TEXT    DEFAULT NULL,
  p_reason    TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.chinese_chess_rooms%ROWTYPE;
  v_side TEXT;
BEGIN
  -- Lock row to prevent concurrent double-moves
  SELECT * INTO v_room
  FROM public.chinese_chess_rooms
  WHERE room_code = p_room_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN '{"error":"room_not_found"}'::jsonb;
  END IF;

  -- Determine caller's side
  IF    v_room.player_red   = auth.uid() THEN v_side := 'red';
  ELSIF v_room.player_black = auth.uid() THEN v_side := 'black';
  ELSE  RETURN '{"error":"not_a_player"}'::jsonb;
  END IF;

  IF v_room.status <> 'playing' THEN
    RETURN '{"error":"game_not_active"}'::jsonb;
  END IF;

  IF v_room.current_turn <> v_side THEN
    RETURN '{"error":"not_your_turn"}'::jsonb;
  END IF;

  -- Apply the move
  UPDATE public.chinese_chess_rooms SET
    board        = p_new_board,
    current_turn = p_new_turn,
    last_move    = jsonb_build_object(
                     'from', jsonb_build_array(p_from_row, p_from_col),
                     'to',   jsonb_build_array(p_to_row,   p_to_col)
                   ),
    move_count   = move_count + 1,
    status       = CASE WHEN p_finished THEN 'finished'::text ELSE 'playing'::text END,
    winner       = p_winner,
    end_reason   = p_reason,
    finished_at  = CASE WHEN p_finished THEN now() ELSE NULL END,
    -- Clear draw offer for the moving side
    red_offered_draw   = CASE WHEN v_side = 'red'   THEN false ELSE red_offered_draw   END,
    black_offered_draw = CASE WHEN v_side = 'black' THEN false ELSE black_offered_draw END
  WHERE id = v_room.id;

  -- Record the move
  INSERT INTO public.chinese_chess_moves (
    room_id, player_id, side,
    from_row, from_col, to_row, to_col,
    piece, captured_piece, move_number
  ) VALUES (
    v_room.id,
    auth.uid(),
    v_side,
    p_from_row, p_from_col,
    p_to_row,   p_to_col,
    v_room.board -> p_from_row ->> p_from_col,
    p_captured,
    v_room.move_count + 1
  );

  RETURN '{"ok":true}'::jsonb;
END;
$$;

GRANT EXECUTE ON FUNCTION public.make_chinese_chess_move TO authenticated;

-- ── 5. RPC: resign_chinese_chess_game ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resign_chinese_chess_game(
  p_room_code TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.chinese_chess_rooms%ROWTYPE;
  v_side TEXT;
BEGIN
  SELECT * INTO v_room
  FROM public.chinese_chess_rooms
  WHERE room_code = p_room_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN '{"error":"room_not_found"}'::jsonb;
  END IF;

  IF    v_room.player_red   = auth.uid() THEN v_side := 'red';
  ELSIF v_room.player_black = auth.uid() THEN v_side := 'black';
  ELSE  RETURN '{"error":"not_a_player"}'::jsonb;
  END IF;

  IF v_room.status <> 'playing' THEN
    RETURN '{"error":"game_not_active"}'::jsonb;
  END IF;

  UPDATE public.chinese_chess_rooms SET
    status      = 'finished',
    winner      = CASE WHEN v_side = 'red' THEN 'black' ELSE 'red' END,
    end_reason  = 'resign',
    finished_at = now()
  WHERE id = v_room.id;

  RETURN '{"ok":true}'::jsonb;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resign_chinese_chess_game TO authenticated;

NOTIFY pgrst, 'reload schema';
