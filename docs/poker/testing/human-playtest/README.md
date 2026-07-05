# Poker Bot — Controlled Human Playtest Package (Prompt 27F-B)

**Status: PREPARED, NOT EXECUTED.** This folder is the tester-facing and coordinator-facing package for the controlled human bot playtest. No tester has been invited, no session has been run, and no flag has been changed. It prepares the materials so that a *human* coordinator can run sessions when they choose to.

It builds on, and does not replace, the runbook in [`../../bots/human-playtest-plan.md`](../../bots/human-playtest-plan.md) (Prompt 27D) and the verified local environment in [`../local-playtest-setup.md`](../local-playtest-setup.md) (the Prompt 27F-A stack).

---

## Precondition

Prompt 27F-A concluded **READY FOR PROMPT 27F-B HUMAN TESTER PREPARATION** after a technical bot playtest of 40 real completed hands (Easy/Normal/Hard heads-up + some multiway) with exact chip conservation, independent hand-evaluation agreement, no private-card leak, and no production traffic. Its open human-test priorities — real mobile/tablet devices, PWA install & resume, orientation & safe-area, longer sessions, **Hard multiway**, and **side-pot / split-pot** coverage — are what this package is designed to exercise.

## Environment (local only)

- App: `http://127.0.0.1:3000` (practice matrix `/games/poker/practice`)
- Local Supabase: `http://127.0.0.1:64321` · Local mail: `http://127.0.0.1:64324`
- Login: email + password for the two local accounts `tester-a@example.com` and `tester-b@example.com`. Password lives only in git-ignored `.env.playtest.local` and is never revealed or stored anywhere.
- Public poker **OFF** · cash bots **OFF** · tournaments **OFF** · practice-only · no production wallets.

## The package

| Deliverable | File |
|---|---|
| Tester groups matrix | [`tester-groups.md`](./tester-groups.md) |
| Session matrix & hand targets | [`session-plan.md`](./session-plan.md) |
| Tester instructions | [`tester-instructions.md`](./tester-instructions.md) |
| Evaluation / rating form (15 axes + free text) | [`evaluation-form.md`](./evaluation-form.md) |
| Bug-report template | [`bug-report-template.md`](./bug-report-template.md) |
| Stop-test checklist | [`stop-test-checklist.md`](./stop-test-checklist.md) |
| Result-import format for 27F-C | [`result-import-format.md`](./result-import-format.md) |

## Guardrails baked into every doc

Practice-only; bots always labeled; credentials never shared or stored; severity uses the project scale **blocker/major/minor/cosmetic**; no cards/tokens/passwords/PII in any report or result; no tester invited automatically; no code, SQL, migration, git, deployment, wallet, or production flag touched by this preparation.

## Hand-off to 27F-C

27F-C consumes the anonymous [`result-import-format.md`](./result-import-format.md) records and computes medians/verdicts against the success bars in [`../../bots/human-playtest-plan.md`](../../bots/human-playtest-plan.md) §5. This package produces only raw, anonymous, real inputs — it computes no verdict and invents no data.

---

**Related:** [human-playtest-plan.md](../../bots/human-playtest-plan.md) · [local-playtest-setup.md](../local-playtest-setup.md) · [internal-playtest-environment.md](../internal-playtest-environment.md) · [difficulty-definitions.md](../../bots/difficulty-definitions.md) · [user-disclosure.md](../../bots/user-disclosure.md) · [issue-severity-guide.md](../../alpha/issue-severity-guide.md) · [privacy-safe-logging.md](../../operations/privacy-safe-logging.md)
