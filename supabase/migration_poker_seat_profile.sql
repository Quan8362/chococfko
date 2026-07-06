-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — Seat identity: copy the player's PROFILE (display_name + avatar_url) onto the seat
-- ════════════════════════════════════════════════════════════════════════════════════
-- The original poker_sit_down (migration_poker_economy.sql) seated a user but never wrote
-- display_name / avatar_url onto poker_seats, so every seat rendered with a null name and a
-- null avatar (the "?" initials fallback on the felt). This redefines poker_sit_down to snapshot
-- the caller's profile identity onto the seat at sit-down time (display-only, like TLMN seats).
--
-- Idempotent + safe to re-run. Grants are re-applied to match the original definition.
-- ════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.poker_sit_down(p_table_id uuid, p_seat_index int, p_buy_in bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_entry  bigint := 10000;  -- ENTRY_MIN_BALANCE
  t        public.poker_tables%ROWTYPE;
  s        public.poker_seats%ROWTYPE;
  v_min    bigint;
  v_max    bigint;
  v_bal    bigint;
  v_name   text;
  v_avatar text;
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

  -- Snapshot the caller's profile identity onto the seat (display-only).
  SELECT display_name, avatar_url INTO v_name, v_avatar
    FROM public.profiles WHERE id = v_uid;

  UPDATE public.poker_seats
    SET user_id = v_uid, status = 'sitting_in', stack = p_buy_in, pending_topup = 0,
        display_name = v_name, avatar_url = v_avatar,
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

REVOKE ALL ON FUNCTION public.poker_sit_down(uuid, int, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poker_sit_down(uuid, int, bigint) TO authenticated;

-- Backfill: currently-occupied seats that predate this change get their profile identity now,
-- so live players don't have to stand up and re-sit to gain a name/avatar on the felt.
UPDATE public.poker_seats ps
   SET display_name = COALESCE(ps.display_name, pr.display_name),
       avatar_url   = COALESCE(ps.avatar_url,   pr.avatar_url)
  FROM public.profiles pr
 WHERE ps.user_id = pr.id
   AND ps.user_id IS NOT NULL
   AND (ps.avatar_url IS NULL OR ps.display_name IS NULL);
