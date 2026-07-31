-- ════════════════════════════════════════════════════════════════════════════════════
-- TOURNAMENT MANAGEMENT SYSTEM — CORE SCHEMA (badminton-first, standalone module)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Independent of Poker / TLMN / Caro. Competitors are ADMIN-entered names (NOT auth.users);
-- results are ADMIN-entered (not produced by an online game engine).
--
-- Run in Supabase SQL Editor (or an isolated local/preview DB). Idempotent (IF NOT EXISTS /
-- OR REPLACE / DROP POLICY IF EXISTS). Reuses the global update_updated_at_column() trigger fn.
--
-- Security model (see docs/tournaments/TOURNAMENT_SYSTEM_DESIGN.md §4, §12):
--   • All admin writes go through the SERVICE-ROLE client inside 'use server' actions, AFTER
--     checkIsAdmin(). Service-role has explicit `FOR ALL TO service_role` policies (Supabase
--     service_role does NOT bypass RLS here — same pattern as caro_* / poker_*).
--   • Guest (anon OR logged-in non-admin) may SELECT a child row ONLY when its linked tournament
--     is 'published' or 'completed'. Enforced by SECURITY DEFINER visibility helpers so a direct
--     query on a child table can never leak draft/archived data.
--   • Audit log has NO public SELECT policy — service-role only.
--
-- Cross-event integrity (§ "composite FK" rationale in design doc):
--   Same-event membership is enforced in the DATABASE via COMPOSITE FOREIGN KEYS to
--   (id, event_id) unique keys on the parents. This makes it structurally impossible to attach
--   a competitor/group/match/seed-slot of one event to another event — not merely an app check.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 0. Trigger helpers (visibility helpers are defined in §11b, after the tables exist) ─────
-- Shared updated_at trigger fn. Production already has public.update_updated_at_column() from an
-- earlier migration; define it ONLY if absent so this migration is self-contained on a fresh DB
-- and NON-INTRUSIVE where it already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
      LANGUAGE plpgsql AS $body$
      BEGIN NEW.updated_at = now(); RETURN NEW; END;
      $body$;
    $fn$;
  END IF;
END $$;

-- Optimistic-concurrency helper: bump version on every UPDATE. App reads version, then
-- UPDATE ... WHERE id = ? AND version = ?; a 0-row result means a concurrent Admin won.
CREATE OR REPLACE FUNCTION public.tournament_bump_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

-- ── 1. tournaments ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournaments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL,
  name        text NOT NULL,
  starts_at   timestamptz,
  ends_at     timestamptz,
  location    text,
  rules_url   text,                       -- URL validated at application layer (per spec)
  status      text NOT NULL DEFAULT 'draft',
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournaments_slug_unique UNIQUE (slug),
  CONSTRAINT tournaments_name_not_empty CHECK (length(btrim(name)) > 0),
  CONSTRAINT tournaments_slug_not_empty CHECK (length(btrim(slug)) > 0),
  CONSTRAINT tournaments_status_valid CHECK (status IN ('draft','published','completed','archived')),
  CONSTRAINT tournaments_dates_order CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

-- ── 2. tournament_events ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournament_events (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id                   uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name                            text NOT NULL,
  format                          text NOT NULL,
  group_count                     integer NOT NULL DEFAULT 1,
  winner_qualifiers_per_group     integer NOT NULL DEFAULT 1,
  consolation_qualifiers_per_group integer NOT NULL DEFAULT 0,
  third_place_enabled             boolean NOT NULL DEFAULT false,
  status                          text NOT NULL DEFAULT 'setup',
  display_order                   integer NOT NULL DEFAULT 0,
  version                         integer NOT NULL DEFAULT 1,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_events_name_not_empty CHECK (length(btrim(name)) > 0),
  CONSTRAINT tournament_events_format_valid CHECK (format IN ('round_robin','knockout','group_knockout')),
  CONSTRAINT tournament_events_status_valid CHECK (status IN
    ('setup','group_stage','group_stage_completed','knockout_ready','knockout_running','completed')),
  CONSTRAINT tournament_events_counts_nonneg CHECK (
    group_count >= 0 AND winner_qualifiers_per_group >= 0 AND consolation_qualifiers_per_group >= 0),
  -- group_knockout ALWAYS has a championship bracket → ≥1 winner qualifier, ≥1 group.
  CONSTRAINT tournament_events_gk_needs_winner CHECK (format <> 'group_knockout' OR winner_qualifiers_per_group >= 1),
  CONSTRAINT tournament_events_gk_needs_group CHECK (format <> 'group_knockout' OR group_count >= 1),
  -- round_robin needs at least one group.
  CONSTRAINT tournament_events_rr_needs_group CHECK (format <> 'round_robin' OR group_count >= 1),
  -- Composite-FK target so children carrying event_id prove same-event membership.
  CONSTRAINT tournament_events_id_tournament_uq UNIQUE (id, tournament_id)
);

