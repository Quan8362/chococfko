'use client'

// ── Poker cards — PokerCard · PokerCardBack · CommunityCardSlot ─────────────────────────────
//
// Original poker-lounge card art (NOT the TLMN deck): a clean white face with crisp corner
// indices and inline-SVG suit pips, plus a champagne-gold/charcoal card back matching the lounge
// theme. Suits are ALWAYS inline SVG, never OS emoji (emoji break suit colour on Windows — the
// same lesson the TLMN card module records). Colour is never the only signal: every card shows
// the rank letter + a suit glyph, so ♠♣ vs ♥♦ is legible without relying on red/black.
//
// The card `value` is the domain Card string (`${Rank}${Suit}`, e.g. 'As', 'Td', '9h') from
// lib/games/poker/types.ts. PokerCard renders ONLY a known value — opponents' face-down cards
// use PokerCardBack and the client never even receives their values (privacy A1).

import type { Card, Rank, Suit } from '@/lib/games/poker/types'

const RED = '#c2253e' // true playing-card red for ♥♦
const INK = '#1a1714' // near-black for ♠♣

// Suit glyphs in a shared 48×48 viewBox so all suits scale uniformly (no stretch).
const SPADE =
  'M24 5C24 5 9 16 9 27 9 32 12 35 16 35 18.5 35 20.5 34 22 32.5 21.5 36 20 39.5 17 42L31 42C28 39.5 26.5 36 26 32.5 27.5 34 29.5 35 32 35 36 35 39 32 39 27 39 16 24 5 24 5Z'
const DIAMOND = 'M24 3 41 24 24 45 7 24Z'
const HEART =
  'M24 42C24 42 7 30 7 17 7 10.8 11.6 6 16.5 6 20 6 22.8 8.3 24 11.2 25.2 8.3 28 6 31.5 6 36.4 6 41 10.8 41 17 41 30 24 42 24 42Z'

function SuitGlyph({ suit }: { suit: Suit }) {
  if (suit === 'c') {
    return (
      <>
        <circle cx="24" cy="15" r="8.4" />
        <circle cx="14.6" cy="27.4" r="8.4" />
        <circle cx="33.4" cy="27.4" r="8.4" />
        <path d="M20.4 28C21 33.4 19 38.5 14.5 42L33.5 42C29 38.5 27 33.4 27.6 28Z" />
      </>
    )
  }
  return <path d={suit === 's' ? SPADE : suit === 'd' ? DIAMOND : HEART} />
}

function SuitPip({ suit, size, color }: { suit: Suit; size: number; color: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden style={{ display: 'block', fill: color }}>
      <SuitGlyph suit={suit} />
    </svg>
  )
}

const SUIT_LABEL: Record<Suit, string> = { s: 'spades', c: 'clubs', d: 'diamonds', h: 'hearts' }

function parseCard(card: Card): { rank: Rank; suit: Suit } {
  return { rank: card[0] as Rank, suit: card[1] as Suit }
}

export interface PokerCardProps {
  card: Card
  /** card width in px; height is derived 5:7. */
  w?: number
  /** dim a card that is no longer in contention (e.g. not part of a winning hand). */
  dim?: boolean
  /** gold highlight for the cards forming a winning hand at showdown. */
  highlight?: boolean
  /** play the deal-in animation (presentation only; honours reduced-motion via the .pk-anim-* class). */
  dealt?: boolean
  className?: string
}

