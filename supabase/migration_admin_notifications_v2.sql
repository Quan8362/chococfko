-- ── ADMIN NOTIFICATIONS v2 ────────────────────────────────────────────────────
-- Run in Supabase SQL Editor (handles fresh install AND upgrade from v1)

-- 1. Create table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS admin_notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL,
  title        text NOT NULL,
  message      text,
  target_type  text,
  target_id    text,
  target_url   text,
  recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_read      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz
);

-- 2. Add new columns if upgrading from v1 (safe to run on fresh table too)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_notifications' AND column_name = 'recipient_id'
  ) THEN
    ALTER TABLE admin_notifications
      ADD COLUMN recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_notifications' AND column_name = 'actor_id'
  ) THEN
    ALTER TABLE admin_notifications
      ADD COLUMN actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. REPLICA IDENTITY FULL — required for Realtime filtered subscriptions
--    (allows filtering by non-PK columns like recipient_id)
ALTER TABLE admin_notifications REPLICA IDENTITY FULL;

-- 4. Enable Realtime (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'admin_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE admin_notifications;
  END IF;
END $$;

-- 5. Drop old v1 triggers (they can't set recipient_id, so we handle it in server actions)
DROP TRIGGER IF EXISTS trg_notif_post       ON posts;
DROP TRIGGER IF EXISTS trg_notif_place      ON places;
DROP TRIGGER IF EXISTS trg_notif_confession ON confessions;
DROP FUNCTION IF EXISTS create_admin_notification_on_pending();

-- 6. Enable RLS
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

-- 7. Drop old v1 policies
DROP POLICY IF EXISTS notif_authenticated_select  ON admin_notifications;
DROP POLICY IF EXISTS notif_authenticated_update  ON admin_notifications;
DROP POLICY IF EXISTS notif_service_insert        ON admin_notifications;
DROP POLICY IF EXISTS "notif_authenticated_select" ON admin_notifications;
DROP POLICY IF EXISTS "notif_authenticated_update" ON admin_notifications;
DROP POLICY IF EXISTS "notif_service_insert"       ON admin_notifications;

-- 8. New RLS: each admin only sees their own notifications
CREATE POLICY "notif_select_own"
  ON admin_notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = recipient_id);

CREATE POLICY "notif_update_own"
  ON admin_notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- Service role inserts (server actions use SUPABASE_SERVICE_ROLE_KEY → bypasses RLS)
CREATE POLICY "notif_service_insert"
  ON admin_notifications FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 9. Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_admin_notif_recipient_unread
  ON admin_notifications (recipient_id, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_admin_notif_recipient_all
  ON admin_notifications (recipient_id, created_at DESC);
