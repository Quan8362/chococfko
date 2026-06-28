-- TLMN interaction system — Phase 3: coin costs + daily free allowance + server-side
-- validation + usage history + admin-configurable catalog. PLAY-MONEY ONLY (extends the
-- Run-7 "xu" wallet; no real currency). Apply AFTER migration_tlmn_run7_economy.sql.
--
-- SECURITY MODEL (must stay true):
--   • Server-authoritative spend: the ONLY way coins leave a wallet for an interaction is
--     spend_interaction() (SECURITY DEFINER, uses auth.uid()). The browser never writes.
--   • Atomic + race-safe: the wallet is locked SELECT … FOR UPDATE inside the function.
--   • No negative balance: game_wallets.balance has CHECK (balance >= 0) AND the function
--     raises 'insufficient_coins' before deducting.
--   • Idempotent: game_interaction_usage.event_id is UNIQUE — a retried spend with the same
--     client event id returns the prior result and never double-charges.
--   • Daily free allowance: per (user, key) calendar-day count of free uses < free_daily_limit.
--   • Catalog is admin-configurable WITHOUT a deploy (cost / free limit / cooldown / enabled
--     / sort_order), edited by the service role via /admin server actions.

-- ── 1. Allow a new ledger reason for interaction spends ────────────────────────────────
ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_reason_check;
ALTER TABLE public.coin_ledger ADD CONSTRAINT coin_ledger_reason_check
  CHECK (reason IN ('signup_grant','daily_grant','round_settlement','interaction_spend'));