// A single face-up card. Aspect 5:7. Sized by `w` so it stays crisp from the small board to the
// larger own-hole cards.
export function PokerCard({ card, w = 52, dim = false, highlight = false, dealt = false, className = '' }: PokerCardProps) {
  const { rank, suit } = parseCard(card)
  const red = suit === 'd' || suit === 'h'
  const color = red ? RED : INK
  const h = Math.round(w * 1.4)
  const rankSize = Math.round(w * 0.34)
  const cornerSuit = Math.round(w * 0.2)
  const centerSuit = Math.round(w * 0.5)
  const padX = Math.max(2, Math.round(w * 0.07))
  const padY = Math.max(2, Math.round(w * 0.05))
  const label = `${rank === 'T' ? '10' : rank} of ${SUIT_LABEL[suit]}`

  const corner = (
    <>
      <span className="font-black" style={{ fontSize: rankSize }}>
        {rank === 'T' ? '10' : rank}
      </span>
      <SuitPip suit={suit} size={cornerSuit} color={color} />
    </>
  )

  return (
    <span
      role="img"
      aria-label={label}
      className={[
        'relative inline-flex flex-col select-none bg-white leading-none overflow-hidden',
        dealt ? 'pk-anim-deal' : '',
        highlight ? 'ring-2 ring-[var(--pk-gold-soft)] shadow-[0_0_16px_-2px_rgba(230,207,149,0.7)]' : 'ring-1 ring-black/15',
        dim ? 'grayscale-[0.5] brightness-[0.82] saturate-[0.85]' : '',
        className,
      ].join(' ')}
      style={{ width: w, height: h, color, borderRadius: 'var(--pk-r-card)', boxShadow: highlight ? undefined : 'var(--pk-shadow-seat)' }}
    >
      <span className="absolute z-10 flex flex-col items-center leading-[0.82]" style={{ top: padY, left: padX }}>
        {corner}
      </span>
      <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
        <SuitPip suit={suit} size={centerSuit} color={color} />
      </span>
      <span className="absolute z-10 flex flex-col items-center leading-[0.82] rotate-180" style={{ bottom: padY, right: padX }}>
        {corner}
      </span>
    </span>
  )
}

// Face-down card back — champagne-gold lattice on deep charcoal, matching the lounge. Used for
// every opponent hole card (values are never sent to the client) and the undealt deck affordance.
export function PokerCardBack({ w = 52, dealt = false, className = '' }: { w?: number; dealt?: boolean; className?: string }) {
  const h = Math.round(w * 1.4)
  return (
    <span
      aria-label="face down card"
      role="img"
      className={`relative inline-block overflow-hidden ring-1 ring-black/50 ${dealt ? 'pk-anim-deal' : ''} ${className}`}
      style={{
        width: w,
        height: h,
        borderRadius: 'var(--pk-r-card)',
        boxShadow: 'var(--pk-shadow-seat)',
        background: 'radial-gradient(120% 120% at 50% 0%, #2a2330 0%, #181420 55%, #0f0c14 100%)',
      }}
    >
      <span
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(201,161,74,0.5) 0 1px, transparent 1px 7px), repeating-linear-gradient(-45deg, rgba(201,161,74,0.5) 0 1px, transparent 1px 7px)',
        }}
      />
      <span className="absolute inset-[2px]" style={{ borderRadius: 6, border: '1px solid rgba(201,161,74,0.55)' }} />
      <span className="absolute inset-[4px]" style={{ borderRadius: 5, border: '1px solid rgba(255,255,255,0.08)' }} />
      <span className="absolute inset-0 flex items-center justify-center">
        <SuitPip suit="d" size={Math.round(w * 0.42)} color="rgba(230,207,149,0.85)" />
      </span>
    </span>
  )
}

// A board slot: shows a revealed community card, OR an empty "to be dealt" frame. The engine
// writes only revealed streets here (SHOWDOWN-PRIVATE-001); an empty slot is purely a placeholder
// so the board keeps a stable 5-wide footprint that never reflows as cards arrive.
export function CommunityCardSlot({
  card,
  w = 56,
  dealt = false,
  dim = false,
  highlight = false,
}: {
  card?: Card | null
  w?: number
  dealt?: boolean
  dim?: boolean
  highlight?: boolean
}) {
  const h = Math.round(w * 1.4)
  if (card) return <PokerCard card={card} w={w} dealt={dealt} dim={dim} highlight={highlight} />
  return (
    <span
      aria-hidden
      className="inline-block"
      style={{
        width: w,
        height: h,
        borderRadius: 'var(--pk-r-card)',
        border: '1px dashed rgba(201,161,74,0.28)',
        background: 'rgba(0,0,0,0.22)',
        boxShadow: 'inset 0 1px 6px rgba(0,0,0,0.45)',
      }}
    />
  )
}
