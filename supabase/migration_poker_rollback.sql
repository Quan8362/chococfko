-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — CORRECTIVE ROLLBACK (only if the poker persistence layer must be removed)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Drops ONLY poker_* objects. Touches NO TLMN/Caro/wallet data. The coin_ledger reason CHECK
-- is restored to its pre-poker superset (so existing rows still validate). Safe to run only
-- when no poker hands are in flight. NOT part of the normal apply path — corrective use only.
-- ════════════════════════════════════════════════════════════════════════════════════

-- 1. Remove poker tables from the realtime publication (ignore if absent).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['poker_tables','poker_seats','poker_hands','poker_actions'] LOOP
    IF EXISTS (SELECT 1 FROM pg_publication_tables
               WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- 2. Drop RPCs.
-- Engine (migration_poker_engine.sql) RPCs first.
DROP FUNCTION IF EXISTS public.poker_start_hand(uuid, int, int, int, timestamptz, bigint, bigint, bigint, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.poker_commit_action(uuid, int, text, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.poker_pause_hand(uuid, text);
-- Lifecycle (migration_poker_lifecycle.sql) RPCs.
DROP FUNCTION IF EXISTS public.poker_reap_idle_table(uuid, int);
DROP FUNCTION IF EXISTS public.poker_resolve_closing(uuid);
DROP FUNCTION IF EXISTS public.poker_close_table(uuid);
DROP FUNCTION IF EXISTS public.poker_clean_expired_reservations(uuid);
DROP FUNCTION IF EXISTS public.poker_set_seat_connection(uuid, int, boolean);
DROP FUNCTION IF EXISTS public.poker_set_post_bb_policy(uuid, int, text);
DROP FUNCTION IF EXISTS public.poker_return_from_sit_out(uuid, int);
DROP FUNCTION IF EXISTS public.poker_sit_out(uuid, int);
DROP FUNCTION IF EXISTS public.poker_seat_in_live_hand(uuid, int);
DROP FUNCTION IF EXISTS public.poker_top_up(uuid, int, bigint, text);
-- Core/economy RPCs.
DROP FUNCTION IF EXISTS public.poker_settle_hand(uuid, jsonb, jsonb, bigint);
DROP FUNCTION IF EXISTS public.poker_refund_hand(uuid);
DROP FUNCTION IF EXISTS public.poker_finalize_hand_seats(uuid);
DROP FUNCTION IF EXISTS public.poker_stand_up(uuid, int);
DROP FUNCTION IF EXISTS public.poker_rebuy(uuid, int, bigint);
DROP FUNCTION IF EXISTS public.poker_top_up(uuid, int, bigint);
DROP FUNCTION IF EXISTS public.poker_sit_down(uuid, int, bigint);
DROP FUNCTION IF EXISTS public.poker_reserve_seat(uuid, int);

-- 3. Drop tables (CASCADE clears FKs/indexes/policies/triggers). Order respects dependencies.
DROP TABLE IF EXISTS public.poker_topup_requests   CASCADE;
DROP TABLE IF EXISTS public.poker_hand_state        CASCADE;
DROP TABLE IF EXISTS public.poker_incidents        CASCADE;
DROP TABLE IF EXISTS public.poker_hand_settlements CASCADE;
DROP TABLE IF EXISTS public.poker_deck             CASCADE;
DROP TABLE IF EXISTS public.poker_hole_cards       CASCADE;
DROP TABLE IF EXISTS public.poker_actions          CASCADE;
DROP TABLE IF EXISTS public.poker_hands            CASCADE;
DROP TABLE IF EXISTS public.poker_seats            CASCADE;
DROP TABLE IF EXISTS public.poker_table_members    CASCADE;
DROP TABLE IF EXISTS public.poker_table_secrets    CASCADE;
DROP TABLE IF EXISTS public.poker_tables           CASCADE;

-- 4. Restore the coin_ledger reason CHECK to its pre-poker superset.
ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_reason_check;
ALTER TABLE public.coin_ledger ADD CONSTRAINT coin_ledger_reason_check
  CHECK (reason IN ('signup_grant','daily_grant','round_settlement','voluntary_exit','interaction_spend'));

NOTIFY pgrst, 'reload schema';
