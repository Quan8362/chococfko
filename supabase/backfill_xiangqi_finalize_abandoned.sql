-- ════════════════════════════════════════════════════════════════════════════
-- BACKFILL — finalize stranded Chinese Chess games.  ⚠️ DO NOT RUN WITHOUT APPROVAL.
--
-- Run diagnose_xiangqi_history.sql FIRST. This script previews candidates (Step A,
-- read-only) and keeps the mutation (Step B) commented out behind a transaction.
--
-- POLICY (fair, evidence-based — does NOT invent winners):
--   • SAFE auto-finalize  → status='playing' AND both players present AND the
--     OBJECTIVE per-turn deadline (turn_started_at + turn_timeout_seconds) has
--     expired. This is a timeout loss for the player on the clock — the exact rule
--     the live client / claim RPC already applies. end_reason='timeout'.
--   • AMBIGUOUS / no-contest → 'playing' with NO usable deadline (turn_started_at
--     NULL) or only one player ever present. These get NO winner; if anything they
--     should be marked 'cancelled' (no-contest), listed here for MANUAL review.
--   • Never started (player_black NULL) and corrupted state are listed separately.
-- ════════════════════════════════════════════════════════════════════════════

-- ── STEP A — PREVIEW (safe). Review before any mutation. ──────────────────────

-- A1) SAFE auto-finalize candidates (objective expired deadline → timeout loss).
SELECT id, room_code, current_turn,
       CASE WHEN current_turn = 'red' THEN 'black' ELSE 'red' END AS would_award_winner,
       turn_started_at, turn_timeout_seconds,
       now() - (turn_started_at + (COALESCE(turn_timeout_seconds,60) || ' seconds')::interval) AS overdue_by,
       move_count
FROM chinese_chess_rooms
WHERE status = 'playing'
  AND player_red IS NOT NULL
  AND player_black IS NOT NULL
  AND turn_started_at IS NOT NULL
  AND now() > turn_started_at + ((COALESCE(turn_timeout_seconds,60)) || ' seconds')::interval
ORDER BY turn_started_at ASC;

-- A2) AMBIGUOUS / no-contest — both players but NO usable deadline. NO winner.
SELECT id, room_code, status, move_count, created_at, updated_at
FROM chinese_chess_rooms
WHERE status = 'playing'
  AND player_red IS NOT NULL
  AND player_black IS NOT NULL
  AND turn_started_at IS NULL
ORDER BY updated_at DESC;

-- A3) Never started (no opponent) — leave as-is or expire as a waiting room.
SELECT id, room_code, status, created_at, updated_at
FROM chinese_chess_rooms
WHERE status = 'playing' AND player_black IS NULL
ORDER BY updated_at DESC;

-- A4) Corrupted/inconsistent terminal state for manual review.
SELECT id, room_code, status, winner, end_reason, finished_at
FROM chinese_chess_rooms
WHERE (winner IS NOT NULL AND status <> 'finished')
   OR (status = 'finished' AND finished_at IS NULL)
ORDER BY updated_at DESC;

-- ── STEP B — APPLY (mutating). Uncomment ONLY after approving Step A output. ───
-- The preferred path is simply to call the deployed RPC, which encodes exactly the
-- SAFE rule from A1 (idempotent, atomic):
--
-- SELECT public.finalize_expired_chinese_chess_games(0);   -- 0s grace = finalize all already-expired
--
-- ...or, equivalently, the raw guarded UPDATE:
--
-- BEGIN;
-- UPDATE public.chinese_chess_rooms SET
--   status             = 'finished',
--   winner             = CASE WHEN current_turn = 'red' THEN 'black' ELSE 'red' END,
--   end_reason         = 'timeout',
--   finished_at        = COALESCE(finished_at, turn_started_at + (COALESCE(turn_timeout_seconds,60) || ' seconds')::interval),
--   red_offered_draw   = false,
--   black_offered_draw = false
-- WHERE status = 'playing'
--   AND player_red IS NOT NULL
--   AND player_black IS NOT NULL
--   AND turn_started_at IS NOT NULL
--   AND now() > turn_started_at + ((COALESCE(turn_timeout_seconds,60)) || ' seconds')::interval
-- RETURNING id, room_code, winner, finished_at;
-- -- Review RETURNING, then COMMIT;  (otherwise ROLLBACK;)
--
-- Do NOT auto-assign winners for A2/A3. If you want them out of 'playing', mark
-- 'cancelled' (no winner) after manual review — that intentionally keeps them OUT of
-- the history view (which is status='finished' only).
