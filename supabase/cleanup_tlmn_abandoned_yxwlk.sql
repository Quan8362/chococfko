-- ONE-TIME, NARROWLY-SCOPED cleanup for the confirmed stranded room YXWLK.
--
-- DO NOT run automatically. Apply migration_tlmn_abandoned.sql FIRST (it adds the
-- 'abandoned' status these UPDATEs write). After that migration + the code are deployed,
-- the reaper (reapAbandonedGames, nudged from the TLMN lobby load and the cron) finalizes
-- YXWLK on its own — this script is only for an immediate, manual one-off close.
--
-- Scope: invite_code = 'YXWLK' ONLY. Idempotent (guarded on status='playing'). It does
-- NOT delete any history, settlement, ledger, stats, or the already-'ended' round-1 game
-- row — it merely transitions the stuck ROOM out of 'playing'. No winner, no new payout.
--
-- Confirmed pre-state (2026-06-30, read-only): room YXWLK status='playing'; round-1 game
-- status='ended' (card_counts {0:0, 1:11} — seat 0 went out); both humans gone.

BEGIN;

-- Close any STILL-LIVE round for this room (none expected for YXWLK — round 1 is 'ended').
UPDATE public.tlmn_games g
SET status = 'abandoned', turn_seat = NULL, turn_deadline = NULL, turn_started_at = NULL
FROM public.tlmn_rooms r
WHERE g.room_id = r.id
  AND r.invite_code = 'YXWLK'
  AND g.status = 'playing';

-- Transition the stranded room out of 'playing'.
UPDATE public.tlmn_rooms
SET status = 'abandoned'
WHERE invite_code = 'YXWLK'
  AND status = 'playing';

-- Inspect the result before committing.
SELECT r.invite_code, r.status AS room_status,
       g.round_no, g.status AS game_status, g.card_counts
FROM public.tlmn_rooms r
LEFT JOIN public.tlmn_games g ON g.room_id = r.id
WHERE r.invite_code = 'YXWLK'
ORDER BY g.round_no DESC;

COMMIT;
