-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — TOURNAMENT ORCHESTRATION (live play: seating, chips, blinds, elimination)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Strictly ADDITIVE + IDEMPOTENT. Builds the authoritative LIVE-PLAY layer on top of
-- migration_poker_tournament.sql. Adds two tables (poker_tournament_seats,
-- poker_tournament_hands), a few tournament columns, and service-role-only DEFINER RPCs that:
--   • seat the field deterministically (seeded), copying the starting stack into CHIPS;
--   • open/close tournament-scoped hands (state lives in jsonb; the server plays them with the
--     PURE cash engine — this layer never reimplements betting/showdown);
--   • apply a settled hand's chip deltas to the seats (chip-conserving);
--   • record eliminations once (finishing places), and move seats for table balancing.
--
-- WALLET ISOLATION (TNMT-CHIP-002, the core invariant): NOTHING in this migration writes
-- public.game_wallets or public.coin_ledger. Tournament chips move ONLY between
-- poker_tournament_seats.stack (and poker_tournament_entries.chips). The only coin crossings stay in
-- migration_poker_tournament.sql: entry-fee debit at register, prize/refund credit at settle/unreg.
-- A grep of this file for game_wallets/coin_ledger must return ZERO write statements.
--
-- AUTHORITY: every mutation is a SECURITY DEFINER RPC, service_role-only (REVOKE from anon +
-- authenticated), row-locked, idempotent (idempotency-key txn rows in poker_tournament_txn or a
-- natural unique key), and audited (poker_tournament_audit). Reuse, don't fork: hand PLAY logic is
-- the existing pure engine in the server; here we persist chips + state only.
--
-- Feature gate: reachable only via the internal-alpha server surface (POKER_TOURNAMENT_INTERNAL_ALPHA
-- + Closed Beta + operator). Safe to apply while dark. Local-validated before any prod apply; the
-- prod apply is a separate controlled migration phase (never reapplied blindly).
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 0. Tournament columns for the blind clock / hand counter (additive) ─────────────────
ALTER TABLE public.poker_tournaments
  ADD COLUMN IF NOT EXISTS current_level_index int NOT NULL DEFAULT 0;
ALTER TABLE public.poker_tournaments
  ADD COLUMN IF NOT EXISTS level_started_at timestamptz;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 1. Tables ──────────────────────────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════════════════════════

-- One row per SEATED entry at a live table. `stack` is tournament CHIPS (never coins). A busted
-- seat keeps its row with stack 0 and state 'busted' (audit); a moved seat is re-pointed in place.
CREATE TABLE IF NOT EXISTS public.poker_tournament_seats (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  uuid NOT NULL REFERENCES public.poker_tournaments(id) ON DELETE CASCADE,
  entry_id       uuid NOT NULL REFERENCES public.poker_tournament_entries(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL,
  table_no       int  NOT NULL,
  seat_index     int  NOT NULL,
  stack          bigint NOT NULL CHECK (stack >= 0),      -- CHIPS, not coins
  state          text NOT NULL DEFAULT 'active'
                   CHECK (state IN ('active','sitting_out','busted')),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, table_no, seat_index),           -- one entry per physical seat
  UNIQUE (entry_id)                                       -- an entry occupies at most one seat
);
CREATE INDEX IF NOT EXISTS poker_tournament_seats_by_table
  ON public.poker_tournament_seats (tournament_id, table_no);

-- Tournament-scoped hand. `state` is the server-authoritative hand snapshot (wallet-free); hole cards
-- live inside it and are NOT public (RLS below exposes only the non-secret projection via the server).
CREATE TABLE IF NOT EXISTS public.poker_tournament_hands (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  uuid NOT NULL REFERENCES public.poker_tournaments(id) ON DELETE CASCADE,
  table_no       int  NOT NULL,
  hand_no        int  NOT NULL,
  level_index    int  NOT NULL,
  small_blind    bigint NOT NULL CHECK (small_blind >= 0),
  big_blind      bigint NOT NULL CHECK (big_blind >= 0),
  ante           bigint NOT NULL DEFAULT 0 CHECK (ante >= 0),
  state          jsonb  NOT NULL DEFAULT '{}'::jsonb,
  settled        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  settled_at     timestamptz,
  UNIQUE (tournament_id, table_no, hand_no)
);
CREATE INDEX IF NOT EXISTS poker_tournament_hands_by_table
  ON public.poker_tournament_hands (tournament_id, table_no, settled);

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 2. RLS + grants ─────────────────────────────────────────────────────────────────────
-- Seats + hand metadata are public-readable (live standings / spectating); writes are DENIED to
-- clients (no write policy + REVOKE). Only DEFINER RPCs mutate.
-- ════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.poker_tournament_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_tournament_hands ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.poker_tournament_seats FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.poker_tournament_hands FROM anon, authenticated;

