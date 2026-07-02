-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — Migration: VERSIONED ECONOMY CONFIGURATION (no coin movement)
-- ════════════════════════════════════════════════════════════════════════════════════
-- PENDING — NOT YET APPLIED. Apply AFTER the existing poker migrations
--   (poker_core → poker_private → poker_economy → poker_lifecycle → poker_engine → poker_admin_ops).
-- Rollback: migration_poker_economy_config_rollback.sql (drops ONLY the objects created here).
--
-- WHAT THIS DOES: adds a versioned, auditable home for the poker economy TUNING (blind tiers,
-- buy-in bounds, faucet parameters, ratholing thresholds, table limits, leaderboard metric).
-- It is the DB mirror of lib/games/poker/economyConfig.ts (KEEP IN SYNC). The active config is
-- what an admin has activated; activation is a service-role, AUDITED action.
--
-- WHAT THIS DELIBERATELY DOES **NOT** DO (financial-integrity guardrails):
--   • It NEVER moves coins. There is NO faucet / reward / grant RPC here. Busted-wallet recovery
--     is already provided by the SHARED wallet's public.claim_daily_coins() (migration_tlmn_run7_
--     economy.sql) — poker reuses the SAME game_wallets, so NO new production reward is enabled
--     by this migration.
--   • It NEVER rewrites a balance. Config activation/rollback only changes which tuning row is
--     active; balances are untouched.
--   • Published config versions are IMMUTABLE (a trigger blocks UPDATE/DELETE of the jsonb) so a
--     historical version can always be rolled back to exactly.
--
-- ADDITIVE + IDEMPOTENT + NON-DESTRUCTIVE. Touches no existing poker/TLMN/Caro/wallet data.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Versioned config table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.poker_economy_config (
  version        text PRIMARY KEY,                    -- 'v1','v2',… monotonic, immutable once published
  config         jsonb NOT NULL,                      -- the full PokerEconomyConfig object
  effective_from date  NOT NULL,
  is_active      boolean NOT NULL DEFAULT false,
  note           text,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- At most ONE active version at a time (a partial unique index over the constant `true`).
CREATE UNIQUE INDEX IF NOT EXISTS poker_economy_config_one_active
  ON public.poker_economy_config ((is_active)) WHERE is_active;

-- Published config bodies are immutable: block UPDATE of `config`/`version`/`effective_from`
-- and block DELETE entirely, so a version can always be rolled back to exactly. Only the
-- is_active / note columns may change (via the activate RPC below).
CREATE OR REPLACE FUNCTION public.poker_economy_config_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'poker_economy_config rows are immutable (DELETE blocked)';
  END IF;
  IF NEW.version <> OLD.version
     OR NEW.config IS DISTINCT FROM OLD.config
     OR NEW.effective_from <> OLD.effective_from
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'poker_economy_config body is immutable (only is_active/note may change)';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_poker_economy_config_guard ON public.poker_economy_config;
CREATE TRIGGER trg_poker_economy_config_guard
  BEFORE UPDATE OR DELETE ON public.poker_economy_config
  FOR EACH ROW EXECUTE FUNCTION public.poker_economy_config_guard();

-- ── 2. Immutable activation/rollback audit log ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.poker_economy_config_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email  text,
  action       text NOT NULL CHECK (action IN ('publish','activate','rollback')),
  from_version text,
  to_version   text NOT NULL,
  reason       text NOT NULL,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS poker_economy_config_audit_created_idx
  ON public.poker_economy_config_audit (created_at DESC);

CREATE OR REPLACE FUNCTION public.poker_economy_config_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'poker_economy_config_audit is append-only (% blocked)', TG_OP;
END;
$$;
DROP TRIGGER IF EXISTS trg_poker_economy_config_audit_immutable ON public.poker_economy_config_audit;
CREATE TRIGGER trg_poker_economy_config_audit_immutable
  BEFORE UPDATE OR DELETE ON public.poker_economy_config_audit
  FOR EACH ROW EXECUTE FUNCTION public.poker_economy_config_audit_immutable();

-- ── 3. RLS ────────────────────────────────────────────────────────────────────────────
-- Config tuning is NON-secret (blind tiers, buy-in bounds) → any signed-in user may READ it so
-- the client can render the sanctioned tiers. There is NO client write policy (definer RPCs
-- mutate). The audit log is opaque to clients (RLS on, no policy).
ALTER TABLE public.poker_economy_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_economy_config_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poker_economy_config_read" ON public.poker_economy_config;
CREATE POLICY "poker_economy_config_read" ON public.poker_economy_config
  FOR SELECT TO authenticated USING (true);
-- audit: RLS on, NO policies → definer-only.

-- ── 4. Read RPC: the active config (falls back to NULL when none activated yet) ────────
CREATE OR REPLACE FUNCTION public.poker_get_active_economy_config()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT config FROM public.poker_economy_config WHERE is_active LIMIT 1;
$$;

-- ── 5. Publish a NEW immutable version (service-role, audited). Does NOT activate it. ──
CREATE OR REPLACE FUNCTION public.poker_publish_economy_config(
  p_version        text,
  p_config         jsonb,
  p_effective_from date,
  p_actor          uuid,
  p_actor_email    text,
  p_reason         text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_version IS NULL OR length(trim(p_version)) = 0 THEN RAISE EXCEPTION 'version_required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF jsonb_typeof(p_config) <> 'object' THEN RAISE EXCEPTION 'config_not_object'; END IF;

  -- Idempotent publish: a repeat of the SAME version+body is a no-op; a conflicting body errors.
  INSERT INTO public.poker_economy_config (version, config, effective_from, is_active, note, created_by)
    VALUES (p_version, p_config, p_effective_from, false, p_reason, p_actor)
    ON CONFLICT (version) DO NOTHING;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.poker_economy_config
               WHERE version = p_version AND config IS DISTINCT FROM p_config) THEN
      RAISE EXCEPTION 'version_already_published_with_different_body';
    END IF;
    RETURN jsonb_build_object('ok', true, 'published', false, 'version', p_version);
  END IF;

  INSERT INTO public.poker_economy_config_audit (actor, actor_email, action, to_version, reason, detail)
    VALUES (p_actor, p_actor_email, 'publish', p_version, p_reason,
            jsonb_build_object('effective_from', p_effective_from));
  RETURN jsonb_build_object('ok', true, 'published', true, 'version', p_version);
END;
$$;

-- ── 6. Activate a published version (service-role, audited). NEVER touches balances. ──
-- Also used for ROLLBACK: activating an OLDER version is a rollback (recorded as such).
CREATE OR REPLACE FUNCTION public.poker_activate_economy_config(
  p_version     text,
  p_actor       uuid,
  p_actor_email text,
  p_reason      text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prev    text;
  v_exists  boolean;
  v_action  text;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT true INTO v_exists FROM public.poker_economy_config WHERE version = p_version;
  IF NOT v_exists THEN RAISE EXCEPTION 'unknown_version %', p_version; END IF;

  SELECT version INTO v_prev FROM public.poker_economy_config WHERE is_active;

  -- Idempotent: already active → nothing to do.
  IF v_prev = p_version THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'active', p_version);
  END IF;

  -- Rollback iff the target's created_at precedes the currently-active one.
  v_action := 'activate';
  IF v_prev IS NOT NULL THEN
    IF (SELECT created_at FROM public.poker_economy_config WHERE version = p_version)
       < (SELECT created_at FROM public.poker_economy_config WHERE version = v_prev) THEN
      v_action := 'rollback';
    END IF;
    UPDATE public.poker_economy_config SET is_active = false WHERE version = v_prev;
  END IF;

  UPDATE public.poker_economy_config SET is_active = true WHERE version = p_version;

  INSERT INTO public.poker_economy_config_audit (actor, actor_email, action, from_version, to_version, reason)
    VALUES (p_actor, p_actor_email, v_action, v_prev, p_version, p_reason);

  RETURN jsonb_build_object('ok', true, 'changed', true, 'active', p_version, 'previous', v_prev, 'action', v_action);
END;
$$;

-- ── 7. Seed v1 (mirrors lib/games/poker/economyConfig.ts POKER_ECONOMY_V1) + activate ─
-- Idempotent: only seeds if v1 is absent. If a v1 row already exists it is left untouched.
INSERT INTO public.poker_economy_config (version, config, effective_from, is_active, note)
VALUES (
  'v1',
  $json${
    "version": "v1",
    "effectiveFrom": "2026-07-02",
    "note": "Launch economy: reuses shared wallet faucets; 6 readable blind tiers; leaderboard = bb/100.",
    "faucet": {
      "startingCoins": 1000000,
      "dailyRecoveryCoins": 200000,
      "recoveryCooldownHours": 24,
      "recoveryEligibilityBalance": 10000,
      "maxLifetimeRecoveryClaims": null
    },
    "defaultMinBuyInBb": 40,
    "defaultMaxBuyInBb": 100,
    "blindTiers": [
      {"id":"micro","smallBlind":50,"bigBlind":100,"minBuyInBb":40,"maxBuyInBb":100,"recommendedWalletMin":10000,"recommendedWalletMax":100000,"volatility":"low"},
      {"id":"low","smallBlind":250,"bigBlind":500,"minBuyInBb":40,"maxBuyInBb":100,"recommendedWalletMin":100000,"recommendedWalletMax":500000,"volatility":"low"},
      {"id":"medium","smallBlind":1000,"bigBlind":2000,"minBuyInBb":40,"maxBuyInBb":100,"recommendedWalletMin":500000,"recommendedWalletMax":2000000,"volatility":"medium"},
      {"id":"high","smallBlind":5000,"bigBlind":10000,"minBuyInBb":40,"maxBuyInBb":100,"recommendedWalletMin":2000000,"recommendedWalletMax":10000000,"volatility":"medium"},
      {"id":"elite","smallBlind":25000,"bigBlind":50000,"minBuyInBb":40,"maxBuyInBb":100,"recommendedWalletMin":10000000,"recommendedWalletMax":50000000,"volatility":"high"},
      {"id":"whale","smallBlind":100000,"bigBlind":200000,"minBuyInBb":40,"maxBuyInBb":100,"recommendedWalletMin":50000000,"recommendedWalletMax":null,"volatility":"high"}
    ],
    "tableLimits": {"minSeats":2,"maxSeats":6,"maxTablesCreatedPerUser":3,"maxConcurrentSeatsPerUser":2},
    "ratholing": {"retainedStackWindowMinutes":30,"minReturnStackFactorPct":100,"rejoinWindowMinutes":10,"maxRejoinsPerWindow":3,"rapidRejoinCooldownSeconds":120,"reconnectGraceSeconds":120},
    "session": {"softReminderMinutes":90,"longSessionMinutes":180,"maxDailyRecoveryClaims":1},
    "season": {"enabled":false,"lengthDays":90,"resetScope":"leaderboard_only"},
    "leaderboardMetric": "bb_per_100"
  }$json$::jsonb,
  DATE '2026-07-02',
  true,
  'Seeded launch config (v1).'
)
ON CONFLICT (version) DO NOTHING;

-- ── 8. Grants — least privilege ───────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.poker_get_active_economy_config()                                   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poker_get_active_economy_config()                                 TO authenticated;

-- Admin-only mutating RPCs: service role ONLY (the app authorizes admins by ADMIN_EMAILS and
-- passes p_actor). The browser must never call these.
REVOKE ALL ON FUNCTION public.poker_publish_economy_config(text, jsonb, date, uuid, text, text)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poker_activate_economy_config(text, uuid, text, text)               FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poker_publish_economy_config(text, jsonb, date, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_activate_economy_config(text, uuid, text, text)             TO service_role;

NOTIFY pgrst, 'reload schema';
