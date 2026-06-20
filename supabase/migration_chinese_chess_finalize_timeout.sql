-- Chinese Chess — Step 5: server-authoritative stale-game finalizer
-- Run AFTER migration_chinese_chess_timeout.sql
--
-- WHY: timeout is server-VALIDATED (claim_chinese_chess_timeout) but client-
-- TRIGGERED — some live browser must call it. If BOTH players go offline after the
-- per-turn deadline passes (crash, closed tabs, lost connection), nobody claims the
-- timeout and the room is stranded in status='playing' forever, so it never enters
-- the chinese_chess_history view (status='finished'). This is the gap the existing
-- TODO in ChineseChessGame.tsx calls out.
--
-- This finalizer reuses the SAME objective rule as claim_chinese_chess_timeout
-- (the player on the clock exceeded turn_started_at + turn_timeout_seconds), so it
-- is FAIR — it never assigns a loss for mere inactivity, only for a genuinely
-- expired authoritative deadline. A grace margin lets any still-live client claim
-- first. It is idempotent (WHERE status='playing'), atomic (single statement), and
-- requires NO browser to be open.
--
-- It is safe to run repeatedly (lobby load and/or pg_cron).

CREATE OR REPLACE FUNCTION public.finalize_expired_chinese_chess_games(
  p_grace_seconds INT DEFAULT 30
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH expired AS (
    UPDATE public.chinese_chess_rooms SET
      status             = 'finished',
      winner             = CASE WHEN current_turn = 'red' THEN 'black' ELSE 'red' END,
      end_reason         = 'timeout',
      finished_at        = now(),
      red_offered_draw   = false,
      black_offered_draw = false
    WHERE status = 'playing'
      AND player_red   IS NOT NULL
      AND player_black IS NOT NULL          -- never finalize a not-properly-started room
      AND turn_started_at IS NOT NULL
      AND now() > turn_started_at
                  + ((COALESCE(turn_timeout_seconds, 60) + GREATEST(p_grace_seconds, 0)) || ' seconds')::interval
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN v_count;
END;
$$;

-- Callable by the app (anon/authenticated lobby load) and by service role / cron.
GRANT EXECUTE ON FUNCTION public.finalize_expired_chinese_chess_games TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_expired_chinese_chess_games TO anon;
GRANT EXECUTE ON FUNCTION public.finalize_expired_chinese_chess_games TO service_role;

-- ── OPTIONAL: fully browser-independent scheduling via pg_cron ─────────────────
-- Requires the pg_cron extension (Supabase: Dashboard → Database → Extensions).
-- Uncomment to run every minute regardless of whether any lobby is open:
--
-- SELECT cron.schedule(
--   'finalize-xiangqi-timeouts',
--   '* * * * *',
--   $$ SELECT public.finalize_expired_chinese_chess_games(30); $$
-- );

NOTIFY pgrst, 'reload schema';
