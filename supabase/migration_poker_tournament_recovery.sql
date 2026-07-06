-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — TOURNAMENT RECOVERY (resilient next-hand + started-tournament refund) — 27G-F1
-- ════════════════════════════════════════════════════════════════════════════════════
-- Strictly ADDITIVE + IDEMPOTENT. Closes the two production blockers found by 27G-F-CC:
--
--   1. NEXT-HAND WEDGE. The server opens the next hand by (a) inserting the hand row
--      (poker_tournament_start_hand, already idempotent) then (b) writing the initial engine
--      `state` jsonb. Step (b) was a bare UPDATE keyed only by hand id — two concurrent openers,
--      or a stale retry that raced a player's first action, could clobber an in-progress log back
--      to empty. This migration adds poker_tournament_init_hand_state: an ATOMIC, guarded
--      state-init that writes ONLY when the row is still uninitialized (state->'config' IS NULL)
--      and unsettled. Concurrent / retried / stale callers converge on exactly one hand and can
--      NEVER overwrite a live action log. It creates NO hand — creation stays in start_hand.
--
--   2. NO SAFE REFUND FOR A STARTED TOURNAMENT. Pre-start unregister refunds a single entry;
--      settlement needs a champion. A started tournament that cannot continue had NO safe operator
--      recovery — plain Cancel stranded escrowed entry fees. This migration adds
--      poker_tournament_recover_refund: an operator/service-role-only DEFINER RPC that refunds
--      every still-escrowed entry EXACTLY ONCE (row-locked, idempotent by txn key AND the existing
--      payouts unique key), credits the audited 'poker_tournament_refund' ledger reason, creates NO
--      prize payout, drives the tournament to terminal CANCELLED, and refuses to run once any prize
--      payout exists. It also hardens poker_tournament_settle to refuse a CANCELLED tournament
--      (belt-and-braces: a refunded tournament can never be settled afterward).
--
-- WALLET ISOLATION preserved for the next-hand path (init_hand_state touches ONLY the hand row).
-- The refund path is the ONLY coin crossing here and uses the SAME pattern as the base
-- unregister/settle RPCs: wallet debit/credit is row-locked, integer, idempotent, audited.
--
-- AUTHORITY: both new RPCs are SECURITY DEFINER, service_role-only (REVOKE from anon+authenticated).
-- Apply AFTER migration_poker_tournament.sql + _orchestration.sql + _realtime.sql. Local-validated
-- (poker_tournament_recovery_tests.sql) before any prod apply; prod apply is a separate controlled
-- phase (never reapplied blindly). Rollback: migration_poker_tournament_recovery_rollback.sql.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 1. RPC: init_hand_state — ATOMIC, guarded initial write of a hand's engine state ────
-- The server computes the deterministic engine config (seed = f(tournament seed, table, hand#),
-- button, seat stacks) and passes it here. This writes it ONLY while the hand row is still
-- uninitialized ('{}' or no config) and unsettled. A concurrent opener, a stale retry, or a
-- late duplicate can therefore never clobber an in-progress action log or a settled hand — the
-- WHERE clause is the single atomic guard (the UPDATE row-locks the matched row). Returns true iff
-- THIS call performed the initialization (false = someone already initialized / it is settled).
-- ════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.poker_tournament_init_hand_state(
  p_hand_id uuid, p_tournament_id uuid, p_state jsonb
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.poker_tournament_hands
    SET state = p_state
    WHERE id = p_hand_id
      AND tournament_id = p_tournament_id
      AND settled = false
      AND (state = '{}'::jsonb OR (state -> 'config') IS NULL);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 2. RPC: recover_refund — safe operator refund for a STARTED tournament ──────────────
-- Refunds every entry that still holds escrow (state NOT IN WITHDRAWN/PAID) EXACTLY ONCE and moves
-- the tournament to terminal CANCELLED. Guards:
--   • service_role only (grants below) — a participant can NEVER invoke it.
--   • refuses COMPLETED (settlement done) and refuses any tournament that already has a 'prize'
--     payout (cannot refund an already-paid tournament).
--   • idempotent by the txn key (a retried call refunds nothing more) AND by the payouts unique
--     (tournament_id, entry_id, kind='refund') key (a per-entry second guard).
--   • row-locks the tournament, each entry, and each wallet; integer coins; never negative.
--   • NO prize/place payout row is created — only refund rows (the established once-only marker,
--     identical to pre-start unregister). Reason 'poker_tournament_refund' (approved).
-- Returns the number of entries refunded.
-- ════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.poker_tournament_recover_refund(
  p_tournament_id uuid, p_actor uuid, p_idempotency_key text
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t        public.poker_tournaments%ROWTYPE;
  v_prizes int;
  r        record;
  v_bal    bigint;
  v_count  int := 0;
  v_total  bigint := 0;
BEGIN
  -- Idempotency: claim the key first. A retried recovery (same key) refunds nothing more.
  INSERT INTO public.poker_tournament_txn (idempotency_key, tournament_id, kind)
    VALUES (p_idempotency_key, p_tournament_id, 'recover_refund')
    ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN
    PERFORM 1 FROM public.poker_tournament_txn
      WHERE idempotency_key = p_idempotency_key AND tournament_id = p_tournament_id AND kind = 'recover_refund';
    IF NOT FOUND THEN RAISE EXCEPTION 'idempotency key % reused across tournament/operation', p_idempotency_key; END IF;
    RETURN 0;   -- retried recovery: no extra refunds
  END IF;

  SELECT * INTO t FROM public.poker_tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament not found'; END IF;

  -- Never after a successful settlement / any prize payout.
  IF t.state = 'COMPLETED' THEN RAISE EXCEPTION 'recover_refund: tournament already settled'; END IF;
  SELECT COUNT(*) INTO v_prizes FROM public.poker_tournament_payouts
    WHERE tournament_id = p_tournament_id AND kind = 'prize';
  IF v_prizes > 0 THEN RAISE EXCEPTION 'recover_refund: tournament has prize payouts (cannot refund)'; END IF;

  -- Refund each still-escrowed entry once (WITHDRAWN was already refunded pre-start; PAID already
  -- received a prize — both are excluded). Deterministic order for a stable audit.
  FOR r IN
    SELECT id AS entry_id, user_id, entry_fee
    FROM public.poker_tournament_entries
    WHERE tournament_id = p_tournament_id AND state NOT IN ('WITHDRAWN','PAID')
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    -- Once-only refund guard: record the refund row; skip the credit if it already existed.
    INSERT INTO public.poker_tournament_payouts (tournament_id, entry_id, user_id, place, amount, kind)
      VALUES (p_tournament_id, r.entry_id, r.user_id, NULL, r.entry_fee, 'refund')
      ON CONFLICT (tournament_id, entry_id, kind) DO NOTHING;
    IF NOT FOUND THEN CONTINUE; END IF;   -- already refunded → no double credit

    IF r.entry_fee > 0 THEN
      SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = r.user_id FOR UPDATE;
      IF v_bal IS NULL THEN
        INSERT INTO public.game_wallets (user_id, balance) VALUES (r.user_id, 0)
          ON CONFLICT (user_id) DO NOTHING;
        v_bal := 0;
      END IF;
      v_bal := v_bal + r.entry_fee;
      UPDATE public.game_wallets SET balance = v_bal WHERE user_id = r.user_id;
      INSERT INTO public.coin_ledger (user_id, game_code, delta, reason, balance_after)
        VALUES (r.user_id, 'poker', r.entry_fee, 'poker_tournament_refund', v_bal);
      v_total := v_total + r.entry_fee;
    END IF;

    -- Terminal per-entry state: WITHDRAWN = refunded / out of the pool (same meaning as pre-start
    -- unregister). settle bars WITHDRAWN from payment and the prize-pool excludes it.
    UPDATE public.poker_tournament_entries SET state = 'WITHDRAWN', chips = 0 WHERE id = r.entry_id;
    v_count := v_count + 1;
  END LOOP;

  -- Terminal recovery state: CANCELLED (never COMPLETED — there is no champion and no prize).
  UPDATE public.poker_tournaments
    SET state = 'CANCELLED', cancelled_at = COALESCE(cancelled_at, now())
    WHERE id = p_tournament_id;

  INSERT INTO public.poker_tournament_audit (tournament_id, event, actor, detail)
    VALUES (p_tournament_id, 'recover_refund', p_actor,
      jsonb_build_object('refunded_entries', v_count, 'refunded_total', v_total, 'from_state', t.state));
  RETURN v_count;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 3. Harden settle: a CANCELLED (recovery-refunded) tournament can never be settled ──
-- Forward patch of poker_tournament_settle (base migration) adding ONE guard: reject a CANCELLED
-- tournament. Everything else is verbatim from migration_poker_tournament.sql §7. This guarantees
-- "settlement rejected after refund" at the authoritative DB layer, not only the server action.
-- ════════════════════════════════════════════════════════════════════════════════════
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
    RETURN;   -- retried settlement (same key): no extra credits
  END IF;

  SELECT * INTO t FROM public.poker_tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament not found'; END IF;
  -- A fully-settled tournament is terminal: refuse a fresh settle request.
  IF t.state = 'COMPLETED' THEN RAISE EXCEPTION 'tournament already settled'; END IF;
  -- A recovery-refunded tournament is terminal CANCELLED: it holds no escrow and has no champion,
  -- so it can NEVER be settled afterward (27G-F1 refund safety).
  IF t.state = 'CANCELLED' THEN RAISE EXCEPTION 'tournament cancelled — cannot settle'; END IF;

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

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 4. Grants — both new RPCs are service_role ONLY (server-authoritative) ──────────────
-- ════════════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.poker_tournament_init_hand_state(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poker_tournament_recover_refund(uuid, uuid, text)   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poker_tournament_init_hand_state(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_tournament_recover_refund(uuid, uuid, text)   TO service_role;
-- settle re-declared above: re-assert its grants (unchanged from the base migration).
REVOKE ALL ON FUNCTION public.poker_tournament_settle(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poker_tournament_settle(uuid, jsonb, text) TO service_role;

-- ════════════════════════════════════════════════════════════════════════════════════
-- Done. Apply AFTER the three prior tournament migrations. Rollback:
-- migration_poker_tournament_recovery_rollback.sql
-- ════════════════════════════════════════════════════════════════════════════════════
