-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — Migration 1/3: PUBLIC game-state core (tables, seats, hands, actions, members)
-- ════════════════════════════════════════════════════════════════════════════════════
-- NLHE play-money poker. "Xu" coins have ZERO monetary value (no purchase, no cashout,
-- no conversion). This migration creates the PUBLIC, spectator-safe game-state tables and
-- locks them down: every poker table is SELECT-scoped only, with NO client write policy —
-- all mutations go through 'use server' actions (service role) or the SECURITY DEFINER
-- RPCs in migration_poker_economy.sql. This is the strict posture (the deliberate
-- correction of TLMN's loose tlmn_rooms/tlmn_seats write policy).
--
-- PRIVACY: this file contains NO card-bearing or secret column. Hole cards, the deck, the
-- shuffle seed, and the table password hash live in migration_poker_private.sql /
-- poker_table_secrets and are NEVER published to realtime. (security-model §2, A1/A2.)
--
-- Companion specs: docs/poker/architecture/{system-architecture,security-model,coin-model}.md
-- Apply ORDER: poker_core.sql → poker_private.sql → poker_economy.sql → (deploy code).
-- Idempotent + additive + non-destructive. Touches NO existing table or TLMN data.
-- Rollback strategy: see migration_poker_rollback.sql (drops poker_* objects only).
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Tables ────────────────────────────────────────────────────────────────────────

-- A poker table (room). PUBLIC metadata only. The private join password is NOT here — it
-- lives in poker_table_secrets (no SELECT policy) so a public SELECT can never leak it.
CREATE TABLE IF NOT EXISTS public.poker_tables (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  small_blind   bigint NOT NULL CHECK (small_blind > 0),
  big_blind     bigint NOT NULL CHECK (big_blind > 0),
  min_buy_in_bb int    NOT NULL DEFAULT 40  CHECK (min_buy_in_bb > 0),
  max_buy_in_bb int    NOT NULL DEFAULT 100 CHECK (max_buy_in_bb >= min_buy_in_bb),
  capacity      int    NOT NULL DEFAULT 6   CHECK (capacity BETWEEN 2 AND 6),
  is_private    boolean NOT NULL DEFAULT false,
  -- table lifecycle (NOT the hand lifecycle — that is poker_hands.phase):
  status        text   NOT NULL DEFAULT 'open' CHECK (status IN ('open','closing','closed')),
  current_hand_id uuid,                    -- FK added after poker_hands exists (below)
  state_version bigint NOT NULL DEFAULT 0, -- table-level monotonic version (seat/lobby changes)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (big_blind >= small_blind)
);

-- Private-table join secret. Hash ONLY, never plaintext. NO SELECT policy at all → only the
-- service role / SECURITY DEFINER join path can read it (mirrors the no-policy deck table).
CREATE TABLE IF NOT EXISTS public.poker_table_secrets (
  table_id      uuid PRIMARY KEY REFERENCES public.poker_tables(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Who has been admitted to a table (passed the private password gate, or joined a public
-- table) and in what role. Used to enforce private-table membership and to track spectators.
CREATE TABLE IF NOT EXISTS public.poker_table_members (
  table_id   uuid NOT NULL REFERENCES public.poker_tables(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'player' CHECK (role IN ('player','spectator')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_id, user_id)
);

-- Seats. PUBLIC (incl. stack — pot math is public; only CARDS are secret). One row per seat
-- index per table; the row exists whether or not it is occupied.
CREATE TABLE IF NOT EXISTS public.poker_seats (
  table_id             uuid NOT NULL REFERENCES public.poker_tables(id) ON DELETE CASCADE,
  seat_index           int  NOT NULL CHECK (seat_index >= 0),
  user_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name         text,
  avatar_url           text,
  status               text NOT NULL DEFAULT 'empty'
                         CHECK (status IN ('empty','reserved','sitting_in','sitting_out','leaving','busted')),
  stack                bigint NOT NULL DEFAULT 0 CHECK (stack >= 0),       -- table escrow
  pending_topup        bigint NOT NULL DEFAULT 0 CHECK (pending_topup >= 0), -- active next hand
  committed_this_street bigint NOT NULL DEFAULT 0 CHECK (committed_this_street >= 0),
  committed_total      bigint NOT NULL DEFAULT 0 CHECK (committed_total >= 0),
  last_action          text CHECK (last_action IN ('fold','check','call','bet','raise','all_in')),
  all_in               boolean NOT NULL DEFAULT false,
  -- seat ownership / reservation + idempotency:
  reserved_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reserved_until       timestamptz,
  sit_down_token       uuid,            -- set at sit-down; dedupes a retried buy-in
  post_bb_policy       text NOT NULL DEFAULT 'post' CHECK (post_bb_policy IN ('post','wait')),
  seated_at            timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_id, seat_index)
);

-- One user may occupy at most ONE seat per table (defense against multi-seating / collusion).
CREATE UNIQUE INDEX IF NOT EXISTS poker_seats_one_per_user
  ON public.poker_seats (table_id, user_id) WHERE user_id IS NOT NULL;

-- A hand of poker. PUBLIC projection only: `board` holds REVEALED streets only; `reveal`
-- holds showdown cards of non-mucking contenders only. NEVER an un-turned board card, NEVER
-- a folded/mucked hand, NEVER the shuffle seed (that lives in poker_deck — no policy).
CREATE TABLE IF NOT EXISTS public.poker_hands (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id        uuid NOT NULL REFERENCES public.poker_tables(id) ON DELETE CASCADE,
  hand_no         int  NOT NULL,
  phase           text NOT NULL DEFAULT 'STARTING'
                    CHECK (phase IN ('STARTING','BETTING','SHOWDOWN','SETTLEMENT','COMPLETED','CANCELLED','PAUSED_FOR_REVIEW')),
  street          text CHECK (street IN ('PREFLOP','FLOP','TURN','RIVER','SHOWDOWN')),
  board           jsonb NOT NULL DEFAULT '[]'::jsonb,  -- revealed cards only, e.g. ["As","Kd","2c"]
  pots            jsonb NOT NULL DEFAULT '{"main":{"amount":0,"eligibleSeatIndexes":[]},"sides":[]}'::jsonb,
  button_seat     int,
  turn_seat       int,
  turn_started_at timestamptz,
  turn_deadline   timestamptz,
  -- betting bookkeeping (public — pot math is public):
  current_bet     bigint NOT NULL DEFAULT 0 CHECK (current_bet >= 0),
  min_raise       bigint NOT NULL DEFAULT 0 CHECK (min_raise >= 0),
  last_full_raise bigint NOT NULL DEFAULT 0 CHECK (last_full_raise >= 0),
  action_seq      int    NOT NULL DEFAULT 0 CHECK (action_seq >= 0),
  state_version   bigint NOT NULL DEFAULT 0,  -- monotonic; stale-action rejection (C4/EC-H2)
  reveal          jsonb,                      -- [{seatIndex,cards:[c1,c2]}] non-muckers ONLY, at showdown
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  UNIQUE (table_id, hand_no)
);

-- Now that poker_hands exists, wire poker_tables.current_hand_id → poker_hands(id).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'poker_tables_current_hand_fk'
  ) THEN
    ALTER TABLE public.poker_tables
      ADD CONSTRAINT poker_tables_current_hand_fk
      FOREIGN KEY (current_hand_id) REFERENCES public.poker_hands(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Per-action audit log (replayable history). Contains action TYPE + AMOUNT only — NO cards.
-- (hand_id, action_seq) is unique so a duplicated/retried action can never log twice; the
-- idempotency_key dedupes a client retry before a seq is even assigned.
CREATE TABLE IF NOT EXISTS public.poker_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hand_id         uuid NOT NULL REFERENCES public.poker_hands(id) ON DELETE CASCADE,
  table_id        uuid NOT NULL REFERENCES public.poker_tables(id) ON DELETE CASCADE,
  seat_index      int  NOT NULL,
  user_id         uuid,
  street          text NOT NULL CHECK (street IN ('PREFLOP','FLOP','TURN','RIVER','SHOWDOWN')),
  action_seq      int  NOT NULL,
  type            text NOT NULL CHECK (type IN ('fold','check','call','bet','raise','all_in','post_sb','post_bb','timeout_fold','timeout_check')),
  amount          bigint CHECK (amount IS NULL OR amount >= 0),
  idempotency_key text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hand_id, action_seq)
);
CREATE UNIQUE INDEX IF NOT EXISTS poker_actions_idem
  ON public.poker_actions (hand_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ── 2. Indexes ───────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS poker_tables_status_idx ON public.poker_tables (status, created_at DESC);
CREATE INDEX IF NOT EXISTS poker_seats_table_idx   ON public.poker_seats (table_id);
CREATE INDEX IF NOT EXISTS poker_hands_table_idx    ON public.poker_hands (table_id, hand_no DESC);
CREATE INDEX IF NOT EXISTS poker_actions_hand_idx   ON public.poker_actions (hand_id, action_seq);
CREATE INDEX IF NOT EXISTS poker_members_user_idx   ON public.poker_table_members (user_id);

-- ── 3. updated_at triggers (reuse the existing platform touch function) ───────────────
DROP TRIGGER IF EXISTS trg_poker_tables_updated_at ON public.poker_tables;
CREATE TRIGGER trg_poker_tables_updated_at BEFORE UPDATE ON public.poker_tables
  FOR EACH ROW EXECUTE FUNCTION public.tlmn_touch_updated_at();
DROP TRIGGER IF EXISTS trg_poker_seats_updated_at ON public.poker_seats;
CREATE TRIGGER trg_poker_seats_updated_at BEFORE UPDATE ON public.poker_seats
  FOR EACH ROW EXECUTE FUNCTION public.tlmn_touch_updated_at();

-- ── 4. Row Level Security ─────────────────────────────────────────────────────────────
-- PUBLIC game-state tables: SELECT(true) for everyone (spectator-safe, no secrets here).
-- NO INSERT/UPDATE/DELETE policy on ANY of them → clients cannot write game state at all.
-- All writes happen via the service role or SECURITY DEFINER RPCs.
ALTER TABLE public.poker_tables         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_table_secrets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_table_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_seats          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_hands          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_actions        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS poker_tables_read   ON public.poker_tables;
CREATE POLICY poker_tables_read  ON public.poker_tables  FOR SELECT USING (true);

DROP POLICY IF EXISTS poker_seats_read    ON public.poker_seats;
CREATE POLICY poker_seats_read   ON public.poker_seats   FOR SELECT USING (true);

DROP POLICY IF EXISTS poker_hands_read    ON public.poker_hands;
CREATE POLICY poker_hands_read   ON public.poker_hands   FOR SELECT USING (true);

DROP POLICY IF EXISTS poker_actions_read  ON public.poker_actions;
CREATE POLICY poker_actions_read ON public.poker_actions FOR SELECT USING (true);

-- Members: a user may read ONLY membership rows for tables they themselves belong to. This is
-- what enforces private-table membership (a non-member sees no member rows for that table).
-- The "am I a member of this table" check MUST go through a SECURITY DEFINER helper — querying
-- poker_table_members directly inside its own policy causes infinite RLS recursion.
CREATE OR REPLACE FUNCTION public.poker_is_table_member(p_table_id uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.poker_table_members
    WHERE table_id = p_table_id AND user_id = p_uid
  );
$$;
REVOKE ALL ON FUNCTION public.poker_is_table_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.poker_is_table_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS poker_members_read ON public.poker_table_members;
CREATE POLICY poker_members_read ON public.poker_table_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.poker_is_table_member(table_id, auth.uid())
  );

-- poker_table_secrets: RLS enabled, NO policy at all → opaque to anon/authenticated. Only the
-- service role (join action) can read the hash to verify a password. Never reaches a client.

-- ── 5. Lock down direct writes (defense in depth beyond "no policy") ──────────────────
-- Even though there is no write POLICY, also REVOKE the table privileges so a future stray
-- permissive policy cannot accidentally open a write path (the caro-secure-moves lesson).
REVOKE INSERT, UPDATE, DELETE ON public.poker_tables        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.poker_table_secrets FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.poker_table_members FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.poker_seats         FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.poker_hands         FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.poker_actions       FROM anon, authenticated;
REVOKE ALL ON public.poker_table_secrets FROM anon, authenticated;  -- no SELECT either

-- ── 6. Realtime publication — PUBLIC tables ONLY ──────────────────────────────────────
-- poker_hole_cards and poker_deck (migration_poker_private.sql) are NEVER added here.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['poker_tables','poker_seats','poker_hands','poker_actions'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
