-- ════════════════════════════════════════════════════════════════════════════
-- ONE-TIME CORRECTION — Caro games that the FIRST version of finalizeStaleGames
-- closed out as a forfeit win with finished_at = now(), making old stranded
-- matches show as "vừa xong" wins.  ⚠️ DO NOT RUN WITHOUT APPROVAL.
--
-- The fixed code now marks abandoned games as 'cancelled' (no-contest) with
-- finished_at = last move time. This script aligns the already-recovered rows.
--
-- HOW WE IDENTIFY THEM (the abandonment signature, to avoid touching real games):
--   • status = 'finished'
--   • winning_cells = '[]'  → no five-in-a-row (not a real checkmate-style win)
--   • board is NOT full      → not a draw
--   • finished_at - created_at is large (> 1 hour) → the game sat stranded for a
--     long time before being auto-finalized; a genuinely played-out win or a real
--     surrender finishes within minutes of creation, so this gap excludes them.
--
-- TIME SOURCE: the original last-move timestamp is unrecoverable (the
-- caro_rooms_updated_at trigger overwrote updated_at when the row was finalized,
-- and Caro has no per-move table). created_at is the best available proxy and, for
-- short Caro games, is within minutes of the true finish.
-- ════════════════════════════════════════════════════════════════════════════

-- WHY EACH FILTER PROVABLY EXCLUDES A GENUINE RESULT:
--   • winner IN ('X','O')      → only the bogus forfeit-wins. Excludes real DRAWS
--                                 (winner='draw') and any already-cancelled rows
--                                 (winner NULL).
--   • winning_cells = '[]'      → a real five-in-a-row WIN always has its winning
--                                 cells stored by makeMove, so real wins are excluded.
--   • board not full (<225)     → a real DRAW fills the board; excluded.
--   • finished_at - created_at  → a real SURRENDER finishes within minutes of
--     > 1 hour                    creation. A Caro game (15s/turn, 225 cells) maxes
--                                 out around ~30 min, so a >1h gap can only be a
--                                 room that sat stranded for a long time before the
--                                 buggy finalizer closed it. Real surrenders excluded.
-- Eyeball check: every candidate row should have an OLD created_at and a much more
-- RECENT finished_at (the moment the buggy finalizer ran). If any row looks like a
-- normal recent game, STOP and do not run Step B.

-- ── STEP A — PREVIEW (safe). Review before Step B. ────────────────────────────
SELECT id, room_code, winner,
       created_at, finished_at,
       finished_at - created_at AS stranded_gap,
       (SELECT count(*) FROM jsonb_array_elements(board) e WHERE e <> 'null'::jsonb) AS pieces_on_board
FROM caro_rooms
WHERE status = 'finished'
  AND winner IN ('X','O')
  AND winning_cells = '[]'::jsonb
  AND finished_at IS NOT NULL
  AND finished_at - created_at > interval '1 hour'
  -- board not completely full (a full board with no win would be a legitimate draw)
  AND (
    jsonb_typeof(board) <> 'array'
    OR (SELECT count(*) FROM jsonb_array_elements(board) e WHERE e <> 'null'::jsonb) < 225
  )
ORDER BY finished_at DESC;

-- ── STEP B — APPLY (mutating). Uncomment ONLY after approving Step A. ──────────
-- ✅ ALREADY EXECUTED on 2026-06-20: converted exactly 8 stranded forfeit-wins
--    into no-contest rows (status='cancelled', winner=NULL, finished_at=created_at).
--    Re-commented (preview-only) so it cannot be run again by accident — the WHERE
--    no longer matches those rows (now 'cancelled'), but keep it disabled regardless.
-- Converts the recovered forfeit-wins into no-contest rows with an accurate
-- historical time. Keep the WHERE identical to Step A.
--
-- BEGIN;
-- UPDATE caro_rooms SET
--   status        = 'cancelled',
--   winner        = NULL,
--   winning_cells = '[]'::jsonb,
--   finished_at   = created_at          -- best available proxy for the true finish
-- WHERE status = 'finished'
--   AND winner IN ('X','O')
--   AND winning_cells = '[]'::jsonb
--   AND finished_at IS NOT NULL
--   AND finished_at - created_at > interval '1 hour'
--   AND (
--     jsonb_typeof(board) <> 'array'
--     OR (SELECT count(*) FROM jsonb_array_elements(board) e WHERE e <> 'null'::jsonb) < 225
--   )
-- RETURNING id, room_code, status, winner, finished_at;
-- -- Review RETURNING, then COMMIT;  (otherwise ROLLBACK;)
--
-- NOTE: the caro_rooms_updated_at trigger will bump updated_at on this UPDATE —
-- that's fine, the history view orders by finished_at, which we set explicitly.
