-- ── CARO TOURNAMENT SYSTEM ──────────────────────────────────────────────────
-- Run in Supabase SQL Editor AFTER migration_caro.sql

-- 1. Tournaments table
CREATE TABLE IF NOT EXISTS public.caro_tournaments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 text NOT NULL,
  description           text,
  type                  text DEFAULT 'single_elimination' CHECK (type IN ('single_elimination')),
  status                text DEFAULT 'draft' CHECK (status IN ('draft','registration_open','registration_closed','in_progress','finished','cancelled')),
  max_players           integer DEFAULT 8 CHECK (max_players IN (4,8,16,32)),
  registration_start_at timestamptz,
  registration_end_at   timestamptz,
  start_at              timestamptz,
  end_at                timestamptz,
  champion_user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  rules                 text,
  prize                 text,
  is_public             boolean DEFAULT true
);

-- 2. Participants table
CREATE TABLE IF NOT EXISTS public.caro_tournament_participants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES caro_tournaments(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text NOT NULL DEFAULT '',
  avatar_url    text,
  status        text DEFAULT 'registered' CHECK (status IN ('registered','checked_in','eliminated','champion','withdrawn')),
  seed          integer,
  joined_at     timestamptz DEFAULT now(),
  eliminated_at timestamptz,
  UNIQUE(tournament_id, user_id)
);

-- 3. Matches table
CREATE TABLE IF NOT EXISTS public.caro_tournament_matches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid NOT NULL REFERENCES caro_tournaments(id) ON DELETE CASCADE,
  round_number    integer NOT NULL,
  match_number    integer NOT NULL,
  player_x_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  player_o_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  winner_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  loser_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  room_code       text,
  status          text DEFAULT 'pending' CHECK (status IN ('pending','ready','playing','finished','cancelled','walkover')),
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 4. Triggers for updated_at
DROP TRIGGER IF EXISTS caro_tournaments_updated_at ON caro_tournaments;
CREATE TRIGGER caro_tournaments_updated_at
  BEFORE UPDATE ON caro_tournaments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS caro_tournament_matches_updated_at ON caro_tournament_matches;
CREATE TRIGGER caro_tournament_matches_updated_at
  BEFORE UPDATE ON caro_tournament_matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Indexes
CREATE INDEX IF NOT EXISTS caro_tournaments_status_idx     ON caro_tournaments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS caro_participants_tournament_idx ON caro_tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS caro_participants_user_idx       ON caro_tournament_participants(user_id);
CREATE INDEX IF NOT EXISTS caro_matches_tournament_idx      ON caro_tournament_matches(tournament_id, round_number, match_number);
CREATE INDEX IF NOT EXISTS caro_matches_room_code_idx       ON caro_tournament_matches(room_code);

-- 6. RLS
ALTER TABLE caro_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE caro_tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE caro_tournament_matches ENABLE ROW LEVEL SECURITY;

-- Tournaments: public read
DROP POLICY IF EXISTS "caro_tournaments_select" ON caro_tournaments;
CREATE POLICY "caro_tournaments_select" ON caro_tournaments
  FOR SELECT USING (is_public = true OR auth.uid() IS NOT NULL);

-- Tournaments: only service role writes (admin uses service role client)
DROP POLICY IF EXISTS "caro_tournaments_insert" ON caro_tournaments;
CREATE POLICY "caro_tournaments_insert" ON caro_tournaments
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "caro_tournaments_update" ON caro_tournaments;
CREATE POLICY "caro_tournaments_update" ON caro_tournaments
  FOR UPDATE TO service_role USING (true);

-- Participants: public read
DROP POLICY IF EXISTS "caro_participants_select" ON caro_tournament_participants;
CREATE POLICY "caro_participants_select" ON caro_tournament_participants
  FOR SELECT USING (true);

-- Participants: users can join (insert own row)
DROP POLICY IF EXISTS "caro_participants_insert" ON caro_tournament_participants;
CREATE POLICY "caro_participants_insert" ON caro_tournament_participants
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Participants: users can withdraw (update own row to withdrawn)
DROP POLICY IF EXISTS "caro_participants_update" ON caro_tournament_participants;
CREATE POLICY "caro_participants_update" ON caro_tournament_participants
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Participants: service role full access
DROP POLICY IF EXISTS "caro_participants_service" ON caro_tournament_participants;
CREATE POLICY "caro_participants_service" ON caro_tournament_participants
  FOR ALL TO service_role USING (true);

-- Matches: public read
DROP POLICY IF EXISTS "caro_matches_select" ON caro_tournament_matches;
CREATE POLICY "caro_matches_select" ON caro_tournament_matches
  FOR SELECT USING (true);

-- Matches: service role full access
DROP POLICY IF EXISTS "caro_matches_service" ON caro_tournament_matches;
CREATE POLICY "caro_matches_service" ON caro_tournament_matches
  FOR ALL TO service_role USING (true);

-- 7. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE caro_tournaments;
ALTER PUBLICATION supabase_realtime ADD TABLE caro_tournament_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE caro_tournament_matches;

-- 8. Helper view: participant counts per tournament
CREATE OR REPLACE VIEW caro_tournament_participant_counts AS
SELECT tournament_id, count(*) AS participant_count
FROM caro_tournament_participants
WHERE status NOT IN ('withdrawn')
GROUP BY tournament_id;

NOTIFY pgrst, 'reload schema';
