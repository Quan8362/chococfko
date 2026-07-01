-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — Migration 5/5: HAND ENGINE ↔ DB WIRING (atomic start / commit / pause)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Phase P3 connects the pure NLHE engine (lib/games/poker, fully unit-tested) to the
-- authoritative persistence spine. The TypeScript server (service role) is the ONLY thing
-- that runs the engine: it shuffles with a CSPRNG, computes the next state, and hands a
-- pre-computed, conservation-checked PATCH to these RPCs. The RPCs own ATOMICITY +
-- compare-and-swap + IDEMPOTENCY so concurrent or duplicated commands can never double-apply,
-- reshuffle, redeal, or mint coins. Settlement reuses the approved poker_settle_hand /
-- poker_refund_hand RPCs from migration_poker_economy.sql.
--
-- Apply AFTER poker_core → poker_private → poker_economy → poker_lifecycle. Strictly additive,
-- idempotent, non-destructive. Touches NO existing TLMN/Caro/wallet object.
--
-- PRIVACY: engine_state is the canonical serialized HandState (the resume source of truth). It
-- carries the revealed board + PUBLIC betting bookkeeping only — NEVER a hole card or an undealt
-- deck card. Even so it lives in its OWN server-only table (poker_hand_state): NOT in the
-- realtime publication and with NO client policy, so the per-action realtime broadcast on
-- poker_hands stays lean and the engine blob never crosses the wire. Clients reconstruct the
-- table from fetchTableState (public columns) + fetchMyHoleCards (read-own) + fetchLegalActions.
-- These RPCs are service-role only — the browser never reaches them.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 1. poker_hand_state — server-only canonical resume snapshot (no policy, not published) ─
CREATE TABLE IF NOT EXISTS public.poker_hand_state (
  hand_id      uuid PRIMARY KEY REFERENCES public.poker_hands(id) ON DELETE CASCADE,
  table_id     uuid NOT NULL REFERENCES public.poker_tables(id) ON DELETE CASCADE,
  engine_state jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.poker_hand_state ENABLE ROW LEVEL SECURITY;   -- no policy → opaque to clients
REVOKE ALL ON public.poker_hand_state FROM anon, authenticated;  -- service role only
-- (Deliberately NOT added to the supabase_realtime publication.)

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 2. poker_start_hand — atomically begin one hand (deal already computed server-side) ──
-- The server has: advanced the button, posted blinds, securely shuffled, and dealt — all in
-- TypeScript via the pure engine. This RPC PERSISTS that result atomically and idempotently.
-- It activates pending top-ups (folded into the starting stack by the caller's math) and
-- asserts per-seat coin conservation so a server bug can never create or destroy chips.
--
-- p_seats      : [{seat_index, user_id, stack, committed_this_street, committed_total, all_in}]
--                (post-blind state; stack already net of the blind + inclusive of pending top-up)
-- p_hole       : [{seat_index, user_id, cards:[c1,c2]}]
-- p_deck       : {stub:[...52], seed:<bigint-as-number/text>, deal_index:int, burns:[...]}
-- p_blinds     : [{seat_index, user_id, type:'post_sb'|'post_bb', amount}]
CREATE OR REPLACE FUNCTION public.poker_start_hand(
  p_table_id      uuid,
  p_hand_no       int,
  p_button_seat   int,
  p_turn_seat     int,
  p_turn_deadline timestamptz,
  p_current_bet   bigint,
  p_min_raise     bigint,
  p_last_full_raise bigint,
  p_pots          jsonb,
  p_engine_state  jsonb,
  p_seats         jsonb,
  p_hole          jsonb,
  p_deck          jsonb,
  p_blinds        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t        public.poker_tables%ROWTYPE;
  v_hand   uuid;
  rec      record;
  s        public.poker_seats%ROWTYPE;
  v_old    bigint;
  v_new    bigint;
  v_seq    int := 0;
BEGIN
  SELECT * INTO t FROM public.poker_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'table_not_found'; END IF;
  IF t.status <> 'open' THEN RAISE EXCEPTION 'table_not_open'; END IF;

  -- Idempotency: a hand is already live, OR this hand_no already exists (a retried start).
  IF t.current_hand_id IS NOT NULL THEN
    PERFORM 1 FROM public.poker_hands h
      WHERE h.id = t.current_hand_id
        AND h.phase IN ('STARTING','BETTING','SHOWDOWN','SETTLEMENT');
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'hand_id', t.current_hand_id);
    END IF;
  END IF;
  SELECT id INTO v_hand FROM public.poker_hands
    WHERE table_id = p_table_id AND hand_no = p_hand_no;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'hand_id', v_hand);
  END IF;

  -- Insert the public hand row (BETTING / PREFLOP).
  INSERT INTO public.poker_hands (
    table_id, hand_no, phase, street, board, pots, button_seat, turn_seat,
    turn_started_at, turn_deadline, current_bet, min_raise, last_full_raise,
    action_seq, state_version
  ) VALUES (
    p_table_id, p_hand_no, 'BETTING', 'PREFLOP', '[]'::jsonb, COALESCE(p_pots,'{}'::jsonb),
    p_button_seat, p_turn_seat, now(), p_turn_deadline, p_current_bet, p_min_raise,
    p_last_full_raise, 0, 0
  )
  RETURNING id INTO v_hand;

  -- Canonical resume snapshot (server-only).
  INSERT INTO public.poker_hand_state (hand_id, table_id, engine_state)
    VALUES (v_hand, p_table_id, p_engine_state);

  -- Apply each dealt-in seat's post-blind state, asserting coin conservation.
  -- Invariant: new(stack + committed_total) == old(stack + pending_topup). Pending top-ups are
  -- ACTIVATED here (folded into the live stack) so they play from this hand (TOPUP-001).
  FOR rec IN
    SELECT (e->>'seat_index')::int AS seat,
           (e->>'user_id')::uuid   AS uid,
           (e->>'stack')::bigint    AS stack,
           (e->>'committed_this_street')::bigint AS cts,
           (e->>'committed_total')::bigint AS ct,
           COALESCE((e->>'all_in')::boolean, false) AS allin
    FROM jsonb_array_elements(p_seats) e
    ORDER BY (e->>'seat_index')::int
  LOOP
    SELECT * INTO s FROM public.poker_seats
      WHERE table_id = p_table_id AND seat_index = rec.seat FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'seat_not_found seat=%', rec.seat; END IF;
    IF s.user_id IS DISTINCT FROM rec.uid THEN RAISE EXCEPTION 'seat_user_mismatch seat=%', rec.seat; END IF;

    v_old := s.stack + s.pending_topup;
    v_new := rec.stack + rec.ct;
    IF v_old <> v_new THEN
      RAISE EXCEPTION 'start_not_conserved seat=% old=% new=%', rec.seat, v_old, v_new;
    END IF;

    UPDATE public.poker_seats
      SET stack = rec.stack, pending_topup = 0,
          committed_this_street = rec.cts, committed_total = rec.ct,
          all_in = rec.allin, last_action = NULL
      WHERE table_id = p_table_id AND seat_index = rec.seat;
  END LOOP;

  -- Persist private hole cards (read-own) and the server-only deck.
  FOR rec IN
    SELECT (e->>'seat_index')::int AS seat, (e->>'user_id')::uuid AS uid, e->'cards' AS cards
    FROM jsonb_array_elements(p_hole) e
  LOOP
    INSERT INTO public.poker_hole_cards (hand_id, table_id, seat_index, user_id, cards)
      VALUES (v_hand, p_table_id, rec.seat, rec.uid, rec.cards)
      ON CONFLICT (hand_id, seat_index) DO NOTHING;
  END LOOP;

  INSERT INTO public.poker_deck (hand_id, table_id, stub, deal_index, burns, seed)
    VALUES (
      v_hand, p_table_id,
      p_deck->'stub',
      COALESCE((p_deck->>'deal_index')::int, 0),
      COALESCE(p_deck->'burns','[]'::jsonb),
      COALESCE((p_deck->>'seed')::bigint, 0)
    )
    ON CONFLICT (hand_id) DO NOTHING;

  -- Audit the forced blinds (own seq space; NOT the engine action counter).
  FOR rec IN
    SELECT (e->>'seat_index')::int AS seat, (e->>'user_id')::uuid AS uid,
           (e->>'type') AS typ, (e->>'amount')::bigint AS amt
    FROM jsonb_array_elements(COALESCE(p_blinds,'[]'::jsonb)) e
  LOOP
    INSERT INTO public.poker_actions (hand_id, table_id, seat_index, user_id, street, action_seq, type, amount)
      VALUES (v_hand, p_table_id, rec.seat, rec.uid, 'PREFLOP', v_seq, rec.typ, rec.amt);
    v_seq := v_seq + 1;
  END LOOP;

  UPDATE public.poker_tables
    SET current_hand_id = v_hand, state_version = state_version + 1
    WHERE id = p_table_id;

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'hand_id', v_hand);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 3. poker_commit_action — the ATOMIC compare-and-swap heart ────────────────────────
-- Persists ONE engine transition (a player action, or an auto street-advance / showdown set-up)
-- atomically with:
--   • CAS on action_seq  → a stale/duplicate command (wrong expected_seq) is rejected, never
--                           double-applied (refresh-safe, EC-H2).
--   • idempotency key     → a retried player action with the same key is a NO-OP.
--   • per-seat conservation→ new(stack+committed_total) == old(stack+committed_total): a betting
--                            action only moves chips stack→pot WITHIN a seat, never mints coins.
-- The caller passes the already-validated NEW state (computed by the pure engine). This RPC
-- does NOT re-run poker rules; it guarantees the transition is applied exactly once.
--
-- p_hand    : {phase, street, board, pots, reveal, turn_seat, turn_deadline, turn_started_at,
--              current_bet, min_raise, last_full_raise, action_seq, engine_state}
-- p_seats   : [{seat_index, stack, committed_this_street, committed_total, all_in, last_action}]
-- p_audit   : null, OR {seat_index, user_id, street, type, amount}  (one action row to log)
CREATE OR REPLACE FUNCTION public.poker_commit_action(
  p_hand_id      uuid,
  p_expected_seq int,
  p_idem         text,
  p_hand         jsonb,
  p_seats        jsonb,
  p_audit        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h        public.poker_hands%ROWTYPE;
  rec      record;
  s        public.poker_seats%ROWTYPE;
  v_seq    int;
  v_new_seq int;
BEGIN
  SELECT * INTO h FROM public.poker_hands WHERE id = p_hand_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'hand_not_found'; END IF;

  IF h.phase IN ('COMPLETED','CANCELLED') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'hand_over', 'action_seq', h.action_seq);
  END IF;
  IF h.phase = 'PAUSED_FOR_REVIEW' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'paused', 'action_seq', h.action_seq);
  END IF;

  -- Idempotency: a duplicate of THIS exact command (same key) already landed → no-op.
  IF p_idem IS NOT NULL AND length(trim(p_idem)) > 0 THEN
    PERFORM 1 FROM public.poker_actions WHERE hand_id = p_hand_id AND idempotency_key = p_idem;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'action_seq', h.action_seq);
    END IF;
  END IF;

  -- Compare-and-swap: reject anything computed against a different (stale) version.
  IF h.action_seq <> p_expected_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stale', 'action_seq', h.action_seq);
  END IF;

  -- Log the action (own audit seq space, after any blind posts). Idempotency key dedupes a retry.
  IF p_audit IS NOT NULL AND p_audit <> 'null'::jsonb THEN
    SELECT COALESCE(MAX(action_seq), -1) + 1 INTO v_seq FROM public.poker_actions WHERE hand_id = p_hand_id;
    INSERT INTO public.poker_actions (hand_id, table_id, seat_index, user_id, street, action_seq, type, amount, idempotency_key)
      VALUES (
        p_hand_id, h.table_id,
        (p_audit->>'seat_index')::int,
        (p_audit->>'user_id')::uuid,
        COALESCE(p_audit->>'street', h.street),
        v_seq,
        (p_audit->>'type'),
        NULLIF(p_audit->>'amount','')::bigint,
        NULLIF(p_idem,'')
      );
  END IF;

  -- Apply seat patches with a per-seat conservation guard.
  FOR rec IN
    SELECT (e->>'seat_index')::int AS seat,
           (e->>'stack')::bigint AS stack,
           (e->>'committed_this_street')::bigint AS cts,
           (e->>'committed_total')::bigint AS ct,
           COALESCE((e->>'all_in')::boolean, false) AS allin,
           NULLIF(e->>'last_action','') AS la
    FROM jsonb_array_elements(COALESCE(p_seats,'[]'::jsonb)) e
    ORDER BY (e->>'seat_index')::int
  LOOP
    SELECT * INTO s FROM public.poker_seats
      WHERE table_id = h.table_id AND seat_index = rec.seat FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'seat_not_found seat=%', rec.seat; END IF;
    IF (s.stack + s.committed_total) <> (rec.stack + rec.ct) THEN
      RAISE EXCEPTION 'commit_not_conserved seat=% old=% new=%',
        rec.seat, s.stack + s.committed_total, rec.stack + rec.ct;
    END IF;
    UPDATE public.poker_seats
      SET stack = rec.stack, committed_this_street = rec.cts, committed_total = rec.ct,
          all_in = rec.allin, last_action = rec.la
      WHERE table_id = h.table_id AND seat_index = rec.seat;
  END LOOP;

  -- Update the public hand state. action_seq advances to the engine's new counter.
  v_new_seq := COALESCE((p_hand->>'action_seq')::int, h.action_seq + 1);
  UPDATE public.poker_hands SET
    phase           = COALESCE(p_hand->>'phase', phase),
    street          = COALESCE(p_hand->>'street', street),
    board           = COALESCE(p_hand->'board', board),
    pots            = COALESCE(p_hand->'pots', pots),
    reveal          = CASE WHEN p_hand ? 'reveal' THEN p_hand->'reveal' ELSE reveal END,
    turn_seat       = CASE WHEN p_hand ? 'turn_seat' THEN NULLIF(p_hand->>'turn_seat','')::int ELSE turn_seat END,
    turn_started_at = CASE WHEN p_hand ? 'turn_started_at' THEN NULLIF(p_hand->>'turn_started_at','')::timestamptz ELSE turn_started_at END,
    turn_deadline   = CASE WHEN p_hand ? 'turn_deadline' THEN NULLIF(p_hand->>'turn_deadline','')::timestamptz ELSE turn_deadline END,
    current_bet     = COALESCE((p_hand->>'current_bet')::bigint, current_bet),
    min_raise       = COALESCE((p_hand->>'min_raise')::bigint, min_raise),
    last_full_raise = COALESCE((p_hand->>'last_full_raise')::bigint, last_full_raise),
    action_seq      = v_new_seq,
    state_version   = state_version + 1
    WHERE id = p_hand_id;

  -- Canonical resume snapshot (server-only; upsert so resume always reflects the latest state).
  IF p_hand ? 'engine_state' THEN
    INSERT INTO public.poker_hand_state (hand_id, table_id, engine_state, updated_at)
      VALUES (p_hand_id, h.table_id, p_hand->'engine_state', now())
      ON CONFLICT (hand_id) DO UPDATE SET engine_state = EXCLUDED.engine_state, updated_at = now();
  END IF;

  UPDATE public.poker_tables SET state_version = state_version + 1 WHERE id = h.table_id;

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'action_seq', v_new_seq);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 4. poker_pause_hand — freeze an uncertain hand for admin review (never guess) ─────
-- Used when the server detects an impossible/inconsistent state at settlement (e.g. a missing
-- hole card for a contender). It does NOT move coins and does NOT guess a winner — it parks the
-- hand in PAUSED_FOR_REVIEW and records an incident. Recovery is an explicit admin action.
CREATE OR REPLACE FUNCTION public.poker_pause_hand(p_hand_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.poker_hands%ROWTYPE;
BEGIN
  SELECT * INTO h FROM public.poker_hands WHERE id = p_hand_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'hand_not_found'; END IF;
  IF h.phase IN ('COMPLETED','CANCELLED') THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'phase', h.phase);
  END IF;

  UPDATE public.poker_hands
    SET phase = 'PAUSED_FOR_REVIEW', turn_seat = NULL, turn_deadline = NULL,
        state_version = state_version + 1
    WHERE id = p_hand_id;
  UPDATE public.poker_tables SET state_version = state_version + 1 WHERE id = h.table_id;

  INSERT INTO public.poker_incidents (table_id, hand_id, kind, severity, detail)
    VALUES (h.table_id, p_hand_id, 'pause_for_review', 'error',
            jsonb_build_object('reason', COALESCE(p_reason,'unspecified')));

  RETURN jsonb_build_object('ok', true, 'phase', 'PAUSED_FOR_REVIEW');
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 5. Grants — service role ONLY. The browser must never reach the engine RPCs. ──────
REVOKE ALL ON FUNCTION public.poker_start_hand(uuid, int, int, int, timestamptz, bigint, bigint, bigint, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poker_commit_action(uuid, int, text, jsonb, jsonb, jsonb)                                                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poker_pause_hand(uuid, text)                                                                                       FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poker_start_hand(uuid, int, int, int, timestamptz, bigint, bigint, bigint, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_commit_action(uuid, int, text, jsonb, jsonb, jsonb)                                                            TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_pause_hand(uuid, text)                                                                                         TO service_role;

NOTIFY pgrst, 'reload schema';