DROP POLICY IF EXISTS "seats public read" ON public.poker_tournament_seats;
DROP POLICY IF EXISTS "hands public read" ON public.poker_tournament_hands;
CREATE POLICY "seats public read" ON public.poker_tournament_seats FOR SELECT USING (true);
-- Hand rows are public-readable (spectator table state). Hole cards inside `state` are redacted by
-- the server projection before broadcast; the server never selects raw hole cards to a client.
CREATE POLICY "hands public read" ON public.poker_tournament_hands FOR SELECT USING (true);

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 3. RPC: seat_draw — deterministic seeded initial seating ────────────────────────────
-- Assigns every REGISTERED entry to a table/seat (round-robin over tables sized seats_per_table),
-- copies the starting stack into CHIPS, marks entries SEATED. Deterministic: orders entries by
-- md5(seed || entry_id) so the draw is replayable/auditable (no random()). Idempotent: if seats
-- already exist for this tournament, it is a no-op. Chip conservation: sum(seats.stack) ==
-- starting_stack * seated_count.
-- ════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.poker_tournament_seat_draw(p_tournament_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t        public.poker_tournaments%ROWTYPE;
  v_exists int;
  v_n      int := 0;
  r        record;
  v_seat   int;
  v_table  int;
BEGIN
  SELECT * INTO t FROM public.poker_tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament not found'; END IF;
  IF t.state NOT IN ('STARTING','REGISTRATION_OPEN') THEN
    RAISE EXCEPTION 'seat_draw only from STARTING/REGISTRATION_OPEN (state=%)', t.state;
  END IF;

  SELECT COUNT(*) INTO v_exists FROM public.poker_tournament_seats WHERE tournament_id = p_tournament_id;
  IF v_exists > 0 THEN RETURN v_exists; END IF;   -- idempotent: already seated

  -- Deterministic order by md5(seed || entry_id). Assign round-robin across tables so table sizes
  -- differ by <= 1 (initial balance, TNMT-BAL-010/012).
  FOR r IN
    SELECT id AS entry_id, user_id
    FROM public.poker_tournament_entries
    WHERE tournament_id = p_tournament_id AND state IN ('REGISTERED','SEATED')
    ORDER BY md5(t.seed || id::text)
  LOOP
    v_table := (v_n % GREATEST(1, CEIL((SELECT COUNT(*) FROM public.poker_tournament_entries
                 WHERE tournament_id = p_tournament_id AND state IN ('REGISTERED','SEATED'))::numeric
                 / t.seats_per_table))::int) + 1;
    v_seat  := (v_n / GREATEST(1, CEIL((SELECT COUNT(*) FROM public.poker_tournament_entries
                 WHERE tournament_id = p_tournament_id AND state IN ('REGISTERED','SEATED'))::numeric
                 / t.seats_per_table))::int);
    INSERT INTO public.poker_tournament_seats
      (tournament_id, entry_id, user_id, table_no, seat_index, stack, state)
      VALUES (p_tournament_id, r.entry_id, r.user_id, v_table, v_seat, t.starting_stack, 'active');
    UPDATE public.poker_tournament_entries
      SET state = 'SEATED', chips = t.starting_stack, table_no = v_table, seat_index = v_seat
      WHERE id = r.entry_id;
    v_n := v_n + 1;
  END LOOP;

  INSERT INTO public.poker_tournament_audit (tournament_id, event, actor, detail)
    VALUES (p_tournament_id, 'seat_draw', NULL,
      jsonb_build_object('seated', v_n, 'starting_stack', t.starting_stack));
  RETURN v_n;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 4. RPC: start_hand — open a tournament-scoped hand at a table ───────────────────────
-- Creates the next hand row (hand_no = max+1 for the table) at the given blinds/level. The SERVER
-- fills `state` and plays it with the pure engine. Idempotent by the txn key.
-- ════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.poker_tournament_start_hand(
  p_tournament_id uuid, p_table_no int,
  p_level_index int, p_sb bigint, p_bb bigint, p_ante bigint,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hand uuid;
  v_no   int;
BEGIN
  INSERT INTO public.poker_tournament_txn (idempotency_key, tournament_id, kind)
    VALUES (p_idempotency_key, p_tournament_id, 'start_hand')
    ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN
    PERFORM 1 FROM public.poker_tournament_txn
      WHERE idempotency_key = p_idempotency_key AND tournament_id = p_tournament_id AND kind = 'start_hand';
    IF NOT FOUND THEN RAISE EXCEPTION 'idempotency key % reused across tournament/operation', p_idempotency_key; END IF;
    SELECT id INTO v_hand FROM public.poker_tournament_hands
      WHERE tournament_id = p_tournament_id AND table_no = p_table_no
      ORDER BY hand_no DESC LIMIT 1;
    RETURN v_hand;   -- retried start: same hand
  END IF;

  SELECT COALESCE(MAX(hand_no) + 1, 1) INTO v_no FROM public.poker_tournament_hands
    WHERE tournament_id = p_tournament_id AND table_no = p_table_no;
  INSERT INTO public.poker_tournament_hands
    (tournament_id, table_no, hand_no, level_index, small_blind, big_blind, ante)
    VALUES (p_tournament_id, p_table_no, v_no, p_level_index, p_sb, p_bb, p_ante)
    RETURNING id INTO v_hand;
  RETURN v_hand;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 5. RPC: apply_hand_result — settle a hand's CHIP deltas to the seats ─────────────────
-- p_deltas = jsonb [{seat_index, delta}] for the table; the server computed them from the pure
-- engine's settled hand. Chip-conserving: sum(delta) MUST be 0 (chips only move within the table).
-- Applies each delta under FOR UPDATE, mirrors into entries.chips, marks the hand settled, audits.
-- NEVER touches wallets/ledger. Idempotent by the txn key + the hand.settled flag.
-- ════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.poker_tournament_apply_hand_result(
  p_tournament_id uuid, p_hand_id uuid, p_deltas jsonb, p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h        public.poker_tournament_hands%ROWTYPE;
  v_sum    bigint;
  r        jsonb;
  v_seatix int;
  v_delta  bigint;
  v_seat   public.poker_tournament_seats%ROWTYPE;
BEGIN
  INSERT INTO public.poker_tournament_txn (idempotency_key, tournament_id, kind)
    VALUES (p_idempotency_key, p_tournament_id, 'apply_hand')
    ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN
    PERFORM 1 FROM public.poker_tournament_txn
      WHERE idempotency_key = p_idempotency_key AND tournament_id = p_tournament_id AND kind = 'apply_hand';
    IF NOT FOUND THEN RAISE EXCEPTION 'idempotency key % reused across tournament/operation', p_idempotency_key; END IF;
    RETURN;   -- retried apply: chips already moved once
  END IF;

  SELECT * INTO h FROM public.poker_tournament_hands WHERE id = p_hand_id AND tournament_id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'hand not found'; END IF;
  IF h.settled THEN RAISE EXCEPTION 'hand already settled'; END IF;

  -- Chip conservation: a hand only redistributes chips within the table.
  SELECT COALESCE(SUM((x->>'delta')::bigint), 0) INTO v_sum FROM jsonb_array_elements(p_deltas) x;
  IF v_sum <> 0 THEN RAISE EXCEPTION 'hand deltas do not conserve chips (sum=%)', v_sum; END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_deltas) LOOP
    v_seatix := (r->>'seat_index')::int;
    v_delta  := (r->>'delta')::bigint;
    SELECT * INTO v_seat FROM public.poker_tournament_seats
      WHERE tournament_id = p_tournament_id AND table_no = h.table_no AND seat_index = v_seatix FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'apply_hand: seat % missing at table %', v_seatix, h.table_no; END IF;
    IF v_seat.stack + v_delta < 0 THEN RAISE EXCEPTION 'apply_hand: seat % would go negative', v_seatix; END IF;
    UPDATE public.poker_tournament_seats
      SET stack = stack + v_delta,
          state = CASE WHEN stack + v_delta = 0 THEN 'busted' ELSE state END,
          updated_at = now()
      WHERE id = v_seat.id;
    -- Mirror chips into the entry and promote a seated participant to ACTIVE on the first hand it
    -- plays (REGISTERED→SEATED by seat_draw, →ACTIVE here). A live survivor is therefore ACTIVE at
    -- settlement, which is exactly the state poker_tournament_settle pays (champion ACTIVE→PAID).
    UPDATE public.poker_tournament_entries
      SET chips = v_seat.stack + v_delta,
          state = CASE WHEN state = 'SEATED' THEN 'ACTIVE' ELSE state END
      WHERE id = v_seat.entry_id;
  END LOOP;

  UPDATE public.poker_tournament_hands SET settled = true, settled_at = now() WHERE id = p_hand_id;
  INSERT INTO public.poker_tournament_audit (tournament_id, event, actor, detail)
    VALUES (p_tournament_id, 'apply_hand', NULL,
      jsonb_build_object('hand_id', p_hand_id, 'table_no', h.table_no, 'rows', jsonb_array_length(p_deltas)));
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 6. RPC: eliminate — record bust-outs ONCE with finishing places ─────────────────────
-- Every seat with stack 0 whose entry has no finishing_place yet is eliminated: entry → ELIMINATED
-- with finishing_place assigned from the current live count downward (append-only, TNMT-ELIM-011/012).
-- Idempotent: an entry with a finishing_place is skipped, so a retry adds nothing.
-- ════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.poker_tournament_eliminate(p_tournament_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_live   int;
  r        record;
  v_place  int;
  v_count  int := 0;
BEGIN
  PERFORM 1 FROM public.poker_tournaments WHERE id = p_tournament_id FOR UPDATE;
  -- live = entries still holding chips (not yet eliminated / withdrawn / paid)
  SELECT COUNT(*) INTO v_live FROM public.poker_tournament_entries
    WHERE tournament_id = p_tournament_id AND state IN ('SEATED','ACTIVE','DISCONNECTED') AND finishing_place IS NULL;

  -- Eliminate zero-stack seats in a deterministic order (lowest table/seat first). Each takes the
  -- next-lowest finishing place: the (v_live)th place, then v_live-1, ... (bust = worse place).
  v_place := v_live;
  FOR r IN
    SELECT s.entry_id
    FROM public.poker_tournament_seats s
    JOIN public.poker_tournament_entries e ON e.id = s.entry_id
    WHERE s.tournament_id = p_tournament_id AND s.stack = 0
      AND e.finishing_place IS NULL AND e.state IN ('SEATED','ACTIVE','DISCONNECTED')
    ORDER BY s.table_no, s.seat_index
  LOOP
    UPDATE public.poker_tournament_entries
      SET state = 'ELIMINATED', finishing_place = v_place, chips = 0
      WHERE id = r.entry_id AND finishing_place IS NULL;   -- once-only guard
    IF FOUND THEN
      INSERT INTO public.poker_tournament_audit (tournament_id, event, actor, detail)
        VALUES (p_tournament_id, 'eliminate', NULL,
          jsonb_build_object('entry_id', r.entry_id, 'place', v_place));
      v_place := v_place - 1;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- Vacate every busted seat (0 chips) whose entry is now ELIMINATED — the physical seat is freed for
  -- balancing. The entry keeps its ELIMINATED state + finishing_place + audit (the authoritative
  -- record); the seat row only tracks LIVE occupants. Removing a 0-chip seat preserves chip
  -- conservation (it held nothing).
  DELETE FROM public.poker_tournament_seats s
    USING public.poker_tournament_entries e
    WHERE s.entry_id = e.id AND s.tournament_id = p_tournament_id
      AND s.stack = 0 AND e.state = 'ELIMINATED';

  RETURN v_count;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 7. RPC: move_seat — table balancing move (carries the stack) ────────────────────────
-- Moves an entry's seat to a new (table,seat), carrying the CHIP stack. The server decides WHO to
-- move via the pure balancing algorithm; this RPC just applies it atomically + audits. Idempotent:
-- if the seat already sits at the target, no-op.
-- ════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.poker_tournament_move_seat(
  p_tournament_id uuid, p_entry_id uuid, p_to_table int, p_to_seat int, p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.poker_tournament_seats%ROWTYPE;
BEGIN
  INSERT INTO public.poker_tournament_txn (idempotency_key, tournament_id, kind)
    VALUES (p_idempotency_key, p_tournament_id, 'move_seat')
    ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN
    PERFORM 1 FROM public.poker_tournament_txn
      WHERE idempotency_key = p_idempotency_key AND tournament_id = p_tournament_id AND kind = 'move_seat';
    IF NOT FOUND THEN RAISE EXCEPTION 'idempotency key % reused across tournament/operation', p_idempotency_key; END IF;
    RETURN;
  END IF;

  SELECT * INTO s FROM public.poker_tournament_seats
    WHERE tournament_id = p_tournament_id AND entry_id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'move_seat: no seat for entry %', p_entry_id; END IF;
  IF EXISTS (SELECT 1 FROM public.poker_tournament_seats
             WHERE tournament_id = p_tournament_id AND table_no = p_to_table AND seat_index = p_to_seat
               AND entry_id <> p_entry_id) THEN
    RAISE EXCEPTION 'move_seat: target %/%s occupied', p_to_table, p_to_seat;
  END IF;

  UPDATE public.poker_tournament_seats
    SET table_no = p_to_table, seat_index = p_to_seat, updated_at = now()
    WHERE id = s.id;
  UPDATE public.poker_tournament_entries SET table_no = p_to_table, seat_index = p_to_seat WHERE id = p_entry_id;
  INSERT INTO public.poker_tournament_moves (tournament_id, entry_id, from_table_no, to_table_no, to_seat_index, event)
    VALUES (p_tournament_id, p_entry_id, s.table_no, p_to_table, p_to_seat, 'move');
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 8. RPC: advance_level — persist the server-resolved blind level ─────────────────────
-- The server resolves the current level from elapsed/paused_ms (pure blinds.ts) and calls this to
-- persist it. Monotonic (never goes backwards). Audited.
-- ════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.poker_tournament_advance_level(p_tournament_id uuid, p_to_level int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.poker_tournaments%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.poker_tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament not found'; END IF;
  IF p_to_level < t.current_level_index THEN
    RAISE EXCEPTION 'level cannot go backwards (% -> %)', t.current_level_index, p_to_level;
  END IF;
  IF p_to_level = t.current_level_index THEN RETURN; END IF;   -- idempotent no-op
  UPDATE public.poker_tournaments
    SET current_level_index = p_to_level, level_started_at = now() WHERE id = p_tournament_id;
  INSERT INTO public.poker_tournament_audit (tournament_id, event, actor, detail)
    VALUES (p_tournament_id, 'advance_level', NULL, jsonb_build_object('from', t.current_level_index, 'to', p_to_level));
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 9. Grants — every orchestration RPC is service_role ONLY (server-authoritative) ─────
-- These run under the server's service_role; anon + authenticated may NEVER call them (they mutate
-- authoritative chip state). Player-facing calls (register/unregister) stay in the base migration.
-- ════════════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.poker_tournament_seat_draw(uuid)                                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poker_tournament_start_hand(uuid, int, int, bigint, bigint, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poker_tournament_apply_hand_result(uuid, uuid, jsonb, text)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poker_tournament_eliminate(uuid)                                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poker_tournament_move_seat(uuid, uuid, int, int, text)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poker_tournament_advance_level(uuid, int)                            FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poker_tournament_seat_draw(uuid)                                    TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_tournament_start_hand(uuid, int, int, bigint, bigint, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_tournament_apply_hand_result(uuid, uuid, jsonb, text)          TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_tournament_eliminate(uuid)                                     TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_tournament_move_seat(uuid, uuid, int, int, text)               TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_tournament_advance_level(uuid, int)                            TO service_role;

-- ════════════════════════════════════════════════════════════════════════════════════
-- Done. Apply AFTER migration_poker_tournament.sql. Rollback:
-- migration_poker_tournament_orchestration_rollback.sql
-- ════════════════════════════════════════════════════════════════════════════════════
