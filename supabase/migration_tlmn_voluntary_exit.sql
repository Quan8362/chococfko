-- TLMN — Voluntary-exit forfeit. PLAY-MONEY ONLY.
--
-- When a REAL player CONFIRMS leaving an ACTIVE round (not a refresh / disconnect /
-- backgrounding / result screen / lobby), they are treated as a loser holding every card
-- still in their hand and charged the SAME official đếm-lá penalty a round-end loss uses
-- (lib/games/tlmn/engine.ts → loserHandPayment, reused so a quit and a normal loss never
-- diverge). The penalty is computed in TRUSTED server code (the service-role server action
-- in app/games/tlmn/actions.ts, which loads the authoritative hidden hand from tlmn_hands)
-- and applied here atomically. The browser NEVER provides the hand, the penalty, or the
-- balance, and can NEVER call this function (service_role only).
--
-- ECONOMY MODEL (decided with the product owner): the forfeit is a COIN SINK — the
-- quitter's coins leave the economy; the round's remaining live players still settle their
-- own zero-sum đếm-lá among themselves at round-end (the forfeited seat is EXCLUDED from
-- settle_round so it is never charged twice — see settleRoundCoins in actions.ts). The
-- existing Phase-5 bot-takeover still plays the abandoned hand out so the round never
-- breaks; that seat's bot result is ignored for coins/stats.
--
-- SECURITY MODEL (must stay true, mirrors migration_tlmn_run7_economy.sql):
--   • Server-authoritative: balance + forfeit mutations happen ONLY in this SECURITY
--     DEFINER function. The browser never writes balances and this RPC is REVOKEd from
--     anon/authenticated (service_role only), exactly like settle_round.
--   • Idempotent: tlmn_forfeits (room_id, round_no, user_id) PK forfeits each player ONCE
--     per round; a double-tap / retry / reconnect returns the existing result, never a
--     second deduction.
--   • Atomic + race-safe: the wallet row is locked with SELECT ... FOR UPDATE; the forfeit
--     record, ledger row and deduction commit together.
--   • Balance floor: a loss is clamped to the current balance (no debt), matching settle_round.
--   • No hand leakage: tlmn_forfeits stores only COUNTS (cards_left + an itemized count
--     breakdown), never card identities; RLS lets a user read only their OWN forfeit rows.

-- ── 1. Forfeit record — once-only lock + self-readable history ───────────────────────
CREATE TABLE IF NOT EXISTS public.tlmn_forfeits (
  room_id        uuid NOT NULL REFERENCES public.tlmn_rooms(id) ON DELETE CASCADE,
  round_no       int  NOT NULL,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seat_index     int  NOT NULL,
  cards_left     int  NOT NULL DEFAULT 0,
  penalty_points int  NOT NULL DEFAULT 0,   -- card-point penalty BEFORE the coin scale
  coin_penalty   bigint NOT NULL DEFAULT 0, -- coins ACTUALLY deducted (clamped to balance)
  breakdown      jsonb,                     -- itemized COUNTS only (no card identities)
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, round_no, user_id)
);

CREATE INDEX IF NOT EXISTS tlmn_forfeits_user_idx ON public.tlmn_forfeits (user_id, created_at DESC);

ALTER TABLE public.tlmn_forfeits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tlmn_forfeits_read_own" ON public.tlmn_forfeits;
CREATE POLICY "tlmn_forfeits_read_own" ON public.tlmn_forfeits
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- No INSERT/UPDATE/DELETE policy → only the SECURITY DEFINER RPC can mutate.

-- ── 2. Allow the new ledger reason ──────────────────────────────────────────────────
-- coin_ledger.reason was CHECK (reason IN ('signup_grant','daily_grant','round_settlement')).
-- Add 'voluntary_exit' so the forfeit deduction is auditable in the same ledger.
ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_reason_check;
ALTER TABLE public.coin_ledger ADD CONSTRAINT coin_ledger_reason_check
  CHECK (reason IN ('signup_grant','daily_grant','round_settlement','voluntary_exit'));

