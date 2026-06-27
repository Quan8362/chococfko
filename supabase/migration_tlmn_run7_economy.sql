-- TLMN — Run 7: persistent virtual-coin ("xu") economy. PLAY-MONEY ONLY.
--
-- These coins have ZERO monetary value: NOT convertible to real currency, NO
-- purchase, NO cashout, NO payment of any kind. This adds a wallet layer that READS
-- the already-authoritative ĐẾM LÁ settlement and persists coin deltas.
--
-- SECURITY MODEL (must stay true):
--   • Server-authoritative: ALL balance mutations happen in the SECURITY DEFINER
--     functions below. The browser NEVER writes balances.
--   • RLS: users may SELECT only their own wallet/ledger rows. There is NO client
--     INSERT/UPDATE/DELETE policy, so only these definer functions can mutate.
--   • Idempotent settlement: round_settlements (game_code, round_number) PK settles
--     each round EXACTLY once; reconnects/retries can't double-apply.
--   • Server time only: the daily cooldown uses now() in Postgres.
--   • Atomic + race-safe: settlement locks each wallet with SELECT ... FOR UPDATE.
--
-- Economy constants are duplicated here from lib/game/economy.ts — KEEP IN SYNC:
--   SIGNUP_GRANT=1_000_000  DAILY_GRANT=200_000  DAILY_COOLDOWN_HRS=24
--   ENTRY_MIN_BALANCE=10_000  COIN_PER_POINT=1_000  BROKE_THRESHOLD=10_000

-- ── 1. Tables ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.game_wallets (
  user_id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance             bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  last_daily_grant_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Append-only audit trail: every balance change writes one ledger row.
CREATE TABLE IF NOT EXISTS public.coin_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_code     text,
  round_number  int,
  delta         bigint NOT NULL,
  reason        text NOT NULL CHECK (reason IN ('signup_grant','daily_grant','round_settlement')),
  balance_after bigint NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coin_ledger_user_idx ON public.coin_ledger (user_id, created_at DESC);

-- The once-only settlement lock: one row per (game_code, round_number).
CREATE TABLE IF NOT EXISTS public.round_settlements (
  game_code    text NOT NULL,
  round_number int  NOT NULL,
  settled_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_code, round_number)
);

-- ── 2. updated_at trigger (reuse the TLMN touch function from migration_tlmn.sql) ──
DROP TRIGGER IF EXISTS trg_game_wallets_updated_at ON public.game_wallets;
CREATE TRIGGER trg_game_wallets_updated_at
  BEFORE UPDATE ON public.game_wallets
  FOR EACH ROW EXECUTE FUNCTION public.tlmn_touch_updated_at();

-- ── 3. RLS — SELECT own only; NO write policies (definer funcs mutate) ─────────────
ALTER TABLE public.game_wallets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_ledger      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_wallets_read_own" ON public.game_wallets;
CREATE POLICY "game_wallets_read_own" ON public.game_wallets
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "coin_ledger_read_own" ON public.coin_ledger;
CREATE POLICY "coin_ledger_read_own" ON public.coin_ledger
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- round_settlements: RLS on, NO policies at all → opaque to clients (definer only).

-- ── 4. RPCs (SECURITY DEFINER) ────────────────────────────────────────────────────

-- ensure_wallet(): create the caller's wallet on first call (balance = SIGNUP_GRANT,
-- + a 'signup_grant' ledger row). Idempotent. Returns { balance, is_new }.
CREATE OR REPLACE FUNCTION public.ensure_wallet()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_signup bigint := 1000000;  -- SIGNUP_GRANT
  v_balance bigint;
  v_new    boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT balance INTO v_balance FROM public.game_wallets WHERE user_id = v_uid;
  IF v_balance IS NULL THEN
    INSERT INTO public.game_wallets (user_id, balance)
      VALUES (v_uid, v_signup)
      ON CONFLICT (user_id) DO NOTHING;
    IF FOUND THEN
      -- We are the creator (a racing call hit the ON CONFLICT no-op instead).
      v_new := true;
      INSERT INTO public.coin_ledger (user_id, delta, reason, balance_after)
        VALUES (v_uid, v_signup, 'signup_grant', v_signup);
    END IF;
    SELECT balance INTO v_balance FROM public.game_wallets WHERE user_id = v_uid;
  END IF;

  RETURN jsonb_build_object('balance', v_balance, 'is_new', v_new);
END;
$$;

-- get_wallet(): caller's wallet snapshot + daily-claim eligibility (server-computed).
-- can_claim_daily = (balance <= BROKE_THRESHOLD) AND (never claimed OR cooldown elapsed).
CREATE OR REPLACE FUNCTION public.get_wallet()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_broke    bigint := 10000;                 -- BROKE_THRESHOLD
  v_cooldown interval := interval '24 hours'; -- DAILY_COOLDOWN_HRS
  w          public.game_wallets%ROWTYPE;
  v_can      boolean;
  v_next     timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO w FROM public.game_wallets WHERE user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'balance', 0, 'last_daily_grant_at', NULL,
      'can_claim_daily', false, 'next_claim_at', NULL);
  END IF;

  v_next := CASE WHEN w.last_daily_grant_at IS NULL THEN NULL
                 ELSE w.last_daily_grant_at + v_cooldown END;
  v_can := (w.balance <= v_broke)
           AND (w.last_daily_grant_at IS NULL OR now() - w.last_daily_grant_at >= v_cooldown);

  RETURN jsonb_build_object(
    'balance', w.balance,
    'last_daily_grant_at', w.last_daily_grant_at,
    'can_claim_daily', v_can,
    'next_claim_at', v_next);
