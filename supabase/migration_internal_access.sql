-- ============================================================
-- CHỢ CÓC FKO — Public/Community vs FKO-Internal access system
-- Confessions + Chợ đồ cũ (Marketplace)
--
-- Chạy TOÀN BỘ file này trong Supabase SQL Editor.
-- An toàn để chạy lại nhiều lần (idempotent). Không xoá user/content.
--
-- Thứ tự:
--   1. Bảng internal_members + audit
--   2. Hàm is_fko_internal_member()
--   3. Backfill: mọi user hiện có -> internal member
--   4. Cột community_scope cho confessions + marketplace_listings
--   5. Backfill: content cũ -> fko_internal
--   6. RLS theo scope cho confessions + comments
--   7. RLS theo scope cho marketplace + child tables
--   8. View security_invoker (để base-table RLS có hiệu lực)
--   9. Storage: bucket nội bộ + policies
-- ============================================================


-- ── 1. internal_members ─────────────────────────────────────
create table if not exists public.internal_members (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  status      text not null default 'active' check (status in ('active','revoked')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz not null default now(),
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists internal_members_status_idx on public.internal_members(status);

drop trigger if exists internal_members_updated_at on public.internal_members;
create trigger internal_members_updated_at
  before update on public.internal_members
  for each row execute function update_updated_at_column();

-- Audit log of membership changes (grant / revoke / reactivate).
create table if not exists public.internal_member_audit (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  action     text not null check (action in ('grant','revoke','reactivate')),
  actor_id   uuid,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists internal_member_audit_user_idx on public.internal_member_audit(user_id, created_at desc);

-- RLS: a user may read ONLY their own membership row (never the full list).
-- All writes happen via service-role (admin) only — no INSERT/UPDATE/DELETE
-- policy is defined, so authenticated/anon can never grant themselves access.
alter table public.internal_members enable row level security;

drop policy if exists "internal_members_select_own" on public.internal_members;
create policy "internal_members_select_own" on public.internal_members
  for select to authenticated
  using (user_id = auth.uid());

alter table public.internal_member_audit enable row level security;
-- No policies -> only service-role can read/write the audit log.


-- ── 2. is_fko_internal_member() ─────────────────────────────
-- SECURITY DEFINER so it can read internal_members from inside RLS policies
-- regardless of the caller's own SELECT permission. STABLE + null-safe.
create or replace function public.is_fko_internal_member(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.internal_members m
    where m.user_id = uid
      and m.status = 'active'
  );
$$;

revoke all on function public.is_fko_internal_member(uuid) from public;
grant execute on function public.is_fko_internal_member(uuid) to anon, authenticated, service_role;


-- ── 3. Backfill existing users as FKO internal members ──────
-- ONE-TIME backfill for accounts that already exist. There is intentionally
-- NO trigger on auth.users — future sign-ups stay community-only until an
-- admin grants access.
--
-- IMPORTANT — why this is guarded by "internal_members is empty" rather than a
-- plain INSERT ... ON CONFLICT DO NOTHING:
--   A bare backfill is idempotent for *duplicates*, but re-running this file
--   LATER (after real community users have signed up) would wrongly promote
--   every community user to an active internal member. Gating on an empty table
--   makes the backfill strictly one-time: it runs on the very first execution
--   (when no member exists yet) and is skipped on every subsequent run, so
--   future community accounts are never captured. The INSERT ... SELECT is a
--   single atomic statement, so a partial backfill cannot occur.
do $$
declare
  v_existing  bigint;
  v_inserted  bigint;
  v_missing   bigint;
begin
  select count(*) into v_existing from public.internal_members;

  if v_existing = 0 then
    insert into public.internal_members (user_id, status, approved_at)
    select id, 'active', now()
    from auth.users
    on conflict (user_id) do nothing;
    get diagnostics v_inserted = row_count;
    raise notice '[internal_access] one-time user backfill: % auth users -> internal_members (active)', v_inserted;

    -- Hard check, ONLY on the run that performed the backfill: every auth user
    -- must now have a row. (Not valid on later re-runs, where future community
    -- users legitimately have no row.)
    select count(*) into v_missing
    from auth.users u
    left join public.internal_members m on m.user_id = u.id
    where m.user_id is null;
    if v_missing > 0 then
      raise exception '[internal_access] backfill incomplete: % auth user(s) missing from internal_members', v_missing;
    end if;
  else
    raise notice '[internal_access] internal_members already populated (% rows) — user backfill SKIPPED (one-time only). Future community users are never auto-added.', v_existing;
  end if;
end $$;


-- ── 4. community_scope columns ──────────────────────────────
-- Strategy for safe + idempotent backfill of *existing* rows:
--   a. add the column NULLABLE with no default  -> existing rows become NULL
--   b. backfill NULL rows to 'fko_internal'     -> protects all old content
--   c. set default 'community'                  -> all NEW rows are community
--   d. add check constraint + NOT NULL
-- Re-running finds no NULL rows, so nothing is re-touched.

-- confessions
alter table public.confessions add column if not exists community_scope text;
update public.confessions set community_scope = 'fko_internal' where community_scope is null;
alter table public.confessions alter column community_scope set default 'community';
do $$ begin
  alter table public.confessions
    add constraint confessions_community_scope_check
    check (community_scope in ('community','fko_internal'));
exception when duplicate_object then null; end $$;
alter table public.confessions alter column community_scope set not null;
create index if not exists confessions_scope_status_idx
  on public.confessions(community_scope, status, created_at desc);

-- marketplace_listings
alter table public.marketplace_listings add column if not exists community_scope text;
update public.marketplace_listings set community_scope = 'fko_internal' where community_scope is null;
alter table public.marketplace_listings alter column community_scope set default 'community';
do $$ begin
  alter table public.marketplace_listings
    add constraint marketplace_listings_community_scope_check
    check (community_scope in ('community','fko_internal'));
exception when duplicate_object then null; end $$;
alter table public.marketplace_listings alter column community_scope set not null;
create index if not exists ml_scope_status_idx
  on public.marketplace_listings(community_scope, status, created_at desc);


-- ── 5. (child content inherits parent scope via FK joins in RLS) ──
-- Comments, reactions, reports, ratings, bids do NOT store their own scope.
-- Their access is derived from the parent row's community_scope through the
-- RLS policies below, so they always stay consistent with the parent.


-- ── 6. RLS — confessions + confession_comments ──────────────
-- SELECT: approved + not-deleted, AND (community OR caller is internal member).
drop policy if exists "confessions_public_read" on public.confessions;
create policy "confessions_public_read" on public.confessions
  for select using (
    status = 'approved'
    and deleted_at is null
    and (community_scope = 'community' or public.is_fko_internal_member(auth.uid()))
  );

-- INSERT: own + pending, and may only target fko_internal if internal member.
drop policy if exists "confessions_user_insert" on public.confessions;
create policy "confessions_user_insert" on public.confessions
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and status = 'pending'
    and (community_scope = 'community' or public.is_fko_internal_member(auth.uid()))
  );

-- UPDATE own pending: cannot escalate scope to internal unless internal member.
drop policy if exists "confessions_user_update_own" on public.confessions;
create policy "confessions_user_update_own" on public.confessions
  for update to authenticated
  using (author_id = auth.uid() and status = 'pending')
  with check (
    author_id = auth.uid()
    and status = 'pending'
    and (community_scope = 'community' or public.is_fko_internal_member(auth.uid()))
  );

-- confession_comments: read only if parent confession is accessible.
drop policy if exists "confession_comments_public_read" on public.confession_comments;
create policy "confession_comments_public_read" on public.confession_comments
  for select using (
    status = 'approved'
    and deleted_at is null
    and exists (
      select 1 from public.confessions c
      where c.id = confession_comments.confession_id
        and c.deleted_at is null
        and (c.community_scope = 'community' or public.is_fko_internal_member(auth.uid()))
    )
  );

-- INSERT: must be able to read the parent (same scope gate).
drop policy if exists "confession_comments_user_insert" on public.confession_comments;
create policy "confession_comments_user_insert" on public.confession_comments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.confessions c
      where c.id = confession_comments.confession_id
        and c.status = 'approved'
        and c.deleted_at is null
        and (c.community_scope = 'community' or public.is_fko_internal_member(auth.uid()))
    )
  );

