# Poker Alpha — Issue Severity Guide

Use this to pick a severity when filing an in-game report, and for triage on the dashboard.
The in-game form uses four levels: **blocker · major · minor · cosmetic**. When unsure, pick
the higher one — triage can downgrade.

The severity a tester picks is their *perception*; the Alpha lead sets the authoritative
severity during triage on `/admin/poker/alpha`.

---

## Blocker

Stops play or threatens **integrity**. These map directly to the Alpha
[exit blockers](./exit-criteria.md) and must be investigated immediately.

Examples:
- Any **coin discrepancy**: total chips before ≠ after a hand; a stack that changes with no
  reason; a pot that pays more or less than it collected.
- **Wrong winner**, wrong main pot, or wrong side pot.
- **Duplicate settlement** or duplicated cash-out (paid twice).
- **Stack lost on reconnect** or after a disconnect.
- A **stuck / frozen hand** that cannot progress.
- Players seeing **different authoritative state** that never reconciles.
- Any sign of **private-card exposure** (you can see someone's unrevealed hole cards, or your
  cards appear somewhere public).
- Being able to **act out of turn**, act when you shouldn't, or bypass a rule.

If you even *suspect* one of these, file it as a blocker with exact numbers.

---

## Major

Seriously degrades the experience but doesn't corrupt coins or state.

Examples:
- A control is **unusable in landscape** on a common device (overlapping, off-screen).
- The **timer** behaves inconsistently (wrong time shown, but the server still resolves).
- Reconnect **works but is slow / janky** or shows a confusing intermediate state.
- Bet slider / presets produce an **unexpected but corrected** amount.
- A clearly **wrong label or amount** shown transiently that then corrects itself.
- Frequent action **rejections** ("stale state") during normal play.

---

## Minor

Noticeable but low-impact; a workaround exists.

Examples:
- Small layout glitches that don't block action.
- Animation/sound out of sync with state (but state itself is correct).
- Confusing-but-recoverable wording.
- Rare, non-reproducible visual hiccups.

---

## Cosmetic

Purely visual/textual polish with no functional impact.

Examples:
- Spacing, alignment, color, or icon nits.
- Minor translation wording (not a wrong meaning).
- Non-ideal empty states.

> A **wrong translation that changes meaning** (e.g. mislabels a button so a tester takes the
> wrong action) is at least **minor**, often **major** — not cosmetic.

---

## Triage workflow (Alpha lead)

Bug report `status` values (in `poker_bug_reports`): `open → triaged → in_progress →
resolved | wont_fix | duplicate`.

1. Read new `open` reports on `/admin/poker/alpha` (bucketed by severity/device/browser/phase).
2. Cross-check integrity blockers against `poker_ops_events` (coin conservation, settlement,
   sequence gaps, frozen hands) on the same page and `/admin/poker/observability`.
3. Set authoritative severity; mark `triaged`.
4. For blockers, reproduce with the attached table/hand ID via `/admin/poker/hands/[handId]`
   and `/admin/poker/[tableId]`.
5. Move to `in_progress`, then `resolved`/`wont_fix`/`duplicate`.

A single **unresolved blocker** halts Alpha advancement (see exit criteria).
