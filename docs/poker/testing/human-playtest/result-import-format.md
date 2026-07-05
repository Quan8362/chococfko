# Poker Bot — Result Import Format for Prompt 27F-C (Prompt 27F-B)

The structured, privacy-safe format the coordinator fills in per completed session and hands to **Prompt 27F-C** for aggregation. It is a **flat file** (CSV or JSON) kept with the other playtest docs — **not** a production database table (creating a prod table is explicitly out of scope). One record = one tester's one session.

> **Privacy — enforced.** A record may contain **only** the fields below. It must **never** contain passwords, cookies, access/JWT tokens, `Authorization` headers, private/hole cards, the deck, RNG seeds, IP addresses, email/phone, or a tester's real name. Attribution is via an **anonymous tester ID** only. This mirrors the allow-list in [`../../operations/privacy-safe-logging.md`](../../operations/privacy-safe-logging.md).

---

## 1. Field dictionary

| Field | Type | Allowed values / notes |
|---|---|---|
| `tester_id` | string | Anonymous, e.g. `A1`, `B2`, `C1`. Never a name. |
| `group` | enum | `A` (Beginner) · `B` (Casual) · `C` (Experienced) |
| `session_id` | string | From [`session-plan.md`](./session-plan.md), e.g. `S5` |
| `difficulty` | enum | `easy` · `normal` · `hard` · `mixed` |
| `table_type` | enum | `heads_up` · `multiway_6max` |
| `app_mode` | enum | `browser` · `pwa` |
| `device_browser` | string | Coarse only, e.g. `android_chrome`, `ipad_safari`, `desktop_chrome` |
| `orientation` | enum | `landscape` · `portrait` |
| `hands_played` | integer | Real observed count; ≥ 0. Do not round up or estimate. |
| `completed` | boolean | `true` only if the session met its plan and wasn't stopped |
| `incomplete_reason` | string \| null | Required if `completed=false`; e.g. `stopped: stop-test #6 negative stack`, or `short: tester left early` |
| `build_commit` | string | Short hash from `git rev-parse --short HEAD` at session start (read-only) |
| `ratings` | object | The 15 axes below, each integer `1–5` or `null` if not applicable |
| `integrity_flags` | object | The 4 booleans below |
| `free_text` | object | The 8 short answers below (strings; may be empty) |
| `defect_ids` | array<string> | Bug IDs filed this session, e.g. `["27FB-BUG-003"]`; `[]` if none |

**`ratings` keys** (all integer 1–5 or null; 5 = best; `repetition` and `frustration` are reverse-scored so 5 = "no problem"):
`fairness`, `difficulty_suitability`, `decision_quality`, `bet_size_naturalness`, `action_variety`, `repetition`, `bluff_credibility`, `river_quality`, `multiway_quality`, `timing_naturalness`, `ui_clarity`, `mobile_usability`, `frustration`, `learning_value`, `enjoyment`.

**`integrity_flags` keys** (boolean): `bots_always_labeled` (should be `true`), `saw_hidden_cards` (should be `false`), `chip_anomaly` (should be `false`), `frozen_hand` (should be `false`). Any value in the wrong direction must also appear as a `blocker` in `defect_ids`.

**`free_text` keys** (string): `most_unnatural_decision`, `repeated_pattern`, `difficulty_too_easy_or_hard`, `repeatable_exploit`, `unreasonable_bet_size`, `timing_tells`, `ui_realtime_reconnect_integrity_issue`, `would_play_again`.

## 2. CSV layout

Flat header row (ratings and flags flattened with dotted keys; free-text as separate columns). One row per session record.

```
tester_id,group,session_id,difficulty,table_type,app_mode,device_browser,orientation,hands_played,completed,incomplete_reason,build_commit,rating.fairness,rating.difficulty_suitability,rating.decision_quality,rating.bet_size_naturalness,rating.action_variety,rating.repetition,rating.bluff_credibility,rating.river_quality,rating.multiway_quality,rating.timing_naturalness,rating.ui_clarity,rating.mobile_usability,rating.frustration,rating.learning_value,rating.enjoyment,flag.bots_always_labeled,flag.saw_hidden_cards,flag.chip_anomaly,flag.frozen_hand,ft.most_unnatural_decision,ft.repeated_pattern,ft.difficulty_too_easy_or_hard,ft.repeatable_exploit,ft.unreasonable_bet_size,ft.timing_tells,ft.ui_realtime_reconnect_integrity_issue,ft.would_play_again,defect_ids
```

