-- ── FIX: run this AFTER migration_confessions.sql ──────────────────────────
-- Adds a view that includes author display names for admin pages,
-- avoiding PostgREST embedded-relation issues (confessions.author_id → auth.users,
-- not directly → profiles, so the Supabase client .select('profiles(...)') syntax fails).

-- Admin view: all confessions with real author name, safe for service-role queries
create or replace view confessions_admin as
select
  c.id,
  c.title,
  c.content,
  c.author_id,
  c.is_anonymous,
  c.status,
  c.created_at,
  c.updated_at,
  c.approved_at,
  c.approved_by,
  c.rejected_reason,
  c.deleted_at,
  p.display_name  as author_name,
  p.avatar_url    as author_avatar
from confessions c
left join profiles p on p.id = c.author_id;

-- Admin view: confession comments with author name
create or replace view confession_comments_admin as
select
  cc.id,
  cc.confession_id,
  cc.user_id,
  cc.content,
  cc.is_anonymous,
  cc.status,
  cc.created_at,
  cc.updated_at,
  cc.deleted_at,
  p.display_name as author_name,
  p.avatar_url   as author_avatar
from confession_comments cc
left join profiles p on p.id = cc.user_id;

-- Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';
