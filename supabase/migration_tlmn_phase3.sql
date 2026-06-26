-- Tiến Lên Miền Nam Online — Phase 3: server-authoritative play, hidden hands.
--
-- Adds the per-round game state (PUBLIC, broadcast to the whole room) and the
-- per-player hands (SECRET, readable ONLY by their owner). Writes to BOTH tables
-- are performed exclusively by the service-role client in 'use server' actions —
-- the engine (lib/games/tlmn/engine.ts + round.ts) is the single source of truth.
--
-- Reuses the existing realtime layer: postgres_changes over the anon browser
-- client. tlmn_games is public (it carries only card COUNTS, never cards), so it
-- can be read by everyone and streamed like tlmn_rooms. tlmn_hands stays private
-- via RLS so a tampered client can never receive an opponent's cards.
--
-- Depends on migration_tlmn.sql (tlmn_rooms / tlmn_seats).

-- ── 1. Per-round game state (PUBLIC) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tlmn_games (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       uuid NOT NULL REFERENCES public.tlmn_rooms(id) ON DELETE CASCADE,
  round_no      int  NOT NULL DEFAULT 1,
  status        text NOT NULL DEFAULT 'playing' CHECK (status IN ('playing', 'ended')),
  seats         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- participating seat indices (snapshot at deal)
  turn_seat     int,                                   -- whose turn it is (NULL once ended)
  trick         jsonb,                                 -- current table play: {cards:[{rank,suit}], by_seat} | null
  pass_flags    jsonb NOT NULL DEFAULT '[]'::jsonb,    -- seats that have passed in the current trick
  card_counts   jsonb NOT NULL DEFAULT '{}'::jsonb,    -- {seat: remaining-card-count} — PUBLIC, never the cards
  played_counts jsonb NOT NULL DEFAULT '{}'::jsonb,    -- {seat: cards-played} (0 ⇒ cóng at settlement)
  must_three_spade boolean NOT NULL DEFAULT false,     -- round-1 opening must include 3♠
  turn_deadline timestamptz,                           -- per-turn clock (display + late-move rejection)
  turn_started_at timestamptz,                         -- AUTHORITATIVE deadline base for the timeout reaper
  nhat_seat     int,                                   -- the Nhất (first player out / tới-trắng winner)
  chat_events   jsonb NOT NULL DEFAULT '[]'::jsonb,    -- chặt log [{cutVictim,cutter,kind}] for đền + UI
  rules         jsonb NOT NULL DEFAULT '{}'::jsonb,    -- LOCKED resolved ruleset snapshot for this round
  result        jsonb,                                 -- {deltas:{seat:delta}, instant:{seat,type}|null, winner}
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tlmn_games_room_idx ON public.tlmn_games (room_id, round_no DESC);
-- At most one live round per room.
CREATE UNIQUE INDEX IF NOT EXISTS tlmn_games_one_active
  ON public.tlmn_games (room_id) WHERE status = 'playing';

-- ── 2. Per-player hands (SECRET) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tlmn_hands (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    uuid NOT NULL REFERENCES public.tlmn_games(id) ON DELETE CASCADE,
  seat       int  NOT NULL CHECK (seat BETWEEN 0 AND 3),
  cards      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{rank,suit}] — this seat's remaining cards
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, seat)
);

CREATE INDEX IF NOT EXISTS tlmn_hands_game_idx ON public.tlmn_hands (game_id, seat);

-- ── 3. updated_at triggers (reuse the Phase-1 touch function) ──────────────────────
DROP TRIGGER IF EXISTS trg_tlmn_games_updated_at ON public.tlmn_games;
CREATE TRIGGER trg_tlmn_games_updated_at
  BEFORE UPDATE ON public.tlmn_games
  FOR EACH ROW EXECUTE FUNCTION public.tlmn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_tlmn_hands_updated_at ON public.tlmn_hands;
CREATE TRIGGER trg_tlmn_hands_updated_at
  BEFORE UPDATE ON public.tlmn_hands
  FOR EACH ROW EXECUTE FUNCTION public.tlmn_touch_updated_at();

-- ── 4. RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.tlmn_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tlmn_hands ENABLE ROW LEVEL SECURITY;

-- Game state is PUBLIC (counts only). Same posture as tlmn_rooms so the anon
-- realtime client receives the broadcast for everyone in the room (and spectators).
DROP POLICY IF EXISTS "tlmn_games_read" ON public.tlmn_games;
CREATE POLICY "tlmn_games_read" ON public.tlmn_games
  FOR SELECT USING (true);

-- A player may read ONLY their own hand. The seat→user link is resolved through
-- tlmn_games (→ room_id) and tlmn_seats. No write policy ⇒ only the service role
-- (which bypasses RLS) can insert/update hands. This is the anti-cheat guarantee.
DROP POLICY IF EXISTS "tlmn_hands_read_own" ON public.tlmn_hands;
CREATE POLICY "tlmn_hands_read_own" ON public.tlmn_hands
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.tlmn_games g
      JOIN public.tlmn_seats s
        ON s.room_id = g.room_id AND s.seat_index = tlmn_hands.seat
      WHERE g.id = tlmn_hands.game_id
        AND s.user_id = auth.uid()
    )
  );

-- ── 5. Realtime publication ─────────────────────────────────────────────────────
-- Broadcast tlmn_games row changes (public state) to every client. tlmn_hands is
-- intentionally NOT published: clients re-fetch their own hand (RLS-enforced) after
-- each public update, so opponents' cards never travel over the wire.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tlmn_games'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tlmn_games;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
