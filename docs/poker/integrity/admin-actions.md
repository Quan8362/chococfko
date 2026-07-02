# Poker Integrity — Admin Actions

The closed set of actions an admin may take on a review case, the metadata each demands, and the
hard invariant that **no first-version action moves or confiscates coins**. Defined in
`lib/games/poker/integrity/review.ts`; enforced server-side by `poker_risk_record_action`.

## Action catalogue (`ReviewActionKind`)

| Action | Effect | Targets a user? | Restriction primitive |
|---|---|---|---|
| `no_action` | explicit decision to do nothing (still audited) | no | — |
| `monitor` | add to a watch list / raise sampling | yes | — |
| `restrict_private_tables` | may not create/join private tables | yes | `no_join` |
| `restrict_high_blind` | may not sit at high-blind tables | yes | `no_sit` |
| `temp_poker_suspension` | time-boxed suspension from poker (requires expiry) | yes | `no_join` (expiring) |
| `account_investigation` | escalate to a full cross-feature account investigation | yes | — |
| `escalation` | escalate to a senior reviewer / trust & safety (case-level) | no | — |
| `coin_review` | **flag** a coin-ledger review for a human — does **NOT** move coins | yes | — |

Restriction-type actions delegate to the existing audited primitive
`poker_admin_restrict_player` (which itself moves no coins) and are reversible via
`poker_admin_lift_restriction`.

## Required metadata (every action)

`validateReviewAction()` and the SQL both require:

- **Reason** — mandatory free-text justification.
- **Evidence reference** — pointer into the evidence (case id, hand id, or signal code).
- **Admin identity** — the acting admin's user id (`p_actor`).
- **Timestamp** — recorded automatically.
- **Audit entry** — an immutable `poker_admin_audit` row **and** a `poker_risk_case_events` row are
  written in the same transaction.
- **Target user** — for user-targeting actions.
- **Expiry** — for `temp_poker_suspension` (must be in the future).

## The coin invariant

```ts
actionMovesCoins(kind) === false   // for EVERY kind
```

- No action confiscates, deducts, or transfers coins. This is asserted in `review.test.ts`.
- `coin_review` **only flags** the ledger for a human to review; it never calls a wallet RPC.
- `validateReviewAction` rejects any action for which `actionMovesCoins` is true (defence in depth).
- The SQL integrity path never invokes a wallet function. Integrity and wallet logic are separate.

## Suggested (advisory) status after an action

`suggestedStatusAfterAction` proposes a next status, but the admin still chooses the transition
explicitly (and it is validated by the FSM):

| Action | Suggested status |
|---|---|
| `no_action` | `DISMISSED` |
| `monitor` | `MONITORING` |
| `escalation`, `account_investigation` | `INVESTIGATING` |
| everything else | `ACTION_REQUIRED` |

## Guardrails

- **Never auto-ban on one weak signal** — actions are manual, reasoned, and audited.
- **No automatic coin confiscation in v1** — deliberately out of scope; would require a separate,
  reviewed workflow.
- **Reversible** — restrictions can be lifted; only the audit trail is immutable.
- **Least privilege** — action RPCs are `service_role`-only; the browser cannot reach them, and the
  admin server layer gates on `checkIsAdmin()`.
