-- ── Analytics events table ────────────────────────────────────────────────────
-- Tracks page views and user interactions (both anonymous and logged-in).
-- INSERT is open to all (anon key). SELECT is restricted to service role only.
-- Run this in Supabase SQL Editor before using /admin/analytics.

CREATE TABLE IF NOT EXISTS analytics_events (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name           text        NOT NULL,
  path                 text,
  user_id              uuid,
  anonymous_visitor_id text,
  session_id           text,
  locale               text,
  metadata             jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_analytics_created_at   ON analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_event_name   ON analytics_events (event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_user_id      ON analytics_events (user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_visitor_id   ON analytics_events (anonymous_visitor_id);
CREATE INDEX IF NOT EXISTS idx_analytics_session_id   ON analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_path         ON analytics_events (path);

-- RLS: enable security
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Allow any client (including anonymous) to INSERT events
CREATE POLICY "analytics_allow_insert"
  ON analytics_events FOR INSERT
  WITH CHECK (true);

-- No SELECT policy for anon/authenticated roles.
-- Admin pages read via service role client (bypasses RLS entirely).
