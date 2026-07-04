# Store & Policy Readiness Checklist (Prompt 29C)

**Scope:** documentation only. This phase does **not** submit to any store, does
**not** ship a native wrapper, and does **not** certify approval. It prepares a
checklist so a future native-wrapper effort starts from a known position.

> ⚠️ **Store rules change frequently and differ by region.** Every item below MUST
> be re-reviewed against the *then-current* Apple App Store Review Guidelines,
> Google Play Developer Program Policies, and any alternative-store policy at the
> time of submission. Do not treat this file as authoritative policy text.

Chợ Cóc FKO is today a **web app / PWA**. Poker is **play-money only**, ships
**dark** (all flags OFF), and has **no purchases, no cash-out, no real-money
gambling**. That posture is the single biggest factor in a smooth review and must
be preserved (or explicitly re-evaluated) before any store submission.

---

## 1. Native wrapper (if/when pursued)

- [ ] Decide wrapper approach (Capacitor / Trusted Web Activity / native shell) and
      record it here.
- [ ] Confirm the wrapper adds no capability the web app lacks (no hidden native
      purchase, no background tracking).
- [ ] Web Push vs native push: decide per-platform (iOS requires APNs via a native
      shell or A2HS PWA; see §7).
- [ ] Deep links map to the same access-gated routes (`/games/poker/...`) — the
      wrapper must not bypass server-side authorization.
- [ ] Offline behaviour matches the PWA allowlist cache (no private data cached).

## 2. Apple App Store — items to re-review

- [ ] **Gambling / gaming (Guideline 5.3).** Present poker unambiguously as
      **play-money, no prizes, no cash value**. No real-currency wager, no payout.
- [ ] Age rating questionnaire: "Simulated Gambling" answer set correctly; confirm
      resulting 17+ (or regional) rating is acceptable.
- [ ] Regional availability: exclude territories that restrict simulated-gambling
      apps if required.
- [ ] IAP (Guideline 3.1): if virtual coins are ever sold, they MUST use Apple IAP
      — **currently nothing is sold, so this must stay N/A** unless the model changes.
- [ ] Account deletion in-app (Guideline 5.1.1(v)) — see §8.
- [ ] Privacy "Nutrition Label" matches actual data use (see §9).
- [ ] Sign in with Apple required if any third-party social login is offered
      (Google / Facebook / LINE are present) — verify current exemptions.
- [ ] Web-content / minimum-functionality (Guideline 4.2): a thin wrapper around the
      website may be rejected — ensure native value-add or ship as PWA only.

## 3. Google Play — items to re-review

- [ ] **Real-Money Gambling policy**: poker is play-money → confirm it is *not*
      classified as gambling; ensure no simulated-gambling ad monetization triggers.
- [ ] Content rating (IARC) questionnaire: declare simulated gambling honestly.
- [ ] Target API level / data-safety form current at submission.
- [ ] Account deletion + Play Console "Data deletion" URL (see §8).
- [ ] Families policy: ensure the app is not listed as child-directed.

## 4. Alternative stores

- [ ] Identify target store(s) and fetch their current policy.
- [ ] Re-run the gambling / age / privacy / deletion checks against that policy.

## 5. Poker-specific presentation

- [ ] No "win real money", "cash prize", or gambling-payout language in store copy,
      screenshots, or in-app.
- [ ] "Play money / xu" clearly labelled; coins have **no** cash value and cannot be
      cashed out (matches `coinIntegrity` / economy design).
- [ ] Tournaments: **hard-off**; no tournament prize/entry-fee presentation exists.
      Re-review this entire checklist *before* enabling tournaments.

## 6. Virtual coins, purchases, advertising, prizes

- [ ] Coins are earned/allocated only; **no sale path exists today**. If a sale is
      ever added → Apple IAP + Play Billing + tax/consumer-law review.
- [ ] No ads currently tied to poker; if added, confirm no gambling-ad-network use.
- [ ] No prizes, sweepstakes, or contests of value.

## 7. Push notifications

- [ ] iOS push requires a native shell (APNs) or an installed PWA (iOS ≥ 16.4 Web
      Push). Decide per wrapper.
- [ ] Notification content is redacted (`lib/games/poker/notifications/redaction.ts`)
      — safe on a locked screen; re-confirm at submission.
- [ ] Permission is user-initiated and denial is respected (App Store / Play both
      require this).
- [ ] Provide an in-app notification preference + unsubscribe.

## 8. Account deletion

- [ ] In-app account-deletion path (Apple 5.1.1(v), Play data-deletion).
- [ ] Deletion cascades poker data appropriately (`push_subscriptions` already
      `ON DELETE CASCADE` from `auth.users`); document what poker rows are removed
      vs retained (and why, e.g. anti-fraud/integrity retention windows).
- [ ] Publish a data-deletion request URL for Play Console.

## 9. Privacy, tracking & UGC

- [ ] Privacy policy covers: auth (Supabase), push subscriptions, gameplay/coin
      ledger, analytics events, integrity/anti-collusion signals.
- [ ] App Tracking Transparency (iOS): only prompt if cross-app tracking occurs —
      **currently none**; keep it that way or add ATT.
- [ ] Data-safety / privacy-label forms match `lib/analytics`, `push_subscriptions`,
      and integrity data actually collected.
- [ ] User-generated content (chat/social): note that **no in-table chat exists**
      today; quick-messages are localized presets (flagged off). If free-text UGC is
      added → moderation, reporting, and block tooling per store UGC rules
      (`lib/games/poker/admin.ts`, `bugReport.ts`, block features already exist).
- [ ] Age gate / minimum age consistent with the simulated-gambling rating.

## 10. Pre-submission gate

- [ ] A fresh, dated policy review has been completed for **each** target store.
- [ ] Legal sign-off on gambling classification for the target regions.
- [ ] This checklist re-verified end-to-end (esp. if tournaments, purchases, ads, or
      real-money features were enabled since last review).

---

**Bottom line:** the current play-money, no-purchase, dark-shipped posture is the
low-risk path. Any move toward selling coins, enabling tournaments with
prizes/entry fees, adding real-money mechanics, ads, or free-text UGC **requires a
new, dated policy review before submission**. This document does not certify store
approval.
