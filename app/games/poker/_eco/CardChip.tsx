import type { Card } from '@/lib/games/poker/types'

const SUIT: Record<string, { sym: string; red: boolean }> = {
  s: { sym: '♠', red: false },
  c: { sym: '♣', red: false },
  h: { sym: '♥', red: true },
  d: { sym: '♦', red: true },
}

// Pure presentational card (rank + suit). Used by replay / hand detail. Display only.
export function CardChip({ card, size = 'md' }: { card: Card; size?: 'sm' | 'md' }) {
  const rank = card.slice(0, -1).replace('T', '10')
  const suit = SUIT[card.slice(-1)] ?? { sym: '?', red: false }
  const dims = size === 'sm' ? 'h-9 w-7 text-xs' : 'h-12 w-9 text-sm'
  return (
    <span
      className={`inline-flex flex-col items-center justify-center rounded-md border border-line bg-white font-semibold leading-none shadow-sm ${dims} ${
        suit.red ? 'text-rose' : 'text-ink'
      }`}
    >
      <span>{rank}</span>
      <span aria-hidden>{suit.sym}</span>
    </span>
  )
}

export function HiddenCard({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const dims = size === 'sm' ? 'h-9 w-7' : 'h-12 w-9'
  return <span className={`inline-block rounded-md border border-line bg-gradient-to-br from-[#2a1a3e] to-[#4a2a5e] ${dims}`} aria-hidden />
}
