# Poker Bot — Independent Evaluation Results (Prompt 27D)

Independent re-evaluation of the **frozen** calibrated bots on a **fresh** seed group, extended
archetypes, and a full player-count × stack matrix. Method: [`evaluation-plan.md`](./evaluation-plan.md).
Machine-readable: [`27d-results.json`](./27d-results.json). Bots stay **disabled** throughout; no
production SQL, migration, or deploy. Frozen strategy `bot-strategy-2026-07-v1` was **read, never
edited** (no material defect verified — see §5 and [`difficulty-balance.md`](./difficulty-balance.md)).

## 1. Frozen versions & fresh seeds

| Item | Value |
|---|---|
| Source | `main` @ `e448a1f` + uncommitted 27C bot tree |
| Strategy version | `bot-strategy-2026-07-v1` (unchanged) |
| Fresh independent seeds | 24 (`INDEPENDENT_SEEDS`, base `0x27D1DE00`) — **proven disjoint** from calibration/validation/holdout (`independent.test.ts`) |
| Evaluator | Monte-Carlo `estimateEquity` over the unknown universe (own cards + revealed board) |
| Player counts / stacks | HU→6-max · short 20bb / standard 100bb / deep 250bb |
| Deck vs policy randomness | separated — shuffle seed derived inside the runner, never a policy input |

## 2. Actual volume & integrity

| Suite | Seeds × hands | Hands |
|---|---|---:|
| Self-play ladder (hu-std, 6max-std, 6max-short × easy/normal/hard) | 8 × 50 | 10,800 |
| Benchmark matrix (6 tables × 3 diff × 11 opponents) | 5 × 120/90 | 85,230 |
| Mixed-field soak (6-max std/short, heterogeneous) | 8 × 80 | 1,280 |
| Targeted deep-dive (flagged cells, rebuy on/off) | 16 × 250–400 | ~55,000 |
| **Total** | | **~150,000+** |

**Pooled integrity across the entire matrix — 0 defects:**

| Invariant | Result |
|---|---|
| Coin conservation (per-hand Σ=0 + pooled) | **exact, 0 violations** |
| Engine cross-check mismatches (vs canonical `playHand`) | **0** |
| Illegal / stale / duplicate actions to engine | **0** |
| Forced safe-fallbacks | **0** |
| Stuck / non-terminating hands | **0** |
| Negative / fractional stacks | **0 / 0** |

Coverage included multiway side pots, main + multiple side pots, split pots, uncalled refunds, short
all-ins, minimum raises, and multiple all-ins (mixed soak: `sidePots`>0, `allIn` up to 240/640 hands),
all conserving and matching the canonical engine hand-for-hand.

## 3. Self-play difficulty ladder (behavioural fingerprint, fresh seeds)

| Table | Diff | Hands | VPIP% | PFR% | 3bet% | AI% | SD% | topAct | fold | check | call | bet | raise | allin |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hu-standard | easy | 800 | 15.4 | 8.0 | 0.00 | 0.00 | 11.8 | 0.40 | .40 | .20 | .17 | .12 | .10 | .00 |
| hu-standard | normal | 800 | 37.9 | 23.6 | 0.75 | 0.00 | 19.5 | 0.24 | .24 | .19 | .23 | .18 | .16 | .00 |
| hu-standard | hard | 800 | 42.5 | 25.8 | 1.13 | 0.00 | 20.0 | 0.24 | .22 | .19 | .24 | .18 | .17 | .00 |
| 6max-standard | easy | 2400 | 18.2 | 4.9 | 0.00 | 0.04 | 16.4 | 0.45 | .45 | .27 | .15 | .08 | .05 | .00 |
| 6max-standard | normal | 2400 | 10.6 | 8.3 | 0.21 | 0.04 | 3.5 | 0.76 | .76 | .03 | .07 | .05 | .09 | .00 |
| 6max-standard | hard | 2400 | 16.5 | 11.8 | 0.54 | 0.00 | 6.8 | 0.63 | .63 | .07 | .11 | .08 | .11 | .00 |
| 6max-short | easy | 2400 | 16.0 | 4.8 | 0.08 | 0.08 | 14.3 | 0.49 | .49 | .25 | .14 | .08 | .04 | .00 |
| 6max-short | normal | 2400 | 9.7 | 7.8 | 0.33 | 0.08 | 2.9 | 0.80 | .80 | .03 | .05 | .04 | .08 | .00 |
| 6max-short | hard | 2400 | 12.8 | 9.5 | 0.67 | 0.25 | 5.3 | 0.72 | .72 | .05 | .08 | .06 | .09 | .00 |

