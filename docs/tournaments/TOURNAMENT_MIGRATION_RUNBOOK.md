# Tournament System — Production Migration Runbook

_Last updated: 2026-07-29 (Prompt 14). Standalone tournament module
(`/admin/giai-dau/**`, `/giai-dau/**`). This runbook is the authoritative procedure for applying the
tournament database to **production Supabase**. It touches **only** `tournament*` objects and never
modifies data belonging to other modules (Poker / TLMN / Caro / Chinese Chess / dictionary / places)._

> **Who runs this:** a human operator with access to the production Supabase project's **SQL Editor**.
> Migrations are applied through the Supabase dashboard SQL Editor (the established pattern for this
> project — see `[[poker-local-validation]]`), **not** raw `psql` against the pooler. The app deploy
> (Vercel, git-linked to `main`) must happen **after** the DB migration succeeds — deploying the code
> against a DB without the tournament tables would make the tournament pages error.

---

## 0. Exact migration order (from the repository — do not reorder)

The schema (all 11 tables + RLS + visibility helpers + audit log) lives in **core**. Every later
migration adds only functions + grants (+ the realtime publication in the last one), so the order is a
strict dependency chain:

| # | File | Adds | Depends on |
|---|---|---|---|
| 1 | `supabase/migration_tournament_core.sql` | 11 tables, all RLS policies, 3 public visibility helpers (`tournament_is_public`, `tournament_event_is_public`, `tournament_match_is_public`), `tournament_audit_log`, `update_updated_at`/`tournament_bump_version` triggers, indexes, grants | — |
| 2 | `supabase/migration_tournament_group_assignment.sql` | `tournament_initialize_groups`, `tournament_save_group_assignments`, `tournament_generate_group_matches`, `tournament_regenerate_group_matches` | core |
| 3 | `supabase/migration_tournament_scoring.sql` | `tournament_save_match_result`, `tournament_clear_match_result`, `tournament_save_qualification_override`, `tournament_delete_qualification_override` | core |
| 4 | `supabase/migration_tournament_knockout_bracket.sql` | `tournament_save_knockout_seeds`, `tournament_clear_knockout_seeds`, `tournament_generate_knockout`, `tournament_reset_knockout`, `tournament_save_knockout_result`, `tournament_clear_knockout_result` | core |
| 5 | `supabase/migration_tournament_group_knockout.sql` | `tournament_gk_branch_complete`, `tournament_save_group_knockout_seeds`, `tournament_clear_group_knockout_seeds`, `tournament_generate_group_knockout`, `tournament_reset_group_knockout`, `tournament_save_group_knockout_result`, `tournament_clear_group_knockout_result` | core, knockout_bracket |
| 6 | `supabase/migration_tournament_reset_path.sql` | `tournament_reset_bracket_complete`, `tournament_reset_knockout_path`, **+ adds the 11 tables to the `supabase_realtime` publication** | core, scoring, knockout_bracket, group_knockout |
| 7 | `supabase/migration_tournament_public_privacy.sql` | **Privacy fix (Prompt 14B).** `tournament_public_qualification_overrides(uuid)` public-safe projection RPC; **REVOKE SELECT** on `tournament_qualification_overrides` from anon/authenticated; **DROP** the `tqo_public_select` policy | core, scoring |

Each rollback file is `..._rollback.sql` next to its migration. Roll back in **reverse** order (7 → 1).

### Idempotency (verified on the local stack, Prompt 14B — clean apply → reapply → 10/10 harnesses → rollback → reapply → retest, all green)
Re-applying any file is safe:
- Tables: `CREATE TABLE IF NOT EXISTS` (×11, all in core).
- Functions: `CREATE OR REPLACE FUNCTION` (×27, incl. the privacy RPC).
- Policies: each `CREATE POLICY` is preceded by `DROP POLICY IF EXISTS`; the privacy migration `DROP POLICY IF EXISTS tqo_public_select`.
- Grants: `REVOKE`/`GRANT` are naturally idempotent.
- Indexes: `CREATE [UNIQUE] INDEX IF NOT EXISTS` (×15).
- Realtime: guarded by a `pg_publication_tables` existence check before `ALTER PUBLICATION … ADD TABLE`.
- No unguarded `ALTER TABLE … ADD`.

> **Privacy note (Prompt 14B):** after migration 7, anon/authenticated have **no direct SELECT** on
> `tournament_qualification_overrides` — the public page reads the tie-resolution ordering only through
> the `tournament_public_qualification_overrides(event_id)` RPC, which returns just `group_id` +
> `resolved_order` for public events. `reason` and `created_by` are never exposed via REST, RPC, or
> Realtime. If you apply the first 6 without migration 7, the override `reason`/`created_by` remain
> anon-readable — **migration 7 is required for the privacy guarantee.**

---

## 1. Pre-checks (run BEFORE any migration)

Run these read-only queries in the production SQL Editor and confirm the expected result.

