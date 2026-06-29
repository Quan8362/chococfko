// ── Crafted SVG icon set for the TLMN lobby + waiting room (Run — front-door art) ──
// All icons inherit color via currentColor and accept a className, so the scoped
// red/gold lobby theme can tint them. They replace the plain emoji that were used as
// functional UI icons (🤖 👥 ⏳ 🔗 🪙 👑 ⚙️ …). // TODO(asset): a designer can later
// swap the bot/people marks for richer mascot illustrations — these are clean,
// on-theme placeholders that read crisply at every size.

type IconProps = { className?: string }

// ════════════════════════════════════════════════════════════════════════════════
//  TWO-CARD motif — one card system, four contexts (front-door art)
//  ─────────────────────────────────────────────────────────────────────────────
//  Two lightly overlapping standard playing cards: portrait proportions, restrained
//  corners, slight opposite rotations. Card-ness comes from a few RESTRAINED cues, not
//  detail — a thin outer outline, a subtle inner inset border, and ONE tiny corner suit
//  pip on the front card (mirrored on larger variants). Deliberately NO central suit,
//  NO face art, NO thick cartoon strokes, NO emoji, NO shadows. All variants share the
//  same proportions / overlap direction / rotation logic; only size, opacity, stroke
//  weight and detail level change. PILL gets its own more-separated geometry so two card
//  tops survive at ~12–14px.
//    hero  → faint tone-on-tone emboss (colour + opacity from CSS) + inset + mirrored pip
//    info  → burgundy line icon (~18–22px), surface-filled, inset + one front pip
//    pill  → solid cream silhouette (~12–14px), one tiny gold corner cue
//    empty → soft blush cards (~32–38px), inset + one rose heart corner cue (mirrored)
// ════════════════════════════════════════════════════════════════════════════════

export type TwoCardsVariant = 'hero' | 'info' | 'pill' | 'empty'

// Only the existing TLMN lobby palette (burgundy / cream / muted-gold / blush). No blue.
const TC = {
  surface:   '#fffdf8', // panel surface — fills info cards so the rear edge is occluded
  ivory:     '#efe1c2', // warm cream silhouette (pill)
  ivoryPip:  '#9c7322', // muted-gold corner cue on the cream pill
  blush:     '#fbe7ef',
  blushHi:   '#fdf2f7',
  blushLine: '#e3a0bd',
  blushPip:  '#d98ab0', // rose corner heart on the empty-state cards
} as const

type CardGeom = { x: number; y: number; w: number; h: number; rx: number; rot: number; cx: number; cy: number }

// Shared silhouette: two upright cards (≈2.5:3.5 portrait), restrained radius, ~30%
// overlap, slight opposite rotations. PILL is a separate, more-separated build.
const LARGE = {
  back:  { x: 4.4,  y: 5.0, w: 9,   h: 13.6, rx: 1.5, rot: -7, cx: 8.9,  cy: 11.8 },
  front: { x: 10.6, y: 5.0, w: 9,   h: 13.6, rx: 1.5, rot: 7,  cx: 15.1, cy: 11.8 },
} as const
const PILL = {
  back:  { x: 3.6,  y: 4.4, w: 9.2, h: 14,   rx: 1.6, rot: -8, cx: 8.2,  cy: 11.4 },
  front: { x: 10.6, y: 4.4, w: 9.2, h: 14,   rx: 1.6, rot: 8,  cx: 15.2, cy: 11.4 },
} as const

// Tiny corner cues — small suit glyphs centred on the origin so they scale/rotate cleanly.
const SPADE = 'M0 -2C1.25 -.55 2 .1 2 1.05 2 1.9 1.15 2.2 .45 1.75 .6 2.25 .95 2.55 1.25 2.75L-1.25 2.75C-.95 2.55 -.6 2.25 -.45 1.75 -1.15 2.2 -2 1.9 -2 1.05 -2 .1 -1.25 -.55 0 -2Z'
const HEART = 'M0 2.1C-1.7 .5 -2.3 -.45 -1.45 -1.25 -.8 -1.85 0 -1.35 0 -.6 0 -1.35 .8 -1.85 1.45 -1.25 2.3 -.45 1.7 .5 0 2.1Z'

const INSET = 1.15 // inner inset-border margin (local units)

type CardProps = {
  c: CardGeom; fill?: string; stroke?: string; sw?: number
  inset?: boolean; insetSw?: number; insetOpacity?: number
  pip?: string; pipFill?: string; pipScale?: number; mirror?: boolean
}