-- ── 3. tournament_competitors ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournament_competitors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.tournament_events(id) ON DELETE CASCADE,
  name          text NOT NULL,
  short_name    text,
  seed          integer,
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_competitors_name_not_empty CHECK (length(btrim(name)) > 0),
  -- Composite-FK target: (id, event_id) lets children prove "same event".
  CONSTRAINT tournament_competitors_id_event_uq UNIQUE (id, event_id)
);

-- ── 4. tournament_groups ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournament_groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.tournament_events(id) ON DELETE CASCADE,
  name          text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  CONSTRAINT tournament_groups_name_not_empty CHECK (length(btrim(name)) > 0),
  CONSTRAINT tournament_groups_name_uq UNIQUE (event_id, name),
  CONSTRAINT tournament_groups_id_event_uq UNIQUE (id, event_id)
);

-- ── 5. tournament_group_memberships ─────────────────────────────────────────────────────
-- event_id is denormalized so BOTH composite FKs pin the same event: a competitor of event A
-- cannot be placed into a group of event B (DB-enforced, not just app-enforced).
CREATE TABLE IF NOT EXISTS public.tournament_group_memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL,
  group_id      uuid NOT NULL,
  competitor_id uuid NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  CONSTRAINT tgm_group_fk  FOREIGN KEY (group_id, event_id)
    REFERENCES public.tournament_groups(id, event_id) ON DELETE CASCADE,
  CONSTRAINT tgm_competitor_fk FOREIGN KEY (competitor_id, event_id)
    REFERENCES public.tournament_competitors(id, event_id) ON DELETE CASCADE,
  -- A competitor belongs to AT MOST ONE group within the same event.
  CONSTRAINT tgm_one_group_per_event UNIQUE (event_id, competitor_id)
);

