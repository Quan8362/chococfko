-- ── CARO AUTHORITATIVE MOVE SECURITY ──────────────────────────────────────────
-- Forward migration. Run in Supabase SQL Editor AFTER migration_caro_realtime_sync.sql
-- (this depends on the state_version column + bump trigger created there).
--
-- Closes the gap where an authenticated participant could PATCH caro_rooms
-- directly (PostgREST) and set authoritative fields — board / current_turn /
-- winner / winning_cells / status / finished_at / state_version — bypassing the
-- server. Gameplay mutation is now funneled through a single SECURITY DEFINER
-- RPC, and direct INSERT/UPDATE/DELETE is revoked from anon + authenticated.
--
-- Scope: move mutation, RLS/grants, atomicity. Does NOT touch realtime, the
-- timer, board UI, game rules, stale cleanup, the leaderboard, or other games.
-- SELECT visibility (needed for display + realtime) is preserved unchanged.

-- 0. Hard dependency check ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'caro_rooms' AND column_name = 'state_version'
  ) THEN
    RAISE EXCEPTION 'caro_rooms.state_version is missing — apply migration_caro_realtime_sync.sql first';
  END IF;
END
$$;

-- 1. Authoritative move RPC ──────────────────────────────────────────────────────
-- Returns jsonb: { ok: true, room: <full room row> } on success, or
-- { ok: false, error: <stable code> } on a rejected move. Never leaks raw DB
-- errors. The row is locked FOR UPDATE so concurrent callers serialize and the
-- state_version trigger guarantees a monotonic version on every applied move.
CREATE OR REPLACE FUNCTION public.caro_make_move(
  p_room_id uuid,
  p_cell_index integer,
  p_expected_state_version bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid;
  v_room      public.caro_rooms;
  v_updated   public.caro_rooms;
  v_symbol    text;
  v_arr       text[];
  v_size      constant int := 15;
  v_cells     constant int := 225;
  v_dr        int[] := ARRAY[0, 1, 1, 1];
  v_dc        int[] := ARRAY[1, 0, 1, -1];
  v_row       int;
  v_col       int;
  d           int;
  i           int;
  r           int;
  c           int;
  idx         int;
  v_line      int[];
  v_winning   int[] := NULL;
  v_winner    text := NULL;
  v_finished  boolean := false;
  v_status    text;
  v_next_turn text;
  v_board     jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_room FROM public.caro_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  IF v_room.player_x = v_uid THEN
    v_symbol := 'X';
  ELSIF v_room.player_o = v_uid THEN
    v_symbol := 'O';
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_player');
  END IF;

  IF v_room.status <> 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'game_not_playing');
  END IF;

  IF v_room.current_turn <> v_symbol THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_your_turn');
  END IF;

  -- Optimistic concurrency: reject a move computed against an outdated view.
  IF p_expected_state_version IS NOT NULL
     AND p_expected_state_version <> v_room.state_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_state');
  END IF;

  IF p_cell_index < 0 OR p_cell_index >= v_cells THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cell_out_of_range');
  END IF;

  -- Normalize the stored board into a 1-indexed text[] (NULL = empty cell).
  IF jsonb_typeof(v_room.board) = 'array' AND jsonb_array_length(v_room.board) = v_cells THEN
    SELECT array_agg(
             CASE WHEN jsonb_typeof(e.value) = 'null' THEN NULL ELSE (e.value #>> '{}') END
             ORDER BY e.ord)
    INTO v_arr
    FROM jsonb_array_elements(v_room.board) WITH ORDINALITY AS e(value, ord);
  ELSE
    v_arr := array_fill(NULL::text, ARRAY[v_cells]);
  END IF;

  IF v_arr[p_cell_index + 1] = 'X' OR v_arr[p_cell_index + 1] = 'O' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cell_occupied');
  END IF;

  -- Apply exactly one mark.
  v_arr[p_cell_index + 1] := v_symbol;

  -- Win detection anchored on the placed cell (five OR MORE in a row), checking
  -- horizontal, vertical, diagonal and anti-diagonal — same rule as winner.ts.
  v_row := p_cell_index / v_size;
  v_col := p_cell_index % v_size;
  FOR d IN 1..4 LOOP
    v_line := ARRAY[p_cell_index];
    FOR i IN 1..4 LOOP
      r := v_row + v_dr[d] * i;
      c := v_col + v_dc[d] * i;
      EXIT WHEN r < 0 OR r >= v_size OR c < 0 OR c >= v_size;
      idx := r * v_size + c;
      EXIT WHEN v_arr[idx + 1] IS DISTINCT FROM v_symbol;
      v_line := v_line || idx;
    END LOOP;
    FOR i IN 1..4 LOOP
      r := v_row - v_dr[d] * i;
      c := v_col - v_dc[d] * i;
      EXIT WHEN r < 0 OR r >= v_size OR c < 0 OR c >= v_size;
      idx := r * v_size + c;
      EXIT WHEN v_arr[idx + 1] IS DISTINCT FROM v_symbol;
      v_line := v_line || idx;
    END LOOP;
    IF array_length(v_line, 1) >= 5 THEN
      SELECT array_agg(x ORDER BY x) INTO v_winning FROM unnest(v_line) AS x;
      EXIT;
    END IF;
  END LOOP;

  IF v_winning IS NOT NULL THEN
    v_winner := v_symbol;
    v_finished := true;
  ELSIF NOT EXISTS (SELECT 1 FROM unnest(v_arr) AS a WHERE a IS NULL) THEN
    v_winner := 'draw';
    v_finished := true;
  END IF;

  v_status := CASE WHEN v_finished THEN 'finished' ELSE 'playing' END;
  v_next_turn := CASE WHEN v_symbol = 'X' THEN 'O' ELSE 'X' END;

  SELECT jsonb_agg(CASE WHEN a IS NULL THEN 'null'::jsonb ELSE to_jsonb(a) END ORDER BY ord)
  INTO v_board
  FROM unnest(v_arr) WITH ORDINALITY AS u(a, ord);

  -- Single atomic write. state_version is bumped by the BEFORE UPDATE trigger.
  UPDATE public.caro_rooms
  SET board = v_board,
      current_turn = v_next_turn,
      winner = v_winner,
      winning_cells = COALESCE(to_jsonb(v_winning), '[]'::jsonb),
      status = v_status,
      finished_at = CASE WHEN v_finished THEN now() ELSE NULL END
  WHERE id = p_room_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'room', to_jsonb(v_updated));
