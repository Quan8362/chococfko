-- ============================================================================
-- ROLLBACK — Poker Tournament distributed rate limiting
--
-- Reverses migration_poker_tournament_rate_limits.sql. Drops only the limiter
-- objects; touches NO tournament/wallet/ledger/payout/entry/seat/hand data.
-- NEVER run during a healthy release — only to fully remove the feature.
-- ============================================================================

drop function if exists public.poker_tournament_rate_limit_hit(text, double precision, double precision);
drop function if exists public.poker_tournament_rate_limit_cleanup(integer);
drop table if exists public.poker_tournament_rate_limits;

notify pgrst, 'reload schema';