-- ── 3. settle_tlmn_voluntary_exit() — the ONLY way a forfeit charges (service_role only) ─
-- p_penalty_points is the card-point penalty computed by trusted server code from the
-- authoritative hand (loserHandPayment). coin_penalty = points × COIN_PER_POINT (1000),
-- clamped so the loss never exceeds the current balance. Idempotent via the tlmn_forfeits
-- PK. Returns { settled, coin_penalty, balance } — the actually-applied deduction and the
-- new balance (or the existing values on a repeat call, with settled=false).
CREATE OR REPLACE FUNCTION public.settle_tlmn_voluntary_exit(
  p_room_id        uuid,
  p_round_no       int,
  p_user_id        uuid,
  p_seat_index     int,
  p_cards_left     int,
  p_penalty_points int,
  p_breakdown      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_per_point bigint := 1000;  -- COIN_PER_POINT
  v_points    int    := GREATEST(COALESCE(p_penalty_points, 0), 0);
  v_bal       bigint;
  v_coin      bigint;
  v_applied   bigint := 0;
  v_existing  public.tlmn_forfeits%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'no_user'; END IF;

  -- Once-only claim: insert the forfeit slot. A repeat (double-tap / retry / reconnect)
  -- hits the PK conflict → we return the existing settlement and deduct NOTHING.
  INSERT INTO public.tlmn_forfeits
    (room_id, round_no, user_id, seat_index, cards_left, penalty_points, coin_penalty, breakdown)
  VALUES
    (p_room_id, p_round_no, p_user_id, p_seat_index, GREATEST(COALESCE(p_cards_left,0),0),
     v_points, 0, p_breakdown)
  ON CONFLICT (room_id, round_no, user_id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT * INTO v_existing FROM public.tlmn_forfeits
      WHERE room_id = p_room_id AND round_no = p_round_no AND user_id = p_user_id;
    SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = p_user_id;
    RETURN jsonb_build_object(
      'settled', false,
      'coin_penalty', COALESCE(v_existing.coin_penalty, 0),
      'balance', COALESCE(v_bal, 0));
  END IF;

  -- Race guard vs the normal round-end settlement: if this round was ALREADY coin-settled
  -- (settle_round inserted its once-only round_settlements lock), this seat was charged
  -- there as an ordinary loser, so the forfeit must NOT also deduct — exactly ONE
  -- settlement per player per round. We keep the forfeit record (coin_penalty stays 0) for
  -- history/idempotency. (game_code is the room_id stored as text by settle_round.)
  IF EXISTS (
    SELECT 1 FROM public.round_settlements
    WHERE game_code = p_room_id::text AND round_number = p_round_no
  ) THEN
    SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = p_user_id;
    RETURN jsonb_build_object('settled', true, 'coin_penalty', 0, 'balance', COALESCE(v_bal, 0));
  END IF;

  -- Deduct, clamped to the balance floor (0). Lock the wallet row for the transaction.
  v_coin := v_points * v_per_point;
  SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Real players are gated through ensure_wallet at entry; if somehow absent, charge 0.
    v_bal := 0;
    v_applied := 0;
  ELSE
    v_applied := LEAST(v_bal, v_coin);
    v_bal := v_bal - v_applied;
    UPDATE public.game_wallets SET balance = v_bal WHERE user_id = p_user_id;
    INSERT INTO public.coin_ledger (user_id, game_code, round_number, delta, reason, balance_after)
      VALUES (p_user_id, p_room_id::text, p_round_no, -v_applied, 'voluntary_exit', v_bal);
  END IF;

  UPDATE public.tlmn_forfeits SET coin_penalty = v_applied
    WHERE room_id = p_room_id AND round_no = p_round_no AND user_id = p_user_id;

  RETURN jsonb_build_object('settled', true, 'coin_penalty', v_applied, 'balance', v_bal);
END;
$$;

-- ── 4. Grants — trusted server path ONLY (the browser must never call it) ────────────
REVOKE ALL ON FUNCTION public.settle_tlmn_voluntary_exit(uuid, int, uuid, int, int, int, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_tlmn_voluntary_exit(uuid, int, uuid, int, int, int, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
