# Poker Integrity — Risk Scoring

`lib/games/poker/integrity/scoring.ts` combines `RiskSignal`s into one **0..100 score per subject**
(a user, or an account pair) with an overall confidence and an explainable breakdown. It is pure,
deterministic, and **versioned** so scores can be recomputed and compared as rules evolve.

## Versioning

```ts
RISK_SCORE_VERSION   = 'poker-integrity-score-2026-07-v1'
RISK_WEIGHTS_VERSION = 'poker-integrity-weights-2026-07-v1'
```

Both are stamped on every `RiskScore` and persisted on `poker_risk_cases`. The review-queue dedup
key is **version-scoped** (`riskCaseDedupKey`), so bumping the weights version opens a fresh,
comparable case rather than silently mutating history.

## How the score is built

1. **Per-signal strength** `= weight(code) × severity × confidence`, each in `[0,1]`. Because the
   signal's own confidence is a factor, weak/low-sample evidence contributes little.
2. **Combination (noisy-OR):** `score = 100 × (1 − Π(1 − strengthᵢ))`. This keeps the score ≤ 100
   and rewards **independent corroboration** (several distinct signals) more than one strong signal.
3. **Overall confidence** = strength-weighted mean of the signals' confidences.
4. **Band** via thresholds: `low ≥ 20`, `medium ≥ 45`, `high ≥ 70` (`bandFor`).

### Weights (v1)

| Signal | Weight | | Signal | Weight |
|---|---|---|---|---|
| `AS_MULTI_SEAT` | 0.95 | | `GP_SOFT_PLAY` | 0.65 |
| `GP_CHIP_DUMP` | 0.90 | | `REL_VALUE_CONCENTRATION` | 0.60 |
| `REL_ONE_WAY_VALUE_FLOW` | 0.85 | | `GP_COORDINATED_FOLD` | 0.60 |
| `AS_IMPOSSIBLE_FREQUENCY` | 0.80 | | `GP_TIMING_SYNC` | 0.55 |
| `GP_BOT_TIMING` | 0.70 | | `AS_CONCURRENT_SESSIONS` | 0.50 |
| `REL_PRIVATE_TABLE_PAIRING` | 0.50 | | `REL_REPEATED_PAIRING` | 0.40 |
| | | | `AS_SHARED_IDENTIFIER` | 0.30 |

Structural impossibilities weigh most; identifier hints weigh least (corroborating only).

## Stored on each case (`RiskScore`)

- `score`, `confidence`, `band`, `scoreVersion`, `weightsVersion`
- `contributingSignals[]` — each with its `contribution` (points), `severity`, `confidence`,
  `reasons`, and **redacted numeric** `evidence`
- `subjectUserIds`, `relatedUserIds`, `relatedHandIds`, `windowHands`, `categories`

## Guarantees

- **Explainable** — you can always see *which* signals produced the number and by how much.
- **Deterministic** — `recomputeScore(subject, signals)` reproduces an identical score. This is the
  "recalculate when rules change" contract.
- **No irreversible auto-punishment** — the score is advisory. `isActionableAdvisory()` returns true
  only for `band === 'high'` **and** `confidence ≥ MIN_ACTION_CONFIDENCE (0.5)`, and even then it
  merely *suggests* a human may consider stronger action.
- **Separate from wallet** — no coin fields, no side effects. Scoring never reads or writes wallet
  state; a high score never moves coins.

## Recalculation workflow

1. Weights or thresholds change → bump `RISK_WEIGHTS_VERSION`.
2. Re-run the scoring job over the history window.
3. `poker_risk_upsert_case` refreshes **only** the recomputable fields (score, confidence, band,
   signal snapshot) and appends a `rescore` timeline event. Human-owned `status`, `notes`, and
   `resolution` are never overwritten.
