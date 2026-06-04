-- ── FIX: confession_comments_with_author - fallback to auth.users metadata ──
-- Problem: profiles.display_name is NULL for users who signed up via OAuth
--          and haven't explicitly set a display_name in their profile.
-- Fix:     Fall back through auth.users.raw_user_meta_data for name & avatar.
--
-- Run this in Supabase SQL editor (requires service_role access).

create or replace view confession_comments_with_author as
select
  cc.id,
  cc.confession_id,
  cc.user_id,
  cc.content,
  cc.is_anonymous,
  cc.status,
  cc.created_at,
  cc.deleted_at,
  case
    when cc.is_anonymous then null
    else coalesce(
      nullif(trim(p.display_name),                           ''),
      nullif(trim(u.raw_user_meta_data->>'full_name'),       ''),
      nullif(trim(u.raw_user_meta_data->>'name'),            ''),
      split_part(u.email, '@', 1)
    )
  end as author_name,
  case
    when cc.is_anonymous then null
    else coalesce(
      nullif(p.avatar_url,                                   ''),
      nullif(u.raw_user_meta_data->>'avatar_url',            ''),
      nullif(u.raw_user_meta_data->>'picture',               '')
    )
  end as author_avatar
from confession_comments cc
left join profiles p on p.id = cc.user_id
left join auth.users u on u.id = cc.user_id;

notify pgrst, 'reload schema';
