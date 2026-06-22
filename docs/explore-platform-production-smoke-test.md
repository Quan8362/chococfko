# Explore Platform — Production Smoke-Test Checklist

Repeatable manual checklist to verify the deployed Explore Platform. Fill in
**Actual** + **Evidence** for each row. Do not mark the release `PRODUCTION
VERIFIED` until every "must" row passes.

| Field | Value |
|---|---|
| Tester | |
| Date | |
| Environment | production / preview (circle) |
| Commit hash | |
| Locale tested | vi / en / ja / ko / zh |

> Health probe: `GET /api/health` should return `{ status: "healthy", ... }`
> (200). `cron_secret_configured` must be `true` in production.

---

## A. Public (no login)

| # | Step | Expected | Actual | Evidence |
|---|---|---|---|---|
| A1 | Open `/` | Homepage loads, no layout shift, no horizontal scroll | | |
| A2 | Region selector | Switching region updates results | | |
| A3 | Search input | Typing + submit returns relevant results | | |
| A4 | Quick intent chip | Intent applies + is shown as active | | |
| A5 | Category nav | Category filters results | | |
| A6 | Intent + category | Combination works; "clear all" resets | | |
| A7 | Browser back/forward | Filter state restored from URL | | |
| A8 | Zero results | Useful empty state (not blank) | | |
| A9 | Map loads | Markers render; list↔map selection sync | | |
| A10 | "Search this area" | Re-queries by viewport | | |
| A11 | Geolocation denied | Graceful message; no auto-prompt on load | | |
| A12 | Mobile bottom sheet | Opens/closes; body scroll restored after close | | |
| A13 | Place detail | Loads; open/closed status correct | | |
| A14 | Missing call/website | Buttons inactive, not broken links | | |
| A15 | Directions | Opens correct maps target | | |
| A16 | Share | Web Share or safe copy fallback | | |
| A17 | Events list | Published events shown; expired not "upcoming" | | |
| A18 | Cancelled event | Clearly labelled | | |
| A19 | Collections | Renders; empty collection not broken scaffold | | |
| A20 | 5 locales | vi/en/ja/ko/zh fully translated, long labels wrap | | |

## B. Guest → account merge

| # | Step | Expected | Actual | Evidence |
|---|---|---|---|---|
| B1 | Save a place as guest | Saved locally; visible | | |
| B2 | Log in | Guest save merges once (no duplicate) | | |
| B3 | Refresh | State preserved | | |

## C. Authenticated user

| # | Step | Expected | Actual | Evidence |
|---|---|---|---|---|
| C1 | Save / unsave | Toggles + persists | | |
| C2 | Create list, add/remove/reorder | Works | | |
| C3 | Create plan, add stops | Works | | |
| C4 | Opening-hours / overlap warnings | Shown when relevant | | |
| C5 | Share plan (token) | Read-only link works | | |
| C6 | Revoke share | Link stops working | | |
| C7 | Duplicate shared plan | Creates an owned copy | | |
| C8 | Download `.ics` / Google Calendar | Valid file / link (JST) | | |
| C9 | Notification preferences | Loads + persists | | |
| C10 | Ask question / answer | Appears for the right users | | |
| C11 | Mark helpful | Follows ownership/Admin rules | | |
| C12 | Submit report | Accepted; enters review queue | | |
| C13 | **Rate limit** (NEW) | Rapid repeat reports/questions get blocked after the cap | | |

## D. Second user (RLS isolation)

| # | Step | Expected | Actual | Evidence |
|---|---|---|---|---|
| D1 | View user A's private list URL | Denied | | |
| D2 | View user A's shared (token) page | Read-only allowed | | |
| D3 | Edit shared page | Not possible | | |
| D4 | Private notes / participant names | Never visible to B | | |

## E. Admin

| # | Step | Expected | Actual | Evidence |
|---|---|---|---|---|
| E1 | Non-admin visits `/admin/*` | Redirected | | |
| E2 | Place editor | Loads | | |
| E3 | Event editor | Loads; draft not public | | |
| E4 | Reports queue | Loads | | |
| E5 | Search Concepts | Loads | | |
| E6 | Analytics | Loads; empty metrics show `—`, not fake values | | |
| E7 | Data quality | Loads; missing-field filters work | | |

## F. Scheduled (cron)

| # | Step | Expected | Actual | Evidence |
|---|---|---|---|---|
| F1 | `GET /api/cron/return-user` without secret | 401 unauthorized | | |
| F2 | With correct `Bearer $CRON_SECRET` | 200 + JSON summary | | |
| F3 | Run twice in same JST day | Second run: `plansSkippedDup > 0`, no duplicate push | | |
| F4 | Plan dated today (JST) | Owner notified once | | |
| F5 | event_soon opt-out user | Not notified | | |

---

## Performance budgets (fill from a Vercel preview — `npx lighthouse <url> --preset=desktop` and `--form-factor=mobile`)

| Page | LCP (mobile) | CLS | INP/TBT | TTFB | JS payload | Pass? |
|---|---|---|---|---|---|---|
| `/` | | | | | | |
| search results | | | | | | |
| map | | | | | | |
| place detail | | | | | | |
| events | | | | | | |
| collections | | | | | | |
| saved places | | | | | | |
| plans | | | | | | |
| admin analytics | | | | | | |

**Proposed budgets** (mobile, mid-tier): LCP ≤ 2.5s · CLS ≤ 0.1 · TBT ≤ 300ms ·
JS (initial) ≤ 250KB gz. Treat the map bundle as lazy/route-split — it must not load
on `/`.
