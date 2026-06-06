-- =====================================================================
-- Phase 8 Fix: Replace recursive members_select policy
-- Root cause: self-referential RLS policy causes infinite recursion
-- Fix: SECURITY DEFINER function bypasses RLS when called from policies
-- Run in Supabase SQL Editor
-- =====================================================================

-- 1. Create SECURITY DEFINER function to get current user's room IDs
--    This runs as function owner (bypassing RLS), breaking the recursion
CREATE OR REPLACE FUNCTION public.auth_member_room_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT room_id FROM public.community_chat_room_members WHERE user_id = auth.uid();
$$;

-- 2. Replace the recursive policy with one that uses the function
DROP POLICY IF EXISTS "members_select" ON public.community_chat_room_members;
CREATE POLICY "members_select"
  ON public.community_chat_room_members FOR SELECT TO authenticated
  USING (room_id = ANY(SELECT public.auth_member_room_ids()));

-- Result: users can see all members of rooms they belong to,
--         without triggering recursive RLS calls.