-- ── 6. tournament_matches ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid NOT NULL REFERENCES public.tournament_events(id) ON DELETE CASCADE,
  group_id          uuid,                        -- NULL for knockout matches
  stage             text NOT NULL,               -- 'group' | 'knockout'
  bracket           text,                        -- NULL | 'championship' | 'consolation'
  round_number      integer NOT NULL DEFAULT 0,
  match_number      integer NOT NULL DEFAULT 0,
  competitor_a_id   uuid,                         -- NULLABLE: later knockout rounds are placeholders
  competitor_b_id   uuid,
  source_match_a_id uuid,                         -- winner/loser of another match feeds this slot
  source_match_b_id uuid,
  source_outcome_a  text,                         -- 'winner' | 'loser' | NULL
  source_outcome_b  text,
  status            text NOT NULL DEFAULT 'pending',
  winner_competitor_id uuid,
  scheduled_at      timestamptz,
  generation_key    text NOT NULL,               -- stable idempotency key within the event
  version           integer NOT NULL DEFAULT 1,  -- optimistic concurrency
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Same-event integrity via composite FKs (nullable cols → MATCH SIMPLE skips when NULL).
  CONSTRAINT tm_group_fk FOREIGN KEY (group_id, event_id)
    REFERENCES public.tournament_groups(id, event_id) ON DELETE SET NULL,
  CONSTRAINT tm_competitor_a_fk FOREIGN KEY (competitor_a_id, event_id)
    REFERENCES public.tournament_competitors(id, event_id) ON DELETE NO ACTION,
  CONSTRAINT tm_competitor_b_fk FOREIGN KEY (competitor_b_id, event_id)
    REFERENCES public.tournament_competitors(id, event_id) ON DELETE NO ACTION,
  CONSTRAINT tm_source_a_fk FOREIGN KEY (source_match_a_id, event_id)
    REFERENCES public.tournament_matches(id, event_id) ON DELETE SET NULL,
  CONSTRAINT tm_source_b_fk FOREIGN KEY (source_match_b_id, event_id)
    REFERENCES public.tournament_matches(id, event_id) ON DELETE SET NULL,
  CONSTRAINT tm_stage_valid   CHECK (stage IN ('group','knockout')),
  CONSTRAINT tm_bracket_valid CHECK (bracket IS NULL OR bracket IN ('championship','consolation')),
  CONSTRAINT tm_status_valid  CHECK (status IN ('pending','ready','completed','bye','cancelled')),
  CONSTRAINT tm_outcome_a_valid CHECK (source_outcome_a IS NULL OR source_outcome_a IN ('winner','loser')),
  CONSTRAINT tm_outcome_b_valid CHECK (source_outcome_b IS NULL OR source_outcome_b IN ('winner','loser')),
  CONSTRAINT tm_group_shape     CHECK (stage <> 'group' OR (bracket IS NULL AND group_id IS NOT NULL)),
  CONSTRAINT tm_knockout_shape  CHECK (stage <> 'knockout' OR (bracket IS NOT NULL AND group_id IS NULL)),
  -- BYE is explicit: exactly one competitor present, a winner set. NEVER a 0–0 score.
  CONSTRAINT tm_bye_one_side CHECK (status <> 'bye' OR num_nonnulls(competitor_a_id, competitor_b_id) = 1),
  CONSTRAINT tm_bye_has_winner CHECK (status <> 'bye' OR winner_competitor_id IS NOT NULL),
  -- Winner (if any) must be one of the two competitors.
  CONSTRAINT tm_winner_is_participant CHECK (
    winner_competitor_id IS NULL
    OR winner_competitor_id = competitor_a_id
    OR winner_competitor_id = competitor_b_id),
  -- generation_key unique within the event → re-running generate cannot duplicate matches.
  CONSTRAINT tm_generation_key_uq UNIQUE (event_id, generation_key),
  -- Composite-FK target for self-referential source_match_*.
  CONSTRAINT tm_id_event_uq UNIQUE (id, event_id)
);

-- ── 7. tournament_match_games (per game/set score) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournament_match_games (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    uuid NOT NULL REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  game_number integer NOT NULL,
  score_a     integer NOT NULL,
  score_b     integer NOT NULL,
  CONSTRAINT tmg_scores_nonneg CHECK (score_a >= 0 AND score_b >= 0),
  -- A recorded game is a COMPLETED game → it must have a winner (no ties).
  CONSTRAINT tmg_no_tie CHECK (score_a <> score_b),
  CONSTRAINT tmg_game_number_pos CHECK (game_number >= 1),
  CONSTRAINT tmg_game_number_uq UNIQUE (match_id, game_number)
);

-- ── 8. tournament_knockout_seed_slots ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournament_knockout_seed_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES public.tournament_events(id) ON DELETE CASCADE,
  bracket         text NOT NULL,
  slot_index      integer NOT NULL,
  source_type     text NOT NULL,                 -- 'competitor' | 'group_rank' | 'bye'
  source_group_id uuid,                          -- for group_rank
  source_rank     integer,                       -- for group_rank (1 = Nhất bảng)
  competitor_id   uuid,                          -- for competitor
  CONSTRAINT tkss_bracket_valid CHECK (bracket IN ('championship','consolation')),
  CONSTRAINT tkss_source_valid  CHECK (source_type IN ('competitor','group_rank','bye')),
  CONSTRAINT tkss_slot_nonneg   CHECK (slot_index >= 0),
  CONSTRAINT tkss_rank_pos      CHECK (source_rank IS NULL OR source_rank >= 1),
  CONSTRAINT tkss_competitor_shape CHECK (source_type <> 'competitor' OR competitor_id IS NOT NULL),
  CONSTRAINT tkss_group_rank_shape CHECK (source_type <> 'group_rank'
    OR (source_group_id IS NOT NULL AND source_rank IS NOT NULL)),
  CONSTRAINT tkss_bye_shape CHECK (source_type <> 'bye'
    OR (competitor_id IS NULL AND source_group_id IS NULL AND source_rank IS NULL)),
  -- Same-event integrity for the referenced group / competitor.
  CONSTRAINT tkss_group_fk FOREIGN KEY (source_group_id, event_id)
    REFERENCES public.tournament_groups(id, event_id) ON DELETE CASCADE,
  CONSTRAINT tkss_competitor_fk FOREIGN KEY (competitor_id, event_id)
    REFERENCES public.tournament_competitors(id, event_id) ON DELETE CASCADE,
  -- One slot per (event, bracket, index).
  CONSTRAINT tkss_slot_uq UNIQUE (event_id, bracket, slot_index)
);
-- A given group-rank source (e.g. "Nhất bảng A") cannot feed two slots in the same branch.
CREATE UNIQUE INDEX IF NOT EXISTS tkss_group_rank_uq
  ON public.tournament_knockout_seed_slots (event_id, bracket, source_group_id, source_rank)
  WHERE source_type = 'group_rank';

