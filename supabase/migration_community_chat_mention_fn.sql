-- Fix: @mention autocomplete không tìm được thành viên chưa có profiles row
-- Root cause: mention search client-side dùng anon key, không thể đọc auth.users
-- → thành viên chỉ có email (chưa đặt display_name) không bao giờ xuất hiện
--
-- Fix 1 (private rooms): SECURITY DEFINER join community_chat_room_members + profiles + auth.users
-- Fix 2 (public rooms):  SECURITY DEFINER search all users + profiles + auth.users

CREATE OR REPLACE FUNCTION public.get_room_mention_suggestions(
  p_room_id uuid,
  p_query  text
)
RETURNS TABLE (
  id           uuid,
  display_name text,
  avatar_url   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.user_id                                              AS id,
    COALESCE(p.display_name, split_part(u.email, '@', 1)) AS display_name,
    p.avatar_url                                           AS avatar_url
  FROM public.community_chat_room_members m
  LEFT JOIN public.profiles  p ON p.id = m.user_id
  LEFT JOIN auth.users        u ON u.id = m.user_id
  WHERE m.room_id = p_room_id
    -- security: only members can call this
    AND EXISTS (
      SELECT 1
      FROM public.community_chat_room_members cm
      WHERE cm.room_id = p_room_id
        AND cm.user_id = auth.uid()
    )
    -- exclude self
    AND m.user_id <> auth.uid()
    -- filter by query
    AND (
      p_query = ''
      OR LOWER(COALESCE(p.display_name, split_part(u.email, '@', 1)))
         LIKE LOWER('%' || p_query || '%')
    )
  ORDER BY LOWER(COALESCE(p.display_name, split_part(u.email, '@', 1)))
  LIMIT 8
$$;

-- Function 2: public room mention search — all users with email prefix fallback
CREATE OR REPLACE FUNCTION public.get_mention_suggestions(p_query text)
RETURNS TABLE (
  id           uuid,
  display_name text,
  avatar_url   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    COALESCE(p.display_name, split_part(u.email, '@', 1)) AS display_name,
    p.avatar_url
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id <> auth.uid()
    AND (
      p_query = ''
      OR LOWER(COALESCE(p.display_name, split_part(u.email, '@', 1)))
         LIKE LOWER('%' || p_query || '%')
    )
  ORDER BY LOWER(COALESCE(p.display_name, split_part(u.email, '@', 1)))
  LIMIT 8
$$;
