-- ── Fix: coin_ledger reason CHECK must allow EVERY reason the app writes ────────────────
-- Root cause of "Gửi không thành công" when throwing a PAID tomato/bomb:
--   • migration_tlmn_interactions_phase3.sql set the CHECK to include 'interaction_spend'.
--   • migration_tlmn_voluntary_exit.sql later RE-created the CHECK with
--     ('signup_grant','daily_grant','round_settlement','voluntary_exit') and so DROPPED
--     'interaction_spend'.
-- Result: spend_interaction()'s ledger INSERT (reason='interaction_spend') violates the
-- constraint and the RPC raises → spendInteraction() returns 'spend_failed' → the client
-- shows react_send_failed. Free daily allowances (tomato 3/day, bomb 1/day) skip the ledger
-- so they succeed; once exhausted, every paid throw fails — matching the reported symptom.
--
-- This migration makes the CHECK the SINGLE superset of all reasons the codebase writes, so
-- no future single-purpose migration can silently drop another reason again.
-- Idempotent + safe to re-apply.

ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_reason_check;
ALTER TABLE public.coin_ledger ADD CONSTRAINT coin_ledger_reason_check
  CHECK (reason IN (
    'signup_grant',
    'daily_grant',
    'round_settlement',
    'voluntary_exit',
    'interaction_spend'
  ));
