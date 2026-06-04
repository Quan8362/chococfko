-- Chinese Chess — Step 4: timeout columns + claim_timeout RPC
-- Run AFTER migration_chinese_chess_features.sql

-- ── 1. Add timeout columns to chinese_chess_rooms ─────────────────────────────

ALTER TABLE public.chinese_chess_rooms
  ADD COLUMN IF NOT EXISTS turn_started_at      timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS turn_timeout_seconds int         DEFAULT 60;

-- ── 2. Update end_reason constraint to include 'timeout' ──────────────────────

ALTER TABLE public.chinese_chess_rooms
  DROP CONSTRAINT IF EXISTS chinese_chess_rooms_end_reason_check;

ALTER TABLE public.chinese_chess_rooms
  ADD CONSTRAINT chinese_chess_rooms_end_reason_check
  CHECK (
    end_reason IN ('checkmate', 'resign', 'draw', 'general_captured', 'timeout')
    OR end_reason IS NULL
  );

-- ── 3. Backfill turn_started_at for existing active rooms ─────────────────────

UPDATE public.chinese_chess_rooms
  SET turn_started_at = updated_at
  WHERE status = 'playing' AND turn_started_at IS NULL;

-- ── 4. claim_chinese_chess_timeout ────────────────────────────────────────────
-- Either player (or even spectator) can call this once they see the countdown hit 0.
-- The RPC validates server-side that the timeout has genuinely expired.

CREATE OR REPLACE FUNCTION public.claim_chinese_chess_timeout(
  p_room_code TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room   public.chinese_chess_rooms%ROWTYPE;
  v_winner TEXT;
  v_secs   INT;
BEGIN
  SELECT * INTO v_room
  FROM public.chinese_chess_rooms
  WHERE room_code = p_room_code
  FOR UPDATE;

  IF NOT FOUND THEN RETURN '{"error":"room_not_found"}'::jsonb; END IF;
  IF v_room.status <> 'playing' THEN RETURN '{"error":"game_not_active"}'::jsonb; END IF;
  IF v_room.turn_started_at IS NULL THEN RETURN '{"error":"no_timer"}'::jsonb; END IF;

  -- Must be authenticated (but can be either player or spectator watching)
  IF auth.uid() IS NULL THEN RETURN '{"error":"not_authenticated"}'::jsonb; END IF;

  v_secs := COALESCE(v_room.turn_timeout_seconds, 60);

  -- Verify timeout has actually expired on the server
  IF now() < v_room.turn_started_at + (v_secs || ' seconds')::interval THEN
    RETURN jsonb_build_object(
      'error',    'not_timed_out',
      'remaining', EXTRACT(EPOCH FROM (v_room.turn_started_at + (v_secs || ' seconds')::interval - now()))::int
    );
  END IF;

  -- Current player ran out of time → other player wins
  v_winner := CASE WHEN v_room.current_turn = 'red' THEN 'black' ELSE 'red' END;

  UPDATE public.chinese_chess_rooms SET
    status             = 'finished',
    winner             = v_winner,
    end_reason         = 'timeout',
    finished_at        = now(),
    red_offered_draw   = false,
    black_offered_draw = false
  WHERE id = v_room.id;

  RETURN jsonb_build_object('ok', true, 'winner', v_winner);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_chinese_chess_timeout TO authenticated;

-- ── 5. Update make_chinese_chess_move to reset turn_started_at ────────────────
-- Replaces the version from migration_chinese_chess_features.sql.

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
                           'to',   jsonb_build_array(p_to_row, p_to_col)
                         ),
    move_count         = move_count + 1,
    status             = CASE WHEN p_finished THEN 'finished'::text ELSE 'playing'::text END,
    winner             = p_winner,
    end_reason         = p_reason,
    finished_at        = CASE WHEN p_finished THEN now() ELSE NULL END,
    turn_started_at    = CASE WHEN NOT p_finished THEN now() ELSE turn_started_at END,
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

-- ── 6. Update joinRoom logic to set turn_started_at ───────────────────────────
-- When player_black joins and game starts, set turn_started_at = now().
-- This is handled in the TypeScript auto-join code, but also update here
-- for completeness via a trigger.

CREATE OR REPLACE FUNCTION public.chess_room_start_timer()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- When status changes to 'playing', set turn_started_at
  IF NEW.status = 'playing' AND OLD.status = 'waiting' THEN
    NEW.turn_started_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chess_room_start_timer ON public.chinese_chess_rooms;
CREATE TRIGGER trg_chess_room_start_timer
  BEFORE UPDATE ON public.chinese_chess_rooms
  FOR EACH ROW EXECUTE FUNCTION public.chess_room_start_timer();

NOTIFY pgrst, 'reload schema';
