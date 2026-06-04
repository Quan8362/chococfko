-- Chinese Chess — Step 3: draw RPCs + fix make_move
-- Run AFTER migration_chinese_chess_realtime.sql

-- ── 1. offer_chinese_chess_draw ────────────────────────────────────────────────
-- Sets the caller's draw-offer flag.
-- If the opponent already offered → accept immediately (finish as draw).

CREATE OR REPLACE FUNCTION public.offer_chinese_chess_draw(
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

  IF NOT FOUND THEN RETURN '{"error":"room_not_found"}'::jsonb; END IF;

  IF    v_room.player_red   = auth.uid() THEN v_side := 'red';
  ELSIF v_room.player_black = auth.uid() THEN v_side := 'black';
  ELSE  RETURN '{"error":"not_a_player"}'::jsonb;
  END IF;

  IF v_room.status <> 'playing' THEN
    RETURN '{"error":"game_not_active"}'::jsonb;
  END IF;

  -- If opponent already offered → mutual accept, finish as draw
  IF (v_side = 'red'   AND v_room.black_offered_draw) OR
     (v_side = 'black' AND v_room.red_offered_draw)
  THEN
    UPDATE public.chinese_chess_rooms SET
      status             = 'finished',
      winner             = 'draw',
      end_reason         = 'draw',
      finished_at        = now(),
      red_offered_draw   = false,
      black_offered_draw = false
    WHERE id = v_room.id;
    RETURN '{"ok":true,"accepted":true}'::jsonb;
  END IF;

  -- Set own flag only
  IF v_side = 'red' THEN
    UPDATE public.chinese_chess_rooms SET red_offered_draw   = true WHERE id = v_room.id;
  ELSE
    UPDATE public.chinese_chess_rooms SET black_offered_draw = true WHERE id = v_room.id;
  END IF;

  RETURN '{"ok":true,"accepted":false}'::jsonb;
END;
$$;

GRANT EXECUTE ON FUNCTION public.offer_chinese_chess_draw TO authenticated;

-- ── 2. respond_chinese_chess_draw ─────────────────────────────────────────────
-- The non-offering player accepts or declines the draw.

CREATE OR REPLACE FUNCTION public.respond_chinese_chess_draw(
  p_room_code TEXT,
  p_accepted  BOOLEAN
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

  IF NOT FOUND THEN RETURN '{"error":"room_not_found"}'::jsonb; END IF;

  IF    v_room.player_red   = auth.uid() THEN v_side := 'red';
  ELSIF v_room.player_black = auth.uid() THEN v_side := 'black';
  ELSE  RETURN '{"error":"not_a_player"}'::jsonb;
  END IF;

  IF v_room.status <> 'playing' THEN
    RETURN '{"error":"game_not_active"}'::jsonb;
  END IF;

  -- Verify the OTHER player is the one who offered
  IF (v_side = 'red'   AND NOT v_room.black_offered_draw) OR
     (v_side = 'black' AND NOT v_room.red_offered_draw)
  THEN
    RETURN '{"error":"no_pending_offer"}'::jsonb;
  END IF;

  IF p_accepted THEN
    UPDATE public.chinese_chess_rooms SET
      status             = 'finished',
      winner             = 'draw',
      end_reason         = 'draw',
      finished_at        = now(),
      red_offered_draw   = false,
      black_offered_draw = false
    WHERE id = v_room.id;
  ELSE
    -- Decline: reset both draw flags, game continues
    UPDATE public.chinese_chess_rooms SET
      red_offered_draw   = false,
      black_offered_draw = false
    WHERE id = v_room.id;
  END IF;

  RETURN '{"ok":true}'::jsonb;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_chinese_chess_draw TO authenticated;

-- ── 3. Fix make_chinese_chess_move: reset BOTH draw flags on any move ─────────
-- A move implicitly declines the opponent's pending draw offer.

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
  SELECT * INTO v_room
  FROM public.chinese_chess_rooms
  WHERE room_code = p_room_code
  FOR UPDATE;

  IF NOT FOUND THEN RETURN '{"error":"room_not_found"}'::jsonb; END IF;

  IF    v_room.player_red   = auth.uid() THEN v_side := 'red';
  ELSIF v_room.player_black = auth.uid() THEN v_side := 'black';
  ELSE  RETURN '{"error":"not_a_player"}'::jsonb;
  END IF;

  IF v_room.status <> 'playing' THEN RETURN '{"error":"game_not_active"}'::jsonb; END IF;
  IF v_room.current_turn <> v_side THEN RETURN '{"error":"not_your_turn"}'::jsonb; END IF;

  UPDATE public.chinese_chess_rooms SET
    board              = p_new_board,
    current_turn       = p_new_turn,
    last_move          = jsonb_build_object(
                           'from', jsonb_build_array(p_from_row, p_from_col),
                           'to',   jsonb_build_array(p_to_row,   p_to_col)
                         ),
    move_count         = move_count + 1,
    status             = CASE WHEN p_finished THEN 'finished'::text ELSE 'playing'::text END,
    winner             = p_winner,
    end_reason         = p_reason,
    finished_at        = CASE WHEN p_finished THEN now() ELSE NULL END,
    -- A move always clears all draw offers
    red_offered_draw   = false,
    black_offered_draw = false
  WHERE id = v_room.id;

  INSERT INTO public.chinese_chess_moves (
    room_id, player_id, side,
    from_row, from_col, to_row, to_col,
    piece, captured_piece, move_number
  ) VALUES (
    v_room.id, auth.uid(), v_side,
    p_from_row, p_from_col, p_to_row, p_to_col,
    v_room.board -> p_from_row ->> p_from_col,
    p_captured,
    v_room.move_count + 1
  );

  RETURN '{"ok":true}'::jsonb;
END;
$$;

NOTIFY pgrst, 'reload schema';
