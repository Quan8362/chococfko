-- ============================================================================
-- Explore Platform — READ-ONLY schema verification (Phases 1–8)
--
-- Run in the Supabase SQL Editor (or psql) against the production project.
-- This script performs NO writes and touches NO content. It only inspects
-- pg_catalog / information_schema and prints PASS/FAIL per expected object.
--
-- Each section returns a result set with a `status` column. Anything that is
-- not "PASS" is a partially-applied or missing migration and must be fixed
-- before the platform can be called Live-DB verified.
-- ============================================================================

-- ─── 1. Expected TABLES ─────────────────────────────────────────────────────
with expected_tables(name) as (
  values
    ('places'), ('search_queries'), ('place_saves'),
    ('place_lists'), ('place_list_items'),
    ('place_plans'), ('place_plan_stops'),
    ('place_comments'), ('place_reports'), ('place_visits'), ('place_ratings'),
    ('place_collections'), ('place_events'),
    ('notification_preferences'), ('search_concepts'), ('analytics_events')
)
select
  e.name as object,
  case when c.relname is null then 'FAIL: MISSING TABLE' else 'PASS' end as status,
  case when c.relkind = 'r' then coalesce(
         (select case when c.relrowsecurity then 'RLS enabled' else 'FAIL: RLS DISABLED' end), '')
       else '' end as rls
from expected_tables e
left join pg_class c
  on c.relname = e.name
 and c.relnamespace = 'public'::regnamespace
 and c.relkind = 'r'
order by e.name;

-- ─── 2. Expected VIEWS ──────────────────────────────────────────────────────
with expected_views(name) as (values ('place_comments_with_author'))
select
  e.name as object,
  case when v.viewname is null then 'FAIL: MISSING VIEW' else 'PASS' end as status
from expected_views e
left join pg_views v on v.viewname = e.name and v.schemaname = 'public'
order by e.name;

-- View column shape (author fields must be present, not the raw table only)
select 'place_comments_with_author.columns' as object,
  case when count(*) filter (where column_name in ('author_name','author_avatar')) = 2
       then 'PASS' else 'FAIL: author columns missing' end as status
from information_schema.columns
where table_schema = 'public' and table_name = 'place_comments_with_author';

-- ─── 3. Expected FUNCTIONS ──────────────────────────────────────────────────
with expected_fns(name) as (
  values ('set_updated_at'), ('places_nearby'), ('touch_search_concepts_updated_at')
)
select
  e.name as object,
  case when p.proname is null then 'FAIL: MISSING FUNCTION' else 'PASS' end as status
from expected_fns e
left join pg_proc p on p.proname = e.name and p.pronamespace = 'public'::regnamespace
order by e.name;

-- ─── 4. Expected TRIGGERS ───────────────────────────────────────────────────
with expected_trgs(name, tbl) as (
  values
    ('places_set_updated_at','places'),
    ('place_lists_set_updated_at','place_lists'),
    ('place_plans_set_updated_at','place_plans'),
    ('place_collections_set_updated_at','place_collections'),
    ('place_events_set_updated_at','place_events'),
    ('trg_touch_search_concepts','search_concepts')
)
select
  e.tbl || '.' || e.name as object,
  case when t.tgname is null then 'FAIL: MISSING TRIGGER' else 'PASS' end as status
from expected_trgs e
left join pg_trigger t on t.tgname = e.name and not t.tgisinternal
order by object;

-- ─── 5. Key COLUMNS on places (structured Phase 1 fields) ───────────────────
with expected_cols(col) as (
  values ('slug'), ('category'), ('lat'), ('lng'), ('prefecture'), ('region'),
         ('price_type'), ('temporary_status'), ('search_eligible'),
         ('recommend_eligible'), ('subcategories'), ('payment_methods'),
         ('opening_hours'), ('updated_at')
)
select
  'places.' || e.col as object,
  case when c.column_name is null then 'FAIL: MISSING COLUMN' else 'PASS' end as status
from expected_cols e
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = 'places' and c.column_name = e.col
order by e.col;

-- ─── 6. Sharing columns on lists/plans (share token + privacy) ──────────────
select 'place_lists.share_token' as object,
  case when exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='place_lists' and column_name='share_token')
  then 'PASS' else 'FAIL: MISSING' end as status
union all
select 'place_plans.share_token',
  case when exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='place_plans' and column_name='share_token')
  then 'PASS' else 'FAIL: MISSING' end;

-- ─── 7. RLS POLICY COUNTS (must be > 0 on every owned/user table) ───────────
with expected_pol(tbl, min_policies) as (
  values
    ('place_saves', 3), ('place_lists', 4), ('place_list_items', 4),
    ('place_plans', 4), ('place_plan_stops', 4),
    ('place_comments', 2), ('place_reports', 2), ('place_visits', 3),
    ('place_ratings', 2), ('notification_preferences', 4),
    ('place_collections', 1), ('place_events', 1), ('search_queries', 1),
    ('search_concepts', 1), ('places', 1)
)
select
  e.tbl as object,
  count(p.polname) as policy_count,
  case when count(p.polname) >= e.min_policies then 'PASS'
       else 'FAIL: expected >= ' || e.min_policies end as status
from expected_pol e
left join pg_policy p
  on p.polrelid = ('public.' || e.tbl)::regclass
group by e.tbl, e.min_policies
order by e.tbl;

-- ─── 8. Detect DUPLICATE / conflicting policy names per table ───────────────
select schemaname || '.' || tablename as object, policyname, count(*) as dup
from pg_policies
where schemaname = 'public'
  and tablename in (
    'place_saves','place_lists','place_list_items','place_plans','place_plan_stops',
    'place_comments','place_reports','place_visits','place_ratings',
    'notification_preferences','place_collections','place_events','search_queries')
group by 1, 2
having count(*) > 1;
-- (empty result = PASS, no duplicate policies)

-- ─── 9. analytics_events shape (needed for retention/session metrics) ───────
with expected_cols(col) as (
  values ('event_name'),('path'),('user_id'),('anonymous_visitor_id'),
         ('session_id'),('locale'),('metadata'),('created_at')
)
select 'analytics_events.' || e.col as object,
  case when c.column_name is null then 'FAIL: MISSING COLUMN' else 'PASS' end as status
from expected_cols e
left join information_schema.columns c
  on c.table_schema='public' and c.table_name='analytics_events' and c.column_name=e.col
order by e.col;

-- ─── 10. places_nearby() callable signature sanity (lat,lng,radius) ─────────
select 'places_nearby(signature)' as object,
  case when exists (
    select 1 from pg_proc
    where proname='places_nearby' and pronargs >= 3
      and pronamespace='public'::regnamespace
  ) then 'PASS' else 'FAIL: missing or wrong arity' end as status;

-- ============================================================================
-- Interpretation:
--   * Any row with status not starting "PASS" => investigate that migration.
--   * Section 8 returning ANY rows => duplicate policies, resolve before release.
--   * Paste the full output into docs/explore-platform-release-hardening.md §3.
-- ============================================================================
