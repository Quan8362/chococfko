-- TLMN / site-wide — make profiles the reliable avatar source of truth.
--
-- ROOT CAUSE this fixes: the original handle_new_user() trigger copied ONLY
-- display_name from OAuth sign-up metadata, never the avatar. Google / Facebook / LINE
-- users therefore had profiles.avatar_url = NULL even though their provider picture sat
-- in auth.users.raw_user_meta_data (avatar_url / picture). Every surface that joins
-- profiles (TLMN seats, the waiting-room host list, the wins/coins leaderboards) then
-- showed a blank/initials avatar for those users.
--
-- This migration:
--   1. Upgrades handle_new_user() to also seed avatar_url (avatar_url → picture) and a
--      better display_name (display_name → name → full_name) at sign-up, going forward.
--   2. Backfills existing profiles whose display_name / avatar_url is still NULL from the
--      same auth metadata (idempotent — only fills blanks, never overwrites a user's
--      chosen value).
--
-- profiles.avatar_url stays the authoritative APPLICATION value: a user updating their
-- avatar later changes profiles only, and onboarding never overwrites a non-null value.
-- RLS is unchanged — profiles_update still restricts writes to auth.uid() = id, so a
-- client can never overwrite another user's avatar. Safe to re-run.

-- ── 1. Sign-up trigger now seeds display_name + avatar_url from OAuth metadata ──────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    nullif(coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name'
    ), ''),
    nullif(coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    ), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ── 2. Backfill existing rows (fill blanks only) ───────────────────────────────────
update public.profiles p
set
  display_name = coalesce(
    p.display_name,
    nullif(u.raw_user_meta_data->>'display_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    nullif(u.raw_user_meta_data->>'full_name', '')
  ),
  avatar_url = coalesce(
    p.avatar_url,
    nullif(u.raw_user_meta_data->>'avatar_url', ''),
    nullif(u.raw_user_meta_data->>'picture', '')
  )
from auth.users u
where u.id = p.id
  and (p.display_name is null or p.avatar_url is null);

-- Create profiles for any auth users missing a row entirely (defensive).
insert into public.profiles (id, display_name, avatar_url)
select
  u.id,
  nullif(coalesce(
    u.raw_user_meta_data->>'display_name',
    u.raw_user_meta_data->>'name',
    u.raw_user_meta_data->>'full_name'
  ), ''),
  nullif(coalesce(
    u.raw_user_meta_data->>'avatar_url',
    u.raw_user_meta_data->>'picture'
  ), '')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- ── 3. Index for the profile joins used by the leaderboard RPCs / seat hydration ───
-- profiles(id) is already the PK, so the join is covered. No extra index needed.
