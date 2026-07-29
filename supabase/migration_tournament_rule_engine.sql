-- ════════════════════════════════════════════════════════════════════════════════════════════
-- migration_tournament_rule_engine.sql  (Prompt 15A-2 — MIGRATION #8, applies AFTER public_privacy)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Persistence for the tournament RULE ENGINE (config layer beside the domain engine — see
-- lib/tournaments/rules/** and docs/tournaments/TOURNAMENT_RULES_DESIGN.md). It stores:
--   • rule PRESETS   — versioned admin templates (e.g. FJP Olympiad 2026) with category variants.
--   • event SNAPSHOTS — the immutable, self-contained rule set attached to ONE event. A snapshot is a
--     deep copy: editing a preset later can NEVER change an existing snapshot (there is no FK from a
--     snapshot to a preset — provenance is recorded as plain columns for traceability only).
--
-- Depends on: migration_tournament_core.sql (needs tournament_events + the visibility helper
-- public.tournament_event_is_public, the update_updated_at_column + tournament_bump_version triggers).
-- Order: migration #8, AFTER migration_tournament_public_privacy.sql (privacy). See the runbook §0.
--
-- Additive & idempotent: CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE FUNCTION / DROP POLICY IF
-- EXISTS before CREATE POLICY / CREATE INDEX IF NOT EXISTS / naturally-idempotent REVOKE+GRANT. It
-- does NOT modify any approved migration (1–7) and touches no existing table's columns.
--
-- Security model (mirrors the qualification-override privacy fix, migration 7):
--   • Both tables are RLS-enabled and are ADMIN/service-role only — NO public SELECT policy and NO
--     anon/authenticated table grants. Every admin write goes through the service-role client AFTER
--     checkIsAdmin() in a 'use server' action.
--   • Presets are administration templates and are NEVER exposed to Guests directly.
--   • Guests never read the snapshot base table (it carries admin metadata: preset provenance,
--     requires_configuration, optimistic-concurrency version). They see only a minimal public-safe
--     scoring SUMMARY, via the SECURITY DEFINER RPC tournament_public_event_rule_summary(uuid), which
--     re-checks event visibility (published/completed) and returns no internal fields.
--
-- JSONB rationale (see docs §"Storage model"): the rule PAYLOAD is stored as JSONB governed by a
-- `schema_version` + minimal structural CHECKs; the TypeScript domain (lib/tournaments/rules) remains
-- the authoritative validator. Metadata that callers query/gate on (source, preset provenance,
-- snapshot_version, requires_configuration, version) is promoted to typed COLUMNS — a columns+JSONB
-- hybrid. No executable code / function text is ever stored.

-- ── 1. tournament_rule_presets ───────────────────────────────────────────────────────────────
-- One row per (preset_key, version). `payload` is the array of category variants
-- ([{ "category": ..., "rules": {group,knockout,handicap} }, ...]) — a self-contained template.
CREATE TABLE IF NOT EXISTS public.tournament_rule_presets (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_key             text    NOT NULL,
  version                integer NOT NULL,
  label                  text    NOT NULL,
  description            text,
  schema_version         integer NOT NULL DEFAULT 1,
  payload                jsonb   NOT NULL,
  -- A preset is a TEMPLATE only; it is never the global default (an event always gets its own
  -- snapshot). Stored so the "not default" guarantee is assertable in the DB, and CHECK-pinned false.
  is_default             boolean NOT NULL DEFAULT false,
  -- True when the template ships intentionally incomplete (e.g. handicap enabled but its numbers are
  -- not yet confirmed). A requires-configuration preset MUST NOT be applied to live scoring.
  requires_configuration boolean NOT NULL DEFAULT false,
  status                 text    NOT NULL DEFAULT 'active',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trp_key_version_uq   UNIQUE (preset_key, version),
  CONSTRAINT trp_key_not_empty    CHECK (length(btrim(preset_key)) > 0),
  CONSTRAINT trp_label_not_empty  CHECK (length(btrim(label)) > 0),
  CONSTRAINT trp_version_pos      CHECK (version >= 1),
  CONSTRAINT trp_schema_ver_pos   CHECK (schema_version >= 1),
  CONSTRAINT trp_status_valid     CHECK (status IN ('active','deprecated')),
  CONSTRAINT trp_not_default      CHECK (is_default = false),
  -- payload must be a non-empty JSON array of variants (deeper shape validated in the TS domain).
  CONSTRAINT trp_payload_is_array CHECK (jsonb_typeof(payload) = 'array' AND jsonb_array_length(payload) >= 1)
);

-- ── 2. tournament_event_rule_snapshots ───────────────────────────────────────────────────────
-- The immutable rule set attached to one event. `payload` is the deep-copied RuleSet
-- ({ group, knockout, handicap }). Metadata is promoted to columns. There is intentionally NO
-- foreign key on (preset_key, preset_version): the snapshot is independent of the preset registry,
-- so a later preset edit or delete can never mutate a live event's rules.
CREATE TABLE IF NOT EXISTS public.tournament_event_rule_snapshots (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id               uuid NOT NULL REFERENCES public.tournament_events(id) ON DELETE CASCADE,
  source                 text NOT NULL,                 -- 'default' | 'preset' | 'custom'
  preset_key             text,                          -- provenance only (nullable, NOT an FK)
  preset_version         integer,                       -- provenance only (nullable, NOT an FK)
  category               text,                          -- category variant chosen from the preset
  schema_version         integer NOT NULL DEFAULT 1,
  snapshot_version       integer NOT NULL DEFAULT 1,     -- bumped by the domain on each override
  requires_configuration boolean NOT NULL DEFAULT false, -- some rule still needs organizer input
  payload                jsonb   NOT NULL,               -- the deep-copied RuleSet {group,knockout,handicap}
  version                integer NOT NULL DEFAULT 1,      -- optimistic concurrency (trigger-bumped)
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- At most one snapshot per event (the current, authoritative rule set for that event).
  CONSTRAINT ters_event_uq       UNIQUE (event_id),
  CONSTRAINT ters_source_valid   CHECK (source IN ('default','preset','custom')),
  CONSTRAINT ters_schema_ver_pos CHECK (schema_version >= 1),
  CONSTRAINT ters_snap_ver_pos   CHECK (snapshot_version >= 1),
  -- A preset-sourced snapshot MUST record its provenance; a default/custom one MUST NOT carry any.
  CONSTRAINT ters_preset_provenance CHECK (
    (source = 'preset'  AND preset_key IS NOT NULL AND length(btrim(preset_key)) > 0 AND preset_version IS NOT NULL AND preset_version >= 1)
    OR
    (source <> 'preset' AND preset_key IS NULL AND preset_version IS NULL)
  ),
  -- payload must be a non-empty JSON object (the RuleSet). Deeper shape validated in the TS domain.
  CONSTRAINT ters_payload_is_object CHECK (jsonb_typeof(payload) = 'object' AND payload <> '{}'::jsonb)
);

-- ── 3. Indexes ──────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS trp_key_idx  ON public.tournament_rule_presets (preset_key, version DESC);
CREATE INDEX IF NOT EXISTS trp_status_idx ON public.tournament_rule_presets (status);
-- event_id already has a UNIQUE constraint (implicit index); add a provenance lookup index.
CREATE INDEX IF NOT EXISTS ters_preset_idx ON public.tournament_event_rule_snapshots (preset_key, preset_version);

-- ── 4. Triggers ─────────────────────────────────────────────────────────────────────────────
-- Reuse the shared updated_at trigger fn from core. Snapshots additionally get the optimistic
-- concurrency version-bump used by tournament_events / tournament_matches.
DROP TRIGGER IF EXISTS trp_updated_at ON public.tournament_rule_presets;
CREATE TRIGGER trp_updated_at BEFORE UPDATE ON public.tournament_rule_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS ters_updated_at ON public.tournament_event_rule_snapshots;
CREATE TRIGGER ters_updated_at BEFORE UPDATE ON public.tournament_event_rule_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS ters_bump_version ON public.tournament_event_rule_snapshots;
CREATE TRIGGER ters_bump_version BEFORE UPDATE ON public.tournament_event_rule_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.tournament_bump_version();

-- ── 5. Public-safe scoring summary RPC ────────────────────────────────────────────────────────
-- Guests never read the snapshot base table. This SECURITY DEFINER function returns ONLY a minimal
-- scoring summary for events whose tournament is published/completed (the WHERE clause, NOT RLS, is
-- the visibility gate — so draft/archived never leak). It exposes no admin metadata (no preset id,
-- no actor, no version, no requires_configuration internals). `handicap_enabled` is a plain boolean.
CREATE OR REPLACE FUNCTION public.tournament_public_event_rule_summary(p_event_id uuid)
RETURNS TABLE (
  category               text,
  preset_label           text,
  group_points_to_win    integer,
  group_win_by           integer,
  group_points_cap       integer,
  knockout_points_to_win integer,
  knockout_win_by        integer,
  knockout_points_cap    integer,
  tie_break_order        jsonb,
  handicap_enabled       boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT
    s.category,
    -- Preset label is safe to show (e.g. "FJP Olympiad 2026"); resolved from the presets registry by
    -- provenance. NULL for custom/default snapshots or if the preset row is absent.
    (SELECT p.label FROM public.tournament_rule_presets p
       WHERE p.preset_key = s.preset_key AND p.version = s.preset_version) AS preset_label,
    (s.payload #>> '{group,match,points_to_win}')::int    AS group_points_to_win,
    (s.payload #>> '{group,match,win_by}')::int           AS group_win_by,
    (s.payload #>> '{group,match,points_cap}')::int       AS group_points_cap,
    (s.payload #>> '{knockout,match,points_to_win}')::int AS knockout_points_to_win,
    (s.payload #>> '{knockout,match,win_by}')::int        AS knockout_win_by,
    (s.payload #>> '{knockout,match,points_cap}')::int    AS knockout_points_cap,
    (s.payload #> '{group,tie_break_order}')              AS tie_break_order,
    COALESCE((s.payload #>> '{handicap,enabled}')::boolean, false) AS handicap_enabled
  FROM public.tournament_event_rule_snapshots s
  WHERE s.event_id = p_event_id
    AND public.tournament_event_is_public(s.event_id)
$$;

-- ── 6. Row Level Security ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.tournament_rule_presets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_event_rule_snapshots    ENABLE ROW LEVEL SECURITY;

-- Presets: admin/service-role only (no public read of administration templates).
DROP POLICY IF EXISTS trp_service_all ON public.tournament_rule_presets;
CREATE POLICY trp_service_all ON public.tournament_rule_presets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Snapshots: admin/service-role only. Guests read a summary through the safe RPC, never the base row.
DROP POLICY IF EXISTS ters_service_all ON public.tournament_event_rule_snapshots;
CREATE POLICY ters_service_all ON public.tournament_event_rule_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 7. Grants ─────────────────────────────────────────────────────────────────────────────────
-- service_role performs every write; grant explicitly so it never depends on default privileges.
GRANT ALL PRIVILEGES ON public.tournament_rule_presets, public.tournament_event_rule_snapshots
  TO service_role;
-- Defense-in-depth: strip any default-privilege grants so anon/authenticated can NEVER read or write
-- the base tables (no REST + no Realtime leakage of admin/rule metadata). Public access is RPC-only.
REVOKE ALL ON public.tournament_rule_presets            FROM anon, authenticated;
REVOKE ALL ON public.tournament_event_rule_snapshots    FROM anon, authenticated;

-- The public-safe summary RPC: revoke from PUBLIC, then grant EXECUTE to the roles that need it.
REVOKE ALL ON FUNCTION public.tournament_public_event_rule_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_public_event_rule_summary(uuid)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- END migration_tournament_rule_engine.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════
