-- =====================================================================
-- Phase 8: Private Chat Rooms
-- Run in Supabase SQL Editor
-- =====================================================================

-- 1. Extend community_chat_rooms
ALTER TABLE public.community_chat_rooms
  ADD COLUMN IF NOT EXISTS is_private    boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by    uuid       REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz;

-- 2. Create room members table
CREATE TABLE IF NOT EXISTS public.community_chat_room_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid        NOT NULL REFERENCES public.community_chat_rooms(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text        NOT NULL DEFAULT 'member'
                          CHECK (role IN ('owner','admin','member')),
  added_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_room_members_room_id  ON public.community_chat_room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_room_members_user_id  ON public.community_chat_room_members(user_id);

-- 3. Enable RLS
ALTER TABLE public.community_chat_room_members ENABLE ROW LEVEL SECURITY;

-- 4. RLS: members can SELECT members of rooms they belong to
DROP POLICY IF EXISTS "members_select" ON public.community_chat_room_members;
CREATE POLICY "members_select"
  ON public.community_chat_room_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_chat_room_members m2
      WHERE m2.room_id = community_chat_room_members.room_id
        AND m2.user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies → only service_role (server actions) can mutate

-- 5. Update rooms SELECT: private rooms only visible to members
DROP POLICY IF EXISTS "rooms_select_auth" ON public.community_chat_rooms;
CREATE POLICY "rooms_select_auth"
  ON public.community_chat_rooms FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (
      is_private = false
      OR created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.community_chat_room_members m
        WHERE m.room_id = community_chat_rooms.id
          AND m.user_id = auth.uid()
      )
    )
  );

-- 6. Update messages SELECT: private room messages only visible to members
DROP POLICY IF EXISTS "community_chat_select" ON public.community_chat_messages;
CREATE POLICY "community_chat_select"
  ON public.community_chat_messages FOR SELECT TO authenticated
  USING (
    is_deleted = false
    AND (
      EXISTS (
        SELECT 1 FROM public.community_chat_rooms r
        WHERE r.id = room_id
          AND r.is_active = true
          AND r.is_private = false
      )
      OR
      EXISTS (
        SELECT 1 FROM public.community_chat_room_members m
        WHERE m.room_id = community_chat_messages.room_id
          AND m.user_id = auth.uid()
      )
    )
  );

-- 7. Update messages INSERT: private rooms require membership
DROP POLICY IF EXISTS "community_chat_insert" ON public.community_chat_messages;
CREATE POLICY "community_chat_insert"
  ON public.community_chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.community_chat_rooms r
        WHERE r.id = room_id
          AND r.is_active = true
          AND r.is_private = false
      )
      OR
      EXISTS (
        SELECT 1 FROM public.community_chat_room_members m
        WHERE m.room_id = community_chat_messages.room_id
          AND m.user_id = auth.uid()
      )
    )
  );

-- 8. Enable Realtime for room members
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'community_chat_room_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_chat_room_members;
  END IF;
END;
$$;
