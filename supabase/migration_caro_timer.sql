-- ── CARO SERVER-AUTHORITATIVE TURN TIMER + LIFECYCLE ──────────────────────────
-- Forward migration. Run in Supabase SQL Editor AFTER migration_caro_realtime_sync.sql
-- and migration_caro_secure_moves.sql (depends on state_version + caro_make_move).
--
-- Adds an authoritative per-turn deadline (turn_started_at / turn_deadline),
-- folds deadline handling into the move RPC, and adds timeout-resolution RPCs.
-- A timed-out player LOSES (their opponent wins). The browser may request
-- resolution but the database confirms the deadline has actually passed.
--
-- Scope: timer + timeout + room lifecycle only. Realtime publication, the move
-- RPC's security model (SECURITY DEFINER / grants / row lock), win rules, board
-- UI and other games are unchanged.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='caro_rooms' AND column_name='state_version') THEN
    RAISE EXCEPTION 'apply migration_caro_realtime_sync.sql first (state_version missing)';
  END IF;
  IF to_regprocedure('public.caro_make_move(uuid,integer,bigint)') IS NULL THEN
    RAISE EXCEPTION 'apply migration_caro_secure_moves.sql first (caro_make_move missing)';
  END IF;
END
$$;

-- The turn window in seconds, and the grace (latency/skew tolerance) shared by
-- move-rejection and timeout-resolution so they hand off cleanly at one instant.
-- Turn = 15s (unchanged product value); grace = 2s.

-- 1. Deadline columns ───────────────────────────────────────────────────────────
ALTER TABLE public.caro_rooms ADD COLUMN IF NOT EXISTS turn_started_at timestamptz;
ALTER TABLE public.caro_rooms ADD COLUMN IF NOT EXISTS turn_deadline   timestamptz;

-- 2. Initialize the deadline atomically when a game begins ────────────────────────
-- Fires on EVERY waiting -> playing transition (any join path: in-room button,
-- lobby, by-code), so the deadline is always server-set with the DB clock.
CREATE OR REPLACE FUNCTION public.caro_set_initial_deadline()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'playing' AND OLD.status = 'waiting' THEN
    NEW.turn_started_at := now();
    NEW.turn_deadline   := now() + interval '15 seconds';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS caro_rooms_initial_deadline ON public.caro_rooms;
CREATE TRIGGER caro_rooms_initial_deadline
  BEFORE UPDATE ON public.caro_rooms
  FOR EACH ROW EXECUTE FUNCTION public.caro_set_initial_deadline();

