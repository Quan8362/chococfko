-- Phase 4: Group Stage support for Caro Tournaments
-- Run in Supabase SQL Editor

-- 1. Extend tournament type CHECK constraint to allow group_stage
ALTER TABLE caro_tournaments DROP CONSTRAINT IF EXISTS caro_tournaments_type_check;
ALTER TABLE caro_tournaments ADD CONSTRAINT caro_tournaments_type_check
  CHECK (type IN ('single_elimination', 'group_stage'));

-- 2. Add group stage config columns to tournaments
ALTER TABLE caro_tournaments ADD COLUMN IF NOT EXISTS num_groups integer DEFAULT 2;
ALTER TABLE caro_tournaments ADD COLUMN IF NOT EXISTS advance_per_group integer DEFAULT 1;

-- 3. Groups table
CREATE TABLE IF NOT EXISTS caro_tournament_groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES caro_tournaments(id) ON DELETE CASCADE,
  name          text NOT NULL,
  group_order   integer NOT NULL DEFAULT 1,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 4. Group members table (who is in which group)
CREATE TABLE IF NOT EXISTS caro_tournament_group_members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  uuid NOT NULL,
  group_id       uuid NOT NULL REFERENCES caro_tournament_groups(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES caro_tournament_participants(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL,
  created_at     timestamptz DEFAULT now()
);

-- 5. Add group_id to matches (null = knockout or single_elimination, non-null = group stage match)
ALTER TABLE caro_tournament_matches ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES caro_tournament_groups(id);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_caro_groups_tournament ON caro_tournament_groups(tournament_id);
CREATE INDEX IF NOT EXISTS idx_caro_group_members_group ON caro_tournament_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_caro_group_members_tournament ON caro_tournament_group_members(tournament_id);
CREATE INDEX IF NOT EXISTS idx_caro_matches_group ON caro_tournament_matches(group_id);

-- 7. RLS
ALTER TABLE caro_tournament_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE caro_tournament_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read tournament groups" ON caro_tournament_groups;
CREATE POLICY "public read tournament groups"
  ON caro_tournament_groups FOR SELECT USING (true);
DROP POLICY IF EXISTS "service manage tournament groups" ON caro_tournament_groups;
CREATE POLICY "service manage tournament groups"
  ON caro_tournament_groups FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "public read tournament group members" ON caro_tournament_group_members;
CREATE POLICY "public read tournament group members"
  ON caro_tournament_group_members FOR SELECT USING (true);
DROP POLICY IF EXISTS "service manage tournament group members" ON caro_tournament_group_members;
CREATE POLICY "service manage tournament group members"
  ON caro_tournament_group_members FOR ALL USING (auth.role() = 'service_role');

-- 8. updated_at trigger for groups
CREATE OR REPLACE FUNCTION update_caro_tournament_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_caro_groups_updated_at ON caro_tournament_groups;
CREATE TRIGGER trg_caro_groups_updated_at
  BEFORE UPDATE ON caro_tournament_groups
  FOR EACH ROW EXECUTE FUNCTION update_caro_tournament_groups_updated_at();

-- 9. Realtime (add new tables to the publication)
ALTER PUBLICATION supabase_realtime ADD TABLE caro_tournament_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE caro_tournament_group_members;