// One card: outer outline + optional subtle inset border + optional tiny corner pip(s).
// Everything is drawn in the card's own rotated frame so the cues sit in true corners.
function Card({ c, fill, stroke, sw, inset, insetSw = 0.6, insetOpacity = 0.5, pip, pipFill, pipScale = 0.5, mirror }: CardProps) {
  const px = c.x + INSET + 1.3, py = c.y + INSET + 1.65
  const mx = c.x + c.w - INSET - 1.3, my = c.y + c.h - INSET - 1.65
  return (
    <g transform={`rotate(${c.rot} ${c.cx} ${c.cy})`}>
      <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={c.rx} fill={fill ?? 'none'} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      {inset && (
        <rect
          x={c.x + INSET} y={c.y + INSET} width={c.w - 2 * INSET} height={c.h - 2 * INSET} rx={Math.max(c.rx - 0.6, 0.4)}
          fill="none" stroke={stroke} strokeWidth={insetSw} strokeOpacity={insetOpacity} strokeLinejoin="round"
        />
      )}
      {pip && <path d={pip} transform={`translate(${px} ${py}) scale(${pipScale})`} fill={pipFill} />}
      {pip && mirror && <path d={pip} transform={`translate(${mx} ${my}) scale(${pipScale}) rotate(180)`} fill={pipFill} />}
    </g>
  )
}

export function TlmnTwoCards({ variant, className }: { variant: TwoCardsVariant; className?: string }) {
  if (variant === 'pill') {
    // Solid cream silhouette + one tiny gold corner cue — crisp at ~12–14px.
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <Card c={PILL.back} fill={TC.ivory} />
        <Card c={PILL.front} fill={TC.ivory} pip={SPADE} pipFill={TC.ivoryPip} pipScale={0.46} />
      </svg>
    )
  }

  if (variant === 'empty') {
    // Soft blush cards + inset border + one rose heart corner cue (mirrored); restrained.
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" opacity={0.72}>
        <Card c={LARGE.back} fill={TC.blush} stroke={TC.blushLine} sw={1.2} inset insetSw={0.6} insetOpacity={0.55} />
        <Card c={LARGE.front} fill={TC.blushHi} stroke={TC.blushLine} sw={1.2} inset insetSw={0.6} insetOpacity={0.55} pip={HEART} pipFill={TC.blushPip} pipScale={0.55} mirror />
      </svg>
    )
  }

  if (variant === 'info') {
    // Burgundy line icon — surface fill (invisible on the cream panel) occludes the rear
    // edge; inset border + one front spade pip make it read unmistakably as two cards.
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <Card c={LARGE.back} fill={TC.surface} stroke="currentColor" sw={1.3} inset insetSw={0.7} insetOpacity={0.4} />
        <Card c={LARGE.front} fill={TC.surface} stroke="currentColor" sw={1.3} inset insetSw={0.7} insetOpacity={0.4} pip={SPADE} pipFill="currentColor" pipScale={0.5} />
      </svg>
    )
  }

  // hero — faint tone-on-tone emboss; colour + opacity supplied by the .tl-hero__suit CSS.
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <Card c={LARGE.back} stroke="currentColor" sw={0.9} inset insetSw={0.6} insetOpacity={0.7} />
      <Card c={LARGE.front} stroke="currentColor" sw={0.9} inset insetSw={0.6} insetOpacity={0.7} pip={SPADE} pipFill="currentColor" pipScale={0.5} mirror />
    </svg>
  )
}

// ── TLMN brand mark — a face-up 2♥ over a subtle supporting card (Run — identity) ──
// Replaces the old Joker emoji, which on Windows rendered as a multicolour clown card
// and wrongly implied Joker gameplay (Tiến Lên uses no Jokers). The 2♥ is the strongest
// single card in Tiến Lên Miền Nam, so it reads as the game's true identity. Self-coloured
// (ivory card + burgundy "2" + brand red heart) so it stays premium and legible on BOTH
// the light lobby and the dark felt; crisp from ~16px up.
export function TlmnDeuce({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      {/* supporting card behind, fanned left */}
      <g transform="rotate(-15 7.5 13)">
        <rect x="2.4" y="6.2" width="9" height="12.8" rx="1.9" fill="#f1e4c8" stroke="#c19a3e" strokeWidth="0.9" />
      </g>
      {/* face-up 2♥ card */}
      <rect x="8.4" y="4.3" width="11.2" height="15.7" rx="2.2" fill="#fbf4e6" stroke="#b8902f" strokeWidth="1.1" />
      {/* corner indices (mirrored), serif to match the brand */}
      <text x="9.9" y="9.6" fontSize="4.5" fontWeight="800" fill="#8a1a30" fontFamily="Georgia,'Times New Roman',serif">2</text>
      <text x="18.1" y="14.7" fontSize="4.5" fontWeight="800" fill="#8a1a30" fontFamily="Georgia,'Times New Roman',serif" transform="rotate(180 18.1 14.7)">2</text>
      {/* central brand-red heart */}
      <g transform="translate(9.9 8.6) scale(0.66)" fill="#d32f2f">
        <path d="M6 10.5C6 10.5 1 6.8 1 3.7 1 2 2.3 1 3.6 1.45 4.5 1.75 5.3 2.6 6 3.6 6.7 2.6 7.5 1.75 8.4 1.45 9.7 1 11 2 11 3.7 11 6.8 6 10.5 6 10.5Z" />
      </g>
    </svg>
  )
}

