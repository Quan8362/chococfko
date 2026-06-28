// ── Crafted SVG icon set for the TLMN lobby + waiting room (Run — front-door art) ──
// All icons inherit color via currentColor and accept a className, so the scoped
// red/gold lobby theme can tint them. They replace the plain emoji that were used as
// functional UI icons (🤖 👥 ⏳ 🔗 🪙 👑 ⚙️ …). // TODO(asset): a designer can later
// swap the bot/people marks for richer mascot illustrations — these are clean,
// on-theme placeholders that read crisply at every size.

type IconProps = { className?: string }

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

// ── Empty-seat chair / "+" (open seat at the table) ──
export function TlmnSeat({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 4.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6H6v-6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M4.5 10.5h15a1.5 1.5 0 0 1 1.5 1.5c0 1.7-1.4 3-3 3H6a3 3 0 0 1-3-3 1.5 1.5 0 0 1 1.5-1.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M6.5 15v4.5M17.5 15v4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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