`defect_ids` in CSV = semicolon-separated inside one cell, e.g. `27FB-BUG-003;27FB-BUG-004`.

## 3. JSON template (recommended for 27F-C)

```json
{
  "tester_id": "",
  "group": "A|B|C",
  "session_id": "",
  "difficulty": "easy|normal|hard|mixed",
  "table_type": "heads_up|multiway_6max",
  "app_mode": "browser|pwa",
  "device_browser": "",
  "orientation": "landscape|portrait",
  "hands_played": 0,
  "completed": false,
  "incomplete_reason": null,
  "build_commit": "",
  "ratings": {
    "fairness": null, "difficulty_suitability": null, "decision_quality": null,
    "bet_size_naturalness": null, "action_variety": null, "repetition": null,
    "bluff_credibility": null, "river_quality": null, "multiway_quality": null,
    "timing_naturalness": null, "ui_clarity": null, "mobile_usability": null,
    "frustration": null, "learning_value": null, "enjoyment": null
  },
  "integrity_flags": {
    "bots_always_labeled": true, "saw_hidden_cards": false,
    "chip_anomaly": false, "frozen_hand": false
  },
  "free_text": {
    "most_unnatural_decision": "", "repeated_pattern": "",
    "difficulty_too_easy_or_hard": "", "repeatable_exploit": "",
    "unreasonable_bet_size": "", "timing_tells": "",
    "ui_realtime_reconnect_integrity_issue": "", "would_play_again": ""
  },
  "defect_ids": []
}
```

## 4. Illustrative example (SCHEMA DEMO — NOT REAL DATA)

> Synthetic placeholder to show shape only. It is **not** a real tester, session, or score, and must be deleted/replaced before any real import. No verdict may cite it.

```json
{
  "tester_id": "C1",
  "group": "C",
  "session_id": "S5",
  "difficulty": "hard",
  "table_type": "heads_up",
  "app_mode": "browser",
  "device_browser": "desktop_chrome",
  "orientation": "landscape",
  "hands_played": 0,
  "completed": false,
  "incomplete_reason": "EXAMPLE ONLY — no session was run",
  "build_commit": "<short-hash>",
  "ratings": { "fairness": null, "difficulty_suitability": null, "decision_quality": null, "bet_size_naturalness": null, "action_variety": null, "repetition": null, "bluff_credibility": null, "river_quality": null, "multiway_quality": null, "timing_naturalness": null, "ui_clarity": null, "mobile_usability": null, "frustration": null, "learning_value": null, "enjoyment": null },
  "integrity_flags": { "bots_always_labeled": true, "saw_hidden_cards": false, "chip_anomaly": false, "frozen_hand": false },
  "free_text": { "most_unnatural_decision": "", "repeated_pattern": "", "difficulty_too_easy_or_hard": "", "repeatable_exploit": "", "unreasonable_bet_size": "", "timing_tells": "", "ui_realtime_reconnect_integrity_issue": "", "would_play_again": "" },
  "defect_ids": []
}
```

## 5. Rules for filling it

- One record **per tester per session**. A reused account across two sittings produces **two** records with different `session_id`s.
- `hands_played` and every rating must come from **real evidence**. Leave a rating `null` rather than guess. Never fabricate a tester, a session, or a score.
- A stopped session is still recorded: `completed=false`, real partial `hands_played`, and a concrete `incomplete_reason`.
- 27F-C computes the medians and verdicts against the bars in [`../../bots/human-playtest-plan.md`](../../bots/human-playtest-plan.md) §5. This file only carries raw, anonymous inputs.

---

**Related:** [evaluation-form.md](./evaluation-form.md) · [bug-report-template.md](./bug-report-template.md) · [privacy-safe-logging.md](../../operations/privacy-safe-logging.md) · [human-playtest-plan.md](../../bots/human-playtest-plan.md)
