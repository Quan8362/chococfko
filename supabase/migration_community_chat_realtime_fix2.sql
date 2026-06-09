-- Fix 1: Message soft-delete not delivered via Realtime
-- Root cause: SELECT policy has `is_deleted = false`. When UPDATE sets is_deleted=true,
-- the new row fails the policy → Realtime drops the event → other browsers never see the delete.
-- Fix: remove is_deleted from RLS; application queries already use .eq('is_deleted', false).

-- Update is_room_member to handle both public and private rooms in one function
CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_chat_rooms
    WHERE id = p_room_id
      AND is_active = true
      AND is_private = false
  )
  OR EXISTS (
    SELECT 1 FROM public.community_chat_room_members
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
  );
$$;

-- Rebuild messages SELECT policy — drop is_deleted = false condition
DROP POLICY IF EXISTS "community_chat_select" ON public.community_chat_messages;
CREATE POLICY "community_chat_select"
  ON public.community_chat_messages FOR SELECT TO authenticated
  USING (public.is_room_member(room_id));

-- Rebuild messages INSERT policy to match
DROP POLICY IF EXISTS "community_chat_insert" ON public.community_chat_messages;
CREATE POLICY "community_chat_insert"
  ON public.community_chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_room_member(room_id)
  );

-- Fix 2: Reaction DELETE events arrive with empty payload (only PK by default)
-- Root cause: Postgres default REPLICA IDENTITY only includes PK columns in OLD row.
-- DELETE events sent via Realtime have payload.old = { id } only — message_id/user_id/emoji missing.
-- Fix: REPLICA IDENTITY FULL so DELETE events include all columns.
ALTER TABLE public.community_chat_reactions REPLICA IDENTITY FULL;
