'use client'

import { RANKS, R2, type Card } from '@/lib/games/tlmn/engine'

const SUIT_CHAR = ['♠', '♣', '♦', '♥'] // index = suit

// Lightweight CSS playing card — crisp at any size, legible down to ~360px. Red for
// ♦♥, ink for ♠♣. The "2" (heo) gets a subtle gold accent since it's the top single.
export function CardFace({
  card, w = 46, selected = false, dim = false, raised = false,
}: {
  card: Card
  w?: number
  selected?: boolean
  dim?: boolean
  raised?: boolean
}) {
  const red = card.suit >= 2
  const isHeo = card.rank === R2
  const h = Math.round(w * 1.4)
  const rank = RANKS[card.rank]
  const suit = SUIT_CHAR[card.suit]
  const color = red ? '#d6006c' : '#241a17'

  return (
    <span
      className={[
        'relative inline-flex flex-col select-none rounded-[7px] bg-white leading-none transition-all duration-150',
        selected ? 'ring-2 ring-rose shadow-[0_8px_18px_-6px_rgba(214,0,108,0.55)]' : 'ring-1 ring-line',
        raised ? '-translate-y-2' : '',
        dim ? 'opacity-45 grayscale-[35%]' : '',
        isHeo && !dim ? 'shadow-[0_0_0_1.5px_rgba(201,154,61,0.55)]' : 'shadow-card',
      ].join(' ')}
      style={{ width: w, height: h, color }}
    >
      {/* top-left corner */}
      <span className="absolute top-[3px] left-[4px] flex flex-col items-center leading-[0.92]">
        <span className="font-black" style={{ fontSize: Math.round(w * 0.34) }}>{rank}</span>
        <span style={{ fontSize: Math.round(w * 0.28) }}>{suit}</span>
      </span>
      {/* center pip */}
      <span
        className="absolute inset-0 flex items-center justify-center opacity-90"
        style={{ fontSize: Math.round(w * 0.62) }}
      >
        {suit}
      </span>
      {/* bottom-right corner (rotated) */}
      <span className="absolute bottom-[3px] right-[4px] flex flex-col items-center leading-[0.92] rotate-180">
        <span className="font-black" style={{ fontSize: Math.round(w * 0.34) }}>{rank}</span>
        <span style={{ fontSize: Math.round(w * 0.28) }}>{suit}</span>
      </span>
      {isHeo && !dim && (
        <span className="absolute top-[3px] right-[4px] text-gold" style={{ fontSize: Math.round(w * 0.22) }}>★</span>
      )}
    </span>
  )
}

// Face-down card back with a subtle chococfko motif (warm magenta, fine lattice +
// a centered monogram). Never shows real cards — used for opponents' counts.
export function CardBack({ w = 30, className = '' }: { w?: number; className?: string }) {
  const h = Math.round(w * 1.4)
  return (
    <span
      className={`relative inline-block rounded-[6px] ring-1 ring-rose-deep/40 overflow-hidden ${className}`}
      style={{
        width: w,
        height: h,
        background:
          'repeating-linear-gradient(45deg, #d6006c 0, #d6006c 4px, #b80c5e 4px, #b80c5e 8px)',
      }}
    >
      <span className="absolute inset-[2px] rounded-[4px] border border-white/25" />
      <span
        className="absolute inset-0 flex items-center justify-center text-white/90 font-serif font-black"
        style={{ fontSize: Math.round(w * 0.42) }}
      >
        ♦
      </span>
    </span>
  )
}

// A small fanned stack of face-down backs representing an opponent's hand size.
export function FannedBacks({ count, w = 26 }: { count: number; w?: number }) {
  const shown = Math.min(Math.max(count, 0), 5)
  if (shown <= 0) return null
  const h = Math.round(w * 1.4)
  return (
    <span className="relative inline-block" style={{ height: h + 6, width: w + (shown - 1) * 9 }}>
      {Array.from({ length: shown }).map((_, i) => (
        <span
          key={i}
          className="absolute bottom-0"
          style={{
            left: i * 9,
            transform: `rotate(${(i - (shown - 1) / 2) * 4}deg)`,
            transformOrigin: 'bottom center',
          }}
        >
          <CardBack w={w} />
        </span>
      ))}
    </span>
  )
}
