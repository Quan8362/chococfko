-- Web Push: lưu push subscription của từng user để gửi thông báo cả khi đóng tab.
-- Idempotent — an toàn chạy lại.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text        NOT NULL UNIQUE,
  p256dh      text        NOT NULL,
  auth        text        NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Mỗi user chỉ quản lý subscription của chính mình. Server gửi push dùng
-- service-role (bypass RLS) để đọc subscription của bất kỳ recipient nào.
DROP POLICY IF EXISTS push_subs_select_own ON public.push_subscriptions;
CREATE POLICY push_subs_select_own ON public.push_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_subs_insert_own ON public.push_subscriptions;
CREATE POLICY push_subs_insert_own ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_subs_update_own ON public.push_subscriptions;
CREATE POLICY push_subs_update_own ON public.push_subscriptions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_subs_delete_own ON public.push_subscriptions;
CREATE POLICY push_subs_delete_own ON public.push_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid());
