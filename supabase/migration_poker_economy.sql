-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — Migration 3/3: COIN ESCROW & SETTLEMENT (SECURITY DEFINER RPCs)
-- ════════════════════════════════════════════════════════════════════════════════════
-- The financial-integrity layer. Reuses the proven TLMN discipline (migration_tlmn_run7_
-- economy.sql): integer-only bigint, SELECT … FOR UPDATE with deterministic lock order,
-- append-only coin_ledger with balance_after, idempotent, and REVOKEd from clients except the
-- strictly auth.uid()-scoped player RPCs.
--
-- MONEY LOCATIONS (coin-model §2):
--     game_wallets.balance  ⇄  poker_seats.stack (+ pending_topup)  ⇄  poker_hands pot
--          (wallet)                  (table escrow)                       (in-hand)
--   • Wallet↔stack crossings (sit_down/top_up/rebuy/stand_up/leaving-cashout) write a
--     coin_ledger row → balance_after is ALWAYS the true wallet balance.
--   • Stack↔pot movements (contributions, settlement, refund) are escrow-INTERNAL: they do
--     NOT cross the wallet, so they are audited in poker_actions + poker_hand_settlements
--     (NOT coin_ledger). This keeps coin_ledger a strict, always-correct wallet ledger while
--     still fully auditing every coin. Conservation is enforced + tested either way.
--
-- Constants duplicated from lib/game/economy.ts — KEEP IN SYNC: ENTRY_MIN_BALANCE=10_000.
-- Buy-in bounds are per-table: [min_buy_in_bb × BB, max_buy_in_bb × BB].
-- Apply AFTER poker_core.sql + poker_private.sql. Idempotent, additive, non-destructive.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 0. Widen coin_ledger reason CHECK to the SUPERSET incl. poker reasons ─────────────
-- Re-create as the single superset of every reason the codebase writes (the lesson of
-- migration_coin_ledger_reason_fix.sql: never let a single-purpose migration drop a reason).
ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_reason_check;
ALTER TABLE public.coin_ledger ADD CONSTRAINT coin_ledger_reason_check
  CHECK (reason IN (
    'signup_grant',
    'daily_grant',
    'round_settlement',
    'voluntary_exit',
    'interaction_spend',
    -- poker wallet↔stack crossings:
    'poker_sit_down',
    'poker_top_up',
    'poker_rebuy',
    'poker_stand_up',
    -- reserved (escrow-internal today, but allowed so a future phase can ledger them safely):
    'poker_settle_hand',
    'poker_refund_hand'
  ));

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 1. Internal helper: finalize all seats at a table at HAND END ─────────────────────
-- Folds pending top-ups into stacks (TOPUP-001, active next hand), resets per-hand betting
-- bookkeeping, busts zero-stack seats, and cashes out seats that requested to leave mid-hand
-- (LEAVE-001 → the queued stand_up runs here). Called ONLY from settle/refund. Not client-callable.
CREATE OR REPLACE FUNCTION public.poker_finalize_hand_seats(p_table_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s        public.poker_seats%ROWTYPE;
  v_wallet bigint;
  v_cashout bigint;
BEGIN
  FOR s IN
    SELECT * FROM public.poker_seats
    WHERE table_id = p_table_id AND user_id IS NOT NULL
    ORDER BY user_id, seat_index   -- deterministic lock order (B5)
    FOR UPDATE
  LOOP
    -- Fold any pending top-up into the live stack (effective from next hand).
    IF s.pending_topup > 0 THEN
      UPDATE public.poker_seats
        SET stack = stack + s.pending_topup, pending_topup = 0
        WHERE table_id = s.table_id AND seat_index = s.seat_index;
      s.stack := s.stack + s.pending_topup;
      s.pending_topup := 0;
    END IF;

    -- Reset per-hand betting bookkeeping.
    UPDATE public.poker_seats
      SET committed_this_street = 0, committed_total = 0, all_in = false, last_action = NULL
      WHERE table_id = s.table_id AND seat_index = s.seat_index;

    IF s.status = 'leaving' THEN
      -- Queued stand-up: return remaining stack to the wallet and empty the seat.
      v_cashout := s.stack;
      SELECT balance INTO v_wallet FROM public.game_wallets WHERE user_id = s.user_id FOR UPDATE;
      IF FOUND AND v_cashout > 0 THEN
        v_wallet := v_wallet + v_cashout;
        UPDATE public.game_wallets SET balance = v_wallet WHERE user_id = s.user_id;
        INSERT INTO public.coin_ledger (user_id, game_code, delta, reason, balance_after)
          VALUES (s.user_id, 'poker', v_cashout, 'poker_stand_up', v_wallet);
      END IF;
      UPDATE public.poker_seats
        SET status='empty', user_id=NULL, display_name=NULL, avatar_url=NULL, stack=0,
            pending_topup=0, reserved_by=NULL, reserved_until=NULL, sit_down_token=NULL,
            seated_at=NULL
        WHERE table_id = s.table_id AND seat_index = s.seat_index;
    ELSIF s.status = 'sitting_in' AND s.stack = 0 THEN
      UPDATE public.poker_seats SET status='busted'
        WHERE table_id = s.table_id AND seat_index = s.seat_index;
    END IF;
  END LOOP;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 2. poker_reserve_seat(table_id, seat_index) — claim an empty seat (no coins) ──────
CREATE OR REPLACE FUNCTION public.poker_reserve_seat(p_table_id uuid, p_seat_index int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hold interval := interval '30 seconds';
  s     public.poker_seats%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO s FROM public.poker_seats
    WHERE table_id = p_table_id AND seat_index = p_seat_index FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'seat_not_found'; END IF;

  -- Idempotent: already mine (reserved or seated) → just refresh the hold.
  IF s.user_id = v_uid OR s.reserved_by = v_uid THEN
    UPDATE public.poker_seats SET reserved_until = now() + v_hold
      WHERE table_id = p_table_id AND seat_index = p_seat_index AND s.user_id IS NULL;
    RETURN jsonb_build_object('ok', true, 'seat_index', p_seat_index, 'reserved', s.user_id IS NULL);
  END IF;

  -- One seat per user per table — a HELD (non-expired) reservation counts too, otherwise a
  -- player holding seat A could reserve seat B (multi-seating / collusion hole).
  IF EXISTS (SELECT 1 FROM public.poker_seats
             WHERE table_id = p_table_id AND seat_index <> p_seat_index
               AND (user_id = v_uid
                    OR (reserved_by = v_uid AND reserved_until IS NOT NULL AND reserved_until > now()))) THEN
    RAISE EXCEPTION 'already_seated_at_table';
  END IF;

  IF s.status <> 'empty'
     OR (s.reserved_by IS NOT NULL AND s.reserved_until IS NOT NULL AND s.reserved_until > now()) THEN
    RAISE EXCEPTION 'seat_unavailable';
  END IF;

  UPDATE public.poker_seats
    SET status='reserved', reserved_by=v_uid, reserved_until=now() + v_hold
    WHERE table_id = p_table_id AND seat_index = p_seat_index;

  INSERT INTO public.poker_table_members (table_id, user_id, role)
    VALUES (p_table_id, v_uid, 'player')
    ON CONFLICT (table_id, user_id) DO UPDATE SET last_seen_at = now();

  RETURN jsonb_build_object('ok', true, 'seat_index', p_seat_index, 'reserved', true);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 3. poker_sit_down(table_id, seat_index, buy_in) — wallet → stack escrow ───────────
CREATE OR REPLACE FUNCTION public.poker_sit_down(p_table_id uuid, p_seat_index int, p_buy_in bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_entry bigint := 10000;  -- ENTRY_MIN_BALANCE
  t       public.poker_tables%ROWTYPE;
  s       public.poker_seats%ROWTYPE;
  v_min   bigint;
  v_max   bigint;
  v_bal   bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_buy_in IS NULL OR p_buy_in <= 0 THEN RAISE EXCEPTION 'invalid_buy_in'; END IF;

  SELECT * INTO t FROM public.poker_tables WHERE id = p_table_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'table_not_found'; END IF;
  IF t.status <> 'open' THEN RAISE EXCEPTION 'table_not_open'; END IF;

  SELECT * INTO s FROM public.poker_seats
    WHERE table_id = p_table_id AND seat_index = p_seat_index FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'seat_not_found'; END IF;

  -- Idempotent: caller already sitting here with chips → return current state, move nothing.
  IF s.user_id = v_uid AND s.status IN ('sitting_in','sitting_out') AND s.stack > 0 THEN
    SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = v_uid;
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'stack', s.stack, 'balance', v_bal);
  END IF;

  -- Seat must be empty, or reserved by caller.
  IF NOT (s.status = 'empty' OR (s.status = 'reserved' AND s.reserved_by = v_uid)) THEN
    RAISE EXCEPTION 'seat_unavailable';
  END IF;
  -- One seat per user per table — a HELD (non-expired) reservation on another seat counts too.
  IF EXISTS (SELECT 1 FROM public.poker_seats
             WHERE table_id = p_table_id AND seat_index <> p_seat_index
               AND (user_id = v_uid
                    OR (reserved_by = v_uid AND reserved_until IS NOT NULL AND reserved_until > now()))) THEN
    RAISE EXCEPTION 'already_seated_at_table';
  END IF;

  v_min := t.min_buy_in_bb::bigint * t.big_blind;
  v_max := t.max_buy_in_bb::bigint * t.big_blind;
  IF p_buy_in < v_min OR p_buy_in > v_max THEN
    RAISE EXCEPTION 'buy_in_out_of_range min=% max=%', v_min, v_max;
  END IF;

  -- Entry gate + funds. Lock the wallet.
  SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_wallet'; END IF;
  IF v_bal < v_entry THEN RAISE EXCEPTION 'below_entry_gate'; END IF;
  IF v_bal < p_buy_in THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  v_bal := v_bal - p_buy_in;  -- wallet → stack
  UPDATE public.game_wallets SET balance = v_bal WHERE user_id = v_uid;
  INSERT INTO public.coin_ledger (user_id, game_code, delta, reason, balance_after)
    VALUES (v_uid, 'poker', -p_buy_in, 'poker_sit_down', v_bal);

  UPDATE public.poker_seats
    SET user_id = v_uid, status = 'sitting_in', stack = p_buy_in, pending_topup = 0,
        committed_this_street = 0, committed_total = 0, all_in = false, last_action = NULL,
        reserved_by = NULL, reserved_until = NULL, sit_down_token = gen_random_uuid(),
        seated_at = now()
    WHERE table_id = p_table_id AND seat_index = p_seat_index;

  INSERT INTO public.poker_table_members (table_id, user_id, role)
    VALUES (p_table_id, v_uid, 'player')
    ON CONFLICT (table_id, user_id) DO UPDATE SET last_seen_at = now();

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'stack', p_buy_in, 'balance', v_bal);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 4. poker_top_up(table_id, seat_index, amount) — wallet → pending_topup ────────────
CREATE OR REPLACE FUNCTION public.poker_top_up(p_table_id uuid, p_seat_index int, p_amount bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  t     public.poker_tables%ROWTYPE;
  s     public.poker_seats%ROWTYPE;
  v_cap bigint;
  v_bal bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT * INTO t FROM public.poker_tables WHERE id = p_table_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'table_not_found'; END IF;

  SELECT * INTO s FROM public.poker_seats
    WHERE table_id = p_table_id AND seat_index = p_seat_index FOR UPDATE;
  IF NOT FOUND OR s.user_id <> v_uid THEN RAISE EXCEPTION 'not_your_seat'; END IF;

  v_cap := t.max_buy_in_bb::bigint * t.big_blind;
  IF s.stack + s.pending_topup + p_amount > v_cap THEN
    RAISE EXCEPTION 'exceeds_table_cap cap=%', v_cap;
  END IF;

  SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_wallet'; END IF;
  IF v_bal < p_amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  v_bal := v_bal - p_amount;
  UPDATE public.game_wallets SET balance = v_bal WHERE user_id = v_uid;
  INSERT INTO public.coin_ledger (user_id, game_code, delta, reason, balance_after)
    VALUES (v_uid, 'poker', -p_amount, 'poker_top_up', v_bal);

  UPDATE public.poker_seats SET pending_topup = pending_topup + p_amount
    WHERE table_id = p_table_id AND seat_index = p_seat_index;

  RETURN jsonb_build_object('ok', true, 'pending_topup', s.pending_topup + p_amount, 'balance', v_bal);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 5. poker_rebuy(table_id, seat_index, amount) — busted seat, wallet → stack ────────
CREATE OR REPLACE FUNCTION public.poker_rebuy(p_table_id uuid, p_seat_index int, p_amount bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_entry bigint := 10000;  -- ENTRY_MIN_BALANCE
  t       public.poker_tables%ROWTYPE;
  s       public.poker_seats%ROWTYPE;
  v_min   bigint;
  v_max   bigint;
  v_bal   bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT * INTO t FROM public.poker_tables WHERE id = p_table_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'table_not_found'; END IF;

  SELECT * INTO s FROM public.poker_seats
    WHERE table_id = p_table_id AND seat_index = p_seat_index FOR UPDATE;
  IF NOT FOUND OR s.user_id <> v_uid THEN RAISE EXCEPTION 'not_your_seat'; END IF;
  IF NOT (s.status = 'busted' OR s.stack = 0) THEN RAISE EXCEPTION 'not_busted'; END IF;

  v_min := t.min_buy_in_bb::bigint * t.big_blind;
  v_max := t.max_buy_in_bb::bigint * t.big_blind;
  IF p_amount < v_min OR p_amount > v_max THEN
    RAISE EXCEPTION 'rebuy_out_of_range min=% max=%', v_min, v_max;
  END IF;

  SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_wallet'; END IF;
  IF v_bal < v_entry THEN RAISE EXCEPTION 'below_entry_gate'; END IF;
  IF v_bal < p_amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  v_bal := v_bal - p_amount;
  UPDATE public.game_wallets SET balance = v_bal WHERE user_id = v_uid;
  INSERT INTO public.coin_ledger (user_id, game_code, delta, reason, balance_after)
    VALUES (v_uid, 'poker', -p_amount, 'poker_rebuy', v_bal);

  UPDATE public.poker_seats
    SET stack = p_amount, status = 'sitting_in', pending_topup = 0
    WHERE table_id = p_table_id AND seat_index = p_seat_index;

  RETURN jsonb_build_object('ok', true, 'stack', p_amount, 'balance', v_bal);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 6. poker_stand_up(table_id, seat_index) — stack → wallet (idempotent) ─────────────
-- Caller: the seat's own player (auth.uid) OR the server/reaper (service role → auth.uid NULL).
-- If called mid-hand while the seat is in the live hand, it is QUEUED (status → leaving) and
-- the actual transfer runs at hand end via poker_finalize_hand_seats (LEAVE-001).
CREATE OR REPLACE FUNCTION public.poker_stand_up(p_table_id uuid, p_seat_index int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_service boolean := (v_uid IS NULL);  -- service-role calls have no auth.uid()
  t        public.poker_tables%ROWTYPE;
  s        public.poker_seats%ROWTYPE;
  v_bal    bigint;
  v_move   bigint;
  v_in_hand boolean;
BEGIN
  SELECT * INTO s FROM public.poker_seats
    WHERE table_id = p_table_id AND seat_index = p_seat_index FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'seat_not_found'; END IF;

  -- Idempotent: already empty / nobody seated → nothing to do.
  IF s.user_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'moved', 0, 'idempotent', true);
  END IF;
  IF NOT v_service AND s.user_id <> v_uid THEN RAISE EXCEPTION 'not_your_seat'; END IF;

  SELECT * INTO t FROM public.poker_tables WHERE id = p_table_id;

  -- Is the seat participating in a live (non-terminal) hand?
  v_in_hand := EXISTS (
    SELECT 1 FROM public.poker_hands h
    JOIN public.poker_hole_cards hc ON hc.hand_id = h.id AND hc.seat_index = p_seat_index
    WHERE h.id = t.current_hand_id AND h.phase IN ('STARTING','BETTING','SHOWDOWN','SETTLEMENT')
  );

  IF v_in_hand THEN
    -- Queue the stand-up; coins move at settlement. No transfer now (LEAVE-001).
    UPDATE public.poker_seats SET status = 'leaving'
      WHERE table_id = p_table_id AND seat_index = p_seat_index;
    RETURN jsonb_build_object('ok', true, 'queued', true, 'moved', 0);
  END IF;

  -- Safe to cash out now: stack + any pending top-up → wallet.
  v_move := s.stack + s.pending_topup;
  SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = s.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_wallet'; END IF;
  IF v_move > 0 THEN
    v_bal := v_bal + v_move;
    UPDATE public.game_wallets SET balance = v_bal WHERE user_id = s.user_id;
    INSERT INTO public.coin_ledger (user_id, game_code, delta, reason, balance_after)
      VALUES (s.user_id, 'poker', v_move, 'poker_stand_up', v_bal);
  END IF;

  UPDATE public.poker_seats
    SET status='empty', user_id=NULL, display_name=NULL, avatar_url=NULL, stack=0,
        pending_topup=0, committed_this_street=0, committed_total=0, all_in=false,
        last_action=NULL, reserved_by=NULL, reserved_until=NULL, sit_down_token=NULL,
        seated_at=NULL
    WHERE table_id = p_table_id AND seat_index = p_seat_index;

  RETURN jsonb_build_object('ok', true, 'moved', v_move, 'balance', v_bal, 'idempotent', false);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 7. poker_settle_hand(hand_id, payouts, refunds, total) — service role only ────────
-- Idempotent via poker_hand_settlements(hand_id) PK. Credits each winner seat's STACK by its
-- integer payout (escrow-internal — no coin_ledger row). Asserts conservation when the engine
-- supplies the hand total: Σ payouts + Σ refunds == total contributed (POT-CONSERVE-001).
CREATE OR REPLACE FUNCTION public.poker_settle_hand(
  p_hand_id           uuid,
  p_payouts           jsonb,
  p_refunds           jsonb DEFAULT '[]'::jsonb,
  p_total_contributed bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h          public.poker_hands%ROWTYPE;
  v_sum      bigint := 0;
  rec        record;
  v_applied  jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO h FROM public.poker_hands WHERE id = p_hand_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'hand_not_found'; END IF;

  -- Validate payout shape + non-negativity, and sum them.
  IF jsonb_typeof(p_payouts) <> 'array' THEN RAISE EXCEPTION 'payouts_not_array'; END IF;
  FOR rec IN SELECT (e->>'seatIndex')::int AS seat, (e->>'amount')::bigint AS amt
             FROM jsonb_array_elements(p_payouts) e LOOP
    IF rec.amt < 0 THEN RAISE EXCEPTION 'negative_payout'; END IF;
    v_sum := v_sum + rec.amt;
  END LOOP;
  FOR rec IN SELECT (e->>'amount')::bigint AS amt
             FROM jsonb_array_elements(COALESCE(p_refunds,'[]'::jsonb)) e LOOP
    IF rec.amt < 0 THEN RAISE EXCEPTION 'negative_refund'; END IF;
    v_sum := v_sum + rec.amt;
  END LOOP;

  -- Conservation check (when supplied): awards + refunds must equal the pot exactly.
  IF p_total_contributed IS NOT NULL AND v_sum <> p_total_contributed THEN
    RAISE EXCEPTION 'not_conserved sum=% total=%', v_sum, p_total_contributed;
  END IF;

  -- Idempotency lock. Done AFTER validation so a malformed call leaves no lock (whole tx rolls
  -- back on RAISE anyway). A second valid call finds the row and moves no coins.
  INSERT INTO public.poker_hand_settlements (hand_id, table_id, kind, payouts, total_contributed)
    VALUES (p_hand_id, h.table_id, 'settle', p_payouts, COALESCE(p_total_contributed, v_sum))
    ON CONFLICT (hand_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('settled', false);
  END IF;

  -- Credit winner + refunded seats' stacks, deterministic lock order (by user_id, seat).
  FOR rec IN
    SELECT (e->>'seatIndex')::int AS seat, (e->>'amount')::bigint AS amt
    FROM jsonb_array_elements(p_payouts || COALESCE(p_refunds,'[]'::jsonb)) e
    WHERE (e->>'amount')::bigint > 0
    ORDER BY (SELECT user_id FROM public.poker_seats
              WHERE table_id = h.table_id AND seat_index = (e->>'seatIndex')::int),
             (e->>'seatIndex')::int
  LOOP
    UPDATE public.poker_seats SET stack = stack + rec.amt
      WHERE table_id = h.table_id AND seat_index = rec.seat;
    v_applied := v_applied || jsonb_build_object('seatIndex', rec.seat, 'amount', rec.amt);
  END LOOP;

  -- Hand-end seat finalization (pending top-ups, busts, queued leaves).
  PERFORM public.poker_finalize_hand_seats(h.table_id);

  UPDATE public.poker_hands
    SET phase='COMPLETED', completed_at=now(), turn_seat=NULL, turn_deadline=NULL,
        state_version = state_version + 1
    WHERE id = p_hand_id;
  UPDATE public.poker_tables SET state_version = state_version + 1 WHERE id = h.table_id;

  RETURN jsonb_build_object('settled', true, 'applied', v_applied);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 8. poker_refund_hand(hand_id) — service role only — refund all contributions ─────
-- Used on CANCELLED / admin-resolved freeze. Returns each seat's committed_total to its stack
-- (escrow-internal). Idempotent via the same settlement lock (kind='refund').
CREATE OR REPLACE FUNCTION public.poker_refund_hand(p_hand_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h       public.poker_hands%ROWTYPE;
  v_total bigint := 0;
  rec     record;
BEGIN
  SELECT * INTO h FROM public.poker_hands WHERE id = p_hand_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'hand_not_found'; END IF;

  SELECT COALESCE(SUM(committed_total),0) INTO v_total
    FROM public.poker_seats WHERE table_id = h.table_id;

  INSERT INTO public.poker_hand_settlements (hand_id, table_id, kind, payouts, total_contributed)
    VALUES (p_hand_id, h.table_id, 'refund', '[]'::jsonb, v_total)
    ON CONFLICT (hand_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('refunded', false);
  END IF;

  FOR rec IN
    SELECT seat_index, committed_total FROM public.poker_seats
    WHERE table_id = h.table_id AND committed_total > 0
    ORDER BY user_id, seat_index
    FOR UPDATE
  LOOP
    UPDATE public.poker_seats SET stack = stack + rec.committed_total
      WHERE table_id = h.table_id AND seat_index = rec.seat_index;
  END LOOP;

  PERFORM public.poker_finalize_hand_seats(h.table_id);

  UPDATE public.poker_hands
    SET phase='CANCELLED', completed_at=now(), turn_seat=NULL, turn_deadline=NULL,
        state_version = state_version + 1
    WHERE id = p_hand_id;
  UPDATE public.poker_tables SET state_version = state_version + 1 WHERE id = h.table_id;

  INSERT INTO public.poker_incidents (table_id, hand_id, kind, severity, detail)
    VALUES (h.table_id, p_hand_id, 'refund', 'warn', jsonb_build_object('total_refunded', v_total));

  RETURN jsonb_build_object('refunded', true, 'total', v_total);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 9. Grants — least privilege ───────────────────────────────────────────────────────
-- Player-facing (auth.uid()-scoped) RPCs → authenticated only.
REVOKE ALL ON FUNCTION public.poker_reserve_seat(uuid, int)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poker_sit_down(uuid, int, bigint)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poker_top_up(uuid, int, bigint)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poker_rebuy(uuid, int, bigint)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poker_stand_up(uuid, int)              FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poker_reserve_seat(uuid, int)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.poker_sit_down(uuid, int, bigint)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.poker_top_up(uuid, int, bigint)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.poker_rebuy(uuid, int, bigint)       TO authenticated;
-- stand_up is callable by the player AND by the server/reaper (service role).
GRANT EXECUTE ON FUNCTION public.poker_stand_up(uuid, int)            TO authenticated, service_role;

-- Trusted server-only RPCs → service role ONLY. The browser must never call these.
-- NOTE: Supabase grants EXECUTE on public functions to anon/authenticated EXPLICITLY (not only
-- via PUBLIC), so REVOKE … FROM PUBLIC is NOT enough — we must revoke from those roles by name.
REVOKE ALL ON FUNCTION public.poker_finalize_hand_seats(uuid)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poker_settle_hand(uuid, jsonb, jsonb, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poker_refund_hand(uuid)                       FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poker_settle_hand(uuid, jsonb, jsonb, bigint)   TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_refund_hand(uuid)                         TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_finalize_hand_seats(uuid)                 TO service_role;

NOTIFY pgrst, 'reload schema';