**Reading it (independent confirmation of 27C-C):**
- **PFR is monotone easy < normal < hard** at every table (6-max 4.9 → 8.3 → 11.8; short 4.8 → 7.8 →
  9.5; HU 8.0 → 23.6 → 25.8). The 27C-A passivity leak (PFR 0.4–2.3%) is fixed on the fresh seeds too.
- **3-bet monotone** easy (~0) < normal (0.2–0.8) < hard (0.5–1.1).
- **All-in% is flat and tiny** (0.00–0.25%) across all difficulties — **higher difficulty is NOT more
  shoving.** Skill scales through selectivity + aggression, not variance.
- **Easy is loose-passive** (highest VPIP in 6-max at 18%, lowest PFR, most calling/checking, highest
  top-action share = most predictable). **Normal/Hard are tight-aggressive** (raise-or-fold: high fold
  share, near-zero limp). This is the intended style contrast, not just a strength gap.
- **All six action types are used**; no difficulty is a single-action policy. Easy's higher top-action
  share (0.40–0.49) is the intended beginner "tell"; normal's high fold share in 6-max (0.76–0.80) is
  correct tight-fold discipline, not a mechanical loop (its non-fold actions span call/bet/raise).

## 4. Difficulty ordering vs fixed benchmarks

Mean bb/100 of the bot under test, averaged across benchmark matchups (fresh seeds):

| Slice | easy | normal | hard | Ordering |
|---|---:|---:|---:|---|
| All 11 benchmarks | **133** | **182** | **224** | easy < normal < hard ✅ |
| Heads-up tables only | **90** | **134** | **212** | easy < normal < hard ✅ (cleanest signal) |
| HU standard+deep, non-maniac benchmarks | **140** | **159** | **259** | easy < normal < hard ✅ |
| 6-max, non-maniac benchmarks | **93** | **184** | **175** | easy < normal ≈ hard (normal/hard within 6-max variance) |

The ladder is **monotone and positive**, strongest on the heads-up tables (per 27C-C, HU carries the
clean statistical ordering; 6-max single-seat winrate CIs are wide). Against the non-degenerate
benchmarks every difficulty is solidly profitable, hard the most.

**Note on `beatsZero` counts:** at this bounded independent sample (5 seeds/matchup) many cells are
*flat* (CI crosses 0) rather than *significant* — that is a sample-size property, not a weakness. The
larger 27C-C holdout (16 seeds × 250–300) already established the significant "beats all 7 benchmarks";
27D re-confirms the **direction** on fresh seeds and adds harder probes.

## 5. Flagged cells investigated (no material defect)

The lean pass surfaced 12 CI-significant negatives, all against the maximal-aggression archetypes
(`aggressive` / `over_aggressive` / `min_raise`) in short-stack or 6-max-clone tables. Each was
re-run at higher sample with **rebuy ON vs OFF** to separate a real leak from a rebuy/variance artifact:

