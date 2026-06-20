-- ════════════════════════════════════════════════════════════════════════════
-- BACKFILL — finalize abandoned Caro games so completed-but-stranded matches
-- appear in history.  ⚠️  DO NOT RUN WITHOUT EXPLICIT APPROVAL.
--
-- Run diagnose_caro_history.sql FIRST and review the candidates. This script:
--   1) PREVIEWS the rooms it would finalize (step A — safe, read-only),
--   2) only then (step B) finalizes them, mirroring the app's forfeit rule:
--      the player whose turn it was when the game stalled forfeits, so the
--      opponent is recorded as the winner. Same rule as finalizeStaleGames().
--
-- It is idempotent (WHERE status='playing') and conservative (only games with
-- BOTH players that have been idle well beyond the turn limit).
--
-- It intentionally does NOT fabricate results for rooms that never had an
-- opponent (player_o IS NULL) — those are listed separately for manual review.
-- ════════════════════════════════════════════════════════════════════════════

-- Tunable: how long a 'playing' room must be idle to be considered abandoned.
-- 30 minutes is far beyond the 15s turn limit; raise it to be more conservative.
-- (updated_at == last move time for 'playing' rooms — heartbeats only run while
--  status='waiting'.)

-- ── STEP A — PREVIEW (safe). Review this output before running Step B. ─────────
SELECT id,
       room_code,
       current_turn,
       CASE current_turn WHEN 'X' THEN 'O' ELSE 'X' END AS would_award_winner,
       player_x,
       player_o,
       created_at,
       updated_at,
       now() - updated_at AS idle_for
FROM caro_rooms
WHERE status = 'playing'
  AND player_x IS NOT NULL
  AND player_o IS NOT NULL
  AND updated_at < now() - interval '30 minutes'
ORDER BY updated_at DESC;

-- Rooms that can NOT be safely auto-finalized (no opponent ever joined) —
-- list for manual review; do NOT backfill these as wins.
SELECT id, room_code, status, created_at, updated_at
FROM caro_rooms
WHERE status = 'playing'
  AND player_o IS NULL
ORDER BY updated_at DESC;

-- ── STEP B — APPLY (mutating). Uncomment ONLY after approving Step A output. ───
-- BEGIN;
--
-- UPDATE caro_rooms
-- SET    status      = 'finished',
--        winner      = CASE current_turn WHEN 'X' THEN 'O' ELSE 'X' END,
--        finished_at = COALESCE(finished_at, updated_at)
-- WHERE  status = 'playing'
--   AND  player_x IS NOT NULL
--   AND  player_o IS NOT NULL
--   AND  updated_at < now() - interval '30 minutes'
-- RETURNING id, room_code, winner, finished_at;
--
-- -- Review the RETURNING output. If correct:
-- COMMIT;
-- -- otherwise:
-- -- ROLLBACK;
--
-- NOTE: tournament-linked rooms (caro_tournament_matches.room_code) are NOT
-- advanced by this raw SQL. If any previewed room belongs to a tournament,
-- finalize it through the app's finalizeStaleGames() path (which calls
-- recordTournamentResult) or update the bracket manually.
