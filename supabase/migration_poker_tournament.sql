-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — TOURNAMENT FOUNDATION (separate tournament domain beside cash tables)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Strictly ADDITIVE + IDEMPOTENT + non-destructive. Adds new poker_tournament_* objects and
-- widens the coin_ledger reason CHECK to a SUPERSET (never drops a reason). Touches NO existing
-- cash-table / TLMN / Caro / wallet row. Apply AFTER the existing poker migrations, on an isolated
-- DB first (run poker_tournament_tests.sql), then prod during the tournament release.
--
-- AUTHORITY (engine-specification.md §0): server + DB are the only source of truth. Every mutation
-- is a SECURITY DEFINER RPC with FOR UPDATE locks + state validation + an immutable audit row.
-- Clients have NO direct write path (RLS + REVOKE). Coins are INTEGER (bigint) + idempotent; a
-- retried register / settle / refund never double-moves coins. Tournament CHIPS live only in
-- poker_tournament_entries.chips and NEVER touch game_wallets (TNMT-CHIP-002).
--
-- GUARANTEE OVERLAY (intentional coin creation): when a tournament's guaranteed_prize_pool exceeds
-- the fees actually collected, settlement pays out the guarantee and thereby MINTS the difference as
-- new play-money coins (TNMT-PAY-021). This is by design (a "house overlay"). Settlement still
-- conserves EXACTLY against the effective (guaranteed) pool; the credit reason is the explicit
-- 'poker_tournament_prize'; and each settle audit row records {collected_fees, overlay} so ledger
-- monitoring can separate guarantee-funded value from player-funded value.
--
-- Feature gate: reachable only when POKER_TOURNAMENT_ENABLED is on — currently HARD OFF in
-- lib/games/poker/flags.ts. This migration is safe to apply while the flag is off (nothing calls
-- these RPCs yet).
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 0. Widen coin_ledger reason CHECK to the SUPERSET incl. tournament reasons ─────────
-- Re-create as the single superset of every reason the codebase writes (never drop a reason).
ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_reason_check;
ALTER TABLE public.coin_ledger ADD CONSTRAINT coin_ledger_reason_check
  CHECK (reason IN (
    'signup_grant',
    'daily_grant',
    'round_settlement',
    'voluntary_exit',
    'interaction_spend',
    'poker_sit_down',
    'poker_top_up',
    'poker_rebuy',
    'poker_stand_up',
    'poker_settle_hand',
    'poker_refund_hand',
    -- tournament wallet crossings (entry fee out, prize in, refund in):
    'poker_tournament_entry',
    'poker_tournament_prize',
    'poker_tournament_refund'
  ));

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 1. Tables ──────────────────────────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════════════════════════

-- The tournament itself. `config` holds the versioned blind + payout structures (mirrors
-- lib/games/poker/tournament/config.ts). `paused_ms` is the accumulated paused/break time used by
-- the server-authoritative blind clock (TNMT-BLIND-012). `seed` makes the seat draw replayable.
CREATE TABLE IF NOT EXISTS public.poker_tournaments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 text NOT NULL,
  state                 text NOT NULL DEFAULT 'DRAFT'
                          CHECK (state IN ('DRAFT','SCHEDULED','REGISTRATION_OPEN','STARTING',
                                           'RUNNING','BREAK','FINAL_TABLE','COMPLETED','CANCELLED',
                                           'PAUSED_FOR_REVIEW')),
  entry_fee             bigint NOT NULL CHECK (entry_fee > 0),
  starting_stack        bigint NOT NULL CHECK (starting_stack > 0),
  min_entries           int    NOT NULL CHECK (min_entries >= 2),
  max_entries           int    NOT NULL CHECK (max_entries >= min_entries),
  seats_per_table       int    NOT NULL DEFAULT 6 CHECK (seats_per_table BETWEEN 2 AND 10),
  guaranteed_prize_pool bigint NOT NULL DEFAULT 0 CHECK (guaranteed_prize_pool >= 0),
  config                jsonb  NOT NULL,   -- blind structure, payout structure, late-reg / re-entry
  seed                  text   NOT NULL DEFAULT gen_random_uuid()::text,
  scheduled_at          timestamptz,
  started_at            timestamptz,
  paused_ms             bigint NOT NULL DEFAULT 0 CHECK (paused_ms >= 0),
  paused_from_state     text,              -- state a PAUSED_FOR_REVIEW paused from
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- One row per ENTRY (a re-entry is a new row, seq >= 1). Chips are tournament-internal only.
CREATE TABLE IF NOT EXISTS public.poker_tournament_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid NOT NULL REFERENCES public.poker_tournaments(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  seq             int  NOT NULL DEFAULT 0 CHECK (seq >= 0),   -- 0 = initial, >=1 = re-entry
  state           text NOT NULL DEFAULT 'REGISTERED'
                    CHECK (state IN ('REGISTERED','SEATED','ACTIVE','DISCONNECTED','ELIMINATED',
                                     'REBUY_ELIGIBLE','WITHDRAWN','PAID')),
  chips           bigint NOT NULL DEFAULT 0 CHECK (chips >= 0),
  entry_fee       bigint NOT NULL CHECK (entry_fee > 0),   -- fee paid for THIS entry (audit)
  table_no        int,
  seat_index      int,
  finishing_place int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id, seq)
);
CREATE INDEX IF NOT EXISTS poker_tournament_entries_by_tournament
  ON public.poker_tournament_entries (tournament_id, state);

