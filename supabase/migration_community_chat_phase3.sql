-- ── COMMUNITY CHAT PHASE 3 ─────────────────────────────────────────────────
-- Chạy trong Supabase SQL Editor SAU migration_community_chat.sql
-- Thêm: rooms, room_id, reports, read_states, RLS updates

-- ── 1. ROOMS TABLE ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_chat_rooms (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        NOT NULL UNIQUE,
  name        text        NOT NULL,
  description text,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2. DEFAULT ROOMS ────────────────────────────────────────────────────────

INSERT INTO public.community_chat_rooms (key, name, sort_order) VALUES
  ('general', 'Chat chung', 0),
  ('food',    'Ăn uống',    1),
  ('travel',  'Du lịch',    2),
  ('games',   'Mini Game',  3),
  ('help',    'Hỏi đáp',    4)
ON CONFLICT (key) DO NOTHING;

-- ── 3. ADD room_id TO MESSAGES (nullable trước để backfill) ─────────────────

ALTER TABLE public.community_chat_messages
  ADD COLUMN IF NOT EXISTS room_id uuid
    REFERENCES public.community_chat_rooms(id) ON DELETE SET NULL;

-- ── 4. BACKFILL: tất cả tin cũ → phòng general ─────────────────────────────

UPDATE public.community_chat_messages
SET room_id = (SELECT id FROM public.community_chat_rooms WHERE key = 'general')
WHERE room_id IS NULL;

-- ── 5. SET NOT NULL sau khi backfill xong ──────────────────────────────────

ALTER TABLE public.community_chat_messages
  ALTER COLUMN room_id SET NOT NULL;

-- ── 6. INDEXES (thêm composite index cho room-based queries) ────────────────

-- Giữ nguyên index cũ community_chat_created_idx nếu đã có,
-- thêm các index mới phục vụ query theo room

CREATE INDEX IF NOT EXISTS community_chat_room_created_idx
  ON public.community_chat_messages (room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS community_chat_room_active_created_idx
  ON public.community_chat_messages (room_id, is_deleted, created_at DESC);

-- ── 7. UPDATE INSERT POLICY (thêm điều kiện room hợp lệ) ───────────────────

DROP POLICY IF EXISTS "community_chat_insert" ON public.community_chat_messages;
CREATE POLICY "community_chat_insert"
  ON public.community_chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.community_chat_rooms
      WHERE id = room_id AND is_active = true
    )
  );

-- ── 8. RLS CHO ROOMS ────────────────────────────────────────────────────────

ALTER TABLE public.community_chat_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rooms_select_auth" ON public.community_chat_rooms;
CREATE POLICY "rooms_select_auth"
  ON public.community_chat_rooms
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- ── 9. REPORTS TABLE ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_chat_reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid        NOT NULL REFERENCES public.community_chat_messages(id) ON DELETE CASCADE,
  reporter_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_chat_reports_unique UNIQUE (message_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS community_chat_reports_message_idx
  ON public.community_chat_reports (message_id);
CREATE INDEX IF NOT EXISTS community_chat_reports_reporter_idx
  ON public.community_chat_reports (reporter_id);
CREATE INDEX IF NOT EXISTS community_chat_reports_created_idx
  ON public.community_chat_reports (created_at DESC);

ALTER TABLE public.community_chat_reports ENABLE ROW LEVEL SECURITY;

-- Authenticated user INSERT report của chính mình
DROP POLICY IF EXISTS "reports_insert_auth" ON public.community_chat_reports;
CREATE POLICY "reports_insert_auth"
  ON public.community_chat_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- User chỉ SELECT được report của chính mình (để check "đã báo cáo")
DROP POLICY IF EXISTS "reports_select_own" ON public.community_chat_reports;
CREATE POLICY "reports_select_own"
  ON public.community_chat_reports
  FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

-- ── 10. READ STATES TABLE ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_chat_read_states (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id      uuid        NOT NULL REFERENCES public.community_chat_rooms(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_chat_read_states_unique UNIQUE (user_id, room_id)
);

CREATE INDEX IF NOT EXISTS community_chat_read_states_user_idx
  ON public.community_chat_read_states (user_id);

ALTER TABLE public.community_chat_read_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_states_select_own" ON public.community_chat_read_states;
CREATE POLICY "read_states_select_own"
  ON public.community_chat_read_states
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "read_states_insert_own" ON public.community_chat_read_states;
CREATE POLICY "read_states_insert_own"
  ON public.community_chat_read_states
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "read_states_update_own" ON public.community_chat_read_states;
CREATE POLICY "read_states_update_own"
  ON public.community_chat_read_states
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ── 11. REALTIME CHO BẢNG MỚI ──────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.community_chat_rooms;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.community_chat_reports;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.community_chat_read_states;
EXCEPTION WHEN others THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
