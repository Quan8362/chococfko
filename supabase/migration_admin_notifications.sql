-- ── ADMIN NOTIFICATIONS ───────────────────────────────────────────────────────
-- Run in Supabase SQL Editor

-- 1. Table
CREATE TABLE IF NOT EXISTS admin_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL,                 -- new_pending_post | new_pending_place | new_pending_confession
  title       text NOT NULL,
  message     text,                          -- short description (e.g. post title)
  target_type text,                          -- post | place | confession
  target_id   text,                          -- id or slug of the content
  target_url  text,                          -- URL to the admin review page
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);

-- 2. RLS
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read (soft security — UI only visible to admin)
CREATE POLICY "notif_authenticated_select"
  ON admin_notifications FOR SELECT
  TO authenticated USING (true);

-- Authenticated users can mark as read
CREATE POLICY "notif_authenticated_update"
  ON admin_notifications FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Service role can insert (all server-side calls use service role key)
-- Note: service_role bypasses RLS by default, so this policy is for clarity
CREATE POLICY "notif_service_insert"
  ON admin_notifications FOR INSERT
  TO service_role WITH CHECK (true);

-- 3. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE admin_notifications;

-- 4. Trigger function — fires when new pending content is created
CREATE OR REPLACE FUNCTION create_admin_notification_on_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_TABLE_NAME = 'posts' AND NEW.status = 'pending' THEN
    INSERT INTO admin_notifications (type, title, message, target_type, target_id, target_url)
    VALUES (
      'new_pending_post',
      'Bài viết mới cần duyệt',
      NEW.title,
      'post',
      NEW.id::text,
      '/admin?tab=pending'
    );

  ELSIF TG_TABLE_NAME = 'places' AND NEW.status = 'pending' THEN
    INSERT INTO admin_notifications (type, title, message, target_type, target_id, target_url)
    VALUES (
      'new_pending_place',
      'Địa điểm mới cần duyệt',
      NEW.name,
      'place',
      NEW.slug,
      '/admin/dia-diem/' || NEW.slug
    );

  ELSIF TG_TABLE_NAME = 'confessions' AND NEW.status = 'pending' THEN
    INSERT INTO admin_notifications (type, title, message, target_type, target_id, target_url)
    VALUES (
      'new_pending_confession',
      'Confession mới cần duyệt',
      NEW.title,
      'confession',
      NEW.id::text,
      '/admin/confessions'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Attach triggers
DROP TRIGGER IF EXISTS trg_notif_post ON posts;
CREATE TRIGGER trg_notif_post
  AFTER INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION create_admin_notification_on_pending();

DROP TRIGGER IF EXISTS trg_notif_place ON places;
CREATE TRIGGER trg_notif_place
  AFTER INSERT ON places
  FOR EACH ROW EXECUTE FUNCTION create_admin_notification_on_pending();

DROP TRIGGER IF EXISTS trg_notif_confession ON confessions;
CREATE TRIGGER trg_notif_confession
  AFTER INSERT ON confessions
  FOR EACH ROW EXECUTE FUNCTION create_admin_notification_on_pending();

-- 6. Index for fast unread queries
CREATE INDEX IF NOT EXISTS idx_admin_notif_unread
  ON admin_notifications (is_read, created_at DESC)
  WHERE is_read = false;