drop policy if exists "confession_comments_user_delete_own" on public.confession_comments;
create policy "confession_comments_user_delete_own" on public.confession_comments
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ── 7. RLS — marketplace_listings + child tables ────────────
-- SELECT: owner sees own (any status); others see approved + scope-allowed.
drop policy if exists "ml_select_public" on public.marketplace_listings;
create policy "ml_select_public" on public.marketplace_listings
  for select using (
    auth.uid() = user_id
    or (
      status = 'approved'
      and (community_scope = 'community' or public.is_fko_internal_member(auth.uid()))
    )
  );

-- INSERT: own, and internal scope only for internal members.
drop policy if exists "ml_insert_own" on public.marketplace_listings;
create policy "ml_insert_own" on public.marketplace_listings
  for insert with check (
    auth.uid() = user_id
    and (community_scope = 'community' or public.is_fko_internal_member(auth.uid()))
  );

-- UPDATE: own, and resulting scope must stay allowed (blocks community->internal
-- escalation by non-members; internal members may move either direction).
drop policy if exists "ml_update_own" on public.marketplace_listings;
create policy "ml_update_own" on public.marketplace_listings
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (community_scope = 'community' or public.is_fko_internal_member(auth.uid()))
  );

drop policy if exists "ml_delete_own" on public.marketplace_listings;
create policy "ml_delete_own" on public.marketplace_listings
  for delete using (auth.uid() = user_id);

