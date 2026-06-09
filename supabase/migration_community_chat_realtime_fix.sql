-- Fix: Private room messages not delivered via Supabase Realtime
--
-- Root cause: community_chat_messages SELECT policy uses a subquery on
-- community_chat_room_members (which has its own RLS policy that self-references
-- the same table). In Supabase Realtime's JWT-based RLS evaluation context,
-- this nested RLS chain is not evaluated correctly → events silently dropped.
--
-- Fix: SECURITY DEFINER function bypasses the inner-table RLS, so Realtime
-- can evaluate membership correctly without the nested RLS chain.

-- 1. Helper function: check if auth.uid() is a member of a room
CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_chat_room_members
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
  );
$$;

-- 2. Rebuild messages SELECT policy using the helper
DROP POLICY IF EXISTS "community_chat_select" ON public.community_chat_messages;
CREATE POLICY "community_chat_select"
  ON public.community_chat_messages FOR SELECT TO authenticated
  USING (
    is_deleted = false
    AND (
      -- Public room: anyone authenticated can read
      EXISTS (
        SELECT 1 FROM public.community_chat_rooms r
        WHERE r.id = room_id
          AND r.is_active = true
          AND r.is_private = false
      )
      OR
      -- Private room: only members
      public.is_room_member(room_id)
    )
  );

-- 3. Rebuild messages INSERT policy using the helper (for consistency)
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
      public.is_room_member(room_id)
    )
  );
