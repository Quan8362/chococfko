# Tournament System — Admin Guide

_How an operator runs a tournament end to end. Audience: an admin (an email in `ADMIN_EMAILS`)._
_All admin screens live under `/admin/giai-dau`. Guests never see anything here._

Everything an admin does is a server action guarded by `checkIsAdmin()`; a non-admin who reaches an
admin URL is redirected to `/`. All writes are authoritative on the server — the UI only reflects state
the server confirms.

---

## 0. Lifecycle at a glance

```
draft ──publish──▶ published ──(auto/complete)──▶ completed
  │                    │
  └────────archive─────┴──────────▶ archived
```

- **draft** — work in progress. Invisible to the public. Build the whole tournament here.
- **published** — public can read it at `/giai-dau/<slug>`. You can still edit and enter results.
- **completed** — the tournament is finished (podiums decided). Still public.
- **archived** — hidden from the public again. Use for old/retired tournaments.

Only `published` and `completed` tournaments are ever visible to guests.

---

## 1. Create a tournament

1. Go to `/admin/giai-dau` → **create**.
2. Enter the name, slug (used in the public URL `/giai-dau/<slug>`), dates, location, and optional
   rules link.
   - The slug must be unique. Name and dates are validated (end date not before start date).
3. Save → you land on the tournament page in **draft**.

## 2. Create an event (nội dung)

A tournament has one or more **events** (e.g. "Men's Singles", "Women's Doubles"). Each event has its
own format and its own competitors, schedule, standings, and bracket.

1. On the tournament page → **add event**.
2. Choose the **format**:
   - **round_robin** — one group (or several), everyone plays everyone; ranked by points.
   - **knockout** — single-elimination bracket only.
   - **group_knockout** — group stage first, then top competitors advance to a knockout bracket
     (with an optional consolation bracket for the next tier).
3. For group formats, set the group count and how many qualify per group (championship / consolation).
   For knockout, set whether a third-place match is played.

## 3. Add competitors (vận động viên)

1. Open the event → **competitors** tab.
2. Add each competitor (name + optional short name + optional seed).
3. You can reorder and edit until you generate the schedule.

## 4. Groups / seeding

- **Round-robin & group_knockout:** open the **groups** tab. Assign competitors to groups by
  drag-and-drop, or use the automatic **fallback** distribution. There is always a keyboard/button
  fallback for drag-and-drop.
- **Knockout & group_knockout bracket:** open the **seeding** tab and place competitors into bracket
  slots. Uneven fields get **BYEs** automatically (a competitor with a BYE advances without playing).

## 5. Generate the schedule / bracket

1. Preview first — the workspace shows exactly what will be created (e.g. round-robin shows the exact
   match list; knockout shows the bracket shape with BYE placement).
2. **Generate**. This is **idempotent** for the round-robin schedule — regenerating rebuilds the same
   set without duplicating. Generating a knockout builds the bracket rounds from your seeds.

## 6. Enter results (scoring)

1. Open the **schedule** / **results** tab.
2. For each match, enter the game scores. The server:
   - validates the scores,
   - updates the match status,
   - recomputes standings (round-robin) or advances the winner to the next bracket slot (knockout),
   - and, when a bracket completes, computes the **podium** (1st / 2nd / 3rd, including joint-third when
     there is no third-place match).
3. Standings/points/diff and the bracket update live; the public page follows via realtime.

**Correcting a result:** you can clear/re-enter a match. If a completed result has **downstream**
completed matches that depend on it, the normal edit is refused — use the controlled reset in §8.

## 7. Tie resolution

When a round-robin group is **fully tied** at a qualification boundary (the standings algorithm cannot
separate them for who qualifies), the workspace surfaces a **tie / resolution** step:

1. Open the tie panel. It shows only the tied competitors at the ambiguous boundary.
2. Drag them into the order the organising committee decides, optionally with a private reason note.
3. Save. The public standings then show a neutral **"Ban tổ chức phân định"** ("decided by the
   committee") marker — guests see that a decision was made, **not** the internal ordering rationale.

## 8. Controlled downstream reset (correcting an upstream result)

To change a completed upstream knockout result whose downstream is already decided:

1. Open the **reset** / correction path for the match.
2. **Preview** the impact — the workspace lists exactly what will be reset: which downstream matches,
   how many scores are deleted, which participants are cleared, and any podium/status change. This is
   read-only; nothing changes yet.
3. If you accept, type the exact confirmation word **`RESET`** and confirm.
4. The server re-derives the dependency graph from the database (it never trusts the preview), resets
   **only the affected branch**, re-progresses it, and recomputes the podium/status atomically.
   Independent branches, the other bracket, and the group stage are left untouched.

Re-enter the corrected score and let the bracket/podium recompute.

## 9. Publish / archive

- **Publish** (from the tournament status actions): moves `draft → published`. The tournament becomes
  publicly readable at `/giai-dau/<slug>`. There is a publish gate — the tournament must be in a
  sensible state first (the UI tells you if something blocks publishing).
- **Archive**: hides a `published`/`completed` tournament from the public again.
- **Delete** is only allowed for an empty draft (a safety guard against removing a live tournament).

## 10. What the public sees

- `/giai-dau` — the list of published + completed tournaments.
- `/giai-dau/<slug>` — overview, competitors, schedule, standings (for group formats), bracket + podium
  (for knockout formats). Tabs are keyboard-navigable and deep-linkable (`?event=…&tab=…`).
- Guests **cannot** see draft or archived tournaments, the audit log, or any internal tie rationale.
- The public page updates in near-real-time as you enter results (no reload needed).

---

## Reference

- Data model, formats, and algorithms: `TOURNAMENT_SYSTEM_DESIGN.md`.
- Applying the database in production: `TOURNAMENT_MIGRATION_RUNBOOK.md`.
- Test coverage and gate status: `TOURNAMENT_TEST_REPORT.md`.

---

## Scoped management surface (`/quan-ly-giai-dau`) — Prompt 15B-2

`/quan-ly-giai-dau` is the shared management surface for **Site Admins, managers and scorekeepers**.
It reuses the same workspace as `/admin/giai-dau` but is scoped by membership, so a person can manage
specific tournaments without being a global Site Admin.

**Roles**
- **Site Admin** (`ADMIN_EMAILS`, e.g. `chococfko@gmail.com`): everything — create tournaments,
  manage members, and hard-delete drafts.
- **Manager**: run a tournament — update/publish/archive, events, competitors, groups, brackets,
  scores, tie overrides. Cannot manage members or hard-delete, and cannot create tournaments.
- **Scorekeeper**: view + record scores only. The event workspace collapses to a score-only view.

**Inviting a manager/scorekeeper (Site Admin)**
1. Open the tournament at `/quan-ly-giai-dau/<id>` → “Thành viên quản lý”.
2. Enter the person's email, pick a role, press *Mời*. A PENDING invitation is created (no email is
   sent yet — 15B-2 does not include delivery).
3. The invitee signs in with that email and visits `/quan-ly-giai-dau`; the invitation is claimed
   automatically (verified JWT email) and the tournament appears in their list.
4. Change a role with the row's role select; **Thu hồi** revokes access (effective on their next
   check); a revoked email can be **Mời lại** (re-invited).

**Navigation**: the “Quản lý giải đấu” menu entry appears for Site Admins and for anyone with at
least one active membership. Managers/scorekeepers never see the `/admin` area.