END;
$$;

-- claim_daily_coins(): re-checks eligibility SERVER-SIDE, then grants DAILY_GRANT.
-- Rate-limited by the cooldown itself. Returns { balance, next_claim_at }.
CREATE OR REPLACE FUNCTION public.claim_daily_coins()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_grant    bigint := 200000;                -- DAILY_GRANT
  v_broke    bigint := 10000;                 -- BROKE_THRESHOLD
  v_cooldown interval := interval '24 hours'; -- DAILY_COOLDOWN_HRS
  w          public.game_wallets%ROWTYPE;
  v_new      bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO w FROM public.game_wallets WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_wallet'; END IF;
  IF w.balance > v_broke THEN RAISE EXCEPTION 'not_broke'; END IF;
  IF w.last_daily_grant_at IS NOT NULL AND now() - w.last_daily_grant_at < v_cooldown THEN
    RAISE EXCEPTION 'cooldown_active';
  END IF;

  v_new := w.balance + v_grant;
  UPDATE public.game_wallets
    SET balance = v_new, last_daily_grant_at = now()
    WHERE user_id = v_uid;
  INSERT INTO public.coin_ledger (user_id, delta, reason, balance_after)
    VALUES (v_uid, v_grant, 'daily_grant', v_new);

  RETURN jsonb_build_object('balance', v_new, 'next_claim_at', now() + v_cooldown);
END;
$$;

-- settle_round(p_game_code, p_round_number, p_results): apply the authoritative
-- per-player ĐẾM LÁ deltas as coin deltas. Called ONLY from trusted server code
-- (service role) — REVOKEd from anon/authenticated below. p_results is a jsonb array
-- of { "user_id": uuid, "delta": int } where delta is the CARD-POINT delta for a real
-- (authenticated, non-bot) player. coin_delta = delta × COIN_PER_POINT, clamped so a
-- loser pays at most their current balance (the actually-applied delta is recorded).
-- Idempotent via the round_settlements lock. Returns { settled, applied:[{user_id,delta,balance}] }.
CREATE OR REPLACE FUNCTION public.settle_round(
  p_game_code    text,
  p_round_number int,
  p_results      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_per_point bigint := 1000;  -- COIN_PER_POINT
  rec         record;
  v_bal       bigint;
  v_coin      bigint;
  v_applied   bigint;
  v_out       jsonb := '[]'::jsonb;
BEGIN
  -- Once-only lock: if the row already exists this round was already settled.
  INSERT INTO public.round_settlements (game_code, round_number)
    VALUES (p_game_code, p_round_number)
    ON CONFLICT (game_code, round_number) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('settled', false, 'applied', '[]'::jsonb);
  END IF;

  -- Deterministic lock order (by user_id) to avoid deadlocks between settlements.
  FOR rec IN
    SELECT (e->>'user_id')::uuid AS uid, (e->>'delta')::bigint AS card_delta
    FROM jsonb_array_elements(p_results) e
    ORDER BY (e->>'user_id')
  LOOP
    SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = rec.uid FOR UPDATE;
    IF NOT FOUND THEN
      -- Real players are gated through ensure_wallet at entry; if somehow absent, skip.
      CONTINUE;
    END IF;

    v_coin := rec.card_delta * v_per_point;
    IF v_coin < 0 THEN
      v_applied := -LEAST(v_bal, -v_coin);  -- clamp loss to current balance
    ELSE
      v_applied := v_coin;
    END IF;

    v_bal := v_bal + v_applied;
    UPDATE public.game_wallets SET balance = v_bal WHERE user_id = rec.uid;
    INSERT INTO public.coin_ledger (user_id, game_code, round_number, delta, reason, balance_after)
      VALUES (rec.uid, p_game_code, p_round_number, v_applied, 'round_settlement', v_bal);

    v_out := v_out || jsonb_build_object('user_id', rec.uid, 'delta', v_applied, 'balance', v_bal);
  END LOOP;

  RETURN jsonb_build_object('settled', true, 'applied', v_out);
END;
$$;

-- ── 5. Grants — least privilege ───────────────────────────────────────────────────
-- Player-facing RPCs: callable by signed-in users (operate on auth.uid()).
REVOKE ALL ON FUNCTION public.ensure_wallet()       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_wallet()          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_daily_coins()   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_wallet()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wallet()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_coins() TO authenticated;

-- settle_round: trusted server path ONLY. The browser must never call it.
REVOKE ALL ON FUNCTION public.settle_round(text, int, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_round(text, int, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
