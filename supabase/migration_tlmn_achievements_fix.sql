-- TLMN — FIX: match statistics never recorded + backfill of existing history.
--
-- ROOT CAUSE (migration_tlmn_achievements.sql):
--   record_tlmn_round() parsed its p_players array with `(e->>0)::uuid` while iterating
--   jsonb_array_elements_text(p_players). jsonb_array_elements_text yields each id as a
--   *text* scalar, so `e->>0` (the JSON arrow operator on a text value) has no matching
--   operator and the function raised on first execution. recordRoundStats() in
--   app/games/tlmn/actions.ts swallows that error (best-effort, never wedge a round), so
--   public.game_player_stats was NEVER written → leaderboard showed Trận/Thắng = 0 and
--   Tỷ lệ thắng = – for everyone, while coins (game_wallets) kept loading correctly.
--
-- This migration:
--   1. CREATE OR REPLACE record_tlmn_round() with the correct cast (e::uuid). Existing
--      grants are preserved by REPLACE; re-asserted below for safety.
--   2. Idempotently backfills game_player_stats from the authoritative history that already
--      exists, WITHOUT touching any wallet/coin balance.
--
-- Safe to run multiple times. Run it AFTER migration_tlmn_achievements.sql.

-- ── 1. Fix: the ONLY writer of match stats ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_tlmn_round(
  p_room_id      uuid,
  p_round_number int,
  p_winner       uuid,
  p_players      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key  text := 'tlmn';
  v_uid  uuid;
  v_won  boolean;
  v_count int := 0;
BEGIN
  -- Once-only lock: if the row already exists this round was already recorded.
  INSERT INTO public.tlmn_stat_records (room_id, round_number)
    VALUES (p_room_id, p_round_number)
    ON CONFLICT (room_id, round_number) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('recorded', false, 'players', 0);
  END IF;

  -- p_players is a JSON array of uuid strings, e.g. ["uuid","uuid"]. Each element is a
  -- text scalar → cast directly to uuid. Deterministic lock order (by user_id) avoids
  -- deadlocks between concurrent rounds.
  FOR v_uid IN
    SELECT DISTINCT e::uuid
    FROM jsonb_array_elements_text(p_players) e
    WHERE e IS NOT NULL
    ORDER BY 1
  LOOP
    CONTINUE WHEN v_uid IS NULL;
    v_won := (p_winner IS NOT NULL AND v_uid = p_winner);

    INSERT INTO public.game_player_stats AS s
      (user_id, game_key, total_games, total_wins, total_losses,
       current_win_streak, best_win_streak, last_played_at)
    VALUES
      (v_uid, v_key, 1, CASE WHEN v_won THEN 1 ELSE 0 END, CASE WHEN v_won THEN 0 ELSE 1 END,
       CASE WHEN v_won THEN 1 ELSE 0 END, CASE WHEN v_won THEN 1 ELSE 0 END, now())
    ON CONFLICT (user_id, game_key) DO UPDATE SET
      total_games  = s.total_games  + 1,
      total_wins   = s.total_wins   + CASE WHEN v_won THEN 1 ELSE 0 END,
      total_losses = s.total_losses + CASE WHEN v_won THEN 0 ELSE 1 END,
      current_win_streak = CASE WHEN v_won THEN s.current_win_streak + 1 ELSE 0 END,
      best_win_streak    = CASE WHEN v_won THEN GREATEST(s.best_win_streak, s.current_win_streak + 1)
                                ELSE s.best_win_streak END,
      last_played_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('recorded', true, 'players', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.record_tlmn_round(uuid, int, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_tlmn_round(uuid, int, uuid, jsonb) TO service_role;

-- ── 2. Backfill existing finalized rounds (idempotent, coin-safe) ───────────────────
-- Authoritative participation comes from public.coin_ledger: every real player who was
-- settled in a finalized round has exactly one (user_id, game_code = room_id, round_number)
-- row with reason='round_settlement', written only by settle_round at round-end. This is
-- keyed by the canonical real user_id (no seat guessing) and practice rooms never produce
-- such rows, so they are naturally excluded. The winner of each round is the Nhất seat
-- (tlmn_games.nhat_seat, status='ended') mapped seat→user via tlmn_seats, and is COUNTED
-- ONLY when that user is also an authoritative participant of the same round — this clamps
-- total_wins ≤ total_games and rejects any seat-remap mismatch.
--
-- A single statement: all CTEs share one snapshot, so the rounds chosen for this run are
-- locked (tlmn_stat_records) and folded into game_player_stats atomically; a second run
-- sees those rounds already locked and is a no-op. No wallet/balance is read or written.
WITH settled AS (
  SELECT DISTINCT cl.user_id, cl.game_code::uuid AS room_id, cl.round_number
  FROM public.coin_ledger cl
  WHERE cl.reason = 'round_settlement'
    AND cl.round_number IS NOT NULL
    AND cl.game_code IS NOT NULL
),
rounds AS (  -- finalized rounds not yet folded into stats
  SELECT DISTINCT s.room_id, s.round_number
  FROM settled s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tlmn_stat_records sr
    WHERE sr.room_id = s.room_id AND sr.round_number = s.round_number
  )
),
parts AS (  -- authoritative real participants of those rounds
  SELECT s.user_id, s.room_id, s.round_number
  FROM settled s
  JOIN rounds r ON r.room_id = s.room_id AND r.round_number = s.round_number
),
winners AS (  -- winning real user per round, clamped to an actual participant
  SELECT DISTINCT r.room_id, r.round_number, ts.user_id AS winner_user
  FROM rounds r
  JOIN public.tlmn_games g
    ON g.room_id = r.room_id AND g.round_no = r.round_number AND g.status = 'ended'
  JOIN public.tlmn_seats ts
    ON ts.room_id = g.room_id AND ts.seat_index = g.nhat_seat
   AND COALESCE(ts.is_bot, false) = false AND ts.user_id IS NOT NULL
  WHERE EXISTS (
    SELECT 1 FROM parts p
    WHERE p.room_id = r.room_id AND p.round_number = r.round_number AND p.user_id = ts.user_id
  )
),
agg AS (
  SELECT p.user_id,
         COUNT(*)::bigint AS games,
         COUNT(*) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM winners w
             WHERE w.room_id = p.room_id AND w.round_number = p.round_number
               AND w.winner_user = p.user_id
           )
         )::bigint AS wins
  FROM parts p
  GROUP BY p.user_id
),
lock AS (  -- data-modifying CTE: always runs to completion; makes this run once-only
  INSERT INTO public.tlmn_stat_records (room_id, round_number)
  SELECT room_id, round_number FROM rounds
  ON CONFLICT (room_id, round_number) DO NOTHING
  RETURNING 1
)
INSERT INTO public.game_player_stats AS gps
  (user_id, game_key, total_games, total_wins, total_losses, last_played_at)
SELECT a.user_id, 'tlmn', a.games, a.wins, a.games - a.wins, now()
FROM agg a
ON CONFLICT (user_id, game_key) DO UPDATE SET
  total_games  = gps.total_games  + EXCLUDED.total_games,
  total_wins   = gps.total_wins   + EXCLUDED.total_wins,
  total_losses = gps.total_losses + EXCLUDED.total_losses,
  last_played_at = now();

NOTIFY pgrst, 'reload schema';
