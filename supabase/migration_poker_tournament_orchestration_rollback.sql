-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — TOURNAMENT ORCHESTRATION — ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════════════
-- Drops ONLY the objects migration_poker_tournament_orchestration.sql added. Non-destructive to the
-- base tournament objects, cash tables, TLMN/Caro, wallets, and ledger. The two added columns on
-- poker_tournaments are dropped too (they are orchestration-only).
-- ════════════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.poker_tournament_advance_level(uuid, int);
DROP FUNCTION IF EXISTS public.poker_tournament_move_seat(uuid, uuid, int, int, text);
DROP FUNCTION IF EXISTS public.poker_tournament_eliminate(uuid);
DROP FUNCTION IF EXISTS public.poker_tournament_apply_hand_result(uuid, uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.poker_tournament_start_hand(uuid, int, int, bigint, bigint, bigint, text);
DROP FUNCTION IF EXISTS public.poker_tournament_seat_draw(uuid);

DROP TABLE IF EXISTS public.poker_tournament_hands;
DROP TABLE IF EXISTS public.poker_tournament_seats;

ALTER TABLE public.poker_tournaments DROP COLUMN IF EXISTS level_started_at;
ALTER TABLE public.poker_tournaments DROP COLUMN IF EXISTS current_level_index;