// ── Decorative four-suit cluster (♠♥♦♣) — used as a premium accent / texture mark ──
export function TlmnSuits({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden>
      {/* spade */}
      <path d="M12 6c2.4 2.6 5 4.2 5 6.6a2.5 2.5 0 1 1-5 0c0 2.4 2.6 4 5 6.6-3.2 0-7-.2-10 0 2.4-2.6 5-4.2 5-6.6a2.5 2.5 0 1 1-5 0C7 16.2 9.6 14.6 12 12" fill="currentColor" opacity="0" />
      <path d="M14 7c1.9 2.7 5 4 5 6.8a2.6 2.6 0 0 1-3.6 2.4c.3 1.4 1.2 2.3 2.4 3.3h-7.6c1.2-1 2.1-1.9 2.4-3.3A2.6 2.6 0 0 1 9 13.8C9 11 12.1 9.7 14 7Z" fill="currentColor" />
      {/* heart */}
      <path d="M34 8.4c1.2-1.6 4.6-1.9 5.6.6 1 2.5-1.4 5.2-5.6 8.4-4.2-3.2-6.6-5.9-5.6-8.4 1-2.5 4.4-2.2 5.6-.6Z" fill="currentColor" />
      {/* diamond */}
      <path d="M14 24l5 7-5 7-5-7 5-7Z" fill="currentColor" />
      {/* club — three round lobes (top / lower-left / lower-right) + a flared stem */}
      <g fill="currentColor">
        <circle cx="34" cy="27.2" r="2.8" />
        <circle cx="30.7" cy="30.8" r="2.8" />
        <circle cx="37.3" cy="30.8" r="2.8" />
        <path d="M32.7 30.6c0 2.6-.7 4.7-2.4 6.6h7.4c-1.7-1.9-2.4-4-2.4-6.6Z" />
      </g>
    </svg>
  )
}

