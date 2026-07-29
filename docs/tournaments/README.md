# Tournament System

A standalone tournament-management module for Chợ Cóc FKO. It lets admins run real-world
community tournaments (round-robin groups, single-elimination knockouts, and combined group→knockout
formats) with scoring, standings, tie resolution, brackets, podiums, and a controlled result-correction
path — and gives the public read-only pages to follow along, with realtime updates.

It is **independent** of the mini-games (Poker / TLMN / Caro / Chinese Chess): its own routes, its own
`tournament*` tables, its own domain code. Nothing here mixes with game engines or wallets.

## Routes

| Route | Who | Purpose |
|---|---|---|
| `/giai-dau` | Public (anon OK) | List of published/completed tournaments |
| `/giai-dau/[slug]` | Public (anon OK) | Detail: overview, competitors, schedule, standings, bracket, podium |
| `/admin/giai-dau` | Admin only | Tournament list + create |
| `/admin/giai-dau/[id]` | Admin only | Tournament overview + status actions (publish/archive) + events |
| `/admin/giai-dau/[id]/noi-dung/[eventId]` | Admin only | Event workspace: competitors, groups, schedule, scoring, bracket, tie, reset |

## Code map

```
app/giai-dau/**                     public pages (server components, RLS-only reads)
app/admin/giai-dau/**               admin pages + server actions (checkIsAdmin → service-role RPC)
components/tournaments/public/**     public UI (never imports admin/service-role)
components/tournaments/admin/**      admin UI (forms, boards, bracket, dialogs, tablists)
lib/tournaments/domain/**           PURE domain logic (round-robin, standings, ties, knockout, podium,
                                    progression, reset-impact) — no DB, no React, unit-tested
lib/tournaments/admin/**            admin read queries + security tests
lib/tournaments/public/**           public read model (RLS) + tab slugs + security tests
supabase/migration_tournament_*.sql 6 migrations (+ rollbacks) — see the runbook
supabase/tournament_*_tests.sql     9 SQL harnesses (local stack only)
e2e/tournaments/**                  Playwright suite (local stack only)
```

## Security model (summary)

- **Admin writes:** every mutation is a server action that runs `checkIsAdmin()` **before**
  `createAdminClient()`, then calls a `SECURITY DEFINER` RPC. Anon/authenticated have **no** EXECUTE on
  any mutating RPC; all mutating RPCs pin `search_path` and `REVOKE … FROM PUBLIC, anon, authenticated`.
- **Public reads:** anonymous, RLS-gated. Rows are visible only when the tournament is `published` or
  `completed`. `draft`/`archived` never leak (RLS, not just UI). The **audit log is never public**.
- **Isolation:** composite foreign keys bind child rows to their `(…, event_id)` parent, and every admin
  action re-verifies the event belongs to the tournament in the URL (no IDOR across tournaments/events).
- **XSS:** public JSON-LD is emitted through `jsonLdString()`, which re-encodes `< > &` + U+2028/9 so an
  admin-authored name/location can't break out of the `<script>` tag.

## Documents in this folder

- **`TOURNAMENT_SYSTEM_DESIGN.md`** — full design: data model, formats, algorithms, security rationale.
- **`TOURNAMENT_ADMIN_GUIDE.md`** — how an operator runs a tournament end to end.
- **`TOURNAMENT_MIGRATION_RUNBOOK.md`** — exact migration order, pre-checks, apply, verify, rollback.
- **`TOURNAMENT_TEST_REPORT.md`** — test coverage, quality-gate results, findings, and deploy status.

## Status

Shipped through Prompt 14 (final audit + docs). Production migration + deploy are gated on the operator
steps in the runbook (backup confirmation + applying the SQL in the Supabase SQL Editor, then merging to
`main`). See `TOURNAMENT_TEST_REPORT.md` for the current gate status.
