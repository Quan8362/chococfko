-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — Migration 4/4: CASH-TABLE LIFECYCLE (table settings, seat lifecycle, closure)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Builds the player-lifecycle layer on TOP of the approved persistence spine
-- (migration_poker_core / _private / _economy). Strictly ADDITIVE + IDEMPOTENT + non-
-- destructive: adds columns with safe defaults, one dedup table, and new SECURITY DEFINER
-- RPCs. Touches NO existing TLMN/Caro/wallet object. Apply AFTER the three poker migrations.
--
-- Scope (this phase): TABLE settings (spectators / fixed 20s action + 15s bank / no rake-
-- ante-straddle), SEAT lifecycle (sit-out/return, post-BB policy, connection, reservation
-- cleanup), idempotent TOP-UP, and safe TABLE CLOSURE. NO hand/gameplay engine here.
--
-- AUTHORITY: every mutation is a SECURITY DEFINER RPC (auth.uid()-scoped for players, service-
-- role for the reaper) with FOR UPDATE row locks. Clients still have NO direct write path
-- (the core migration REVOKEd writes + added no write policy). Coins stay integer + idempotent.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Table settings columns (fixed-rule cash table) ─────────────────────────────────
ALTER TABLE public.poker_tables
  ADD COLUMN IF NOT EXISTS action_time_seconds int     NOT NULL DEFAULT 20  CHECK (action_time_seconds > 0),
  ADD COLUMN IF NOT EXISTS time_bank_seconds   int     NOT NULL DEFAULT 15  CHECK (time_bank_seconds >= 0),
  ADD COLUMN IF NOT EXISTS allow_spectators    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS closed_at           timestamptz;

-- ── 2. Seat lifecycle columns (connection + deferred sit-out) ─────────────────────────
-- DISCONNECTED is modeled as a flag, NOT a status: a disconnected player keeps their seat
-- status + stack (RECONNECT-001 — temp disconnect never releases the seat or returns chips).
ALTER TABLE public.poker_seats
  ADD COLUMN IF NOT EXISTS disconnected_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at      timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS sit_out_next_hand boolean     NOT NULL DEFAULT false;

