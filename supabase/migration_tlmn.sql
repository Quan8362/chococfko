-- Tiến Lên Miền Nam Online — Phase 1: lobby, rooms, seats, realtime plumbing.
-- Reuses the same realtime layer as Cờ Caro / Cờ Tướng:
--   • postgres_changes over the anon browser client (needs SELECT USING(true)
--     + table in the supabase_realtime publication)
--   • all writes go through 'use server' actions using the service-role client
-- NOTE: the hands table (per-player cards) is intentionally NOT created here —
--       it lands in Phase 3 (the deal).

-- ── 1. Rooms ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tlmn_rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code text UNIQUE NOT NULL,
  host_seat   int  NOT NULL DEFAULT 0 CHECK (host_seat BETWEEN 0 AND 3),
  status      text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'playing', 'ended')),
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- RULES / score preset (no effect yet)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Seats (0–3) ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tlmn_seats (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id          uuid NOT NULL REFERENCES public.tlmn_rooms(id) ON DELETE CASCADE,
  seat_index       int  NOT NULL CHECK (seat_index BETWEEN 0 AND 3),
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name     text NOT NULL DEFAULT '',
  avatar_url       text,
  is_ready         boolean NOT NULL DEFAULT false,
  is_bot           boolean NOT NULL DEFAULT false,
  connected        boolean NOT NULL DEFAULT true,
  cumulative_score int     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, seat_index)
);

-- One seat per human per room (bots have NULL user_id, so excluded).
CREATE UNIQUE INDEX IF NOT EXISTS tlmn_seats_room_user_uniq
  ON public.tlmn_seats (room_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tlmn_seats_room_idx ON public.tlmn_seats (room_id, seat_index);

-- ── 3. updated_at triggers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tlmn_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_tlmn_rooms_updated_at ON public.tlmn_rooms;
CREATE TRIGGER trg_tlmn_rooms_updated_at
  BEFORE UPDATE ON public.tlmn_rooms
  FOR EACH ROW EXECUTE FUNCTION public.tlmn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_tlmn_seats_updated_at ON public.tlmn_seats;
CREATE TRIGGER trg_tlmn_seats_updated_at
  BEFORE UPDATE ON public.tlmn_seats
  FOR EACH ROW EXECUTE FUNCTION public.tlmn_touch_updated_at();

-- ── 4. RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.tlmn_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tlmn_seats ENABLE ROW LEVEL SECURITY;

-- Anyone can read (the anon realtime client must receive changes; join-by-code
-- needs to resolve the room). Same posture as caro_rooms / chinese_chess_rooms.
DROP POLICY IF EXISTS "tlmn_rooms_read" ON public.tlmn_rooms;
CREATE POLICY "tlmn_rooms_read" ON public.tlmn_rooms
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "tlmn_seats_read" ON public.tlmn_seats;
CREATE POLICY "tlmn_seats_read" ON public.tlmn_seats
  FOR SELECT USING (true);

-- Writes are performed server-side with the service-role client, but keep sane
-- authenticated-only policies so nothing is writable anonymously by accident.
DROP POLICY IF EXISTS "tlmn_rooms_insert" ON public.tlmn_rooms;
CREATE POLICY "tlmn_rooms_insert" ON public.tlmn_rooms
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "tlmn_rooms_update" ON public.tlmn_rooms;
CREATE POLICY "tlmn_rooms_update" ON public.tlmn_rooms
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "tlmn_seats_write" ON public.tlmn_seats;
CREATE POLICY "tlmn_seats_write" ON public.tlmn_seats
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── 5. Realtime publication ─────────────────────────────────────────────────────
-- Mirror caro/chess: broadcast row changes so both clients stay in sync.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tlmn_rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tlmn_rooms;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tlmn_seats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tlmn_seats;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