-- ── 9. tournament_qualification_overrides ───────────────────────────────────────────────
-- Admin-resolved order when a group is FULLY tied at a qualification boundary. Public-readable
-- (gated by event visibility) so the Guest standings can show "Ban tổ chức phân định".
CREATE TABLE IF NOT EXISTS public.tournament_qualification_overrides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL,
  group_id      uuid NOT NULL,
  resolved_order jsonb NOT NULL,                 -- ordered array of competitor ids
  reason        text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tqo_group_fk FOREIGN KEY (group_id, event_id)
    REFERENCES public.tournament_groups(id, event_id) ON DELETE CASCADE,
  CONSTRAINT tqo_one_per_group UNIQUE (event_id, group_id)
);

-- ── 10. tournament_podium ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournament_podium (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL,
  bracket       text NOT NULL,
  rank          integer NOT NULL,                -- 1 | 2 | 3
  competitor_id uuid NOT NULL,
  is_joint      boolean NOT NULL DEFAULT false,  -- true only for joint-3rd (no 3rd-place match)
  CONSTRAINT tp_bracket_valid CHECK (bracket IN ('championship','consolation')),
  CONSTRAINT tp_rank_valid    CHECK (rank IN (1,2,3)),
  CONSTRAINT tp_joint_only_third CHECK (is_joint = false OR rank = 3),
  CONSTRAINT tp_competitor_fk FOREIGN KEY (competitor_id, event_id)
    REFERENCES public.tournament_competitors(id, event_id) ON DELETE CASCADE,
  -- A competitor appears at most once per (event, bracket).
  CONSTRAINT tp_competitor_uq UNIQUE (event_id, bracket, competitor_id)
);
-- Ranks 1 and 2 are unique per (event, bracket); rank 3 may repeat (joint third).
CREATE UNIQUE INDEX IF NOT EXISTS tp_rank_1_2_uq
  ON public.tournament_podium (event_id, bracket, rank)
  WHERE rank IN (1,2);

-- ── 11. tournament_audit_log (service-role only; NEVER public) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.tournament_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
  event_id      uuid REFERENCES public.tournament_events(id) ON DELETE SET NULL,
  actor_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action        text NOT NULL,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tal_action_not_empty CHECK (length(btrim(action)) > 0)
);

-- ── 11b. Visibility helpers (SECURITY DEFINER — bypass RLS to resolve tournament status) ───
-- Defined here (not §0) because SQL function bodies are validated at CREATE time and reference
-- the tables above. SECURITY DEFINER + pinned search_path so a child-table RLS check can resolve
-- the linked tournament's status without granting the caller direct read on parent rows.
CREATE OR REPLACE FUNCTION public.tournament_is_public(t_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = t_id AND t.status IN ('published','completed')
  );
$$;

CREATE OR REPLACE FUNCTION public.tournament_event_is_public(e_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournament_events ev
    JOIN public.tournaments t ON t.id = ev.tournament_id
    WHERE ev.id = e_id AND t.status IN ('published','completed')
  );
$$;

CREATE OR REPLACE FUNCTION public.tournament_match_is_public(m_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournament_matches m
    JOIN public.tournament_events ev ON ev.id = m.event_id
    JOIN public.tournaments t ON t.id = ev.tournament_id
    WHERE m.id = m_id AND t.status IN ('published','completed')
  );
$$;

