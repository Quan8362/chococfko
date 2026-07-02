-- ════════════════════════════════════════════════════════════════════════════════════
-- HARNESS — validate migration_poker_economy_config.sql on an ISOLATED NON-PROD database
-- ════════════════════════════════════════════════════════════════════════════════════
-- ⚠️ DO NOT RUN AGAINST PRODUCTION. Intended for a throwaway Supabase dev branch or a local
-- Supabase/Postgres where the poker migrations (core→private→economy→lifecycle→engine→
-- admin_ops) + migration_poker_economy_config.sql have been applied.
--
-- Run order on the isolated env:
--   1) apply the poker migrations + migration_poker_economy_config.sql
--   2) \i poker_economy_config_tests.sql      (this file — all assertions must pass)
--   3) (optional) apply migration_poker_economy_config_rollback.sql and confirm clean drop
--
-- Every assertion RAISES on failure, so a clean run == PASS. Wrapped so it leaves no residue
-- beyond the rows it self-cleans (it publishes/activates test versions then restores v1).
-- ════════════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_cnt      int;
  v_active   text;
  v_raised   boolean;
  v_wallets0 bigint; v_wallets1 bigint;
  v_ledger0  bigint; v_ledger1  bigint;
  v_settle0  bigint; v_settle1  bigint;
