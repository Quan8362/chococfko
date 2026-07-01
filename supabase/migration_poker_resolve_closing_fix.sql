-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — FIX: poker_resolve_closing must NO-OP unless the table is actually 'closing'
-- ════════════════════════════════════════════════════════════════════════════════════
-- Bug (found by the multiplayer E2E): settle_hand()'s TS caller invokes poker_resolve_closing
-- after EVERY hand settles ("resolve the closure now that no hand is live"), trusting the RPC to
-- self-guard. But the lifecycle version of poker_resolve_closing cashed out and emptied EVERY
-- occupied seat unconditionally — so after any normal hand on an OPEN table, all players were
-- cashed out and the table was vacated. (The SQL harness never caught this: it only ever called
-- resolve_closing AFTER explicitly marking the table 'closing'; and the coin-conservation E2E
-- calls poker_settle_hand directly, bypassing the TS settle path that fires resolve_closing.)
--
-- Fix: resolve_closing is named for — and only valid on — a table the host/reaper has marked
-- 'closing' (poker_close_table sets that; a live hand defers the cash-out to settlement). On any
-- other status it must be a pure NO-OP. Additive CREATE OR REPLACE; no schema change. (CLOSE-001)
-- ════════════════════════════════════════════════════════════════════════════════════

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

  -- ONLY a table the host/reaper has put into 'closing' may be cashed out here. settle_hand()
  -- calls this after every hand; on a still-open (or already-closed) table it must NO-OP, else
  -- every settled hand would cash out all players and empty the table. (CLOSE-001)
  IF t.status <> 'closing' THEN
    RETURN jsonb_build_object('ok', true, 'status', t.status, 'noop', true);
  END IF;

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
