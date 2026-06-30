-- ── CARO AUTHORITATIVE ROOM JOIN ──────────────────────────────────────────────
-- Forward migration. Run in Supabase SQL Editor AFTER migration_caro_secure_moves.sql
-- and migration_caro_timer.sql (depends on the revoked direct writes, the
-- state_version bump trigger, and the caro_set_initial_deadline trigger).
-- Idempotent — safe to re-run.
--
-- Why this exists:
--   Occupying the Player O seat was the last room mutation still done from the
--   service-role admin client via a read-then-conditional-UPDATE, and it carried
--   a client-heartbeat-based `stale` guard. When the host's browser tab is
--   backgrounded the heartbeat setInterval is throttled/suspended, so a host who
--   is genuinely present has their room rejected as "expired" and the joiner can
--   never take the O seat (player_o stays NULL, status stays 'waiting'). Mean-
--   while the host's surviving heartbeats keep bumping state_version, so the room
--   *looks* like it changed even though the join never happened.
--
--   This funnels the join through a single SECURITY DEFINER RPC — the same model
--   as caro_make_move / caro_resolve_timeout — so it is:
--     • Atomic & race-safe: the row is locked FOR UPDATE, so two users clicking
--       "Tham gia phòng" at the same instant serialize; the first wins the seat,
--       the second sees player_o set and gets 'room_full'.
--     • Secure: identity is auth.uid() (the caller's own JWT), not a trusted
--       client argument; direct table UPDATE stays revoked from authenticated.
--     • Self-healing on version: rejected joins RETURN before any UPDATE, so a
--       failed join never bumps state_version.
--     • Free of the false-negative stale rejection: a present host is never
--       blocked. A truly-abandoned waiting room is removed by the existing
--       cleanup reaper, and a game that starts but is then abandoned is closed
--       out by finalizeStaleGames — neither needs the join to second-guess the
--       host's liveness.
--
-- Scope: room join only. Does NOT touch realtime, the move RPC, the timer,
-- RLS/SELECT visibility, board UI, the leaderboard, stale cleanup, or any other
-- game/table.

-- 0. Hard dependency checks ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'caro_rooms' AND column_name = 'state_version'
  ) THEN
    RAISE EXCEPTION 'caro_rooms.state_version is missing — apply migration_caro_realtime_sync.sql first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.caro_rooms'::regclass AND tgname = 'caro_rooms_initial_deadline'
  ) THEN
    RAISE EXCEPTION 'caro_rooms_initial_deadline trigger is missing — apply migration_caro_timer.sql first';
  END IF;
END
$$;

-- 1. Authoritative join RPC ──────────────────────────────────────────────────────
-- Returns jsonb: { ok: true, room: <full room row> } on success (including the
-- idempotent "already seated" case), or { ok: false, error: <stable code> } on a
-- rejected join. Stable error codes:
--   not_authenticated · room_not_found · host_cannot_join · room_not_joinable · room_full
CREATE OR REPLACE FUNCTION public.caro_join_room(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid;
  v_room    public.caro_rooms;
  v_updated public.caro_rooms;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Lock the row so concurrent joiners serialize on it.
  SELECT * INTO v_room FROM public.caro_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  -- The host can never take the O seat in their own room.
  IF v_room.player_x = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'host_cannot_join');
  END IF;

  -- Idempotent: repeated clicks / already seated as O → success no-op.
  IF v_room.player_o = v_uid THEN
    RETURN jsonb_build_object('ok', true, 'room', to_jsonb(v_room));
  END IF;

  -- Not joinable: already started / finished / cancelled.
  IF v_room.status <> 'waiting' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_joinable');
  END IF;

  -- Seat already taken by someone else.
  IF v_room.player_o IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_full');
  END IF;

  -- Claim the seat and start the game. The BEFORE UPDATE triggers stamp
  -- turn_started_at / turn_deadline (caro_set_initial_deadline) and bump
  -- state_version. Single atomic write under the lock acquired above.
  UPDATE public.caro_rooms
  SET player_o = v_uid,
      status = 'playing'
  WHERE id = p_room_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'room', to_jsonb(v_updated));
END;
$$;

-- Only logged-in users may call it; never anon, never public.
REVOKE ALL ON FUNCTION public.caro_join_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caro_join_room(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Verification (run after applying) ─────────────────────────────────────────
--   SELECT proname FROM pg_proc WHERE proname = 'caro_join_room';
--   SELECT grantee, privilege_type FROM information_schema.role_routine_grants
--   WHERE routine_name = 'caro_join_room';

-- ── Rollback ──────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS public.caro_join_room(uuid);
--   NOTIFY pgrst, 'reload schema';
-- (and redeploy the previous joinCaroRoom that wrote via the service-role client.)
