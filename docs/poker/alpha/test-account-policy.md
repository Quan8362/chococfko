# Poker Alpha — Test-Account Policy

How testers are identified, added, removed, and how Alpha data is kept separate from real
production statistics and cleaned up safely.

---

## 1. Accounts

- Testers sign in with their normal **Google** account. We do **not** create shared logins,
  weaken Google auth, or bypass OAuth for anyone.
- **No passwords** are stored in source or in any doc. Access is by email allowlist only.
- Do **not** use real customers' production accounts for destructive testing. Testers should
  use dedicated accounts they control and that we knowingly added to the allowlist.
- Prefer a small set of **dedicated test accounts** (e.g. project-owned Google accounts) for
  destructive / edge-case scripts, and clearly-labelled tester accounts for the rest.

---

## 2. The allowlist (add / remove testers)

Access is governed by two server-only environment variables (never client-exposed):

| Var | Meaning |
|---|---|
| `POKER_ALPHA_MODE` | `1` = Alpha gate active (only allowlisted testers + admins get in) |
| `POKER_ALPHA_TESTERS` | comma-separated **emails** of approved testers |

`POKER_ALPHA_TESTERS` parses exactly like `ADMIN_EMAILS`: comma-separated, trimmed,
case-insensitive, de-duplicated (`lib/games/poker/flags.ts` → `parseAlphaTesters`).

**To add a tester:** append their Google email to `POKER_ALPHA_TESTERS` in the Vercel project
env (the environment running the Alpha) and redeploy / restart so the new env is live. Confirm
on `/admin/poker/alpha` → "Approved testers".

**To remove a tester:** delete their email from `POKER_ALPHA_TESTERS` and redeploy. They lose
access on the next request (the gate is evaluated server-side per request).

**Admins** (`ADMIN_EMAILS`) always have access and do not need to be on the tester list.

> Enforcement is server-side (`app/games/poker/access.ts`). Removing someone from the list is
> sufficient — there is no client-only hiding to work around.

---

## 3. Keeping Alpha coin separate

- All poker coin is **play-money "xu"** — there is no real-money exposure at any tier.
- Run the Alpha on a **staging / preview** environment or the admin-only production stage so
  Alpha hands do not mix into public production statistics. This is the preferred isolation.
- If a **production Alpha** is unavoidable (to reproduce a device/network issue), keep
  `POKER_ALPHA_MODE=1` so only testers play, and treat their coin activity as test data (see
  identification & cleanup below). Poker wallet/economy tables are additive and separable from
  the rest of the site's stats.

---

## 4. Identifying Alpha data

Alpha data is attributable and therefore separable:

- **Bug reports:** every row in `poker_bug_reports` is Alpha data (this table exists only for
  the Alpha). `reporter_id` ties each to a tester.
- **Tester activity:** poker hands/tables/wallet rows created by the tester accounts. Map
  tester emails → `auth.users.id`, then filter `poker_tables.created_by`,
  `poker_seats.user_id`, `poker_hands` via their tables, and the coin ledger by those user IDs.
- **Environment:** if the Alpha ran on staging/preview, *all* poker data there is Alpha data.

Keep the tester email list (the `POKER_ALPHA_TESTERS` value used during the Alpha) recorded in
the go/no-go notes so the tester→user-id mapping is reproducible later.

---

## 5. Cleaning Alpha data safely

- On **staging/preview**: the simplest clean is to reset/rotate that environment's database —
  it contains no real production data.
- On **production** (if used): do **not** run destructive deletes casually. Prefer to *leave
  play-money data in place* and simply **exclude tester user IDs** from any public stats /
  leaderboards. If deletion is required, scope it explicitly to the identified tester user IDs
  / their tables and to `poker_bug_reports`, run it as a reviewed one-off with a backup, and
  never touch other games (TLMN, Caro, Chinese Chess) or non-tester rows.
- Bug reports may be retained for the historical record even after other Alpha data is cleared
  — they contain only sanitised, non-sensitive context.

Any production data change follows the global safety rules: additive-first, no destructive
migrations, backup before delete, and never modify real customer data.

---

## 6. Winding down without losing stacks

To end an Alpha session cleanly:

1. Set `POKER_BLOCK_NEW_JOINS=1` — running tables continue, no new sits/joins/creates.
2. Let existing hands finish; players cash out normally (stacks return to their wallets).
3. Once tables are empty, set `POKER_ALPHA_MODE=0` (and keep `POKER_ENABLED=0`) to close the
   Alpha to everyone but admins.
4. Then perform data identification / cleanup per sections 4–5 if required.
