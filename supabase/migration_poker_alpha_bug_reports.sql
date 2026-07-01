-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — ALPHA in-game bug reports  (controlled real-player Alpha, QA phase)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Additive, idempotent, non-destructive. No existing table is altered. Apply any time
-- after migration_poker_core.sql. The app DEGRADES SAFELY if this is not yet applied:
-- submitPokerBugReport catches the missing-relation error and returns a coded result the
-- UI translates, so deploying the code before applying this migration never breaks poker.
--
-- poker_bug_reports — a tester's "Report a problem" submission plus the non-sensitive
-- technical context the client attaches (table/hand/seat/street/state_version/build/…).
--
-- 🔴 PRIVACY: this table must NEVER hold auth tokens, passwords, service-role creds,
-- unrevealed hole cards, the deck order, or the shuffle seed. The application layer
-- (lib/games/poker/bugReport.ts) enforces an ALLOWLIST on the context before it is ever
-- written here; this schema only stores the sanitised, low-cardinality debugging fields.
-- The `context` jsonb is the already-sanitised object, kept for forward-compatible fields.
-- ════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.poker_bug_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Free-text (validated + length-capped in the server action)
  description      text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 4000),
  expected_result  text CHECK (expected_result IS NULL OR char_length(expected_result) <= 2000),
  actual_result    text CHECK (actual_result   IS NULL OR char_length(actual_result)   <= 2000),
  severity         text NOT NULL DEFAULT 'major'
                     CHECK (severity IN ('blocker','major','minor','cosmetic')),
  contact_ok       boolean NOT NULL DEFAULT false,
  screenshot_url   text CHECK (screenshot_url IS NULL OR char_length(screenshot_url) <= 2000),
  -- Denormalised context columns (also present in `context`) for cheap dashboard filtering
  table_id         uuid,
  hand_id          uuid,
  seat_index       int,
  street           text,
  phase            text,
  state_version    bigint,
  action_seq       bigint,
  last_event_id    text,
  player_count     int,
  build_version    text,
  browser          text,
  os               text,
  viewport         text,
  orientation      text,
  locale           text,
  connection_state text,
  reconnect_count  int,
  error_code       text,
  device_class     text CHECK (device_class IS NULL OR device_class IN ('desktop','tablet','phone','unknown')),
  client_path      text,
  -- Full sanitised context blob (forward-compatible; allowlisted keys only)
  context          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Triage workflow (admin-managed)
  status           text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','triaged','in_progress','resolved','wont_fix','duplicate')),
  admin_note       text CHECK (admin_note IS NULL OR char_length(admin_note) <= 4000),
  client_ts        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS poker_bug_reports_created_idx  ON public.poker_bug_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS poker_bug_reports_status_idx   ON public.poker_bug_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS poker_bug_reports_severity_idx ON public.poker_bug_reports (severity, created_at DESC);
CREATE INDEX IF NOT EXISTS poker_bug_reports_table_idx    ON public.poker_bug_reports (table_id, created_at DESC);
CREATE INDEX IF NOT EXISTS poker_bug_reports_reporter_idx ON public.poker_bug_reports (reporter_id, created_at DESC);

ALTER TABLE public.poker_bug_reports ENABLE ROW LEVEL SECURITY;

-- A tester may read back ONLY their own reports (so a "my reports" view is possible).
-- Writes go through the service-role server action (which validates + sanitises), so no
-- INSERT policy is granted to authenticated — this keeps the write path single & audited.
DROP POLICY IF EXISTS poker_bug_reports_read_own ON public.poker_bug_reports;
CREATE POLICY poker_bug_reports_read_own ON public.poker_bug_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

-- Never expose the report stream to anon; admins read via the service-role client.
REVOKE ALL ON public.poker_bug_reports FROM anon;
GRANT SELECT ON public.poker_bug_reports TO authenticated;

-- keep updated_at fresh on triage edits
CREATE OR REPLACE FUNCTION public.poker_bug_reports_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS poker_bug_reports_touch_trg ON public.poker_bug_reports;
CREATE TRIGGER poker_bug_reports_touch_trg
  BEFORE UPDATE ON public.poker_bug_reports
  FOR EACH ROW EXECUTE FUNCTION public.poker_bug_reports_touch();