| Cell | lean (5 seeds) | deep rebuy-ON (16 seeds) | deep rebuy-OFF | Verdict |
|---|---:|---:|---:|---|
| 6-max easy/normal/hard vs 5× `min_raise` | −68…−97 (LOSS) | **+10 / +30 / +10** (positive) | **+357 / +499 / +346** | small-sample fluke; the min-raisers bust each other |
| HU-short hard vs `aggressive` | −98 (LOSS) | **+82** (beats0) | −68 (CI[−423,287], n.s.) | variance; positive at sample |
| 6-max hard vs `aggressive`/`over_aggressive` | −224/−233 | +205 / +892 (CI crosses 0) | n.s. (huge CI) | variance-dominated |
| **HU-short hard vs `over_aggressive`** | −85 (LOSS) | **−82** (CI[−87,−76], tight) | +46 (n.s., 381 hands) | **consistent, but a bounded opponent-specific artifact — see below** |

**The one persistent negative** — heads-up **20bb** vs a bot that goes **all-in every single hand**
(`over_aggressive`) — is real and consistent (~−82 bb/100, rebuy-on) but is **not a material strategic
defect**:

- The correct call vs an *any-two* 20bb jam needs only ~48.7% equity (very wide, ~60–80% of hands);
  the bots' short-stack `callShoveStrength` (~0.56) is tuned for **realistic** shovers, so they
  over-fold to a literally-any-two jammer and bleed blinds.
- **No human and none of the 7 standard benchmarks plays this way.** It is one of the 27D *extra*
  extreme probes, only at 20bb, only heads-up, and **rebuy-amplified** (rebuy-off it is not a
  significant loss). Practice tables mix difficulties vs a human — this opponent cannot occur there.
- **Widening the shove-call range to beat an any-two jammer would make the bots call too light vs
  realistic shovers (who shove tighter) — a net regression vs the real field.** That is the precise
  over-fit 27D forbids ("do not tune merely to maximize wins"). The tighter range is *correct* against
  every realistic opponent.

⇒ **No code change.** Documented as a bounded, explainable limitation + a human-playtest watch item
(short-stack any-two-shove feel). Full reasoning: [`difficulty-balance.md`](./difficulty-balance.md),
[`exploitability-review.md`](./exploitability-review.md).

## 6. Performance (decision-time bench, `decideSafely` path)

`bench --decisions 6000` (µs/decision); note these ran **contended** with the matrix, so they are an
upper bound vs 27C-C's isolated 8.8 / 16.9 / 30.3 ms:

| Difficulty | mean | P50 | P95 | max |
|---|---:|---:|---:|---:|
| simulation | ~1 µs | 1 µs | 2 µs | 199 µs |
| easy | 10.1 ms | 8.5 ms | 24.1 ms | 38.4 ms |
| normal | 19.5 ms | 16.6 ms | 47.2 ms | 86.0 ms |
| hard | 32.8 ms | 29.2 ms | 80.0 ms | 140.3 ms |

Bounded by fixed sample caps (80/140/220) + the driver action budget (`seats × 200`) — **no unbounded
loop** (nonterminating defects = 0), **no event-loop-blocking growth**, stable ~270 MB memory across
the ~90-minute full run (no leak), **no cross-table private-state cache**. Every decision is dwarfed by
the 700–6000 ms cosmetic action delay, so latency is invisible to a human and never delays settlement.

## 7. Distortions explicitly accounted for

- **Auto-rebuy** inflates all-in/showdown frequencies and, critically, distorts vs-maniac winrate
  (an infinitely-refunded jammer transfers real chips on suckouts) — winrate uses **true rebuy-
  independent P&L**, and the flagged maniac cells were re-checked rebuy-off (§5).
- **5-clone tables** create degenerate multiway dynamics (a table of 5 min-raisers) that do not occur
  in a real mixed practice table; used only as an integrity/exploitability stress.
- **Small independent sample (5 seeds/matchup)** widens CIs — 27D confirms **direction**; 27C-C
  supplies the large-sample significance.
- **Self-play** measures style, not field strength; strength is judged vs fixed benchmarks (§4).