-- ── 12. Triggers ────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS tournaments_updated_at ON public.tournaments;
CREATE TRIGGER tournaments_updated_at BEFORE UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tournament_events_updated_at ON public.tournament_events;
CREATE TRIGGER tournament_events_updated_at BEFORE UPDATE ON public.tournament_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS tournament_events_bump_version ON public.tournament_events;
CREATE TRIGGER tournament_events_bump_version BEFORE UPDATE ON public.tournament_events
  FOR EACH ROW EXECUTE FUNCTION public.tournament_bump_version();

DROP TRIGGER IF EXISTS tournament_competitors_updated_at ON public.tournament_competitors;
CREATE TRIGGER tournament_competitors_updated_at BEFORE UPDATE ON public.tournament_competitors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tournament_matches_updated_at ON public.tournament_matches;
CREATE TRIGGER tournament_matches_updated_at BEFORE UPDATE ON public.tournament_matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS tournament_matches_bump_version ON public.tournament_matches;
CREATE TRIGGER tournament_matches_bump_version BEFORE UPDATE ON public.tournament_matches
  FOR EACH ROW EXECUTE FUNCTION public.tournament_bump_version();

-- ── 13. Indexes ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS tournaments_status_idx        ON public.tournaments (status, starts_at DESC);
CREATE INDEX IF NOT EXISTS tournament_events_tid_idx      ON public.tournament_events (tournament_id, display_order);
CREATE INDEX IF NOT EXISTS tournament_competitors_eid_idx ON public.tournament_competitors (event_id, display_order);
CREATE INDEX IF NOT EXISTS tournament_groups_eid_idx      ON public.tournament_groups (event_id, display_order);
CREATE INDEX IF NOT EXISTS tgm_group_idx                  ON public.tournament_group_memberships (group_id, display_order);
CREATE INDEX IF NOT EXISTS tm_event_idx                   ON public.tournament_matches (event_id);
CREATE INDEX IF NOT EXISTS tm_group_idx                   ON public.tournament_matches (group_id);
CREATE INDEX IF NOT EXISTS tm_bracket_round_idx           ON public.tournament_matches (event_id, bracket, round_number, match_number);
CREATE INDEX IF NOT EXISTS tmg_match_idx                  ON public.tournament_match_games (match_id, game_number);
CREATE INDEX IF NOT EXISTS tkss_event_idx                 ON public.tournament_knockout_seed_slots (event_id, bracket, slot_index);
CREATE INDEX IF NOT EXISTS tqo_event_idx                  ON public.tournament_qualification_overrides (event_id);
CREATE INDEX IF NOT EXISTS tp_event_idx                   ON public.tournament_podium (event_id, bracket, rank);
CREATE INDEX IF NOT EXISTS tal_tournament_idx             ON public.tournament_audit_log (tournament_id, created_at DESC);

-- ── 14. Row Level Security ──────────────────────────────────────────────────────────────
ALTER TABLE public.tournaments                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_events                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_competitors             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_groups                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_group_memberships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_match_games             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_knockout_seed_slots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_qualification_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_podium                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_audit_log               ENABLE ROW LEVEL SECURITY;

-- tournaments: public sees published/completed only; service-role full access.
DROP POLICY IF EXISTS tournaments_public_select ON public.tournaments;
CREATE POLICY tournaments_public_select ON public.tournaments
  FOR SELECT USING (status IN ('published','completed'));
DROP POLICY IF EXISTS tournaments_service_all ON public.tournaments;
CREATE POLICY tournaments_service_all ON public.tournaments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Child tables: public SELECT gated by the linked tournament's visibility. Service-role full.
DROP POLICY IF EXISTS tournament_events_public_select ON public.tournament_events;
CREATE POLICY tournament_events_public_select ON public.tournament_events
  FOR SELECT USING (public.tournament_is_public(tournament_id));
DROP POLICY IF EXISTS tournament_events_service_all ON public.tournament_events;
CREATE POLICY tournament_events_service_all ON public.tournament_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tournament_competitors_public_select ON public.tournament_competitors;
CREATE POLICY tournament_competitors_public_select ON public.tournament_competitors
  FOR SELECT USING (public.tournament_event_is_public(event_id));
DROP POLICY IF EXISTS tournament_competitors_service_all ON public.tournament_competitors;
CREATE POLICY tournament_competitors_service_all ON public.tournament_competitors
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tournament_groups_public_select ON public.tournament_groups;
CREATE POLICY tournament_groups_public_select ON public.tournament_groups
  FOR SELECT USING (public.tournament_event_is_public(event_id));
