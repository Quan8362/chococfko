-- ════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — POKER TOURNAMENT RECOVERY (27G-F1)
-- (migration_poker_tournament_recovery.sql)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Reverses the recovery migration. IDEMPOTENT. Drops the two new RPCs (init_hand_state,
-- recover_refund) and RESTORES poker_tournament_settle to its base-migration body (removing the
-- CANCELLED guard). Data written by a recovery-refund run (refund ledger rows, WITHDRAWN entries,
-- CANCELLED tournament) is append-only history and is intentionally NOT reversed — undoing a real
-- refund would double-spend. Only the CODE is rolled back.
-- ════════════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.poker_tournament_init_hand_state(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.poker_tournament_recover_refund(uuid, uuid, text);

-- Restore poker_tournament_settle to the base migration body (no CANCELLED guard).
CREATE OR REPLACE FUNCTION public.poker_tournament_settle(
  p_tournament_id uuid,
  p_payouts jsonb,
  p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t          public.poker_tournaments%ROWTYPE;
  v_pool     bigint;
  v_collected bigint;
  v_sum      bigint;
  r          jsonb;
  v_bal      bigint;
  v_amount   bigint;
  v_user     uuid;
  v_entry    uuid;
  v_kind     text;
  v_reason   text;
  v_estate   text;
BEGIN
  INSERT INTO public.poker_tournament_txn (idempotency_key, tournament_id, kind)
    VALUES (p_idempotency_key, p_tournament_id, 'settle')
    ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN
    PERFORM 1 FROM public.poker_tournament_txn
      WHERE idempotency_key = p_idempotency_key AND tournament_id = p_tournament_id AND kind = 'settle';
    IF NOT FOUND THEN RAISE EXCEPTION 'idempotency key % reused across tournament/operation', p_idempotency_key; END IF;
    RETURN;
  END IF;

  SELECT * INTO t FROM public.poker_tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament not found'; END IF;
  IF t.state = 'COMPLETED' THEN RAISE EXCEPTION 'tournament already settled'; END IF;

  v_pool := public.poker_tournament_prize_pool(p_tournament_id);
  SELECT COALESCE(SUM(entry_fee), 0) INTO v_collected FROM public.poker_tournament_entries
    WHERE tournament_id = p_tournament_id AND state <> 'WITHDRAWN';
  SELECT COALESCE(SUM((x->>'amount')::bigint), 0) INTO v_sum
    FROM jsonb_array_elements(p_payouts) x;
  IF v_sum <> v_pool THEN
    RAISE EXCEPTION 'payout does not conserve pool (sum=% pool=%)', v_sum, v_pool;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_payouts) LOOP
    v_amount := (r->>'amount')::bigint;
    v_user   := (r->>'user_id')::uuid;
    v_entry  := (r->>'entry_id')::uuid;
    v_kind   := COALESCE(r->>'kind', 'prize');
    IF v_amount < 0 THEN RAISE EXCEPTION 'negative payout'; END IF;
    v_reason := CASE WHEN v_kind = 'refund' THEN 'poker_tournament_refund' ELSE 'poker_tournament_prize' END;

    SELECT state INTO v_estate FROM public.poker_tournament_entries
      WHERE id = v_entry AND tournament_id = p_tournament_id FOR UPDATE;
    IF v_estate IS NULL THEN RAISE EXCEPTION 'settle: unknown entry % for tournament %', v_entry, p_tournament_id; END IF;
    IF v_estate = 'WITHDRAWN' THEN RAISE EXCEPTION 'settle: WITHDRAWN entry % cannot be paid', v_entry; END IF;

    INSERT INTO public.poker_tournament_payouts (tournament_id, entry_id, user_id, place, amount, kind)
      VALUES (p_tournament_id, v_entry, v_user, NULLIF(r->>'place','')::int, v_amount, v_kind)
      ON CONFLICT (tournament_id, entry_id, kind) DO NOTHING;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF v_amount > 0 THEN
      SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = v_user FOR UPDATE;
      IF v_bal IS NULL THEN
        INSERT INTO public.game_wallets (user_id, balance) VALUES (v_user, 0)
          ON CONFLICT (user_id) DO NOTHING;
        v_bal := 0;
      END IF;
      v_bal := v_bal + v_amount;
      UPDATE public.game_wallets SET balance = v_bal WHERE user_id = v_user;
      INSERT INTO public.coin_ledger (user_id, game_code, delta, reason, balance_after)
        VALUES (v_user, 'poker', v_amount, v_reason, v_bal);
    END IF;

    UPDATE public.poker_tournament_entries SET state = 'PAID'
      WHERE id = v_entry AND state IN ('ACTIVE','DISCONNECTED','ELIMINATED');
  END LOOP;

  UPDATE public.poker_tournaments
    SET state = 'COMPLETED', completed_at = now()
    WHERE id = p_tournament_id AND state <> 'COMPLETED';
  INSERT INTO public.poker_tournament_audit (tournament_id, event, actor, detail)
    VALUES (p_tournament_id, 'settle', NULL, jsonb_build_object(
      'pool', v_pool,
      'collected_fees', v_collected,
      'overlay', GREATEST(v_pool - v_collected, 0),
      'rows', jsonb_array_length(p_payouts)));
END;
$$;

REVOKE ALL ON FUNCTION public.poker_tournament_settle(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poker_tournament_settle(uuid, jsonb, text) TO service_role;
