-- Per-user community notifications (e.g. a new comment on a post you commented on).
-- Separate from admin_notifications (which is admin-only). Idempotent.

CREATE TABLE IF NOT EXISTS public.community_notifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          text        NOT NULL,                 -- 'new_comment'
  target_url    text,
  actor_id      uuid,
  actor_name    text,                                 -- null => anonymous
  actor_avatar  text,
  is_read       boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comm_notif_recipient
  ON public.community_notifications(recipient_id, created_at DESC);

ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;

-- Recipients can read / update (mark read) their own. Inserts happen via the
-- service-role client (server actions), which bypasses RLS — so no insert policy.
DROP POLICY IF EXISTS comm_notif_select_own ON public.community_notifications;
CREATE POLICY comm_notif_select_own ON public.community_notifications
  FOR SELECT TO authenticated USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS comm_notif_update_own ON public.community_notifications;
CREATE POLICY comm_notif_update_own ON public.community_notifications
  FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

-- Realtime delivery of complete rows
ALTER TABLE public.community_notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.community_notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN others THEN NULL;
END $$;
