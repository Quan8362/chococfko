# Poker — Cosmetic Achievements & Onboarding Missions (Phase 1)

**Status legend:** ✅ implemented & tested · 🌒 implemented but feature-flagged OFF · ⏳ deferred to a later phase · ✖ not implemented.

This document covers the Poker **social layer, phase 1**: cosmetic achievements and a one-time onboarding mission checklist. Everything here is **🌒 shipped dark** — the code is in `main` but every flag defaults OFF, and the database migration is **committed but PENDING** manual production approval.

> **Zero coins.** No achievement or mission moves, grants, spends, or references a single coin. Poker settlement stays exactly zero-sum. A "reward" is a cosmetic badge or a checklist tick — nothing more.

---

## 1. Achievement catalog (15) — ✅ / 🌒

Source of truth: `lib/games/poker/achievements.ts` (`POKER_ACHIEVEMENTS`).

| Key | Group | Earned when |
|---|---|---|
| `first_hand` | milestone | You are dealt into a completed hand. |
| `first_pot` | milestone | You win any pot. |
| `first_showdown_win` | showdown | You win a pot at showdown. |
| `win_straight` | handmade | You win a **showdown** with a straight. |
| `win_flush` | handmade | You win a showdown with a flush. |
| `win_full_house` | handmade | You win a showdown with a full house. |
| `win_four_of_a_kind` | handmade | You win a showdown with quads. |
| `win_straight_flush` | handmade | You win a showdown with a straight flush (incl. royal). |
| `win_split_pot` | showdown | You share a single pot with ≥1 other winner. |
| `win_side_pot` | showdown | You win a side pot (pot index ≥ 1, positive amount). |
| `reconnect_finish` | resilience | You reconnect during a hand and finish it (see §7). |
| `full_table` | milestone | You play a hand with all six seats occupied. |
| `hands_10` / `hands_100` / `hands_1000` | milestone | Cumulative hands-played milestones. |

Made-hand badges require a **won showdown pot** — a fold-out that nobody contested does not award a hand badge (the winning hand was never made/shown). A royal flush is not a separate badge (it is a top-straight `straight_flush`).

## 2. Mission catalog (6) — ✅ / 🌒

Source of truth: `lib/games/poker/missions.ts` (`POKER_MISSIONS`). All missions are **period `once`** — a permanent "getting started" checklist, **not** daily quests.

| Key | Source | Target | Completed when |
|---|---|---|---|
| `complete_3_hands` | hand | 3 | Finish three hands. |
| `use_check` | hand | 1 | Use Check when it is a legal move. |
| `reach_showdown` | hand | 1 | Reach a showdown once (non-folded contender). |
| `play_beginner_blind` | hand | 1 | Play a hand at a beginner blind tier (BB ≤ the 2nd-lowest configured tier). |
| `review_rules` | action | 1 | Open the poker rules page (`markRulesReviewed`). |
| `complete_training` | action | 1 | Finish one training scenario (`markTrainingScenarioComplete`). |

## 3. Responsible-engagement restrictions — ✅

The catalog **must never** reward: daily-streak pressure, time played / long sessions, repeated all-ins, losing a large amount, winning a specific large amount, coordinated play / collusion, folding to a friend, chip dumping, or spending/acquiring coins. This is enforced by automated guardrail tests that **fail the build** if a prohibited key is introduced:
`missions.test.ts › MIS-CAT-002` and `achievements.test.ts › ACH-CAT-004`.

## 4. Authoritative progress sources — ✅

All awards are derived server-side from the engine's own settlement facts — never from a client claim (`app/games/poker/progress-record.ts`, called inside `actions.ts#settleHand`):