DROP POLICY IF EXISTS tournament_groups_service_all ON public.tournament_groups;
CREATE POLICY tournament_groups_service_all ON public.tournament_groups
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tgm_public_select ON public.tournament_group_memberships;
CREATE POLICY tgm_public_select ON public.tournament_group_memberships
  FOR SELECT USING (public.tournament_event_is_public(event_id));
DROP POLICY IF EXISTS tgm_service_all ON public.tournament_group_memberships;
CREATE POLICY tgm_service_all ON public.tournament_group_memberships
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tournament_matches_public_select ON public.tournament_matches;
CREATE POLICY tournament_matches_public_select ON public.tournament_matches
  FOR SELECT USING (public.tournament_event_is_public(event_id));
DROP POLICY IF EXISTS tournament_matches_service_all ON public.tournament_matches;
CREATE POLICY tournament_matches_service_all ON public.tournament_matches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tmg_public_select ON public.tournament_match_games;
CREATE POLICY tmg_public_select ON public.tournament_match_games
  FOR SELECT USING (public.tournament_match_is_public(match_id));
DROP POLICY IF EXISTS tmg_service_all ON public.tournament_match_games;
CREATE POLICY tmg_service_all ON public.tournament_match_games
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tkss_public_select ON public.tournament_knockout_seed_slots;
CREATE POLICY tkss_public_select ON public.tournament_knockout_seed_slots
  FOR SELECT USING (public.tournament_event_is_public(event_id));
DROP POLICY IF EXISTS tkss_service_all ON public.tournament_knockout_seed_slots;
CREATE POLICY tkss_service_all ON public.tournament_knockout_seed_slots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tqo_public_select ON public.tournament_qualification_overrides;
CREATE POLICY tqo_public_select ON public.tournament_qualification_overrides
  FOR SELECT USING (public.tournament_event_is_public(event_id));
DROP POLICY IF EXISTS tqo_service_all ON public.tournament_qualification_overrides;
CREATE POLICY tqo_service_all ON public.tournament_qualification_overrides
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tournament_podium_public_select ON public.tournament_podium;
CREATE POLICY tournament_podium_public_select ON public.tournament_podium
  FOR SELECT USING (public.tournament_event_is_public(event_id));
DROP POLICY IF EXISTS tournament_podium_service_all ON public.tournament_podium;
CREATE POLICY tournament_podium_service_all ON public.tournament_podium
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- audit log: NO public policy → default deny. Service-role only.
DROP POLICY IF EXISTS tal_service_all ON public.tournament_audit_log;
CREATE POLICY tal_service_all ON public.tournament_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 15. Grants (RLS still applies; anon/authenticated can only SELECT what policies allow) ──
GRANT SELECT ON
  public.tournaments, public.tournament_events, public.tournament_competitors,
  public.tournament_groups, public.tournament_group_memberships, public.tournament_matches,
  public.tournament_match_games, public.tournament_knockout_seed_slots,
  public.tournament_qualification_overrides, public.tournament_podium
  TO anon, authenticated;
-- service_role performs all admin writes (RLS service policies gate the rows). Grant table
-- privileges explicitly so writes never depend on Supabase default-privilege configuration.
GRANT ALL PRIVILEGES ON
  public.tournaments, public.tournament_events, public.tournament_competitors,
  public.tournament_groups, public.tournament_group_memberships, public.tournament_matches,
  public.tournament_match_games, public.tournament_knockout_seed_slots,
  public.tournament_qualification_overrides, public.tournament_podium,
  public.tournament_audit_log
  TO service_role;
-- Defense-in-depth: Supabase default privileges may hand anon/authenticated table-level DML on
-- new public tables (leaving RLS as the only gate). REVOKE all writes so a future policy mistake
-- can never let a Guest mutate tournament data — every write MUST go through service_role.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.tournaments, public.tournament_events, public.tournament_competitors,
  public.tournament_groups, public.tournament_group_memberships, public.tournament_matches,
  public.tournament_match_games, public.tournament_knockout_seed_slots,
  public.tournament_qualification_overrides, public.tournament_podium
  FROM anon, authenticated;
REVOKE ALL ON public.tournament_audit_log FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.tournament_is_public(uuid)       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tournament_event_is_public(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tournament_match_is_public(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_core.sql
-- ════════════════════════════════════════════════════════════════════════════════════
