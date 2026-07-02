# Ratholing & Value-Transfer Policy

Authoritative logic: [`lib/games/poker/ratholing.ts`](../../../lib/games/poker/ratholing.ts)
(pure, unit-tested). Thresholds: `POKER_ECONOMY_V1.ratholing` in `economyConfig.ts`. The
database remains the authoritative enforcer; the pure module lets the server actions reject
abusive intent early and makes the rules testable without a DB.

## 1. What is ratholing?

A player wins a big pot (deep stack), stands up to "bank" the win, then rejoins with only the
minimum so their won chips are no longer at risk. It is a value-lock exploit: opponents can
never win those chips back. Related exploits: repeated join/leave to snipe, multi-account value
transfer, chip dumping, and private-table collusion.

## 2. The retained-stack rule

> A player who leaves a table **deep** must, if they **return soon**, return with the stack
> they left with.

Encoded as:

- **Deep** = left with more than the table **minimum** buy-in (`stackAtLeave > bounds.min`).
  Leaving at/under the min shelters nothing, so it is not ratholing.
- **Soon** = within `retainedStackWindowMinutes` (**30 min**).
- **Required return** = `retainedStack × minReturnStackFactorPct` (**100%**), clamped to the
  table max (you can never be forced above the cap) and never below the table min
  (`minReturnBuyIn`).
- Only a **voluntary stand-up** (`kind = 'stand_up'`) triggers the rule. **Busted** players
  legitimately lost their chips and may rebuy at the minimum. **Disconnects** are handled by
  the reconnect grace below.

`evaluateRejoin` returns `rathole_min_return` with the exact `requiredMinBuyInChips` so the UI
can tell the player precisely what to post.

## 3. Repeated join/leave throttle

- At most `maxRejoinsPerWindow` (**3**) rejoins to the **same** table per
  `rejoinWindowMinutes` (**10 min**) sliding window (`rejoinsInWindow`,
  `isRapidRejoinBlocked`).
- Hitting the cap yields `rapid_rejoin` and a `rapidRejoinCooldownSeconds` (**120 s**) pause.
- This blunts seat-sniping and stack-cycling without affecting normal play (a real player
  rarely rejoins one table 3× in 10 minutes).

## 4. Legitimate reconnection is protected

A departure recorded as a **disconnect** within `reconnectGraceSeconds` (**120 s**) is treated
as a *resume*, not a fresh join. Inside the grace window the player is exempt from **both** the
rapid-rejoin throttle **and** the rathole minimum — they may return with whatever they had.
This guarantees a technical drop (mobile backgrounding, network blip) never penalizes a genuine
user. See the "technical reconnect within grace" test in `ratholing.test.ts`.

## 5. Multi-account value transfer & chip dumping

Structural defenses (not heuristics):

- **One seat per table.** `poker_reserve_seat` / `poker_sit_down` reject a second seat for the
  same `auth.uid()` at a table (a held reservation counts too), closing the "sit two accounts
  at one table" hole.
- **Concurrent-seat cap.** `maxConcurrentSeatsPerUser` (**2**) limits how many tables one human
  grinds at once.
- **No direct transfer.** There is no user-to-user coin move anywhere in the system; a dumper
  must lose chips *at the table*, which is observable.

Detection (heuristic, ops-only): `collusionRiskScore` (in `ranking.ts`) flags a player whose
winnings are dominated by a single counterparty and/or who faced very few distinct opponents.
It is a **signal for review**, never an automatic punishment — action goes through the audited
admin/incident flow (`migration_poker_admin_ops.sql`).

## 6. Private-table abuse

Private (password) tables are where collusion is easiest. Mitigations: the same one-seat and
concurrent-seat limits apply; private tables are excluded from public ranking eligibility
considerations by the distinct-opponent floor (a closed group of friends can't reach 8 distinct
opponents); and `collusionRiskScore` still runs on their hands for ops review.

## 7. Tuning

All thresholds are config-versioned. Changing them means publishing a new economy version
(audited), never editing a live one. Defaults were chosen conservatively to avoid punishing
legitimate reconnects; tighten only if abuse is observed in the simulation or in production
telemetry.