BEGIN
  -- ── Baseline financial-table snapshot (must be UNCHANGED at the end) ─────────────────
  SELECT count(*) INTO v_wallets0 FROM public.game_wallets;
  SELECT count(*) INTO v_ledger0  FROM public.coin_ledger;
  SELECT count(*) INTO v_settle0  FROM public.poker_hand_settlements;

  -- ── 1. Seed applied: exactly one v1 row, and it is active ───────────────────────────
  SELECT count(*) INTO v_cnt FROM public.poker_economy_config;
  IF v_cnt < 1 THEN RAISE EXCEPTION 'FAIL: no seeded config row'; END IF;
  SELECT count(*) INTO v_cnt FROM public.poker_economy_config WHERE is_active;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'FAIL: expected exactly one active config, got %', v_cnt; END IF;
  SELECT version INTO v_active FROM public.poker_economy_config WHERE is_active;
  IF v_active <> 'v1' THEN RAISE EXCEPTION 'FAIL: active should be v1, got %', v_active; END IF;

  -- ── 2. Read RPC returns the active config as an object with the right version ────────
  IF (public.poker_get_active_economy_config() ->> 'version') <> 'v1' THEN
    RAISE EXCEPTION 'FAIL: get_active_economy_config did not return v1';
  END IF;

  -- ── 3. Append-only audit: UPDATE and DELETE must both be blocked ────────────────────
  -- (seed a row first via publish so there is something to attempt against)
  PERFORM public.poker_publish_economy_config(
    'vtest', (SELECT config FROM public.poker_economy_config WHERE version='v1'),
    DATE '2026-09-01', NULL, 'harness@test', 'harness publish');

  v_raised := false;
  BEGIN
    UPDATE public.poker_economy_config_audit SET reason = 'tamper' WHERE true;
  EXCEPTION WHEN OTHERS THEN v_raised := true; END;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL: audit UPDATE was not blocked'; END IF;

  v_raised := false;
  BEGIN
    DELETE FROM public.poker_economy_config_audit WHERE true;
  EXCEPTION WHEN OTHERS THEN v_raised := true; END;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL: audit DELETE was not blocked'; END IF;

  -- ── 4. Published config body is immutable (only is_active/note may change) ───────────
  v_raised := false;
  BEGIN
    UPDATE public.poker_economy_config SET config = '{}'::jsonb WHERE version = 'v1';
  EXCEPTION WHEN OTHERS THEN v_raised := true; END;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL: config body UPDATE was not blocked'; END IF;

  v_raised := false;
  BEGIN
    DELETE FROM public.poker_economy_config WHERE version = 'v1';
  EXCEPTION WHEN OTHERS THEN v_raised := true; END;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL: config DELETE was not blocked'; END IF;

  -- ── 5. Grants: authenticated may READ the active config; may NOT publish/activate ────
  IF NOT has_function_privilege('authenticated', 'public.poker_get_active_economy_config()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: authenticated cannot execute get_active_economy_config';
  END IF;
  IF has_function_privilege('authenticated',
      'public.poker_publish_economy_config(text, jsonb, date, uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: authenticated CAN execute publish (should be service-role only)';
  END IF;
  IF has_function_privilege('anon',
      'public.poker_activate_economy_config(text, uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon CAN execute activate (should be service-role only)';
  END IF;
  IF NOT has_function_privilege('service_role',
      'public.poker_activate_economy_config(text, uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: service_role cannot execute activate';
  END IF;

  -- ── 6. Rollback restores the previous active version ────────────────────────────────
  -- Activate vtest, then activate v1 again → must be recorded as a 'rollback' and v1 active.
  PERFORM public.poker_activate_economy_config('vtest', NULL, 'harness@test', 'activate vtest');
  SELECT version INTO v_active FROM public.poker_economy_config WHERE is_active;
  IF v_active <> 'vtest' THEN RAISE EXCEPTION 'FAIL: vtest did not become active'; END IF;
  SELECT count(*) INTO v_cnt FROM public.poker_economy_config WHERE is_active;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'FAIL: more than one active after activate'; END IF;

  PERFORM public.poker_activate_economy_config('v1', NULL, 'harness@test', 'rollback to v1');
  SELECT version INTO v_active FROM public.poker_economy_config WHERE is_active;
  IF v_active <> 'v1' THEN RAISE EXCEPTION 'FAIL: rollback did not restore v1'; END IF;
  SELECT count(*) INTO v_cnt FROM public.poker_economy_config_audit
    WHERE action = 'rollback' AND to_version = 'v1';
  IF v_cnt < 1 THEN RAISE EXCEPTION 'FAIL: rollback was not audited as a rollback'; END IF;

  -- ── 7. Idempotent activate: re-activating the active version is a no-op ──────────────
  PERFORM public.poker_activate_economy_config('v1', NULL, 'harness@test', 'noop');
  SELECT count(*) INTO v_cnt FROM public.poker_economy_config WHERE is_active;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'FAIL: idempotent activate broke single-active invariant'; END IF;

  -- ── 8. Publish is idempotent for the SAME body; conflicting body errors ──────────────
  PERFORM public.poker_publish_economy_config(
    'vtest', (SELECT config FROM public.poker_economy_config WHERE version='v1'),
    DATE '2026-09-01', NULL, 'harness@test', 'harness re-publish (same body)');
  v_raised := false;
  BEGIN
    PERFORM public.poker_publish_economy_config(
      'vtest', '{"version":"vtest","changed":true}'::jsonb,
      DATE '2026-09-01', NULL, 'harness@test', 'conflicting body');
  EXCEPTION WHEN OTHERS THEN v_raised := true; END;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL: conflicting re-publish was not rejected'; END IF;

  -- ── 9. NO wallet / ledger / settlement row was created or removed ────────────────────
  SELECT count(*) INTO v_wallets1 FROM public.game_wallets;
  SELECT count(*) INTO v_ledger1  FROM public.coin_ledger;
  SELECT count(*) INTO v_settle1  FROM public.poker_hand_settlements;
  IF v_wallets1 <> v_wallets0 THEN RAISE EXCEPTION 'FAIL: game_wallets row count changed'; END IF;
  IF v_ledger1  <> v_ledger0  THEN RAISE EXCEPTION 'FAIL: coin_ledger row count changed'; END IF;
  IF v_settle1  <> v_settle0  THEN RAISE EXCEPTION 'FAIL: poker_hand_settlements row count changed'; END IF;

  RAISE NOTICE 'poker_economy_config harness: ALL ASSERTIONS PASSED';
END $$;

-- ── Self-clean the test version (bypass the immutability trigger by disabling it locally) ──
-- The trigger blocks DELETE for tamper-evidence; on the throwaway env we drop the harness row
-- so the environment can be reused. (Runs as the migration owner / superuser on a dev branch.)
ALTER TABLE public.poker_economy_config DISABLE TRIGGER trg_poker_economy_config_guard;
DELETE FROM public.poker_economy_config WHERE version = 'vtest';
ALTER TABLE public.poker_economy_config ENABLE TRIGGER trg_poker_economy_config_guard;
