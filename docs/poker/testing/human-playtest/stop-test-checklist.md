# Poker Bot — Stop-Test Checklist (Prompt 27F-B)

If **any** of the following appears, **stop the session immediately**, do not keep playing "to confirm," and notify the coordinator. Every item here is a **blocker** on the project scale ([`../../alpha/issue-severity-guide.md`](../../alpha/issue-severity-guide.md)) and maps to a hard release invariant in [`../../beta/success-criteria.md`](../../beta/success-criteria.md) and [`../test-plan.md`](../test-plan.md). Capture evidence *without* private cards (see [`bug-report-template.md`](./bug-report-template.md)), then halt.

Guiding rule: **when in doubt, stop.** A false alarm costs a minute; a missed integrity failure invalidates the test.

---

## Hard stops

| # | Condition | What it looks like | Immediate action |
|---|---|---|---|
| 1 | **Production Supabase traffic** | Any request to `kjfnqbzfhymhfodmgyow.supabase.co` or the domain `chococfko.com` instead of `127.0.0.1:64321`; banner not "LOCAL TEST — NOT PRODUCTION" | Stop all sessions. Do not log in again. Alert coordinator — environment is not isolated. |
| 2 | **Private-card leakage** | You can see the bot's or another seat's hidden hole cards, or any card you shouldn't; a network payload shows cards that aren't yours | Stop. File blocker with hand/table ID (describe in words — do **not** paste the cards). |
| 3 | **Indication of bot cheating** | Bot plays as if it knows your cards or future board cards (folds the nuts to your bluff repeatedly, calls only when beating you) | Stop. Note the hands so it can be reviewed against logs. |
| 4 | **Real-wallet impact** | Anything referencing real money, real balance, payment, or cash-out | Stop immediately. This build must never touch a wallet. |
| 5 | **Chip conservation failure** | Total chips before ≠ after a hand; pot pays out more/less than was wagered | Stop. Record exact integer amounts in and out. |
| 6 | **Negative or fractional stack** | A stack shows below zero or a non-integer chip count | Stop. Screenshot the stack value. |
| 7 | **Duplicate settlement** | A pot appears to pay out twice; a stack jumps by the pot amount more than once | Stop. Record hand ID and the doubled amount. |
| 8 | **Illegal or stale action accepted** | You (or a bot) act out of turn, bet below min / above stack, or a "stale state" action is accepted and changes the hand | Stop. Note the sequence of actions. |
| 9 | **Unrecoverable frozen hand** | A hand hangs and neither waiting, refresh, nor reconnect recovers it | Stop. Note whether refresh/reconnect was tried. |
| 10 | **Unauthorized access** | You can reach an admin screen, another user's data, or a table you shouldn't; a control appears that shouldn't be available to a tester | Stop. Do not explore further; report the path. |
| 11 | **Tournament activation** | Any tournament UI, lobby, or flow becomes reachable (tournaments must stay OFF) | Stop. Tournaments are hard-off; this indicates a flag/config problem. |
| 12 | **Authentication or privacy leak** | Login behaves unexpectedly, a credential/token is shown on screen or in a report, or personal data is exposed | Stop. Do not screenshot the credential; report that it occurred. |

## After a stop

1. **Halt the session.** Record the real partial hand count and which item triggered the stop (this goes in the result file's `incomplete_reason`).
2. **File a blocker** using [`bug-report-template.md`](./bug-report-template.md) with IDs and integer amounts — never cards or credentials.
3. **Do not resume** any session (including other testers') until the coordinator confirms the cause is understood and the environment is still isolated and safe.
4. Items **1, 4, 10, 11, 12** (production traffic, real wallet, unauthorized access, tournament activation, auth/privacy leak) mean **pause the entire playtest**, not just the one session.

## What is *not* a stop

Normal test-build roughness is expected and should be filed at its real severity, not treated as a hard stop: cosmetic glitches, a bet-slider that shows a wrong number **but corrects to the right amount**, sound/animation out of sync while state stays correct, or a single recoverable reconnect. Log these as major/minor/cosmetic and keep playing.

---

**Related:** [issue-severity-guide.md](../../alpha/issue-severity-guide.md) · [success-criteria.md](../../beta/success-criteria.md) · [bug-report-template.md](./bug-report-template.md) · [tester-instructions.md](./tester-instructions.md)
