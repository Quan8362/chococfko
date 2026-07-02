# Poker Integrity — Risk Signals

Explainable, evidence-only detectors for collusion and suspicious play. Every signal is a **pure
function** in `lib/games/poker/integrity/signals.ts`, computed from reduced *facts* that carry **no
hole cards, deck, or seeds**. A signal never punishes — it produces evidence for the scorer
(`scoring.ts`) and, ultimately, a human reviewer (`review.ts`).

> **Do not expose detection logic to players.** These modules run server-side only; the tables and
> RPCs are `service_role`-only (see `privacy.md`, `admin-actions.md`).

## Signal record

```ts
interface RiskSignal {
  code           // stable RiskSignalCode (below)
  category       // 'relationship' | 'gameplay' | 'account_session'
  severity       // 0..1 intrinsic strength of THIS observation
  confidence     // 0..1 driven by SAMPLE SIZE — small samples are never confident
  relatedUserIds // the accounts the signal concerns
  relatedHandIds // supporting hands (for replay links)
  windowHands    // how many hands the observation spans
  reasons        // explainable sub-codes for the admin
  evidence        // redacted NUMERIC evidence only
}
```

`severity` is *how bad this looks*; `confidence` is *how sure we are given the sample*. The scorer
multiplies them, so a strong-looking pattern seen a handful of times stays low.

## Input facts (`HandFacts`)

An integrity job reduces each completed hand from the authoritative tables into `HandFacts` (public
action log + settlement only). No card values are ever read; seat→user identity uses the
service-role hole-cards table for the mapping **only**. See `app/admin/poker/integrity-data.ts` for
the reference reducer.

## Catalogue

### Relationship (`REL_*`)
| Code | Fires when | Reuses |
|---|---|---|
| `REL_ONE_WAY_VALUE_FLOW` | value between a pair moves almost entirely one direction across ≥ N shared hands | `computeCollusionSignals` (admin.ts) |
| `REL_REPEATED_PAIRING` | the same two accounts keep sharing tables, concentrated on ≤ 2 tables | pair flow |
| `REL_PRIVATE_TABLE_PAIRING` | that pairing concentrates (≥ 70%) on **private** tables | `HandFacts.isPrivateTable` |
| `REL_VALUE_CONCENTRATION` | a winner's profit comes from one/few feeders over many hands | `collusionRiskScore` (ranking.ts) |

### Gameplay (`GP_*`)
| Code | Fires when |
|---|---|
| `GP_CHIP_DUMP` | one account repeatedly commits big (all-in / large voluntary raise) and the pot lands with a single collector |
| `GP_SOFT_PLAY` | a player is markedly **less** aggressive versus one opponent than versus the field (directed) |
| `GP_COORDINATED_FOLD` | *(reserved code)* repeated folds to a specific account's aggression |
| `GP_BOT_TIMING` | a user's decisions are both fast **and** low-jitter, or contain impossibly fast actions |
| `GP_TIMING_SYNC` | two accounts act with matched cadence across many shared hands |

### Account / session (`AS_*`)
| Code | Fires when |
|---|---|
| `AS_MULTI_SEAT` | one account occupies **multiple seats in the same hand** (structurally impossible in honest play — severity 1) |
| `AS_CONCURRENT_SESSIONS` | one account in contradictory overlapping live hands on the **same table** (different-table multi-tabling is ignored) |
| `AS_SHARED_IDENTIFIER` | accounts share a hashed device/network token — **weak by policy** (see below) |
| `AS_IMPOSSIBLE_FREQUENCY` | action rate beyond human capability (e.g. macro / auto-play) |

## False-positive guards (built in)

- **Shared workplace / household networks are not proof.** IPs are truncated to `/24` (v4) or `/48`
  (v6) before hashing, so a whole household collapses to **one** token; `AS_SHARED_IDENTIFIER`
  carries severity ≤ 0.35 and confidence ≤ 0.25 and can never reach an actionable band on its own.
- **Legitimate friends** who play a lot but trade value **both ways** produce a low `oneWayRatio` →
  no `REL_ONE_WAY_VALUE_FLOW`.
- **Fast humans** have jittery timing → not `GP_BOT_TIMING` (which needs low variance).
- **Unstable-network players** who fold/timeout to *many different* opponents show no value
  concentration → nothing fires.
- **Minimum sample floors** on every pattern; small samples yield low confidence.

These guards are asserted in `synthetic.test.ts` (scenarios 1, 2, 5, 7, 8).

## Tuning

Thresholds are per-function options (`minHandsTogether`, `oneWayThreshold`, `botMaxMedianMs`,
`botMaxJitterMs`, `impossibleMs`, `maxActionsPerMinute`). Changing them does not change the schema;
re-run the scoring job to recompute cases. Weights live in `scoring.ts` (see `risk-scoring.md`).