// ── Bot / robot mascot (Chơi với máy, Thêm Bot) ──
export function TlmnBot({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3v2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="2.4" r="1.3" fill="currentColor" />
      <rect x="4.2" y="6.4" width="15.6" height="11" rx="3.2" fill="currentColor" opacity="0.16" />
      <rect x="4.2" y="6.4" width="15.6" height="11" rx="3.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9" cy="11.6" r="1.5" fill="currentColor" />
      <circle cx="15" cy="11.6" r="1.5" fill="currentColor" />
      <path d="M9.5 14.4h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2.4 10v3.6M21.6 10v3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 17.4v2.2M16 17.4v2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// ── People / multiplayer (Chơi với người thật) ──
export function TlmnPeople({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="8.5" cy="8" r="3.2" fill="currentColor" opacity="0.16" />
      <circle cx="8.5" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.6 19.2c0-3.2 2.6-5.4 5.9-5.4s5.9 2.2 5.9 5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="17" cy="6.6" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15.4 13.4c3 .2 6 2.1 6 5.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ── Invite / share link (Mời bạn bè, Chia link mời) ──
export function TlmnInvite({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9.5 14.5l5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M11 7l1.4-1.4a3.5 3.5 0 0 1 5 5L16 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 17l-1.4 1.4a3.5 3.5 0 0 1-5-5L8 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Native share (mobile share sheet) ──
export function TlmnShare({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="6" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.5" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.5" cy="18" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.1 10.9l7.3-3.8M8.1 13.1l7.3 3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// ── Hourglass / lobby (Phòng chờ) ──
export function TlmnHourglass({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 4h10M7 20h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7.5 4c0 4 4.5 5.4 4.5 8s-4.5 4-4.5 8M16.5 4c0 4-4.5 5.4-4.5 8s4.5 4 4.5 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.4 18.2c.7-1.4 2.6-2 2.6-2s1.9.6 2.6 2H9.4Z" fill="currentColor" />
    </svg>
  )
}

// ── Empty seat — a clean "open player" silhouette + a small "+" badge, reading as a
// seat waiting for a person (clearer than the old tiny chair). Filled so it stays crisp
// at small sizes inside the dashed seat ring. ──
export function TlmnSeat({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="8" r="3.6" fill="currentColor" />
      <path d="M4.4 18.8c0-3.5 2.95-6 6.6-6 1.5 0 2.86.42 3.96 1.14a5.2 5.2 0 0 0-.96 6.16c-.18.36-.55.6-.99.6H5.5c-.6 0-1.1-.48-1.1-1.06v-.84Z" fill="currentColor" />
      <g>
        <circle cx="18" cy="16.5" r="4.4" fill="currentColor" />
        <path d="M18 14.4v4.2M15.9 16.5h4.2" stroke="var(--tl-red-deep, #520915)" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </svg>
  )
}

// ── Gold coin (wallet balance, daily refill) ──
export function TlmnCoin({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.18" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="6.3" stroke="currentColor" strokeWidth="1.1" opacity="0.7" />
      <path d="M12 8.2v7.6M10 9.6h3a1.6 1.6 0 0 1 0 3.2h-2.6m2.6 0a1.6 1.6 0 0 1 0 3.2h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Crown (host badge) ──
export function TlmnCrown({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 8.5l3 3.5 5-7 5 7 3-3.5-1.4 9.5H5.4L4 8.5Z" fill="currentColor" />
      <path d="M5.4 18h13.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}

// ── Gift (welcome grant toast) ──
export function TlmnGift({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="9" width="16" height="11" rx="1.6" fill="currentColor" opacity="0.16" />
      <rect x="4" y="9" width="16" height="11" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 9h18M12 9v11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 9C9.5 9 7.5 8 7.5 6.2 7.5 5 8.5 4.2 9.7 4.6 11 5 12 9 12 9Zm0 0c2.5 0 4.5-1 4.5-2.8 0-1.2-1-2-2.2-1.6C13 5 12 9 12 9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

// ── Settings sliders (LUẬT CHƠI & ĐIỂM) ──
export function TlmnSettings({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h9M17 7h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4 17h3M11 17h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="15" cy="7" r="2.2" fill="currentColor" opacity="0.2" />
      <circle cx="15" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="9" cy="17" r="2.2" fill="currentColor" opacity="0.2" />
      <circle cx="9" cy="17" r="2.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}

// ── Reset / restore default rules (↺) ──
export function TlmnReset({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12a7 7 0 1 0 2-4.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4 4v4h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Card fan (how-to-play box, play CTA) ──
export function TlmnCards({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.4" y="7" width="9" height="13" rx="1.6" transform="rotate(-14 3.4 7)" fill="currentColor" opacity="0.14" />
      <rect x="3.4" y="7" width="9" height="13" rx="1.6" transform="rotate(-14 3.4 7)" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="5" width="9" height="13" rx="1.6" transform="rotate(8 11 5)" fill="currentColor" opacity="0.2" />
      <rect x="11" y="5" width="9" height="13" rx="1.6" transform="rotate(8 11 5)" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 9.4l1.3 2.2-1.3 2.2-1.3-2.2L16 9.4Z" fill="currentColor" />
    </svg>
  )
}

// ── Play (Chơi ngay với máy — the practice CTA's true action) ──
export function TlmnPlay({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M8 5.6c0-1 1.1-1.6 1.95-1.1l9.2 5.6a1.3 1.3 0 0 1 0 2.2l-9.2 5.6C9.1 18.4 8 17.8 8 16.8V5.6Z" fill="currentColor" />
    </svg>
  )
}

// ── Check / ready ──
export function TlmnCheck({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5l4.2 4.3L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Empty wallet / broke (Hết xu) ──
export function TlmnEmptyWallet({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7.5C4 6.1 5.1 5 6.5 5H17a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" fill="currentColor" opacity="0.14" />
      <path d="M4 7.5C4 6.1 5.1 5 6.5 5H17a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="12" r="1.4" fill="currentColor" />
      <path d="M9 14.5a3.2 3.2 0 0 1 5 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ── Wave / farewell (kicked screen) ──
export function TlmnWave({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 11V6.5a1.4 1.4 0 0 1 2.8 0V11m0-1V5.2a1.4 1.4 0 0 1 2.8 0V11m0-1.2V6a1.4 1.4 0 0 1 2.8 0v5.5m0-3.5a1.4 1.4 0 0 1 2.8 0v5c0 3.6-2.6 6.5-6.4 6.5-2.4 0-4-1-5.2-2.8l-2.6-4a1.4 1.4 0 0 1 2.2-1.7L9 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
