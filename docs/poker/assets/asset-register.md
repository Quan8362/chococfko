# Poker — Asset Register

Authoritative inventory of every visual and audio asset used by Chợ Cóc FKO Poker.
Companion policy: [`licensing.md`](./licensing.md).

**Key finding of the asset audit:** the Poker UI ships **only three binary image assets** (the
approved black-and-gold table backgrounds). Everything else — chips, cards, dealer/blind markers,
pot displays, badges, overlays, and **all sound effects** — is **generated at runtime** (inline
SVG for visuals, Web Audio synthesis for audio). There are **no downloaded, scraped, sampled, or
third-party sprite/audio files** in the Poker path.

Last audited: 2026-07-02.

---

## 1. Binary image assets (the only files that ship)

| Asset | Path | Format | Size | Dimensions | Aspect | Used for | Loaded when |
|---|---|---|---|---|---|---|---|
| Table — desktop | `public/poker-desktop.webp` | WebP | 95,534 B (≈93 KB) | 1672×941 | 16:9 | Desktop felt background | Desktop layout only |
| Table — tablet | `public/poker-tablet.webp` | WebP | 84,624 B (≈83 KB) | 1448×1086 | 4:3 | Tablet-landscape felt | Tablet layout only |
| Table — mobile | `public/poker-mobile.webp` | WebP | 85,396 B (≈83 KB) | 1672×941 | 16:9 | Mobile-landscape felt | Mobile layout only |

Integration point: [`app/games/poker/_components/TableBackground.tsx`](../../../app/games/poker/_components/TableBackground.tsx).
Exactly **one** of the three is selected by layout and preloaded (`react-dom` `preload`); the other
two are never fetched. No UI/text is baked into the artwork — all interactive geometry is anchored
on top of the inner play-area rect.

### Provenance — **UNRESOLVED** (release risk)

A dedicated investigation on 2026-07-02 (Prompt 19B) found **no ownership record** in git history
or documentation — see [`licensing.md`](./licensing.md) §2 for the full method and evidence.

| Field | Value |
|---|---|
| Source | Project-supplied "approved black-and-gold table backgrounds" (per phase brief) — no in-repo source record |
| Ownership | **UNVERIFIED** — no creation/commission/handoff record found; confirm in writing with operator |
| License | **UNVERIFIED** (assumed project-owned from "approved"); **confirm & archive proof** |
| Modification permission | Assumed yes (already re-exported to WebP at 3 aspect ratios) — unconfirmed |
| Production permission | Approved for production per brief (currently dark) |
| Attribution required | Unknown — confirm with source |

> ⚠️ These three files are the **only** assets whose provenance is not self-evidently first-party,
> and it is **UNRESOLVED**. Before any public (non-dark) launch, attach the commission/ownership
> proof to [`licensing.md`](./licensing.md) §2 and flip their status to VERIFIED. Until then the
> asset set is **not** fully production-ready.

---

## 2. Runtime-generated visuals (no files)

All of the following are drawn as **inline SVG / CSS** from code + design tokens. They are
first-party source code, carry no external license, and add **zero** network/asset weight.

| Element | Source | Notes |
|---|---|---|
| Chip (single, top-down) | `_components/chips.tsx` → `PokerChip` | SVG disc: radial-gradient body, 6 edge-spot inlays, inner ring, sheen, face value |
| Chip stack | `_components/chips.tsx` → `PokerChipStack` | `chipBreakdown()` columns, display-capped, exact total shown alongside |
| Chip denominations | `_design/tokens.ts` → `CHIP_DENOMS` | 12 denominations (1 → 500M), distinct base/ring/edge/ink per denom |
| Playing card face | `_components/cards.tsx` → `PokerCard` | Inline SVG rank + suit glyphs (never OS emoji); red/black contrast |
| Card back | `_components/cards.tsx` → `PokerCardBack` | SVG pattern, one production skin |
| Dealer button / SB / BB badges | `_components/markers.tsx` | Disc + glyph + `aria-label`; colour is an aid only |
| All-in badge | `_components/markers.tsx` → `AllInBadge` | Amber pill with bolt icon + text |
| Pot / side-pot displays | `_components/pots.tsx` | SVG/CSS with exact integer values |
| Winner / status overlays | `_components/overlays.tsx` | Winner highlight, inline messages, rotate-device screen |
| Turn timer ring | `_components/TurnTimer.tsx` | SVG stroke-dashoffset ring, own compositor layer |
| Table theme + animation | `_design/poker-theme.css`, `_design/tokens.ts` | Tokens mirrored as CSS vars under `.poker-root` |

---

## 3. Audio assets — 100% synthesized (no files)

Integration point: [`app/games/poker/_design/usePokerSound.ts`](../../../app/games/poker/_design/usePokerSound.ts).

There are **no audio files**. Every cue is generated live with the Web Audio API (short oscillator
"blips" + filtered-noise bursts) through a single module-level `AudioContext`, unlocked on the
first user gesture. This means: nothing to license, nothing to preload/decode, no CDN weight.

| Cue | Category (pref) | Synthesis |
|---|---|---|
| `deal` | effects | noise burst |
| `flip` | effects | noise + triangle blip |
| `chip` | effects | noise + two square blips |
| `check` | effects | low sine blip |
| `call` | effects | triangle blip + noise |
| `raise` | effects | sawtooth sweep + noise |
| `allin` | effects | sawtooth sweep + triangle |
| `timerWarn` | timerWarning | double square beep |
| `potAward` | effects | ascending triad |
| `newHand` | effects | two-note chime |

Haptics use `navigator.vibrate` (no asset), gated by the `vibration` preference.
Background **music**: none ships (the `music` preference is reserved for forward-compat).

---

## 4. Fonts

No Poker-specific font files. The felt reuses the existing platform fonts via CSS variables:

| Token | CSS var | Face |
|---|---|---|
| Body / numerals | `--font-bvp` | Be Vietnam Pro (platform-wide, already licensed) |
| Display / serif | `--font-serif-display` | Platform serif display (already licensed) |

See the site-wide font setup for their license terms; no new font is introduced by Poker.

---

## 5. Summary

- **Binary assets shipped:** 3 (table backgrounds), ≈259 KB total, but only **one (~83–93 KB)** is
  ever loaded per session.
- **Third-party audio/sprite files:** 0.
- **Scraped / placeholder assets:** 0.
- **Outstanding provenance — UNRESOLVED:** written ownership proof for the 3 table backgrounds.
  Investigated 2026-07-02 — no creation/ownership record exists in git history or docs (see
  [`licensing.md`](./licensing.md) §2). Assumed project-owned but **not verified**. Because of this,
  the asset set is **not** certified fully production-ready; confirm before any public (non-dark) launch.
