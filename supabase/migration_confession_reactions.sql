-- ── CONFESSION REACTIONS (heart) ─────────────────────────────────────────────
-- Run this migration in the Supabase SQL editor.
-- One heart per (confession, user). Count is derived; no denormalized column.

create table if not exists confession_reactions (
  confession_id uuid not null references confessions(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (confession_id, user_id)
);

create index if not exists confession_reactions_confession_idx
  on confession_reactions(confession_id);

alter table confession_reactions enable row level security;

-- Anyone can read reactions (used only for an aggregate count + "did I react").
drop policy if exists "confession_reactions_public_read" on confession_reactions;
create policy "confession_reactions_public_read" on confession_reactions
  for select using (true);

-- Logged-in users can add their own heart.
drop policy if exists "confession_reactions_user_insert" on confession_reactions;
create policy "confession_reactions_user_insert" on confession_reactions
  for insert to authenticated
  with check (user_id = auth.uid());

-- ...and remove it.
drop policy if exists "confession_reactions_user_delete" on confession_reactions;
create policy "confession_reactions_user_delete" on confession_reactions
  for delete to authenticated
  using (user_id = auth.uid());
