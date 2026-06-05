-- ── CONFESSIONS RLS FIX ───────────────────────────────────────────────────────
-- Root cause: INSERT + RETURNING (`.select('id')`) requires both an INSERT
-- WITH CHECK policy AND a SELECT USING policy that covers the inserted row.
-- The existing SELECT policy only allows reading 'approved' confessions,
-- so inserting a 'pending' confession with `.select('id').single()` fails RLS.
--
-- Fix: add a SELECT policy that lets authenticated users read their own
-- confessions (all statuses). This is also correct UX — users should see
-- their pending/rejected confessions in their profile.
--
-- Run in Supabase SQL Editor.

-- 1. Allow authenticated users to read their own confessions (any status)
--    This is needed because INSERT + RETURNING checks SELECT policy too.
drop policy if exists "confessions_user_read_own" on confessions;
create policy "confessions_user_read_own" on confessions
  for select to authenticated
  using (author_id = auth.uid());

-- 2. Re-confirm the INSERT policy is correct (idempotent)
--    author_id must equal the logged-in user; status must be 'pending'.
--    Anonymous confessions still store the real author_id — only is_anonymous
--    controls whether the name is shown publicly.
drop policy if exists "confessions_user_insert" on confessions;
create policy "confessions_user_insert" on confessions
  for insert to authenticated
  with check (author_id = auth.uid() and status = 'pending');

-- 3. Confirm public SELECT policy is intact
drop policy if exists "confessions_public_read" on confessions;
create policy "confessions_public_read" on confessions
  for select using (status = 'approved' and deleted_at is null);

-- 4. Confirm user UPDATE policy (edit own pending confession)
drop policy if exists "confessions_user_update_own" on confessions;
create policy "confessions_user_update_own" on confessions
  for update to authenticated
  using (author_id = auth.uid() and status = 'pending')
  with check (author_id = auth.uid() and status = 'pending');

-- Verify: SELECT on public.confessions should show 3 policies
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies where tablename = 'confessions';
