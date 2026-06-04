-- ── CONFESSIONS FEATURE ──────────────────────────────────────────────────────
-- Run this migration in Supabase SQL editor

-- 1. confessions table
create table if not exists confessions (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  content       text not null,
  author_id     uuid references auth.users(id) on delete set null,
  is_anonymous  boolean not null default true,
  status        text not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  approved_at   timestamptz,
  approved_by   uuid references auth.users(id) on delete set null,
  rejected_reason text,
  deleted_at    timestamptz
);

-- 2. confession_comments table
create table if not exists confession_comments (
  id            uuid primary key default gen_random_uuid(),
  confession_id uuid not null references confessions(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  content       text not null,
  is_anonymous  boolean not null default true,
  status        text not null default 'approved',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- 3. indexes
create index if not exists confessions_status_created_idx  on confessions(status, created_at desc);
create index if not exists confessions_author_idx           on confessions(author_id);
create index if not exists confession_comments_confession_idx on confession_comments(confession_id, status, created_at asc);

-- 4. updated_at triggers
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists confessions_updated_at on confessions;
create trigger confessions_updated_at
  before update on confessions
  for each row execute function update_updated_at_column();

drop trigger if exists confession_comments_updated_at on confession_comments;
create trigger confession_comments_updated_at
  before update on confession_comments
  for each row execute function update_updated_at_column();

-- 5. View: confessions_with_comment_count (public-safe — no author info exposed)
create or replace view confessions_public as
select
  c.id,
  c.title,
  c.content,
  c.is_anonymous,
  c.status,
  c.created_at,
  c.approved_at,
  -- expose author info only when NOT anonymous
  case when c.is_anonymous then null else c.author_id end as visible_author_id,
  case when c.is_anonymous then null else p.display_name end as visible_author_name,
  case when c.is_anonymous then null else p.avatar_url    end as visible_author_avatar,
  count(cc.id) filter (where cc.status = 'approved' and cc.deleted_at is null) as comment_count
from confessions c
left join profiles p on p.id = c.author_id
left join confession_comments cc on cc.confession_id = c.id
group by c.id, p.display_name, p.avatar_url;

-- 6. View: confession_comments_with_author
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
  case when cc.is_anonymous then null else p.display_name end as author_name,
  case when cc.is_anonymous then null else p.avatar_url    end as author_avatar
from confession_comments cc
left join profiles p on p.id = cc.user_id;

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table confessions enable row level security;
alter table confession_comments enable row level security;

-- confessions: public can read approved, non-deleted rows
drop policy if exists "confessions_public_read" on confessions;
create policy "confessions_public_read" on confessions
  for select using (status = 'approved' and deleted_at is null);

-- confessions: logged-in users can insert their own, forced to pending
drop policy if exists "confessions_user_insert" on confessions;
create policy "confessions_user_insert" on confessions
  for insert to authenticated
  with check (author_id = auth.uid() and status = 'pending');

-- confessions: users can update only their own pending confessions (e.g. edit before approved)
drop policy if exists "confessions_user_update_own" on confessions;
create policy "confessions_user_update_own" on confessions
  for update to authenticated
  using (author_id = auth.uid() and status = 'pending')
  with check (author_id = auth.uid() and status = 'pending');

-- confession_comments: public can read approved, non-deleted
drop policy if exists "confession_comments_public_read" on confession_comments;
create policy "confession_comments_public_read" on confession_comments
  for select using (status = 'approved' and deleted_at is null);

-- confession_comments: logged-in users can insert
drop policy if exists "confession_comments_user_insert" on confession_comments;
create policy "confession_comments_user_insert" on confession_comments
  for insert to authenticated
  with check (user_id = auth.uid());

-- confession_comments: users can soft-delete their own comments
drop policy if exists "confession_comments_user_delete_own" on confession_comments;
create policy "confession_comments_user_delete_own" on confession_comments
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Note: admin access (full read/write) is handled via service_role key (bypasses RLS).
-- No admin-specific RLS policies are needed because all admin pages use createAdminClient().