**1a. Confirm you are on the correct project** (mask before sharing screenshots):
```sql
select current_database(),
       inet_server_addr()::text as host,   -- expect the prod Supabase host, NOT 127.0.0.1
       now();
```
The app's `NEXT_PUBLIC_SUPABASE_URL` (`https://<ref>.supabase.co`) must match this project's ref.
**If the ref does not match the production project, STOP.**

**1b. Confirm there is NO partially-applied tournament migration** (expect `0`):
```sql
select count(*) as tournament_tables
from information_schema.tables
where table_schema = 'public' and table_name like 'tournament%';
-- expect 0. If between 1 and 10, a previous run was partial → do NOT re-run blindly;
-- inspect which objects exist and resume from the failed file (all files are idempotent).
```

**1c. Confirm no name collisions with other modules** (expect `0` — tournament names are prefixed and
distinct from `caro_tournament*`):
```sql
select proname from pg_proc
where proname like 'tournament\_%' escape '\'
  and proname not like 'caro\_%' escape '\';
-- expect 0 rows on a clean prod DB.
```

**1d. Confirm a backup / PITR is in place.** Supabase Pro/Team projects have daily backups + Point-in-Time
Recovery; confirm the project plan and the most recent successful backup timestamp in
**Dashboard → Database → Backups**. **If you cannot confirm a backup or PITR window, STOP** — this
migration is additive and low-risk, but the production safety gate requires a recovery path before any
schema change.

---

## 2. Backup

- **Preferred:** rely on Supabase automated daily backup + PITR (confirmed in 1d). Note the current
  timestamp so you have a known-good restore point.
- **Belt-and-braces (optional):** because this migration only *adds* `tournament*` objects and touches no
  existing table, a logical dump is not required. If desired, snapshot the (currently empty) namespace:
  ```sql
  select 'no tournament objects yet' where not exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name like 'tournament%');
  ```

---

## 3. Apply (one file at a time, stop on first error)

Apply **in the order of §0**, one file per SQL Editor run. **Do not paste all six as one blob** — that
makes it impossible to know which file failed. After each file, confirm "Success. No rows returned"
(or the expected notices) before moving to the next.

If you use `psql` instead of the dashboard (not the recommended path for this project), run each file
with `ON_ERROR_STOP` so a mid-file failure aborts that file rather than leaving it half-applied:
```bash
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migration_tournament_core.sql
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migration_tournament_group_assignment.sql
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migration_tournament_scoring.sql
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migration_tournament_knockout_bracket.sql
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migration_tournament_group_knockout.sql
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migration_tournament_reset_path.sql
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migration_tournament_public_privacy.sql
```

Record the result of each file (file name → success / error text) as you go.

**After group 1 (core):** run the schema/RLS verification in §4.1 before continuing.
**After group 6 (reset_path):** run the full verification in §4.

> **Do NOT run the SQL test harnesses (`supabase/tournament_*_tests.sql`) against production.** They
> insert-and-`ROLLBACK` fixtures; they are for the local stack only. Production verification is
> **read-only** (below).

---

## 4. Post-migration verification (read-only)

**4.1 — 11 tables exist and RLS is enabled** (expect 11 rows, all `rowsecurity = true`):
```sql
select tablename, rowsecurity
from pg_tables
where schemaname='public' and tablename like 'tournament%'
order by tablename;
```
Expected tables: `tournaments`, `tournament_events`, `tournament_competitors`, `tournament_groups`,
`tournament_group_memberships`, `tournament_matches`, `tournament_match_games`,
`tournament_knockout_seed_slots`, `tournament_qualification_overrides`, `tournament_podium`,
`tournament_audit_log`.

**4.2 — Public SELECT policies exist, audit log has NONE:**
```sql
select tablename, policyname, cmd, roles
from pg_policies
where schemaname='public' and tablename like 'tournament%'
order by tablename, policyname;
```
Confirm: every public table has a `*_public_select` (`SELECT`) policy + a `*_service_all` (`ALL`,
`service_role`). **`tournament_audit_log` must have ONLY the service-role policy** (no public read).

**4.3 — Foreign keys + unique constraints present** (spot check; expect the composite FKs):
```sql
select conrelid::regclass as tbl, conname, contype
from pg_constraint
where conrelid::regclass::text like 'tournament%' and contype in ('f','u','p')
order by tbl, contype;
```
Confirm the composite FKs (e.g. `tqo_group_fk (group_id,event_id)`, `tp_competitor_fk
(competitor_id,event_id)`) and the uniqueness guards (`tqo_one_per_group`, `tp_rank_1_2_uq`).

**4.4 — RPC privileges are locked down** (mutating RPCs: NO anon/authenticated EXECUTE):
```sql
select p.proname,
       has_function_privilege('anon', p.oid, 'execute')          as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
       has_function_privilege('service_role', p.oid, 'execute')  as service_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'tournament\_%' escape '\'
order by p.proname;
```
Expected:
- The **3 visibility helpers** (`tournament_is_public`, `tournament_event_is_public`,
  `tournament_match_is_public`): `anon_exec = t`, `auth_exec = t`, `service_exec = t`.
