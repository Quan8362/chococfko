-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — ACHIEVEMENTS & MISSIONS ROLLBACK (only if the social layer must be removed)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Drops ONLY the objects created by migration_poker_achievements.sql. Leaves the core poker
-- engine + economy + lifecycle + social (reports/blocks) intact. No coins were ever moved by
-- this layer, so there is nothing economic to reconcile. Corrective use only.
-- ════════════════════════════════════════════════════════════════════════════════════

-- RPCs
DROP FUNCTION IF EXISTS public.poker_bump_mission(uuid, text, integer, integer);
DROP FUNCTION IF EXISTS public.poker_record_hand_progress(uuid, jsonb);
DROP FUNCTION IF EXISTS public.poker_apply_mission(uuid, text, integer, integer);

-- Tables
DROP TABLE IF EXISTS public.poker_reconnect_events       CASCADE;
DROP TABLE IF EXISTS public.poker_hand_progress_records  CASCADE;
DROP TABLE IF EXISTS public.poker_player_progress        CASCADE;
DROP TABLE IF EXISTS public.poker_missions               CASCADE;
DROP TABLE IF EXISTS public.poker_achievements           CASCADE;

NOTIFY pgrst, 'reload schema';