-- ── 2. Catalog (admin-configurable economy/enable metadata) ────────────────────────────
-- Visual attributes (emoji, impact, sound) stay in code (lib/games/tlmn/interactions.ts);
-- only the configurable economy/enable fields live here. A key absent from this table is
-- treated by the client as enabled + free (so newly-added code items work before seeding).
CREATE TABLE IF NOT EXISTS public.game_interaction_catalog (
  key              text PRIMARY KEY,
  kind             text NOT NULL CHECK (kind IN ('phrase','throwable')),
  category         text,
  coin_cost        bigint NOT NULL DEFAULT 0 CHECK (coin_cost >= 0),
  free_daily_limit int    NOT NULL DEFAULT 0 CHECK (free_daily_limit >= 0),
  cooldown_ms      int    NOT NULL DEFAULT 0 CHECK (cooldown_ms >= 0),
  is_enabled       boolean NOT NULL DEFAULT true,
  sort_order       int    NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_game_interaction_catalog_updated_at ON public.game_interaction_catalog;
CREATE TRIGGER trg_game_interaction_catalog_updated_at
  BEFORE UPDATE ON public.game_interaction_catalog
  FOR EACH ROW EXECUTE FUNCTION public.tlmn_touch_updated_at();

-- ── 3. Usage history (append-only; powers daily-free counting + analytics) ─────────────
CREATE TABLE IF NOT EXISTS public.game_interaction_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        text NOT NULL UNIQUE,           -- client InteractionEvent.id (idempotency)
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id         uuid,
  interaction_key text NOT NULL,
  coin_cost       bigint NOT NULL DEFAULT 0,
  was_free        boolean NOT NULL DEFAULT false,
  target_user_id  uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS giu_user_key_day_idx
  ON public.game_interaction_usage (user_id, interaction_key, created_at DESC);

-- ── 4. RLS ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.game_interaction_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_interaction_usage   ENABLE ROW LEVEL SECURITY;

-- Catalog config is non-sensitive: readable by everyone (the client filters is_enabled).
-- Writes happen ONLY via the service role (admin actions bypass RLS) — no client write policy.
DROP POLICY IF EXISTS "gic_read_all" ON public.game_interaction_catalog;
CREATE POLICY "gic_read_all" ON public.game_interaction_catalog
  FOR SELECT TO anon, authenticated USING (true);

-- Usage: a user may read only their own rows. No client write policy (definer func inserts).
DROP POLICY IF EXISTS "giu_read_own" ON public.game_interaction_usage;
CREATE POLICY "giu_read_own" ON public.game_interaction_usage
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── 5. spend_interaction RPC (SECURITY DEFINER) ────────────────────────────────────────
-- Decides free vs paid, deducts atomically when paid, records usage. Idempotent by event_id.
-- Returns { ok, was_free, cost, balance, remaining_free }. Raises 'insufficient_coins' /
-- 'item_disabled' / 'not_authenticated'.
CREATE OR REPLACE FUNCTION public.spend_interaction(
  p_event_id text,
  p_room_id  uuid,
  p_key      text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  c         public.game_interaction_catalog%ROWTYPE;
  v_cost    bigint := 0;
  v_limit   int := 0;
  v_used    int := 0;
  v_free    boolean := false;
  v_bal     bigint;
  v_prev    public.game_interaction_usage%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Idempotency: a retried spend with the same event id returns the prior outcome.
  SELECT * INTO v_prev FROM public.game_interaction_usage WHERE event_id = p_event_id;
  IF FOUND THEN
    SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = v_uid;
    RETURN jsonb_build_object('ok', true, 'was_free', v_prev.was_free,
      'cost', v_prev.coin_cost, 'balance', COALESCE(v_bal, 0), 'remaining_free', NULL);
  END IF;

  -- Catalog lookup. Absent key ⇒ free + enabled (newly-added code item, not yet seeded).
  SELECT * INTO c FROM public.game_interaction_catalog WHERE key = p_key;
  IF FOUND THEN
    IF NOT c.is_enabled THEN RAISE EXCEPTION 'item_disabled'; END IF;
    v_cost  := c.coin_cost;
    v_limit := c.free_daily_limit;
  END IF;

  -- Daily free allowance: free uses of this key by this user since the start of today.
  IF v_limit > 0 THEN
    SELECT count(*) INTO v_used
    FROM public.game_interaction_usage
    WHERE user_id = v_uid AND interaction_key = p_key AND was_free = true
      AND created_at >= date_trunc('day', now());
    IF v_used < v_limit THEN v_free := true; END IF;
  END IF;

  -- An item priced 0 is always free regardless of the daily limit.
  IF v_cost = 0 THEN v_free := true; END IF;

  IF v_free THEN
    INSERT INTO public.game_interaction_usage (event_id, user_id, room_id, interaction_key, coin_cost, was_free)
      VALUES (p_event_id, v_uid, p_room_id, p_key, 0, true)
      ON CONFLICT (event_id) DO NOTHING;
    SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = v_uid;
    RETURN jsonb_build_object('ok', true, 'was_free', true, 'cost', 0,
      'balance', COALESCE(v_bal, 0),
      'remaining_free', CASE WHEN v_limit > 0 THEN GREATEST(0, v_limit - v_used - 1) ELSE NULL END);
  END IF;

  -- Paid: lock the wallet, verify funds, deduct, ledger + usage — all atomic.
  SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND OR v_bal < v_cost THEN RAISE EXCEPTION 'insufficient_coins'; END IF;

  v_bal := v_bal - v_cost;
  UPDATE public.game_wallets SET balance = v_bal WHERE user_id = v_uid;
  INSERT INTO public.coin_ledger (user_id, game_code, delta, reason, balance_after)
    VALUES (v_uid, 'tlmn', -v_cost, 'interaction_spend', v_bal);
  INSERT INTO public.game_interaction_usage (event_id, user_id, room_id, interaction_key, coin_cost, was_free)
    VALUES (p_event_id, v_uid, p_room_id, p_key, v_cost, false)
    ON CONFLICT (event_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'was_free', false, 'cost', v_cost,
    'balance', v_bal, 'remaining_free', NULL);
END;
$$;

-- ── 6. Grants ──────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.spend_interaction(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spend_interaction(text, uuid, text) TO authenticated;

-- ── 7. Seed the throwable catalog (sensible starting economy; admin-editable) ──────────
-- Phrases are intentionally NOT seeded ⇒ they default to free. Costs are play-money "xu".
INSERT INTO public.game_interaction_catalog (key, kind, category, coin_cost, free_daily_limit, sort_order) VALUES
  ('flower',    'throwable', 'gift',   0,    0, 10),
  ('heart',     'throwable', 'gift',   0,    0, 20),
  ('applause',  'throwable', 'gift',   0,    0, 30),
  ('confetti',  'throwable', 'premium',1000, 0, 40),
  ('laugh',     'throwable', 'emote',  0,    0, 50),
  ('tomato',    'throwable', 'prank',  200,  3, 60),
  ('egg',       'throwable', 'prank',  300,  1, 70),
  ('bomb',      'throwable', 'prank',  500,  1, 80),
  ('lightning', 'throwable', 'premium',400,  0, 90),
  ('angry',     'throwable', 'emote',  200,  0, 100)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