- **Every other tournament RPC** (23 of them): `anon_exec = f`, `auth_exec = f`, `service_exec = t`.

**4.5 — SECURITY DEFINER + pinned search_path** (expect every function `prosecdef = t` with
`search_path=public, pg_temp` in `proconfig`):
```sql
select proname, prosecdef, proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname like 'tournament\_%' escape '\'
order by proname;
```

**4.6 — Key indexes exist** (expect ~15 `tournament*` indexes):
```sql
select indexname from pg_indexes
where schemaname='public' and tablename like 'tournament%'
order by indexname;
```

**4.7 — Realtime publication includes the tournament tables:**
```sql
select tablename from pg_publication_tables
where pubname='supabase_realtime' and schemaname='public' and tablename like 'tournament%'
order by tablename;
-- expect the 11 tables (at minimum: tournaments, tournament_events, tournament_matches,
-- tournament_match_games, tournament_qualification_overrides, tournament_podium).
```

**4.8 — No stray tournament data** (expect `0`; production starts empty):
```sql
select count(*) as tournaments from public.tournaments;
```

**4.9 — Override privacy is enforced (Prompt 14B)** — expect
`privacy_rpc=1, anon_base_sel=f, auth_base_sel=f, anon_rpc=t, pub_policy=0, rpc_secdef=t`:
```sql
select
  (select count(*) from pg_proc where proname='tournament_public_qualification_overrides') as privacy_rpc,
  has_table_privilege('anon','public.tournament_qualification_overrides','SELECT')          as anon_base_sel,
  has_table_privilege('authenticated','public.tournament_qualification_overrides','SELECT') as auth_base_sel,
  has_function_privilege('anon','public.tournament_public_qualification_overrides(uuid)','EXECUTE') as anon_rpc,
  (select count(*) from pg_policies where tablename='tournament_qualification_overrides'
      and policyname='tqo_public_select') as pub_policy,
  (select prosecdef from pg_proc where proname='tournament_public_qualification_overrides') as rpc_secdef;
```
`anon`/`authenticated` must **not** be able to `select reason, created_by from
tournament_qualification_overrides` — a direct select returns permission-denied; only the RPC
(returning `group_id`, `resolved_order`) is reachable.

---

## 5. Failure handling

- **A file errors mid-run:** STOP. Do not run the next file. Read the error. Because every file is
  idempotent, the usual fix is **forward-fix**: correct the condition and re-run the *same* file. Do not
  reach for a destructive rollback unless the object graph is inconsistent AND you have confirmed no
  data would be lost (production is empty at first apply, so a rollback here loses nothing).
- **Rollback (only if forward-fix is not viable):** run the matching `..._rollback.sql` files in
  **reverse** order down to the point you need, e.g. to undo everything:
  ```
  migration_tournament_public_privacy_rollback.sql
  migration_tournament_reset_path_rollback.sql
  migration_tournament_group_knockout_rollback.sql
  migration_tournament_knockout_bracket_rollback.sql
  migration_tournament_scoring_rollback.sql
  migration_tournament_group_assignment_rollback.sql
  migration_tournament_core_rollback.sql   -- drops the 11 tables (CASCADE); only safe while empty
  ```
  `migration_tournament_core_rollback.sql` drops tables — **only run it while the tournament tables hold
  no real data.**
- **App deployed but DB not migrated:** the tournament routes will error. Roll back the Vercel deployment
  first (see §6 of the operations notes below), then fix the DB, then re-deploy.

---

## 6. Post-migration → deploy sequence

1. DB migration §3 succeeds and §4 verification passes.
2. Merge the tournament branch into `main` → Vercel (git-linked) builds and deploys production.
3. Run the production smoke test (see `TOURNAMENT_TEST_REPORT.md` §Production smoke).
4. If anything is wrong at the app layer only (DB healthy), roll back the Vercel deployment to the prior
   production build; the DB can stay migrated (the tables are simply unused until the next deploy).

### Temporarily hiding the module (kill-switch, no redeploy of DB)
If you need to hide tournaments from users without touching the DB, remove the two navigation entries
(the `/giai-dau` links in `components/Nav.tsx` + `components/MobileMenu.tsx` and the card in
`app/games/page.tsx`) and redeploy. The routes still exist but are unlinked. There is no server env flag
for this module; navigation removal is the intended soft-disable.

---

## 7. What operators need to know

- The module is **admin-authored**: only emails in `ADMIN_EMAILS` can create/edit/publish tournaments.
- Guests (anonymous) can read **published** and **completed** tournaments only. `draft` and `archived`
  are invisible to the public (enforced by RLS, not just the UI).
- All writes go through **service-role RPCs** guarded by `checkIsAdmin()` in server actions; anon and
  authenticated roles have **no** EXECUTE on any mutating tournament RPC.
- The audit log is **service-role only** and is never exposed to the public read model or realtime.
