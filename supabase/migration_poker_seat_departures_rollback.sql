-- ════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for migration_poker_seat_departures.sql
-- ════════════════════════════════════════════════════════════════════════════════════
-- Drops ONLY the objects that migration created. Non-destructive to any other poker/TLMN/
-- wallet data (this table never stored coins or balances).
-- ════════════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_poker_seat_events_immutable ON public.poker_seat_events;
DROP FUNCTION IF EXISTS public.poker_seat_events_immutable();
DROP TABLE IF EXISTS public.poker_seat_events;

NOTIFY pgrst, 'reload schema';
