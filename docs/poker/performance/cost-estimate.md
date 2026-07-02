# Poker — Cost Estimate

Directional, order-of-magnitude cost drivers for running Poker at the tiers in capacity-model.md,
**and** the metered cost of the load tests themselves. Not a quote — actual cost depends on the
Supabase/Vercel plans in effect and real usage. Fill the "Measured" column from the staging run +
the provider dashboards.

> Guardrail reminder: load runs are branch-only and capped by `scripts/poker-load/config.ts`. The
> stop switch (`.STOP`) halts spend immediately. Delete the preview branch when done.

---

## 1. Cost drivers (what actually moves the bill)

| Driver | Scales with | Why it matters for Poker |
|---|---|---|
| Supabase Realtime | concurrent connections + messages/s | **~7,000 msgs/s at target** — the dominant driver (bottlenecks.md W1) |
| Supabase DB compute | CPU + connections | per-action RPCs + reads; pooler keeps connections bounded |
| Supabase egress | bytes out (realtime + reads) | payloads are small (public columns), but ×600 clients adds up |
| Supabase storage | rows over time | hands/actions/settlements accrue; see §3 growth |
| Vercel functions | invocations × duration × concurrency | every action = one server-action invocation |
| Vercel bandwidth | asset + response bytes | 3 table backgrounds are webp; rest are SVG/WebAudio (light) |
| Logs | volume | telemetry writes to `analytics_events`, not logs; keep app logs lean |

## 2. Relative cost by tier (per active hour, directional)

Normalise soft-launch = **1×**. Realtime + function invocations dominate and scale ~linearly with
seated players; storage is a slow accrual.

| Tier | Seated | Realtime | Functions | DB compute | Relative /hr |
|---|---|---|---|---|---|
| soft-launch | 60 | 1× | 1× | 1× | **1×** |
| moderate | 180 | ~3× | ~3× | ~2–3× | **~3×** |
| target | 600 | ~10× | ~8–10× | ~4–6× | **~8–10×** |

Sub-linear DB compute vs linear realtime/functions is expected: the engine is cheap and reads are
indexed, so the marginal player mostly adds a realtime subscriber + occasional RPC.

## 3. Storage growth (per 1,000 completed hands, approx)

| Table | Rows / hand | Note |
|---|---|---|
| `poker_hands` | 1 | small |
| `poker_actions` | ~10–20 | betting actions + blinds; jsonb-light |
| `poker_hole_cards` | = seats | 2 cards each; purge policy candidate |
| `poker_hand_state` | 1 | serialized engine blob — largest per-row |
| `poker_hand_settlements` | 1 | payouts jsonb |

At ~3–4 hands/s (target), that's ~250k–350k hands/day → low-single-digit GB/day of mostly small
rows, dominated by `poker_hand_state`. **Recommend a retention/archival policy** for
`poker_hand_state` and `poker_deck` (resume-only data) once hands complete, to cap storage and
keep history queries fast. (Not implemented in this phase — flagged as a follow-up.)

## 4. Load-test cost (the tests themselves)

| Activity | Metered cost | Control |
|---|---|---|
| `engine-bench` / `preflight` / unit tests | **$0** (offline) | — |
| Preview branch (idle) | branch compute + storage while alive | delete promptly |
| `readload` at `baseline` | small realtime + read metering | start here; watch dashboard |
| Playwright multiplayer | branch metering + CI minutes | one box; low |
| `target`/`soak` runs | the expensive ones | require explicit approval; guardrails + `.STOP` |

**Do not run `target`/`soak` without cost approval.** Step up one profile at a time and read the
Supabase/Vercel dashboards between steps.

## 5. Cost-reduction levers (align with scaling levers)

1. **Realtime payload shrink → Broadcast** (bottlenecks.md W1): fewer messages = lower realtime
   cost *and* headroom — the single highest-leverage change.
2. **Single version bump per action** (W4): ~halves the hottest-row realtime deltas.
3. **`poker_hand_state`/`poker_deck` retention**: archive/delete resume data after completion (§3).
4. **Lobby read caching**: short-TTL cache under heavy lobby load cuts read volume.
5. **Region colocation**: not a direct $ line but cuts function duration (billed) by removing
   cross-region RTT.

## 6. Bottom line

Engine compute is effectively free; **Supabase Realtime is the cost and scaling pivot.** A
soft-launch (≤ ~30 tables) is inexpensive and low-risk. Before the 100-table target, run the branch
load test, confirm the realtime quota headroom, and (if needed) apply levers 1–2 — they reduce both
the scaling ceiling risk and the bill.