- **Winners / split / side pots** ← `ShowdownResult.winnersByPot` + `pots[]` (`lib/games/poker/showdown.ts`).
- **Made-hand category** ← re-evaluated server-side via `evaluateHand(hole, board)` (the winner's real 5-card hand).
- **Showdown participation / fold state** ← engine `handContributions(state)`.
- **`use_check`** ← the `poker_actions` rows for the hand (`type = 'check'`).
- **Beginner blind** ← the table's `big_blind` vs the active economy-config tiers.
- **Seat count / full table** ← players dealt into the hand.

A losing or mucking player can never receive the winner's hand badge (`instantSeatAchievements` gates made-hand badges on `payout > 0 && wonAtShowdown`; unit tests `ACH-INST-005/007`).

## 5. Idempotency model — ✅

- **Per hand:** `poker_record_hand_progress` first inserts `poker_hand_progress_records(hand_id)`; if the row already exists it returns `{recorded:false}` and does nothing — a re-settlement or duplicate callback can never double-count. (Verified: harness `AC2`.)
- **Per unlock:** `poker_achievements` has PK `(user_id, achievement_key)` + `ON CONFLICT DO NOTHING` — a badge exists exactly once. (Verified: `AC2`.)
- **Missions:** progress clamps to target (`LEAST`) and `completed_at` latches (`COALESCE`) — no overshoot, no un-complete, repeat bumps are no-ops. (Verified: `AC4`, `AC5`.)

## 6. Settlement-aftercare behavior — ✅

`recordHandProgress` runs **after** `poker_settle_hand` has already settled coins, and is fully best-effort: it is wrapped in `try/catch`, never throws into the settlement path, and a missing migration / transient error is swallowed. **A failure to record progress can never fail or roll back an already-completed settlement.** Coin + settlement results are provably identical before and after progress processing (harness `AC6`: wallet balance and `coin_ledger` row count unchanged by any recorder call).

## 7. Reconnect achievement limitations — ✅ / known limit

`reconnect_finish` depends on the client noting a genuine channel recovery while seated in a live hand (`usePokerRealtime` → `notePokerReconnect`, self-scoped RLS insert into `poker_reconnect_events`). The marker grants nothing by itself — the settlement recorder consults it and only awards the badge to a player who both reconnected **and** finished the hand. A reconnect the watchdog never classifies as a recovery will not award it (conservative by design; false-negatives possible, false-positives not).

## 8. Feature-flag rollout sequence — 🌒

Pure resolver: `lib/games/poker/flags.ts`. All default **OFF**. Recommended order:

```
POKER_ACHIEVEMENTS_ENABLED=true      # badges: read + record on settle
POKER_MISSIONS_ENABLED=true          # onboarding checklist
# deferred — keep OFF until their phases land:
POKER_FRIEND_INVITES_ENABLED=false   ⏳
POKER_QUICK_MESSAGES_ENABLED=false   ⏳
POKER_HAND_SHARING_ENABLED=false     ⏳
```

Gating is `pokerSocialFeatureOn(flags, viewer, feature)` = feature flag ON **and** viewer can see poker. There is **no admin override** — the feature ships truly dark until its flag is flipped.

## 9. Database migration order — 🌒 PENDING

Apply **after** the existing poker chain (see `release-migration-order.md`):

```
… run7_economy → poker_core → poker_private → poker_economy →
   poker_lifecycle → poker_engine → poker_admin_ops → poker_social →
   migration_poker_achievements.sql      ← THIS layer (additive, idempotent, zero-coin)
```

Additive / idempotent (`CREATE … IF NOT EXISTS`, `CREATE OR REPLACE`), non-destructive. Validated in an isolated disposable Postgres (migration applies + re-applies clean; harness `poker_achievements_tests.sql` AC1–AC7 pass; rollback removes only the new objects and is idempotent).

## 10. Rollback procedure — ✅

`migration_poker_achievements_rollback.sql` drops **only** the 5 new tables + 3 RPCs created by this layer. No coins were ever moved, so there is nothing economic to reconcile. Verified in isolation: after rollback, `poker_hands` / `game_wallets` / `poker_hole_cards` remain intact (harness gate A8).

## 11. Privacy guarantees — ✅

- Progress records store **only** an achievement key / mission key / integer counters + timestamps. No hole cards, deck order, shuffle seeds, tokens, credentials, or PII ever enter these tables.
- Read paths are RLS **read-own** (`poker_achievements`, `poker_missions`, `poker_player_progress`); `poker_reconnect_events` is self-scoped insert/read-own; the `poker_hand_progress_records` lock table is opaque (RLS on, no policy).
- All mutating RPCs are `SECURITY DEFINER`, `service_role`-only (`REVOKE … FROM PUBLIC, anon, authenticated`); a client can never invoke them directly (harness gate A4).

## 12. Reward confirmation — ✅

**Rewards are cosmetic and move zero coins.** No `game_wallets`, `coin_ledger`, stack, settlement, or payout row is read or written by any achievement/mission code path. Proven at the DB level by harness `AC6` (wallet + ledger unchanged) and by the catalog carrying no reward/coin/amount field (`ACH-CAT-004`).

---

## Status of the broader social layer

| System | Status |
|---|---|
| Achievements (15) + Missions (6) | 🌒 implemented, tested, flagged OFF |
| Migration `migration_poker_achievements.sql` | 🌒 committed, **PENDING** manual production apply |
| Friend invites | ⏳ deferred (flag reserved, unwired) |
| Quick messages / emotes | ⏳ deferred (flag reserved, unwired) |
| Hand sharing | ⏳ deferred (flag reserved, unwired) |
| Player notes | ✖ not implemented |