-- 3. Move RPC: set the next deadline on each move, clear it on finish, and reject
--    a move that arrives after the deadline + grace (the timeout resolver then
--    finalizes the loss). Re-creates caro_make_move; security model unchanged.
CREATE OR REPLACE FUNCTION public.caro_make_move(
  p_room_id uuid, p_cell_index integer, p_expected_state_version bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid; v_room public.caro_rooms; v_updated public.caro_rooms; v_symbol text;
  v_arr text[]; v_size constant int := 15; v_cells constant int := 225;
  v_dr int[] := ARRAY[0,1,1,1]; v_dc int[] := ARRAY[1,0,1,-1];
  v_row int; v_col int; d int; i int; r int; c int; idx int;
  v_line int[]; v_winning int[] := NULL; v_winner text := NULL; v_finished boolean := false;
  v_status text; v_next_turn text; v_board jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  SELECT * INTO v_room FROM public.caro_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','room_not_found'); END IF;
  IF v_room.player_x = v_uid THEN v_symbol := 'X';
  ELSIF v_room.player_o = v_uid THEN v_symbol := 'O';
  ELSE RETURN jsonb_build_object('ok',false,'error','not_a_player'); END IF;
  IF v_room.status <> 'playing' THEN RETURN jsonb_build_object('ok',false,'error','game_not_playing'); END IF;
  IF v_room.current_turn <> v_symbol THEN RETURN jsonb_build_object('ok',false,'error','not_your_turn'); END IF;
  -- Late move: the turn deadline (+grace) has passed. Reject; the resolver loses it.
  IF v_room.turn_deadline IS NOT NULL AND now() > v_room.turn_deadline + interval '2 seconds' THEN
    RETURN jsonb_build_object('ok',false,'error','turn_expired'); END IF;
  IF p_expected_state_version IS NOT NULL AND p_expected_state_version <> v_room.state_version THEN
    RETURN jsonb_build_object('ok',false,'error','stale_state'); END IF;
  IF p_cell_index < 0 OR p_cell_index >= v_cells THEN RETURN jsonb_build_object('ok',false,'error','cell_out_of_range'); END IF;
  IF jsonb_typeof(v_room.board) = 'array' AND jsonb_array_length(v_room.board) = v_cells THEN
    SELECT array_agg(CASE WHEN jsonb_typeof(e.value)='null' THEN NULL ELSE (e.value #>> '{}') END ORDER BY e.ord)
    INTO v_arr FROM jsonb_array_elements(v_room.board) WITH ORDINALITY AS e(value, ord);
  ELSE v_arr := array_fill(NULL::text, ARRAY[v_cells]); END IF;
  IF v_arr[p_cell_index+1] = 'X' OR v_arr[p_cell_index+1] = 'O' THEN RETURN jsonb_build_object('ok',false,'error','cell_occupied'); END IF;
  v_arr[p_cell_index+1] := v_symbol;
  v_row := p_cell_index / v_size; v_col := p_cell_index % v_size;
  FOR d IN 1..4 LOOP
    v_line := ARRAY[p_cell_index];
    FOR i IN 1..4 LOOP
      r := v_row + v_dr[d]*i; c := v_col + v_dc[d]*i;
      EXIT WHEN r<0 OR r>=v_size OR c<0 OR c>=v_size;
      idx := r*v_size + c; EXIT WHEN v_arr[idx+1] IS DISTINCT FROM v_symbol;
      v_line := v_line || idx;
    END LOOP;
    FOR i IN 1..4 LOOP
      r := v_row - v_dr[d]*i; c := v_col - v_dc[d]*i;
      EXIT WHEN r<0 OR r>=v_size OR c<0 OR c>=v_size;
      idx := r*v_size + c; EXIT WHEN v_arr[idx+1] IS DISTINCT FROM v_symbol;
      v_line := v_line || idx;
    END LOOP;
    IF array_length(v_line,1) >= 5 THEN SELECT array_agg(x ORDER BY x) INTO v_winning FROM unnest(v_line) AS x; EXIT; END IF;
  END LOOP;
  IF v_winning IS NOT NULL THEN v_winner := v_symbol; v_finished := true;
  ELSIF NOT EXISTS (SELECT 1 FROM unnest(v_arr) AS a WHERE a IS NULL) THEN v_winner := 'draw'; v_finished := true; END IF;
  v_status := CASE WHEN v_finished THEN 'finished' ELSE 'playing' END;
  v_next_turn := CASE WHEN v_symbol='X' THEN 'O' ELSE 'X' END;
  SELECT jsonb_agg(CASE WHEN a IS NULL THEN 'null'::jsonb ELSE to_jsonb(a) END ORDER BY ord)
  INTO v_board FROM unnest(v_arr) WITH ORDINALITY AS u(a, ord);
  UPDATE public.caro_rooms SET board=v_board, current_turn=v_next_turn, winner=v_winner,
    winning_cells=COALESCE(to_jsonb(v_winning),'[]'::jsonb), status=v_status,
    finished_at=CASE WHEN v_finished THEN now() ELSE NULL END,
    turn_started_at=CASE WHEN v_finished THEN NULL ELSE now() END,
    turn_deadline=CASE WHEN v_finished THEN NULL ELSE now() + interval '15 seconds' END
  WHERE id = p_room_id RETURNING * INTO v_updated;
  RETURN jsonb_build_object('ok',true,'room',to_jsonb(v_updated));
END; $$;

REVOKE ALL ON FUNCTION public.caro_make_move(uuid,integer,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caro_make_move(uuid,integer,bigint) TO authenticated;

-- 4. Single-room timeout resolution ──────────────────────────────────────────────
-- Any logged-in client (typically the opponent's browser) may request this; the DB
-- confirms the deadline really passed (+grace). The current-turn owner LOSES.
-- Idempotent: a non-playing room or a not-yet-expired deadline is a safe no-op.
CREATE OR REPLACE FUNCTION public.caro_resolve_timeout(
  p_room_id uuid, p_expected_state_version bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_room public.caro_rooms; v_updated public.caro_rooms; v_winner text;
BEGIN
  SELECT * INTO v_room FROM public.caro_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','room_not_found'); END IF;
  IF v_room.status <> 'playing' THEN RETURN jsonb_build_object('ok',true,'room',to_jsonb(v_room)); END IF;
  IF v_room.turn_deadline IS NULL THEN RETURN jsonb_build_object('ok',false,'error','no_deadline'); END IF;
  IF now() <= v_room.turn_deadline + interval '2 seconds' THEN RETURN jsonb_build_object('ok',false,'error','not_expired'); END IF;
  IF p_expected_state_version IS NOT NULL AND p_expected_state_version <> v_room.state_version THEN
    RETURN jsonb_build_object('ok',false,'error','stale_state'); END IF;
  v_winner := CASE WHEN v_room.current_turn = 'X' THEN 'O' ELSE 'X' END;
  UPDATE public.caro_rooms
  SET status='finished', winner=v_winner, finished_at=now(), turn_started_at=NULL, turn_deadline=NULL
  WHERE id = p_room_id AND status='playing'
  RETURNING * INTO v_updated;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'room',to_jsonb(v_room)); END IF;
  RETURN jsonb_build_object('ok',true,'room',to_jsonb(v_updated));
END; $$;

REVOKE ALL ON FUNCTION public.caro_resolve_timeout(uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caro_resolve_timeout(uuid,bigint) TO authenticated, service_role;

-- 5. Bulk timeout sweep (browser-independent) ─────────────────────────────────────
-- Finalizes ALL expired playing rooms in one atomic statement. For the lobby-load
-- maintenance pass and the cron route. Returns the affected rooms so the caller can
-- record tournament results. Service-role only (no per-user context needed).
CREATE OR REPLACE FUNCTION public.caro_resolve_expired(p_grace_seconds int DEFAULT 2)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  WITH expired AS (
    UPDATE public.caro_rooms
    SET status='finished',
        winner = CASE WHEN current_turn='X' THEN 'O' ELSE 'X' END,
        finished_at = now(), turn_started_at = NULL, turn_deadline = NULL
    WHERE status='playing' AND turn_deadline IS NOT NULL
      AND turn_deadline < now() - make_interval(secs => p_grace_seconds)
    RETURNING room_code, winner, player_x, player_o
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'room_code', room_code,
    'winner_id', CASE WHEN winner='X' THEN player_x ELSE player_o END,
    'loser_id',  CASE WHEN winner='X' THEN player_o ELSE player_x END)), '[]'::jsonb)
  INTO v_result FROM expired;
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.caro_resolve_expired(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caro_resolve_expired(int) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ── Verification ──────────────────────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns WHERE table_schema='public'
--     AND table_name='caro_rooms' AND column_name IN ('turn_started_at','turn_deadline');
--   SELECT tgname FROM pg_trigger WHERE tgrelid='public.caro_rooms'::regclass AND NOT tgisinternal;
--   SELECT proname FROM pg_proc WHERE proname IN ('caro_resolve_timeout','caro_resolve_expired');

-- ── Rollback ────────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS public.caro_resolve_expired(int);
--   DROP FUNCTION IF EXISTS public.caro_resolve_timeout(uuid,bigint);
--   DROP TRIGGER IF EXISTS caro_rooms_initial_deadline ON public.caro_rooms;
--   DROP FUNCTION IF EXISTS public.caro_set_initial_deadline();
--   ALTER TABLE public.caro_rooms DROP COLUMN IF EXISTS turn_deadline, DROP COLUMN IF EXISTS turn_started_at;
--   -- and re-apply caro_make_move from migration_caro_secure_moves.sql (no deadline logic).
