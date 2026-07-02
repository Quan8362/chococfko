-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — INTEGRITY / ANTI-COLLUSION ROLLBACK (only if the review foundation must be removed)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Drops ONLY the objects created by migration_poker_integrity.sql. Leaves the poker engine +
-- economy + lifecycle + admin-ops layers intact (this migration only ADDED risk_* objects and
-- reused poker_admin_audit / poker_audit_write, which are NOT dropped here). Corrective use only.
-- ════════════════════════════════════════════════════════════════════════════════════

-- RPCs
DROP FUNCTION IF EXISTS public.poker_risk_record_action(uuid, uuid, text, text, text, uuid, timestamptz);
DROP FUNCTION IF EXISTS public.poker_risk_add_note(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.poker_risk_transition_case(uuid, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.poker_risk_upsert_case(text, int, text, text, numeric, text, uuid[], uuid[], uuid[], bigint, timestamptz, timestamptz, jsonb, jsonb);

-- Tables (CASCADE clears indexes/triggers + child FKs)
DROP TABLE IF EXISTS public.poker_risk_case_events CASCADE;  -- drop children before parent
DROP TABLE IF EXISTS public.poker_risk_signals     CASCADE;
DROP TABLE IF EXISTS public.poker_risk_cases       CASCADE;

DROP FUNCTION IF EXISTS public.poker_risk_events_immutable();

NOTIFY pgrst, 'reload schema';
