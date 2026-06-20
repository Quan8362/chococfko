-- ════════════════════════════════════════════════════════════════════════════
-- READ-ONLY DIAGNOSTICS for the "recent completed Caro matches missing from
-- history" investigation. Run these in the Supabase SQL Editor.
--
-- Context: `caro_games_history` is a VIEW over caro_rooms WHERE status IN
-- ('finished','cancelled'). A match appears in history ONLY while its caro_rooms
-- row exists with a terminal status. Nothing deletes caro_rooms, and the ONLY
-- code paths that set status='finished' are a submitted 5-in-a-row/draw move and
-- surrender — both require a live browser. Abandoned/crashed games stay 'playing'
-- forever and never enter history. These queries confirm that hypothesis.
--
-- None of these statements modify data.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Status distribution over the last 14 days (created_at).
--    Expectation if the hypothesis holds: many recent rows are 'playing', few/none
--    are 'finished', and 'cancelled' is 0 (no code path ever sets it).
SELECT status,
       count(*)                                   AS rooms,
       count(*) FILTER (WHERE winner IS NOT NULL) AS with_winner,
       min(created_at)                            AS oldest_created,
       max(created_at)                            AS newest_created,
       max(finished_at)                           AS newest_finished
FROM caro_rooms
WHERE created_at > now() - interval '14 days'
GROUP BY status
ORDER BY status;

-- 2) The exact cliff: most recent finished_at currently in history, and how many
--    finished rooms exist per day. Pinpoints when finalization effectively stopped.
SELECT date_trunc('day', finished_at) AS day,
       count(*)                       AS finished_rooms
FROM caro_rooms
WHERE status = 'finished'
GROUP BY 1
ORDER BY 1 DESC
LIMIT 30;

-- 3) Total rows the history view returns right now (should match the UI count).
SELECT count(*) AS history_rows FROM caro_games_history;

-- 4) Recent rooms stranded in 'playing' (the lost "completed" games). These are
--    the matches users played that never reached history.
SELECT id,
       room_code,
       status,
       current_turn,
       winner,
       (player_x IS NOT NULL) AS has_x,
       (player_o IS NOT NULL) AS has_o,
       created_at,
       updated_at,
       finished_at,
       now() - updated_at     AS idle_for
FROM caro_rooms
WHERE status = 'playing'
  AND created_at > now() - interval '14 days'
ORDER BY updated_at DESC;

-- 5) Reconciliation table requested in the brief:
--    room_id | created_at | updated_at | status | winner | history_exists | issue
SELECT r.id                         AS room_id,
       r.created_at,
       r.updated_at,
       r.status,
       r.winner,
       (h.id IS NOT NULL)           AS history_exists,
       CASE
         WHEN r.status = 'playing'  AND r.player_o IS NULL THEN 'never_started (no opponent)'
         WHEN r.status = 'playing'                          THEN 'stranded: abandoned/crashed, not finalized'
         WHEN r.status = 'waiting'                          THEN 'waiting room (expected: not in history)'
         WHEN r.status IN ('finished','cancelled') AND h.id IS NULL THEN 'INVESTIGATE: terminal but not in view'
         ELSE 'ok'
       END                          AS issue
FROM caro_rooms r
LEFT JOIN caro_games_history h ON h.id = r.id
WHERE r.created_at > now() - interval '14 days'
ORDER BY r.created_at DESC;

-- 6) Sanity: confirm no caro_rooms were deleted (rows still increasing, no gaps in
--    creation). If creation continued but finished stopped, abandonment is the cause.
SELECT date_trunc('day', created_at) AS day, count(*) AS created_rooms
FROM caro_rooms
WHERE created_at > now() - interval '14 days'
GROUP BY 1
ORDER BY 1 DESC;
