# Poker — Asset Licensing

Companion to the [`asset-register.md`](./asset-register.md). This file records the licensing
posture for every Poker asset and the policy for adding new ones.

Last reviewed: 2026-07-02.

---

## 1. Licensing posture at a glance

| Asset class | Count | Origin | License | Attribution | Production-ready |
|---|---|---|---|---|---|
| Table backgrounds (WebP) | 3 | Approved / project-supplied | Project-owned (**confirm — §2**) | None (assumed) | ⚠️ pending written proof |
| Inline-SVG visuals (chips, cards, markers, pots, overlays) | n/a (code) | First-party source | Same as repository | None | ✅ Yes |
| Sound effects | 10 cues | First-party Web Audio synthesis | Same as repository | None | ✅ Yes |
| Haptics | n/a | `navigator.vibrate` (browser API) | Platform API | None | ✅ Yes |
| Fonts | 2 | Existing platform fonts | Covered by site-wide font licenses | Per site font terms | ✅ Yes |

**No scraped, copyrighted, sampled, ripped, AI-of-unclear-provenance, or unlicensed third-party
asset is used anywhere in the Poker path.** The audio is fully synthesized in code, so there is no
sound-effect license to track — the single most common licensing risk for a card game is absent by
design.

---

## 2. Table backgrounds — the one item to verify

The three `public/poker-*.webp` files are described by the phase brief as the "approved
black-and-gold table backgrounds already integrated." They are treated as **project-owned** on that
basis, but the audit could not find a first-party creation record in the repository.

**Status: UNRESOLVED (release risk).**

### Provenance investigation — 2026-07-02 (Prompt 19B)

A dedicated search was performed and returned **no ownership evidence**:

- `git log --follow` on all three files → they enter the repo in a **single squashed commit**
  (`21de5ef`, the poker release candidate) as new binaries (`Bin 0 → N bytes`); there is **no
  earlier creation history**. The commit message documents scope only, not asset provenance.
- The preflight audit ([`../01-preflight-audit.md`](../01-preflight-audit.md) §"Poker table asset
  audit") records them as **pre-existing, untracked** files (`public/pocker_*.webp`) at audit time,
  capturing only technical specs (dimensions, bytes) — **no creator, date, source, or license**.
- Repo-wide grep for `commission / copyright / license / owner / creator / stock / generated /
  attribution` found **no record** tied to these files. (For contrast, TLMN's cards *do* carry a
  proper `public/games/tlmn/cards/LICENSE.txt` — the poker backgrounds have no equivalent.)

Conclusion: ownership **cannot be verified from the repository**. No ownership or licensing
information has been invented. The item remains an **unresolved release risk** until the operator
supplies proof (below).

**Action before any public (non-dark) launch:**

1. Obtain written confirmation of ownership from the operator — one of:
   - commission invoice + creator handoff granting all rights, **or**
   - proof the images were created in-house, **or**
   - a stock/marketplace license permitting commercial use + modification (and its attribution
     terms, if any).
2. Archive that proof alongside this file (or link it here) and record:
   - Source · Creator/Vendor · License type · Modification rights · Attribution requirement · Date.
3. Flip the table-background rows in §1 and in the asset register from ⚠️ to VERIFIED.

Until step 3 is done, Poker must remain **dark / limited** (which it already is per the rollout).

> Provenance record (fill in):
>
> | Field | Value |
> |---|---|
> | Source | _to fill_ |
> | Creator / Vendor | _to fill_ |
> | License type | _to fill_ |
> | Modification permission | _to fill_ |
> | Attribution required | _to fill_ |
> | Proof archived at | _to fill_ |
> | Confirmed by / date | _to fill_ |

---

## 3. Why the rest needs no external license

- **Visuals** (chips, cards, ranks/suits, dealer & blind markers, all-in badge, pots, side-pots,
  winner highlight, timer ring, felt vignette) are authored as inline SVG + CSS from
  `_design/tokens.ts`. They are ordinary source code in this repository and inherit its terms.
- **Audio** is generated at runtime by `_design/usePokerSound.ts` using the Web Audio API
  (oscillators + noise buffers). No sample, loop, or recording is bundled or streamed.
- **Haptics** call the standard `navigator.vibrate` browser API.
- **Fonts** are the platform's existing typefaces referenced via CSS variables; no new font file is
  added by Poker, so no new font license is incurred.

---

## 4. Policy for adding future assets

Any new Poker asset (e.g. a future card skin, a music track, a licensed SFX pack) MUST, before
merge:

1. Have a clear, documented, commercial-use license permitting modification where we modify it.
2. Be added to [`asset-register.md`](./asset-register.md) with Source · Ownership · License ·
   Modification permission · Production permission · Attribution · File size · Format.
3. Have its license proof archived and linked here.
4. **Never** be scraped from the web, ripped from another game/app, or of unclear provenance.
5. If attribution is required, wire the credit into the in-app credits/settings surface.
6. Respect the performance budget (see the visual/responsive spec) — new binary assets must be
   lazy/branch-loaded, never eagerly bundled for all layouts.

A new asset that cannot satisfy §1–§4 does not ship; the runtime-generated fallback stays.