-- Balancing / seating audit — every move + (re)seating (TNMT-BAL-034). Append-only.
CREATE TABLE IF NOT EXISTS public.poker_tournament_moves (
  id             bigserial PRIMARY KEY,
  tournament_id  uuid NOT NULL REFERENCES public.poker_tournaments(id) ON DELETE CASCADE,
  entry_id       uuid NOT NULL REFERENCES public.poker_tournament_entries(id) ON DELETE CASCADE,
  from_table_no  int,
  to_table_no    int,
  to_seat_index  int,
  event          text NOT NULL CHECK (event IN ('seat','move','break','final_table')),
  decided_by     text NOT NULL DEFAULT 'balancer',
  level_index    int,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Settlement / refund rows (TNMT-PAY-028). Append-only, one per paid entry or refund.
CREATE TABLE IF NOT EXISTS public.poker_tournament_payouts (
  id             bigserial PRIMARY KEY,
  tournament_id  uuid NOT NULL REFERENCES public.poker_tournaments(id) ON DELETE CASCADE,
  entry_id       uuid NOT NULL REFERENCES public.poker_tournament_entries(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL,
  place          int,                         -- NULL for a refund row
  amount         bigint NOT NULL CHECK (amount >= 0),
  kind           text NOT NULL CHECK (kind IN ('prize','refund')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, entry_id, kind)      -- idempotent settlement per entry
);

-- Idempotency ledger for register / re-entry / unregister / settle (opaque, DEFINER-written).
CREATE TABLE IF NOT EXISTS public.poker_tournament_txn (
  idempotency_key text PRIMARY KEY,
  tournament_id   uuid NOT NULL REFERENCES public.poker_tournaments(id) ON DELETE CASCADE,
  kind            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Immutable audit of important transitions (TNMT-ENG-005 / TNMT-CANCEL-050).
CREATE TABLE IF NOT EXISTS public.poker_tournament_audit (
  id             bigserial PRIMARY KEY,
  tournament_id  uuid NOT NULL REFERENCES public.poker_tournaments(id) ON DELETE CASCADE,
  event          text NOT NULL,
  actor          uuid,               -- admin/user id, NULL = system
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 2. RLS + grants ─────────────────────────────────────────────────────────────────────
-- Public-readable metadata (lobby, standings, results) — no hole cards ever live here. Writes are
-- DENIED to clients (no write policy + REVOKE); only DEFINER RPCs mutate. Idempotency + audit are
-- fully opaque.
-- ════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.poker_tournaments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_tournament_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_tournament_moves     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_tournament_payouts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_tournament_txn       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_tournament_audit     ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.poker_tournaments        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.poker_tournament_entries FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.poker_tournament_moves   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.poker_tournament_payouts FROM anon, authenticated;
REVOKE ALL ON public.poker_tournament_txn   FROM anon, authenticated;   -- opaque
REVOKE ALL ON public.poker_tournament_audit FROM anon, authenticated;   -- opaque

DROP POLICY IF EXISTS "tournaments public read"  ON public.poker_tournaments;
DROP POLICY IF EXISTS "entries public read"      ON public.poker_tournament_entries;
DROP POLICY IF EXISTS "moves public read"        ON public.poker_tournament_moves;
DROP POLICY IF EXISTS "payouts public read"      ON public.poker_tournament_payouts;
-- Lobby, participant list, seating audit and final results are public (spectator-safe).
CREATE POLICY "tournaments public read" ON public.poker_tournaments        FOR SELECT USING (true);
CREATE POLICY "entries public read"     ON public.poker_tournament_entries FOR SELECT USING (true);
CREATE POLICY "moves public read"       ON public.poker_tournament_moves   FOR SELECT USING (true);
CREATE POLICY "payouts public read"     ON public.poker_tournament_payouts FOR SELECT USING (true);

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 3. Pure helper: legal tournament state transition (mirrors stateMachine.ts) ─────────
-- IMMUTABLE lookup used by every mutating RPC so the DB re-enforces the FSM (TNMT-STATE-001).
-- ════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.poker_tournament_can_transition(p_from text, p_to text)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_from
    WHEN 'DRAFT'             THEN p_to IN ('SCHEDULED','CANCELLED')
    WHEN 'SCHEDULED'         THEN p_to IN ('REGISTRATION_OPEN','CANCELLED')
    WHEN 'REGISTRATION_OPEN' THEN p_to IN ('STARTING','CANCELLED')
    WHEN 'STARTING'          THEN p_to IN ('RUNNING','PAUSED_FOR_REVIEW','CANCELLED')
    WHEN 'RUNNING'           THEN p_to IN ('BREAK','FINAL_TABLE','PAUSED_FOR_REVIEW','CANCELLED')
    WHEN 'BREAK'             THEN p_to IN ('RUNNING','FINAL_TABLE','PAUSED_FOR_REVIEW','CANCELLED')
    WHEN 'FINAL_TABLE'       THEN p_to IN ('COMPLETED','PAUSED_FOR_REVIEW','CANCELLED')
    WHEN 'PAUSED_FOR_REVIEW' THEN p_to IN ('STARTING','RUNNING','BREAK','FINAL_TABLE','CANCELLED')
    ELSE false   -- COMPLETED / CANCELLED are terminal
  END;
$$;

-- Effective prize pool = GREATEST(collected fees still escrowed, guarantee). Pure, integer.
-- WITHDRAWN entries were REFUNDED pre-start (TNMT-CANCEL-010) so their fee is NOT in the pool.
CREATE OR REPLACE FUNCTION public.poker_tournament_prize_pool(p_tournament_id uuid)
RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT GREATEST(
    COALESCE((SELECT SUM(entry_fee) FROM public.poker_tournament_entries
              WHERE tournament_id = p_tournament_id AND state <> 'WITHDRAWN'), 0),
    (SELECT guaranteed_prize_pool FROM public.poker_tournaments WHERE id = p_tournament_id)
  );
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 4. RPC: register (idempotent entry-fee escrow) ─────────────────────────────────────
-- Player-callable (auth.uid()). Validates state, field cap, and duplicate; debits the wallet fee
-- (COIN-INT + FOR UPDATE), inserts an entry with the starting stack, writes the ledger + audit.
-- Idempotent: a retried call with the same key moves NO coins and returns the existing entry.
-- ════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.poker_tournament_register(
  p_tournament_id uuid,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  t        public.poker_tournaments%ROWTYPE;
  v_field  int;
  v_dup    int;
  v_bal    bigint;
  v_entry  uuid;
  v_seq    int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  -- Idempotency: claim the key first. If already claimed, return the existing entry (no-op).
  INSERT INTO public.poker_tournament_txn (idempotency_key, tournament_id, kind)
    VALUES (p_idempotency_key, p_tournament_id, 'register')
    ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN
    -- The key was already used. Keys embed the tournament id by construction (registration.ts
    -- initialRegKey/reentryKey), so a claim that does NOT match THIS (tournament, op) means the
    -- caller reused a key across tournaments/operations — fail loud instead of silently returning a
    -- wrong/again entry (TNMT-ENG-004, idempotency scoped by tournament).
    PERFORM 1 FROM public.poker_tournament_txn
      WHERE idempotency_key = p_idempotency_key AND tournament_id = p_tournament_id AND kind = 'register';
    IF NOT FOUND THEN RAISE EXCEPTION 'idempotency key % reused across tournament/operation', p_idempotency_key; END IF;
    SELECT id INTO v_entry FROM public.poker_tournament_entries
      WHERE tournament_id = p_tournament_id AND user_id = v_uid
      ORDER BY seq DESC LIMIT 1;
    RETURN v_entry;   -- retried registration: nothing charged again (COIN-IDEMPOTENCY-001)
  END IF;

  SELECT * INTO t FROM public.poker_tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament not found'; END IF;

  -- State gate: only REGISTRATION_OPEN here (late-reg / re-entry are separate RPCs next phase).
  IF t.state <> 'REGISTRATION_OPEN' THEN RAISE EXCEPTION 'registration closed (state=%)', t.state; END IF;

  SELECT COUNT(*) INTO v_field FROM public.poker_tournament_entries WHERE tournament_id = p_tournament_id;
  IF v_field >= t.max_entries THEN RAISE EXCEPTION 'field full'; END IF;

  -- No duplicate live entry for this user (TNMT-REG-002).
  SELECT COUNT(*) INTO v_dup FROM public.poker_tournament_entries
    WHERE tournament_id = p_tournament_id AND user_id = v_uid
      AND state NOT IN ('WITHDRAWN','ELIMINATED');
  IF v_dup > 0 THEN RAISE EXCEPTION 'already registered'; END IF;

  -- Debit the entry fee from the wallet (integer, row-locked).
  SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = v_uid FOR UPDATE;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'no wallet'; END IF;
  IF v_bal < t.entry_fee THEN RAISE EXCEPTION 'insufficient balance'; END IF;
  v_bal := v_bal - t.entry_fee;
  UPDATE public.game_wallets SET balance = v_bal WHERE user_id = v_uid;
  INSERT INTO public.coin_ledger (user_id, game_code, delta, reason, balance_after)
    VALUES (v_uid, 'poker', -t.entry_fee, 'poker_tournament_entry', v_bal);

  -- Next seq for this user (0 for a first entry).
  SELECT COALESCE(MAX(seq) + 1, 0) INTO v_seq FROM public.poker_tournament_entries
    WHERE tournament_id = p_tournament_id AND user_id = v_uid;

  INSERT INTO public.poker_tournament_entries (tournament_id, user_id, seq, state, chips, entry_fee)
    VALUES (p_tournament_id, v_uid, v_seq, 'REGISTERED', t.starting_stack, t.entry_fee)
    RETURNING id INTO v_entry;

  INSERT INTO public.poker_tournament_audit (tournament_id, event, actor, detail)
    VALUES (p_tournament_id, 'register', v_uid, jsonb_build_object('entry_id', v_entry, 'fee', t.entry_fee));

  RETURN v_entry;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 5. RPC: unregister (pre-start full refund, idempotent) ─────────────────────────────
-- ════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.poker_tournament_unregister(
  p_tournament_id uuid,
  p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   uuid := auth.uid();
  t       public.poker_tournaments%ROWTYPE;
  e       public.poker_tournament_entries%ROWTYPE;
  v_bal   bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  INSERT INTO public.poker_tournament_txn (idempotency_key, tournament_id, kind)
    VALUES (p_idempotency_key, p_tournament_id, 'unregister')
    ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN
    -- Reused-key guard (see poker_tournament_register): a claim that isn't THIS tournament's
    -- unregister means the caller reused a key — fail loud rather than no-op the wrong tournament.
    PERFORM 1 FROM public.poker_tournament_txn
      WHERE idempotency_key = p_idempotency_key AND tournament_id = p_tournament_id AND kind = 'unregister';
    IF NOT FOUND THEN RAISE EXCEPTION 'idempotency key % reused across tournament/operation', p_idempotency_key; END IF;
    RETURN;   -- retried cancel: no extra refund
  END IF;

  SELECT * INTO t FROM public.poker_tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament not found'; END IF;
  IF t.state NOT IN ('SCHEDULED','REGISTRATION_OPEN','STARTING') THEN
    RAISE EXCEPTION 'cannot unregister after start (state=%)', t.state;
  END IF;

  SELECT * INTO e FROM public.poker_tournament_entries
    WHERE tournament_id = p_tournament_id AND user_id = v_uid AND state IN ('REGISTERED','SEATED')
    ORDER BY seq DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no active registration'; END IF;

  -- Full refund of the entry fee (TNMT-CANCEL-010).
  SELECT balance INTO v_bal FROM public.game_wallets WHERE user_id = v_uid FOR UPDATE;
  v_bal := v_bal + e.entry_fee;
  UPDATE public.game_wallets SET balance = v_bal WHERE user_id = v_uid;
  INSERT INTO public.coin_ledger (user_id, game_code, delta, reason, balance_after)
    VALUES (v_uid, 'poker', e.entry_fee, 'poker_tournament_refund', v_bal);

  UPDATE public.poker_tournament_entries SET state = 'WITHDRAWN', chips = 0 WHERE id = e.id;
  INSERT INTO public.poker_tournament_payouts (tournament_id, entry_id, user_id, place, amount, kind)
    VALUES (p_tournament_id, e.id, v_uid, NULL, e.entry_fee, 'refund')
    ON CONFLICT (tournament_id, entry_id, kind) DO NOTHING;
  INSERT INTO public.poker_tournament_audit (tournament_id, event, actor, detail)
    VALUES (p_tournament_id, 'unregister', v_uid, jsonb_build_object('entry_id', e.id, 'refund', e.entry_fee));
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 6. RPC: admin state transition (service-role, validated + audited) ─────────────────
-- ════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.poker_tournament_admin_transition(
  p_tournament_id uuid,
  p_to text,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.poker_tournaments%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.poker_tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament not found'; END IF;
  IF NOT public.poker_tournament_can_transition(t.state, p_to) THEN
    RAISE EXCEPTION 'illegal transition % -> %', t.state, p_to;
  END IF;

  UPDATE public.poker_tournaments SET
    state             = p_to,
    paused_from_state = CASE WHEN p_to = 'PAUSED_FOR_REVIEW' THEN t.state
                             WHEN t.state = 'PAUSED_FOR_REVIEW' THEN NULL
                             ELSE paused_from_state END,
    started_at        = CASE WHEN p_to = 'RUNNING' AND started_at IS NULL THEN now() ELSE started_at END,
    completed_at      = CASE WHEN p_to = 'COMPLETED' THEN now() ELSE completed_at END,
    cancelled_at      = CASE WHEN p_to = 'CANCELLED' THEN now() ELSE cancelled_at END
    WHERE id = p_tournament_id;

  INSERT INTO public.poker_tournament_audit (tournament_id, event, actor, detail)
    VALUES (p_tournament_id, 'transition', p_actor, jsonb_build_object('from', t.state, 'to', p_to));
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 7. RPC: settle (idempotent payout, conservation-checked) ───────────────────────────
-- Service-role only. The server computes the payout rows with the pure, tested engine
-- (payout.ts) and passes them as jsonb [{entry_id,user_id,place,amount,kind}]. This RPC RE-VERIFIES
-- conservation (sum(amount) == effective pool) before crediting, credits each wallet with a ledger
-- row, records payouts, and marks COMPLETED. Idempotent by the txn key AND the payouts unique key.
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
    -- Reused-key guard (see poker_tournament_register): the key must be THIS tournament's settle.
    PERFORM 1 FROM public.poker_tournament_txn
      WHERE idempotency_key = p_idempotency_key AND tournament_id = p_tournament_id AND kind = 'settle';
    IF NOT FOUND THEN RAISE EXCEPTION 'idempotency key % reused across tournament/operation', p_idempotency_key; END IF;
    RETURN;   -- retried settlement (same key): no extra credits
  END IF;

  SELECT * INTO t FROM public.poker_tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament not found'; END IF;
  -- A fully-settled tournament is terminal: refuse a fresh settle request. (A retry with the SAME
  -- key already short-circuited above; a partial settle that crashed before COMPLETED is still
  -- non-COMPLETED here, so a forward-fix with a new key is allowed to finish it.)
  IF t.state = 'COMPLETED' THEN RAISE EXCEPTION 'tournament already settled'; END IF;

  -- Effective pool vs collected fees. When guarantee > collected, the difference is a house OVERLAY
  -- (extra play-money coins minted at settlement, TNMT-PAY-021) — intentional and recorded in the
  -- audit so monitoring can split guarantee-funded from player-funded value.
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

    -- Lock + validate the target entry. A WITHDRAWN entry was already refunded pre-start and its fee
    -- is OUT of the pool (poker_tournament_prize_pool) — paying it would steal from the legitimate
    -- field, so it is NEVER payable from settlement. An unknown entry is a bad payload.
    SELECT state INTO v_estate FROM public.poker_tournament_entries
      WHERE id = v_entry AND tournament_id = p_tournament_id FOR UPDATE;
    IF v_estate IS NULL THEN RAISE EXCEPTION 'settle: unknown entry % for tournament %', v_entry, p_tournament_id; END IF;
    IF v_estate = 'WITHDRAWN' THEN RAISE EXCEPTION 'settle: WITHDRAWN entry % cannot be paid', v_entry; END IF;

    -- Record the payout row idempotently; skip the credit if it already existed (partial-retry /
    -- forward-fix protection — an already-PAID entry never double-credits).
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

    -- Settle the recipient to terminal PAID. The CHAMPION is ACTIVE (never ELIMINATED); in-the-money
    -- losers are ELIMINATED; a finalist may be DISCONNECTED. All three become PAID. WITHDRAWN is
    -- barred above; an already-PAID entry is excluded (never revives — PAID is terminal).
    UPDATE public.poker_tournament_entries SET state = 'PAID'
      WHERE id = v_entry AND state IN ('ACTIVE','DISCONNECTED','ELIMINATED');
  END LOOP;

  UPDATE public.poker_tournaments
    SET state = 'COMPLETED', completed_at = now()
    WHERE id = p_tournament_id AND state <> 'COMPLETED';
  INSERT INTO public.poker_tournament_audit (tournament_id, event, actor, detail)
    VALUES (p_tournament_id, 'settle', NULL, jsonb_build_object(
      'pool', v_pool,
      'collected_fees', v_collected,                     -- player-funded coins
      'overlay', GREATEST(v_pool - v_collected, 0),      -- guarantee-funded coins minted this settle
      'rows', jsonb_array_length(p_payouts)));
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ── 8. Grants ─────────────────────────────────────────────────────────────────────────
-- Players may register / unregister (authenticated). Admin transition + settle are service-role
-- only (REVOKE from anon + authenticated). All are DEFINER, so they run with owner rights; EXECUTE
-- grants decide who may CALL them.
-- ════════════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.poker_tournament_register(uuid, text)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poker_tournament_unregister(uuid, text)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.poker_tournament_admin_transition(uuid, text, uuid)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poker_tournament_settle(uuid, jsonb, text)               FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poker_tournament_register(uuid, text)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.poker_tournament_unregister(uuid, text)               TO authenticated;
-- Trusted mutations run under the server's service_role (REVOKE-from-PUBLIC above removed its
-- implicit EXECUTE, so grant it back explicitly). service_role is server-only, never a client.
GRANT EXECUTE ON FUNCTION public.poker_tournament_admin_transition(uuid, text, uuid)   TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_tournament_settle(uuid, jsonb, text)            TO service_role;

-- ════════════════════════════════════════════════════════════════════════════════════
-- Done. Apply AFTER the existing poker migrations. Rollback: migration_poker_tournament_rollback.sql
-- ════════════════════════════════════════════════════════════════════════════════════
