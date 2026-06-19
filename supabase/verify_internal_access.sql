-- ============================================================
-- CHỢ CÓC FKO — Verification queries for the internal-access migration
-- Read-only. Run in Supabase SQL Editor AFTER migration_internal_access.sql.
-- Each block states the EXPECTED result for the current situation
-- (no external users yet; all existing content was internal).
-- ============================================================

-- ── 1. Existing Auth user count ─────────────────────────────
select count(*) as auth_users from auth.users;

-- ── 2. Active internal-member count ─────────────────────────
-- EXPECTED: equals auth_users above (every existing account is an active member,
-- because no external/community user exists yet).
select count(*) as active_internal_members
from public.internal_members
where status = 'active';

-- ── 3. Total members + status breakdown ─────────────────────
select status, count(*)
from public.internal_members
group by status
order by status;

-- ── 4. Any Auth user MISSING from internal_members ──────────
-- EXPECTED right after migration (no external users yet): 0 rows.
-- NOTE: once real community users sign up, THEY will correctly appear here
-- (community users have no internal_members row by design). So this check only
-- proves a complete backfill when run before the first community registration.
select u.id, u.email
from auth.users u
left join public.internal_members m on m.user_id = u.id
where m.user_id is null;

-- Same as a single number (EXPECTED: 0):
select count(*) as auth_users_missing_membership
from auth.users u
left join public.internal_members m on m.user_id = u.id
where m.user_id is null;

-- ── 5. Counts match assertion (EXPECTED: match = true) ──────
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.internal_members where status = 'active') as active_members,
  (select count(*) from auth.users)
    = (select count(*) from public.internal_members where status = 'active') as match;

-- ── 6. Confession scope verification ────────────────────────
-- EXPECTED: only 'fko_internal' (all pre-existing confessions), count = total.
select community_scope, count(*)
from public.confessions
group by community_scope
order by community_scope;

-- Any pre-existing confession NOT internal (EXPECTED: 0 right after migration,
-- before any new community confession is created):
select count(*) as community_confessions
from public.confessions
where community_scope = 'community';

-- No NULL scope allowed (EXPECTED: 0):
select count(*) as confessions_null_scope
from public.confessions
where community_scope is null;

-- ── 7. Marketplace scope verification ───────────────────────
-- EXPECTED: only 'fko_internal' (all pre-existing listings), count = total.
select community_scope, count(*)
from public.marketplace_listings
group by community_scope
order by community_scope;

select count(*) as community_listings
from public.marketplace_listings
where community_scope = 'community';

select count(*) as listings_null_scope
from public.marketplace_listings
where community_scope is null;

-- ── 8. Authorization plumbing present ───────────────────────
-- Function exists (EXPECTED: 1 row each):
select proname, prosecdef as security_definer
from pg_proc
where proname in ('is_fko_internal_member', 'can_access_listing');

-- RLS enabled on every scoped table (EXPECTED: relrowsecurity = true for all):
select relname, relrowsecurity
from pg_class
where relname in (
  'internal_members','internal_member_audit',
  'confessions','confession_comments',
  'marketplace_listings','marketplace_comments',
  'marketplace_reports','marketplace_ratings','marketplace_bids'
)
order by relname;

-- internal_members policies — EXPECTED: only a SELECT(own) policy, NO write policy
-- (so a user can never grant themselves access; writes go through service-role).
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'internal_members'
order by policyname;

-- Views run as invoker so base-table RLS applies (EXPECTED: security_invoker = true):
select c.relname,
       (select option_value from pg_options_to_table(c.reloptions)
        where option_name = 'security_invoker') as security_invoker
from pg_class c
where c.relkind = 'v'
  and c.relname in ('confessions_public','confession_comments_with_author','marketplace_comments_with_author')
order by c.relname;

-- ── 9. No auto-grant trigger on auth.users (EXPECTED: 0 of ours) ──
-- There must be NO trigger that inserts into internal_members on new sign-up.
select tgname
from pg_trigger
where tgrelid = 'auth.users'::regclass
  and not tgisinternal;

-- ── 10. Internal storage bucket is private (EXPECTED: public = false) ──
select id, public
from storage.buckets
where id = 'marketplace-internal';