-- ── 3. Top-up idempotency ledger (dedupe a retried top-up by client token) ────────────
-- One row == "this top-up request has been applied". A second call with the same key moves
-- NO coins (TOPUP-001 + COIN-IDEMPOTENCY-001). Opaque to clients (written by DEFINER only).
CREATE TABLE IF NOT EXISTS public.poker_topup_requests (
  idempotency_key text PRIMARY KEY,
  table_id        uuid NOT NULL REFERENCES public.poker_tables(id) ON DELETE CASCADE,
  seat_index      int  NOT NULL,
  user_id         uuid NOT NULL,
  amount          bigint NOT NULL CHECK (amount > 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.poker_topup_requests ENABLE ROW LEVEL SECURITY;  -- no policy → opaque
REVOKE ALL ON public.poker_topup_requests FROM anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 4. poker_finalize_hand_seats — REPLACE to also apply deferred sit-out ─────────────
-- Same signature/behavior as migration_poker_economy.sql, plus: a sit-out requested mid-hand
-- (sit_out_next_hand) takes effect now (SITOUT effective next hand). Still called ONLY from
-- settle/refund. Order of precedence at hand end: leaving (cash out) → bust (stack 0) → sit-out.
CREATE OR REPLACE FUNCTION public.poker_finalize_hand_seats(p_table_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s             public.poker_seats%ROWTYPE;
  v_wallet      bigint;
  v_cashout     bigint;
  v_want_sitout boolean;
BEGIN
  FOR s IN
    SELECT * FROM public.poker_seats
    WHERE table_id = p_table_id AND user_id IS NOT NULL
    ORDER BY user_id, seat_index   -- deterministic lock order (B5)
    FOR UPDATE
  LOOP
    v_want_sitout := s.sit_out_next_hand;

    -- Fold any pending top-up into the live stack (effective from next hand).
    IF s.pending_topup > 0 THEN
      UPDATE public.poker_seats
        SET stack = stack + s.pending_topup, pending_topup = 0
        WHERE table_id = s.table_id AND seat_index = s.seat_index;
      s.stack := s.stack + s.pending_topup;
      s.pending_topup := 0;
    END IF;

    -- Reset per-hand betting bookkeeping + consume the deferred sit-out flag.
    UPDATE public.poker_seats
      SET committed_this_street = 0, committed_total = 0, all_in = false, last_action = NULL,
          sit_out_next_hand = false
      WHERE table_id = s.table_id AND seat_index = s.seat_index;

    IF s.status = 'leaving' THEN
      -- Queued stand-up: return remaining stack to the wallet and empty the seat (LEAVE-001).
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
            seated_at=NULL, disconnected_at=NULL
        WHERE table_id = s.table_id AND seat_index = s.seat_index;
    ELSIF s.status = 'sitting_in' AND s.stack = 0 THEN
      UPDATE public.poker_seats SET status='busted'
        WHERE table_id = s.table_id AND seat_index = s.seat_index;
    ELSIF s.status = 'sitting_in' AND v_want_sitout THEN
      UPDATE public.poker_seats SET status='sitting_out'
        WHERE table_id = s.table_id AND seat_index = s.seat_index;
    END IF;
  END LOOP;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 5. Internal helper: is this seat in a LIVE (non-terminal) hand right now? ──────────
CREATE OR REPLACE FUNCTION public.poker_seat_in_live_hand(p_table_id uuid, p_seat_index int)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.poker_tables t
    JOIN public.poker_hands h ON h.id = t.current_hand_id
    JOIN public.poker_hole_cards hc ON hc.hand_id = h.id AND hc.seat_index = p_seat_index
    WHERE t.id = p_table_id
      AND h.phase IN ('STARTING','BETTING','SHOWDOWN','SETTLEMENT')
  );
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 6. poker_sit_out(table_id, seat_index) — dealt out next hand (SITOUT-001) ──────────
CREATE OR REPLACE FUNCTION public.poker_sit_out(p_table_id uuid, p_seat_index int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  s     public.poker_seats%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO s FROM public.poker_seats
    WHERE table_id = p_table_id AND seat_index = p_seat_index FOR UPDATE;
  IF NOT FOUND OR s.user_id <> v_uid THEN RAISE EXCEPTION 'not_your_seat'; END IF;

  IF s.status = 'sitting_out' OR s.sit_out_next_hand THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'status', s.status);
  END IF;
  IF s.status <> 'sitting_in' THEN RAISE EXCEPTION 'cannot_sit_out'; END IF;

  IF public.poker_seat_in_live_hand(p_table_id, p_seat_index) THEN
    -- Stay in the current hand; sit-out applies at hand end (poker_finalize_hand_seats).
    UPDATE public.poker_seats SET sit_out_next_hand = true
      WHERE table_id = p_table_id AND seat_index = p_seat_index;
    RETURN jsonb_build_object('ok', true, 'queued', true, 'status', 'sitting_in');
  END IF;

  UPDATE public.poker_seats SET status = 'sitting_out'
    WHERE table_id = p_table_id AND seat_index = p_seat_index;
  RETURN jsonb_build_object('ok', true, 'queued', false, 'status', 'sitting_out');
END;
$$;

-- ── 7. poker_return_from_sit_out(table_id, seat_index) — re-seat next hand (SITOUT-RETURN-001)
CREATE OR REPLACE FUNCTION public.poker_return_from_sit_out(p_table_id uuid, p_seat_index int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  s     public.poker_seats%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO s FROM public.poker_seats
    WHERE table_id = p_table_id AND seat_index = p_seat_index FOR UPDATE;
  IF NOT FOUND OR s.user_id <> v_uid THEN RAISE EXCEPTION 'not_your_seat'; END IF;

  -- Cancel a queued sit-out, or come back from a committed sit-out.
  IF s.status = 'sitting_out' THEN
    UPDATE public.poker_seats SET status = 'sitting_in', sit_out_next_hand = false
      WHERE table_id = p_table_id AND seat_index = p_seat_index;
    RETURN jsonb_build_object('ok', true, 'status', 'sitting_in');
  ELSIF s.sit_out_next_hand THEN
    UPDATE public.poker_seats SET sit_out_next_hand = false
      WHERE table_id = p_table_id AND seat_index = p_seat_index;
    RETURN jsonb_build_object('ok', true, 'status', s.status, 'cancelled_pending', true);
  END IF;

  IF s.status = 'sitting_in' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'status', 'sitting_in');
  END IF;
  RAISE EXCEPTION 'not_sitting_out';
END;
$$;

-- ── 8. poker_set_post_bb_policy(table_id, seat_index, policy) — wait vs post-BB-now ────
-- 'wait' = wait for the natural big blind (JOIN-BB-001); 'post' = Post Big Blind Now (JOIN-POSTBB-001).
CREATE OR REPLACE FUNCTION public.poker_set_post_bb_policy(p_table_id uuid, p_seat_index int, p_policy text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  s     public.poker_seats%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_policy NOT IN ('post','wait') THEN RAISE EXCEPTION 'invalid_policy'; END IF;
  SELECT * INTO s FROM public.poker_seats
    WHERE table_id = p_table_id AND seat_index = p_seat_index FOR UPDATE;
  IF NOT FOUND OR s.user_id <> v_uid THEN RAISE EXCEPTION 'not_your_seat'; END IF;

  UPDATE public.poker_seats SET post_bb_policy = p_policy
    WHERE table_id = p_table_id AND seat_index = p_seat_index;
  RETURN jsonb_build_object('ok', true, 'post_bb_policy', p_policy);
END;
$$;

-- ── 9. poker_set_seat_connection(table_id, seat_index, connected) — presence flag ─────
-- Player (own seat) heartbeat OR server presence sync. NEVER changes status or stack: a
-- temporary disconnect keeps the seat and the escrowed chips (RECONNECT-001). Reconnect just
-- clears the flag and the player resumes the SAME seat.
CREATE OR REPLACE FUNCTION public.poker_set_seat_connection(p_table_id uuid, p_seat_index int, p_connected boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_service boolean := (v_uid IS NULL);
  s        public.poker_seats%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.poker_seats
    WHERE table_id = p_table_id AND seat_index = p_seat_index FOR UPDATE;
  IF NOT FOUND OR s.user_id IS NULL THEN RAISE EXCEPTION 'seat_not_occupied'; END IF;
  IF NOT v_service AND s.user_id <> v_uid THEN RAISE EXCEPTION 'not_your_seat'; END IF;

  IF p_connected THEN
    UPDATE public.poker_seats SET disconnected_at = NULL, last_seen_at = now()
      WHERE table_id = p_table_id AND seat_index = p_seat_index;
  ELSE
    UPDATE public.poker_seats
      SET disconnected_at = COALESCE(disconnected_at, now()), last_seen_at = now()
      WHERE table_id = p_table_id AND seat_index = p_seat_index;
  END IF;
  -- Keep table membership presence fresh too.
  UPDATE public.poker_table_members SET last_seen_at = now()
    WHERE table_id = p_table_id AND user_id = s.user_id;
  RETURN jsonb_build_object('ok', true, 'connected', p_connected);
END;
$$;

-- ── 10. poker_clean_expired_reservations(table_id) — release stale RESERVED seats ─────
CREATE OR REPLACE FUNCTION public.poker_clean_expired_reservations(p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  UPDATE public.poker_seats
    SET status = 'empty', reserved_by = NULL, reserved_until = NULL
    WHERE table_id = p_table_id
      AND status = 'reserved'
      AND user_id IS NULL
      AND (reserved_until IS NULL OR reserved_until < now());
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'released', v_n);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 11. poker_resolve_closing(table_id) — internal: cash out all seats, then CLOSED ───
-- Precondition (enforced by callers): NO live hand. Returns every occupied seat's stack +
-- pending top-up to its wallet (idempotent, ledgered), frees the seat, then flips the table to
-- CLOSED when no occupied seat remains. Never strands escrow (CLOSING → CLOSED, B3).
CREATE OR REPLACE FUNCTION public.poker_resolve_closing(p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t        public.poker_tables%ROWTYPE;
  s        public.poker_seats%ROWTYPE;
  v_wallet bigint;
  v_move   bigint;
  v_left   int;
BEGIN
  SELECT * INTO t FROM public.poker_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'table_not_found'; END IF;

  -- Refuse to cash out under a live hand (must settle/refund first — E1).
  IF EXISTS (SELECT 1 FROM public.poker_hands h
             WHERE h.id = t.current_hand_id
               AND h.phase IN ('STARTING','BETTING','SHOWDOWN','SETTLEMENT')) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hand_in_progress');
  END IF;

  PERFORM public.poker_clean_expired_reservations(p_table_id);

  FOR s IN
    SELECT * FROM public.poker_seats
    WHERE table_id = p_table_id AND user_id IS NOT NULL
    ORDER BY user_id, seat_index   -- deterministic lock order
    FOR UPDATE
  LOOP
    v_move := s.stack + s.pending_topup;
    SELECT balance INTO v_wallet FROM public.game_wallets WHERE user_id = s.user_id FOR UPDATE;
    IF FOUND AND v_move > 0 THEN
      v_wallet := v_wallet + v_move;
      UPDATE public.game_wallets SET balance = v_wallet WHERE user_id = s.user_id;
      INSERT INTO public.coin_ledger (user_id, game_code, delta, reason, balance_after)
        VALUES (s.user_id, 'poker', v_move, 'poker_stand_up', v_wallet);
    END IF;
    UPDATE public.poker_seats
      SET status='empty', user_id=NULL, display_name=NULL, avatar_url=NULL, stack=0,
          pending_topup=0, committed_this_street=0, committed_total=0, all_in=false,
          last_action=NULL, reserved_by=NULL, reserved_until=NULL, sit_down_token=NULL,
          seated_at=NULL, disconnected_at=NULL, sit_out_next_hand=false
      WHERE table_id = s.table_id AND seat_index = s.seat_index;
  END LOOP;

  SELECT count(*) INTO v_left FROM public.poker_seats
    WHERE table_id = p_table_id AND user_id IS NOT NULL;

  IF v_left = 0 THEN
    UPDATE public.poker_tables SET status='closed', closed_at=now(),
           state_version = state_version + 1
      WHERE id = p_table_id;
    RETURN jsonb_build_object('ok', true, 'status', 'closed');
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', 'closing', 'remaining', v_left);
END;
$$;

-- ── 12. poker_close_table(table_id) — host (or service) closes a table ─────────────────
-- Sets CLOSING (blocks new joins). If a hand is live, it must settle first; otherwise resolves
-- straight to CLOSED, returning every stack to its wallet.
CREATE OR REPLACE FUNCTION public.poker_close_table(p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_service boolean := (v_uid IS NULL);
  t         public.poker_tables%ROWTYPE;
  v_live    boolean;
BEGIN
  SELECT * INTO t FROM public.poker_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'table_not_found'; END IF;
  IF NOT v_service AND t.created_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_table_host';
  END IF;
  IF t.status = 'closed' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'closed', 'idempotent', true);
  END IF;

  v_live := EXISTS (SELECT 1 FROM public.poker_hands h
                    WHERE h.id = t.current_hand_id
                      AND h.phase IN ('STARTING','BETTING','SHOWDOWN','SETTLEMENT'));

  UPDATE public.poker_tables SET status='closing', state_version = state_version + 1
    WHERE id = p_table_id AND status <> 'closing';

  IF v_live THEN
    -- Active hand: do NOT close abruptly. New joins are blocked; settlement (then the reaper /
    -- a later resolve call) completes the close once the hand finishes.
    RETURN jsonb_build_object('ok', true, 'status', 'closing', 'reason', 'hand_in_progress');
  END IF;

  RETURN public.poker_resolve_closing(p_table_id);
END;
$$;

-- ── 13. poker_reap_idle_table(table_id) — service reaper: close empty idle tables ──────
CREATE OR REPLACE FUNCTION public.poker_reap_idle_table(p_table_id uuid, p_idle_seconds int DEFAULT 600)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t          public.poker_tables%ROWTYPE;
  v_occupied int;
  v_live     boolean;
  v_last     timestamptz;
BEGIN
  SELECT * INTO t FROM public.poker_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'table_not_found'; END IF;
  IF t.status = 'closed' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'closed', 'idempotent', true);
  END IF;

  SELECT count(*) INTO v_occupied FROM public.poker_seats
    WHERE table_id = p_table_id AND user_id IS NOT NULL;
  v_live := EXISTS (SELECT 1 FROM public.poker_hands h
                    WHERE h.id = t.current_hand_id
                      AND h.phase IN ('STARTING','BETTING','SHOWDOWN','SETTLEMENT'));
  IF v_occupied > 0 OR v_live THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_idle', 'occupied', v_occupied, 'live', v_live);
  END IF;

  SELECT GREATEST(t.updated_at, COALESCE(MAX(seg.updated_at), t.updated_at))
    INTO v_last
    FROM public.poker_seats seg WHERE seg.table_id = p_table_id;

  IF now() - v_last < make_interval(secs => p_idle_seconds) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_idle_long_enough');
  END IF;

  PERFORM public.poker_clean_expired_reservations(p_table_id);
  UPDATE public.poker_tables SET status='closed', closed_at=now(),
         state_version = state_version + 1
    WHERE id = p_table_id;
  RETURN jsonb_build_object('ok', true, 'status', 'closed');
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 14. poker_top_up(table_id, seat_index, amount, idempotency_key) — idempotent overload
-- 4-arg overload of the economy 3-arg top-up. Dedupes a retried request by client token so a
-- double-submit cannot debit the wallet twice (TOPUP-001 + COIN-IDEMPOTENCY-001). The 3-arg
-- version (no token) remains for callers that don't need dedup.
CREATE OR REPLACE FUNCTION public.poker_top_up(
  p_table_id uuid, p_seat_index int, p_amount bigint, p_idem text
)
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

  -- No token → delegate to the plain 3-arg path (no dedup).
  IF p_idem IS NULL OR length(trim(p_idem)) = 0 THEN
    RETURN public.poker_top_up(p_table_id, p_seat_index, p_amount);
  END IF;

  SELECT * INTO t FROM public.poker_tables WHERE id = p_table_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'table_not_found'; END IF;

  SELECT * INTO s FROM public.poker_seats
    WHERE table_id = p_table_id AND seat_index = p_seat_index FOR UPDATE;
  IF NOT FOUND OR s.user_id <> v_uid THEN RAISE EXCEPTION 'not_your_seat'; END IF;

  v_cap := t.max_buy_in_bb::bigint * t.big_blind;
  IF s.stack + s.pending_topup + p_amount > v_cap THEN
    RAISE EXCEPTION 'exceeds_table_cap cap=%', v_cap;
  END IF;

  -- Idempotency claim BEFORE moving coins. A duplicate token finds the row → moves nothing.
  INSERT INTO public.poker_topup_requests (idempotency_key, table_id, seat_index, user_id, amount)
    VALUES (p_idem, p_table_id, p_seat_index, v_uid, p_amount)
    ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN
    SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = v_uid;
    RETURN jsonb_build_object('ok', true, 'idempotent', true,
                              'pending_topup', s.pending_topup, 'balance', v_bal);
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

  RETURN jsonb_build_object('ok', true, 'idempotent', false,
                            'pending_topup', s.pending_topup + p_amount, 'balance', v_bal);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 15. Grants — least privilege ───────────────────────────────────────────────────────
-- Player-facing (auth.uid()-scoped) RPCs → authenticated.
REVOKE ALL ON FUNCTION public.poker_sit_out(uuid, int)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poker_return_from_sit_out(uuid, int)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poker_set_post_bb_policy(uuid, int, text)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poker_top_up(uuid, int, bigint, text)          FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poker_sit_out(uuid, int)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.poker_return_from_sit_out(uuid, int)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.poker_set_post_bb_policy(uuid, int, text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.poker_top_up(uuid, int, bigint, text)        TO authenticated;

-- Player OR server (connection heartbeat / reservation cleanup / host close).
REVOKE ALL ON FUNCTION public.poker_set_seat_connection(uuid, int, boolean)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poker_clean_expired_reservations(uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poker_close_table(uuid)                         FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poker_set_seat_connection(uuid, int, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.poker_clean_expired_reservations(uuid)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.poker_close_table(uuid)                       TO authenticated, service_role;

-- Trusted server-only (reaper / internal). Browser must never call these.
REVOKE ALL ON FUNCTION public.poker_resolve_closing(uuid)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poker_reap_idle_table(uuid, int)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poker_seat_in_live_hand(uuid, int)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poker_finalize_hand_seats(uuid)        FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poker_resolve_closing(uuid)          TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_reap_idle_table(uuid, int)     TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_seat_in_live_hand(uuid, int)   TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_finalize_hand_seats(uuid)      TO service_role;

NOTIFY pgrst, 'reload schema';