-- Helper for child policies: is this listing accessible to the caller?
create or replace function public.can_access_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.marketplace_listings l
    where l.id = p_listing_id
      and (
        l.user_id = auth.uid()
        or (l.status = 'approved'
            and (l.community_scope = 'community' or public.is_fko_internal_member(auth.uid())))
      )
  );
$$;
revoke all on function public.can_access_listing(uuid) from public;
grant execute on function public.can_access_listing(uuid) to anon, authenticated, service_role;

-- marketplace_comments
drop policy if exists "mc_select" on public.marketplace_comments;
create policy "mc_select" on public.marketplace_comments
  for select using (
    auth.uid() = user_id
    or (status = 'approved' and public.can_access_listing(listing_id))
  );

drop policy if exists "mc_insert_own" on public.marketplace_comments;
create policy "mc_insert_own" on public.marketplace_comments
  for insert with check (
    auth.uid() = user_id and public.can_access_listing(listing_id)
  );

drop policy if exists "mc_delete_own" on public.marketplace_comments;
create policy "mc_delete_own" on public.marketplace_comments
  for delete using (auth.uid() = user_id);

-- marketplace_reports
drop policy if exists "mr_insert_own" on public.marketplace_reports;
create policy "mr_insert_own" on public.marketplace_reports
  for insert with check (
    auth.uid() = reporter_id and public.can_access_listing(listing_id)
  );

-- marketplace_ratings (read scoped to accessible listings)
drop policy if exists "mr_select" on public.marketplace_ratings;
create policy "mr_select" on public.marketplace_ratings
  for select using (public.can_access_listing(listing_id));

drop policy if exists "mr_insert_own" on public.marketplace_ratings;
create policy "mr_insert_own" on public.marketplace_ratings
  for insert with check (auth.uid() = rater_id and public.can_access_listing(listing_id));

drop policy if exists "mr_update_own" on public.marketplace_ratings;
create policy "mr_update_own" on public.marketplace_ratings
  for update using (auth.uid() = rater_id) with check (auth.uid() = rater_id);

-- marketplace_bids: keep existing privacy (own + listing owner) AND gate by access.
drop policy if exists "mb_select" on public.marketplace_bids;
drop policy if exists "mb_select_own" on public.marketplace_bids;
create policy "mb_select_own" on public.marketplace_bids
  for select to authenticated
  using (auth.uid() = bidder_id);

drop policy if exists "mb_select_listing_owner" on public.marketplace_bids;
create policy "mb_select_listing_owner" on public.marketplace_bids
  for select to authenticated
  using (
    exists (
      select 1 from public.marketplace_listings l
      where l.id = marketplace_bids.listing_id and l.user_id = auth.uid()
    )
  );