END;
$$;

-- Only logged-in users may call it; never anon, never public.
REVOKE ALL ON FUNCTION public.caro_make_move(uuid, integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caro_make_move(uuid, integer, bigint) TO authenticated;

-- 2. Lock down direct table mutation ──────────────────────────────────────────
-- All gameplay/room writes go through server actions (service_role) or the RPC
-- above. anon/authenticated keep SELECT only, so a participant can no longer
-- PATCH authoritative fields directly. RLS stays enabled; SELECT is untouched.
REVOKE INSERT, UPDATE, DELETE ON public.caro_rooms FROM anon, authenticated;

-- Drop the now-dead permissive write policies (unreachable without the grant,
-- but removed so the security model is unambiguous). SELECT policy is preserved.
DROP POLICY IF EXISTS "caro_rooms_update" ON public.caro_rooms;
DROP POLICY IF EXISTS "caro_rooms_insert" ON public.caro_rooms;

NOTIFY pgrst, 'reload schema';

-- ── Verification (run after applying) ─────────────────────────────────────────
-- Grants — expect NO insert/update/delete for anon/authenticated, SELECT only:
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema='public' AND table_name='caro_rooms'
--     AND grantee IN ('anon','authenticated') ORDER BY grantee, privilege_type;
-- Policies — expect only caro_rooms_select remaining:
--   SELECT polname FROM pg_policy WHERE polrelid='public.caro_rooms'::regclass;
-- Function grant — expect authenticated has EXECUTE:
--   SELECT grantee, privilege_type FROM information_schema.role_routine_grants
--   WHERE routine_name='caro_make_move';

-- ── Rollback ──────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS public.caro_make_move(uuid, integer, bigint);
--   GRANT INSERT, UPDATE, DELETE ON public.caro_rooms TO anon, authenticated;
--   CREATE POLICY "caro_rooms_insert" ON public.caro_rooms
--     FOR INSERT TO authenticated WITH CHECK (player_x = auth.uid());
--   CREATE POLICY "caro_rooms_update" ON public.caro_rooms
--     FOR UPDATE TO authenticated USING (
--       player_x = auth.uid() OR player_o = auth.uid()
--       OR (player_o IS NULL AND status = 'waiting'));
--   NOTIFY pgrst, 'reload schema';
-- (and redeploy the previous makeMove that wrote via the service-role client.)
