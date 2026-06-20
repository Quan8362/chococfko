-- ════════════════════════════════════════════════════════════════════════════
-- READ-ONLY DIAGNOSTICS for Chinese Chess (Cờ Tướng / Xiangqi) result persistence.
-- Run in the Supabase SQL Editor.
--
-- Architecture: `chinese_chess_history` is a VIEW over `chinese_chess_rooms`
-- WHERE status='finished' ORDER BY finished_at DESC. A match appears in history
-- ONLY while its room row exists with status='finished'. Completion is committed
-- server-side by RPCs (make_chinese_chess_move / resign / draw / claim_timeout),
-- so checkmate/resign/draw persist even if the browser dies after submitting.
--
-- The one gap: TIMEOUT is server-validated but client-TRIGGERED. If BOTH players go
-- offline after the per-turn deadline (turn_started_at + turn_timeout_seconds), no
-- client calls claim_chinese_chess_timeout and the room is stranded in 'playing'.
-- These queries quantify that. None of them modify data.
-- ════════════════════════════════════════════════════════════════════════════

-- A) Status distribution by day over the last 30 days (creation-based).
SELECT date_trunc('day', created_at)                         AS day,
       count(*)                                              AS created,
       count(*) FILTER (WHERE status = 'waiting')            AS waiting,
       count(*) FILTER (WHERE status = 'playing')            AS playing,
       count(*) FILTER (WHERE status = 'finished')           AS finished,
       count(*) FILTER (WHERE status = 'cancelled')          AS cancelled,
       count(*) FILTER (WHERE status NOT IN ('waiting','playing','finished','cancelled')) AS unknown_status
FROM chinese_chess_rooms
WHERE created_at > now() - interval '30 days'
GROUP BY 1 ORDER BY 1 DESC;

-- A2) Finished games broken down by end_reason / winner (last 30 days).
SELECT date_trunc('day', finished_at)                        AS day,
       count(*)                                              AS finished,
       count(*) FILTER (WHERE winner = 'draw')               AS draws,
       count(*) FILTER (WHERE end_reason = 'checkmate')      AS checkmate,
       count(*) FILTER (WHERE end_reason = 'general_captured') AS general_captured,
       count(*) FILTER (WHERE end_reason = 'resign')         AS resign,
       count(*) FILTER (WHERE end_reason = 'timeout')        AS timeout,
       count(*) FILTER (WHERE end_reason = 'draw')           AS draw_reason,
       count(*) FILTER (WHERE end_reason IS NULL)            AS null_reason
FROM chinese_chess_rooms
WHERE status = 'finished' AND finished_at > now() - interval '30 days'
GROUP BY 1 ORDER BY 1 DESC;

-- B) Reconciliation detail (last 14 days). move_count is denormalized on the room;
--    history_exists mirrors the view's status='finished' filter.
SELECT r.id                              AS room_id,
       r.room_code,
       r.created_at,
       r.updated_at,
       r.turn_started_at,
       r.finished_at,
       r.status,
       (r.player_red   IS NOT NULL)      AS has_red,
       (r.player_black IS NOT NULL)      AS has_black,
       r.current_turn,
       r.winner,
       r.end_reason,
       r.move_count,
       (h.id IS NOT NULL)                AS history_exists,
       CASE
         WHEN r.status = 'playing' AND r.player_black IS NULL THEN 'never_started (no opponent)'
         WHEN r.status = 'playing'
              AND r.turn_started_at IS NOT NULL
              AND now() > r.turn_started_at + ((COALESCE(r.turn_timeout_seconds,60)) || ' seconds')::interval
                                                            THEN 'STRANDED: deadline expired, nobody claimed timeout'
         WHEN r.status = 'playing'                          THEN 'in-progress or recently active'
         WHEN r.status = 'waiting'                          THEN 'waiting room (expected: not in history)'
         WHEN r.status = 'finished' AND r.finished_at IS NULL THEN 'INVESTIGATE: finished but finished_at NULL'
         WHEN r.status = 'finished' AND h.id IS NULL          THEN 'INVESTIGATE: finished but absent from view'
         WHEN r.status = 'finished' AND r.winner IS NULL AND r.end_reason <> 'draw'
                                                            THEN 'INVESTIGATE: finished, no winner, not a draw'
         ELSE 'ok'
       END                               AS issue
FROM chinese_chess_rooms r
LEFT JOIN chinese_chess_history h ON h.id = r.id
WHERE r.created_at > now() - interval '14 days'
ORDER BY r.created_at DESC;

-- C) Potentially stranded matches: 'playing' with an OBJECTIVELY expired deadline
--    (this is what finalize_expired_chinese_chess_games would finalize).
SELECT id, room_code, current_turn,
       CASE WHEN current_turn = 'red' THEN 'black' ELSE 'red' END AS would_award_winner,
       turn_started_at,
       turn_timeout_seconds,
       now() - (turn_started_at + (COALESCE(turn_timeout_seconds,60) || ' seconds')::interval) AS overdue_by,
       move_count, updated_at
FROM chinese_chess_rooms
WHERE status = 'playing'
  AND player_red IS NOT NULL
  AND player_black IS NOT NULL
  AND turn_started_at IS NOT NULL
  AND now() > turn_started_at + ((COALESCE(turn_timeout_seconds,60)) || ' seconds')::interval
ORDER BY turn_started_at ASC;

-- C2) Anomalies that should NOT exist (winner set but not terminal; terminal but no finished_at).
SELECT id, room_code, status, winner, end_reason, finished_at, updated_at
FROM chinese_chess_rooms
WHERE (winner IS NOT NULL AND status <> 'finished')
   OR (status = 'finished' AND finished_at IS NULL)
ORDER BY updated_at DESC;

-- D) History cliff: latest recorded result, and whether creation continued while
--    finishes stopped (the tell-tale of a persistence regression vs. just low play).
SELECT max(finished_at) AS latest_finished_at FROM chinese_chess_rooms WHERE status = 'finished';

SELECT date_trunc('day', created_at) AS day,
       count(*)                                       AS created,
       count(*) FILTER (WHERE status = 'finished')    AS finished_same_day_rooms
FROM chinese_chess_rooms
WHERE created_at > now() - interval '30 days'
GROUP BY 1 ORDER BY 1 DESC;
