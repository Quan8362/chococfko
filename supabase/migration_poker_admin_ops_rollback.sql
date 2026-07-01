-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — ADMIN/OPS ROLLBACK (only if the admin-ops layer must be removed)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Drops ONLY the objects created by migration_poker_admin_ops.sql. Leaves the core poker
-- engine + economy + lifecycle intact. The additive poker_tables columns (paused,
-- paused_reason, last_activity_at) are dropped last. Corrective use only.
-- ════════════════════════════════════════════════════════════════════════════════════

-- RPCs
DROP FUNCTION IF EXISTS public.poker_record_ops_event(text, text, uuid, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.poker_admin_reveal_hole_cards(uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.poker_admin_transition_incident(uuid, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.poker_admin_add_incident_note(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.poker_admin_open_incident(uuid, text, text, text, text, uuid, uuid, uuid[], jsonb);
DROP FUNCTION IF EXISTS public.poker_admin_lift_restriction(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.poker_admin_restrict_player(uuid, uuid, text, text, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.poker_admin_refund_hand(uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.poker_admin_freeze_hand(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.poker_admin_force_sit_out(uuid, uuid, int, text);
DROP FUNCTION IF EXISTS public.poker_admin_close_table(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.poker_admin_mark_closing(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.poker_admin_resume_table(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.poker_admin_pause_table(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.poker_audit_write(uuid, text, text, uuid, uuid, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.poker_is_restricted(uuid, text);

-- Tables (CASCADE clears the audit→case FK + indexes/triggers)
DROP TABLE IF EXISTS public.poker_ops_events          CASCADE;
DROP TABLE IF EXISTS public.poker_player_restrictions CASCADE;
DROP TABLE IF EXISTS public.poker_admin_audit         CASCADE;  -- drop before cases (FK)
DROP TABLE IF EXISTS public.poker_incident_cases      CASCADE;

DROP FUNCTION IF EXISTS public.poker_audit_immutable();

-- Additive columns last (only if removing the layer entirely).
ALTER TABLE public.poker_tables
  DROP COLUMN IF EXISTS paused,
  DROP COLUMN IF EXISTS paused_reason,
  DROP COLUMN IF EXISTS last_activity_at;

NOTIFY pgrst, 'reload schema';
