# Poker Bot — Difficulty Balance Review (Prompt 27D)

Independent judgement of whether Easy / Normal / Hard are appropriately balanced for their intended
users, distinct from one another, progressively stronger, and bounded. Evidence:
[`evaluation-results.md`](./evaluation-results.md) · [`27d-results.json`](./27d-results.json). Frozen
strategy `bot-strategy-2026-07-v1` (`strategyConfig.ts`) — **not modified** (no material defect
verified). Config intent: [`difficulty-definitions.md`](./difficulty-definitions.md).

## Verdict: BALANCED — distinct, monotone, bounded.

## EASY — beginner-suitable, bounded weaknesses ✅

- **Legal & understandable.** Loose-passive: highest VPIP (18% at 6-max), lowest PFR (4.8–8.0%),
  most calling/checking, highest top-action share (0.40–0.49 = the most predictable line). Plays like
  a loose, calling beginner — the intended feel.
- **Bounded, no chip-dumping.** All-in% 0.00–0.08%; never 3-bets (capability off); never bluffs
  (`bluffFreq` 0, `semiBluffFreq` 0). It *does* raise its strong hands (the 27C-A passivity leak is
  fixed) so it is not a pure limp-bot, but it takes no wild lines.
- **Still beats the realistic field** (mean +133 bb/100 across benchmarks; +90 HU) — by the *smallest*
  margins of the three, which is correct for the easiest tier.
- Weaknesses are the *designed* beginner leaks: over-limps (`limpEnter` range wide), over-calls
  (never re-raises), ignores position beyond a wider BB defence. Exploitable **on purpose**, bounded.

## NORMAL — solid TAG, clearly above Easy ✅

- Position-aware ranges (`usesPosition` on), equity-vs-pot-odds, value betting, capped semi-bluffs
  (`semiBluffFreq` 0.4) and positional bluffs (`bluffFreq` 0.12), sensible folding (raise-or-fold
  first-in: near-zero limp, high fold share in 6-max = disciplined, not passive).
- **PFR 7.8–23.6% vs Easy's 4.8–8.0%**, 3-bet 0.2–0.8% vs Easy's ~0 — statistically and stylistically
  distinct. More varied than Easy (lower top-action share at HU: 0.24 vs 0.40) **without** extreme
  aggression (all-in% flat ~0.04–0.08%).
- Uses several legal sizings (`cbet [0.5,0.66]`, `value [0.66,0.75]`) — not single-size like Easy.
- Mean +182 bb/100 across benchmarks (> Easy's 133).

## HARD — strongest approved-info strategy, bounded ✅

- Uses **only approved public info + own-card blockers**: blocker-aware 3-bet bluffs, draw-based
  semi-bluffs, board-texture c-bets/protection, varied sizing (3 menu entries), public-action reading
  (`readsAction` on), and **river discipline** (higher late `continueMargin` ⇒ folds medium hands to
  big rivers).
- **Not more aggressive/all-in than Normal** — bluff/c-bet frequencies are held **at or below** Normal
  (`bluffFreq` 0.10 ≤ 0.12; `cbetFreq` 0.55 ≤ 0.60); all-in% flat. Hard's edge is **thinner value +
  better equity + discipline**, not volume bluffing. This is the intended "a strong player bluffs a
  station less, not more" design.
- Highest PFR (9.5–25.8%) and 3-bet (0.5–1.1%); highest winrate (mean +224 across benchmarks, +212
  HU, +259 HU-standard/deep vs non-maniac benchmarks).
- **Explainable, non-collusive, not GTO** — every line is a labelled heuristic branch over own cards
  + public facts; no opponent-card / future-card / seed access (fairness re-proven structurally).

## Ordering (against fixed benchmarks, not only self-play)

**easy < normal < hard, monotone and positive** — 133 < 182 < 224 bb/100 (all benchmarks); 90 < 134 <
212 (heads-up, the cleanest signal). 6-max normal≈hard sits inside the wide 6-max single-seat variance
(a measurement limit, not a balance failure) — HU carries the statistical separation, matching 27C-C.

## Higher difficulty is NOT "more shoving"

All-in% is **flat across all three tiers** (0.00–0.25%). The ladder is built from selectivity +
position + value/aggression + discipline — never from raising variance. This is the single most
important balance property and it holds independently on fresh seeds.

## Why no code change (targeted-balancing gate)

Per the 27D targeted-balancing rule, a change is made **only if a material defect is verified**. The
one persistent negative (heads-up 20bb vs an *any-two-cards* all-in jammer, ~−82 bb/100 rebuy-on) is:

1. **opponent-specific & non-realistic** — no human, and none of the 7 standard benchmarks, jams every
   hand regardless of cards; it is a 27D *extra* extreme probe;
2. **configuration-specific** — only at 20bb, only heads-up, and **rebuy-amplified** (rebuy-off it is
   not a significant loss);
3. **a correct trade-off** — the bots' short-stack `callShoveStrength` is tuned for *realistic*
   shovers; widening it to beat an any-two jammer would make them call too light vs realistic short
   stacks (a net regression vs the real field) — the exact over-fit 27D forbids.

The difficulty ladder is intact, integrity is exact, and the finding does not break easy<normal<hard
(all three are similarly affected). ⇒ **frozen strategy unchanged; documented as a bounded limitation
and a human-playtest watch item.** No before/after remediation is reported because no remediation was
warranted.
