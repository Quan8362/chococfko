-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — TOURNAMENT FOUNDATION — ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════════════
-- Drops ONLY the objects migration_poker_tournament.sql added. Non-destructive to every existing
-- cash-table / TLMN / Caro / wallet object.
--
-- NOTE ON coin_ledger reason CHECK: the forward migration WIDENED the reason CHECK to a superset
-- (added the three tournament reasons). We intentionally DO NOT narrow it back here — narrowing a
-- shared CHECK risks rejecting reasons other migrations legitimately write (the lesson of
-- migration_coin_ledger_reason_fix.sql). The extra allowed reasons are harmless once no rows use
-- them. If a full teardown is required, re-run the canonical superset from the latest economy
-- migration explicitly.
-- ════════════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.poker_tournament_settle(uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.poker_tournament_admin_transition(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.poker_tournament_unregister(uuid, text);
DROP FUNCTION IF EXISTS public.poker_tournament_register(uuid, text);
DROP FUNCTION IF EXISTS public.poker_tournament_prize_pool(uuid);
DROP FUNCTION IF EXISTS public.poker_tournament_can_transition(text, text);

DROP TABLE IF EXISTS public.poker_tournament_audit;
DROP TABLE IF EXISTS public.poker_tournament_txn;
DROP TABLE IF EXISTS public.poker_tournament_payouts;
DROP TABLE IF EXISTS public.poker_tournament_moves;
DROP TABLE IF EXISTS public.poker_tournament_entries;
DROP TABLE IF EXISTS public.poker_tournaments;