drop policy if exists "mb_insert_own" on public.marketplace_bids;
create policy "mb_insert_own" on public.marketplace_bids
  for insert with check (
    auth.uid() = bidder_id and public.can_access_listing(listing_id)
  );


-- ── 8. Views: security_invoker so base-table RLS applies ────
-- Without this, a view runs as its owner and BYPASSES the scope RLS above,
-- letting a community user read internal rows via a direct REST call to the
-- view. service-role callers (admin client) still bypass RLS as before, so
-- in-app admin reads are unaffected.

-- drop + recreate (instead of CREATE OR REPLACE) because we add a new column and
-- CREATE OR REPLACE cannot reorder/insert columns. Nothing else depends on it.
drop view if exists public.confessions_public;
create view public.confessions_public
with (security_invoker = true) as
select
  c.id,
  c.title,
  c.content,
  c.is_anonymous,
  c.status,
  c.created_at,
  c.approved_at,
  c.community_scope,
  case when c.is_anonymous then null else c.author_id end as visible_author_id,
  case when c.is_anonymous then null else p.display_name end as visible_author_name,
  case when c.is_anonymous then null else p.avatar_url    end as visible_author_avatar,
  count(cc.id) filter (where cc.status = 'approved' and cc.deleted_at is null) as comment_count
from public.confessions c
left join public.profiles p on p.id = c.author_id
left join public.confession_comments cc on cc.confession_id = c.id
group by c.id, p.display_name, p.avatar_url;

alter view public.confession_comments_with_author set (security_invoker = true);
alter view public.marketplace_comments_with_author set (security_invoker = true);


-- ── 9. Storage — protected bucket for internal attachments ──
-- Forward-looking infrastructure for internal images. New internal uploads can
-- target this PRIVATE bucket; reads require a signed URL minted server-side
-- after verifying membership. Existing community buckets ('marketplace',
-- 'post-images') stay public for already-published content.
insert into storage.buckets (id, name, public)
values ('marketplace-internal', 'marketplace-internal', false)
on conflict (id) do nothing;

-- Read: only active internal members (or the file owner) may read internal files.
drop policy if exists "marketplace_internal_read" on storage.objects;
create policy "marketplace_internal_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'marketplace-internal'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_fko_internal_member(auth.uid())
    )
  );

-- Insert: only active internal members, into their own folder.
drop policy if exists "marketplace_internal_insert" on storage.objects;
create policy "marketplace_internal_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'marketplace-internal'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_fko_internal_member(auth.uid())
  );

drop policy if exists "marketplace_internal_delete" on storage.objects;
create policy "marketplace_internal_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'marketplace-internal'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 10. Self-verification summary (informational NOTICEs only) ──
-- Prints the key counts so you can confirm the backfill at a glance. This block
-- is purely informational and never raises — the hard backfill check lives in
-- section 3 (only on the run that performed the one-time backfill). Use
-- verify_internal_access.sql for full post-migration verification.
do $$
declare
  v_auth_users     bigint;
  v_members_total  bigint;
  v_members_active bigint;
  v_conf_internal  bigint;
  v_conf_total     bigint;
  v_list_internal  bigint;
  v_list_total     bigint;
begin
  select count(*) into v_auth_users     from auth.users;
  select count(*) into v_members_total  from public.internal_members;
  select count(*) into v_members_active from public.internal_members where status = 'active';
  select count(*) into v_conf_total     from public.confessions;
  select count(*) into v_conf_internal  from public.confessions where community_scope = 'fko_internal';
  select count(*) into v_list_total     from public.marketplace_listings;
  select count(*) into v_list_internal  from public.marketplace_listings where community_scope = 'fko_internal';

  raise notice '[internal_access] auth.users=%, internal_members total=% active=%',
    v_auth_users, v_members_total, v_members_active;
  raise notice '[internal_access] confessions: % of % are fko_internal',
    v_conf_internal, v_conf_total;
  raise notice '[internal_access] marketplace_listings: % of % are fko_internal',
    v_list_internal, v_list_total;
end $$;

-- ── DONE ────────────────────────────────────────────────────
