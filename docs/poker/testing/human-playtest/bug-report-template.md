# Poker Bot — Bug Report Template (Prompt 27F-B)

Use this for any defect found during a human session. It reuses the project severity scale **blocker · major · minor · cosmetic** from [`../../alpha/issue-severity-guide.md`](../../alpha/issue-severity-guide.md) — do not invent new severity labels. Categories match the in-app report flow in [`../../beta/tester-guide.md`](../../beta/tester-guide.md).

> **Privacy — read before filling this in.** Never paste hole cards, the deck, RNG seeds, commit-hash-as-secret, passwords, cookies, tokens, or another player's hidden cards into a report. Describe hands in words; use **hand/table/action IDs** and **integer chip amounts** as evidence, and stable **`PKR_*` error codes** if the UI shows one. This matches [`../../operations/privacy-safe-logging.md`](../../operations/privacy-safe-logging.md).

---

## Template (copy one block per bug)

```
BUG ID:            (leave blank — coordinator assigns, e.g. 27FB-BUG-001)
SEVERITY:          blocker | major | minor | cosmetic   (tester's best guess; lead re-triages)
CATEGORY:          rules | coin | realtime | reconnect | ui | mobile | performance | translation | sound | abuse | other
DATE & TIME:       YYYY-MM-DD HH:MM (local, include timezone offset)

ENVIRONMENT:       LOCAL — http://127.0.0.1:3000 / Supabase http://127.0.0.1:64321
                   (confirm the on-screen banner said "LOCAL TEST — NOT PRODUCTION")
BUILD / COMMIT:    (short hash from `git rev-parse --short HEAD` at session start — read-only)

TESTER ID (anon):  (e.g. C1 — never a real name)
TESTER ROLE/GROUP: A Beginner | B Casual | C Experienced
DEVICE & BROWSER:  (e.g. iPhone 14 / iOS Safari, Desktop / Chrome 126)
VIEWPORT:          (e.g. 844×390 landscape, or "desktop 1920×1080")
APP MODE:          Browser | PWA
ORIENTATION:       Landscape | Portrait

DIFFICULTY:        Easy | Normal | Hard | Mixed
TABLE MODE:        Heads-up | 6-max multiway
TABLE ID:          (if visible)
HAND ID:           (if visible)

STEPS TO REPRODUCE:
  1.
  2.
  3.
EXPECTED RESULT:
ACTUAL RESULT:

REPRODUCIBILITY:   always | often | sometimes | once/unable to reproduce
SCREENSHOT / VIDEO: (attach; crop out any hidden cards and any credential field)
CONSOLE / NETWORK EVIDENCE:
  - console error text or PKR_* code (no tokens/cookies/cards)
  - relevant network request name/status (redact Authorization headers & bodies with cards)
```

## Field notes

- **Severity guidance (from the project scale):**
  - **blocker** — stops play or threatens integrity: any chip discrepancy, wrong winner/pot/side-pot, duplicate settlement, stack lost on reconnect, frozen hand, acting out of turn, or **any** private-card exposure. If you even *suspect* one, file it as blocker with exact numbers.
  - **major** — seriously degrades play but doesn't corrupt chips/state: control unusable in landscape, timer inconsistency, janky reconnect, frequent "stale state" rejections.
  - **minor** — noticeable but low-impact, workaround exists.
  - **cosmetic** — pure visual/text polish, no functional impact.
- **Reproducibility** helps triage prioritise; "once/unable to reproduce" is still worth filing for integrity-class bugs.
- The **coordinator/lead** sets the authoritative severity during triage; the tester's severity is a first guess.

## Illustrative example (schema only — NOT a real observed defect)

> Marked clearly as a format example. It contains no real tester, no real hand, and no fabricated test result — it exists only to show how the fields are filled.

```
BUG ID:            27FB-BUG-000 (EXAMPLE)
SEVERITY:          major
CATEGORY:          mobile
DATE & TIME:       2026-07-05 14:20 +07:00
ENVIRONMENT:       LOCAL — http://127.0.0.1:3000 / Supabase http://127.0.0.1:64321 (banner: LOCAL TEST — NOT PRODUCTION)
BUILD / COMMIT:    <short-hash>
TESTER ID (anon):  C1
TESTER ROLE/GROUP: C Experienced
DEVICE & BROWSER:  Pixel 7 / Android Chrome
VIEWPORT:          915×412 landscape
APP MODE:          PWA
ORIENTATION:       Landscape
DIFFICULTY:        Hard
TABLE MODE:        Heads-up
TABLE ID:          <table-id if shown>
HAND ID:           <hand-id if shown>
STEPS TO REPRODUCE:
  1. Open the raise slider on a mobile PWA in landscape.
  2. Drag toward max.
  3. The confirm button sits under the device notch / safe-area inset.
EXPECTED RESULT:   Confirm button fully visible and tappable.
ACTUAL RESULT:     Button ~40% under the notch; hard to tap. (No chip/state error — amounts were correct.)
REPRODUCIBILITY:   always
SCREENSHOT / VIDEO: attached (no cards visible in frame)
CONSOLE / NETWORK EVIDENCE: none; no PKR_* code shown
```

---

**Related:** [issue-severity-guide.md](../../alpha/issue-severity-guide.md) · [privacy-safe-logging.md](../../operations/privacy-safe-logging.md) · [stop-test-checklist.md](./stop-test-checklist.md) · [result-import-format.md](./result-import-format.md)
