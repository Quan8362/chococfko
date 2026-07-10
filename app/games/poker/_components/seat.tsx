'use client'

// ── Player seat — PlayerSeat + PlayerAvatarFrame · PlayerInfoPanel · CurrentBetIndicator ·
//    ConnectionIndicator ───────────────────────────────────────────────────────────────────
//
// A seat renders authoritative PUBLIC state only (PublicSeat): name, public stack, committed
// chips, blind/dealer markers, last action, and presence — plus presentation flags (current
// actor, winner, timer). Opponent hole cards are ALWAYS face-down backs; the client never holds
// their values (privacy A1). Own cards / legal showdown reveals are passed in explicitly.
//
// Every state is communicated by icon + label, not colour alone (accessibility). Long names
// truncate; large/low stacks use formatCoinsShort with the exact value in the tooltip/aria.

import type { Card, PokerActionType, SeatStatus } from '@/lib/games/poker/types'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { formatCoinsShort, formatCoinsFull } from '@/lib/game/economy'
import { avatarSrc, bumpAvatarSize } from '@/lib/avatar'
import { seatInitials } from '@/lib/games/poker/seatIdentity'
import { PokerCard, PokerCardBack } from './cards'
import { PokerChip } from './chips'
import { BigBlindBadge, AllInBadge } from './markers'
import { TurnTimer } from './TurnTimer'

// Presentation view of a seat — PUBLIC fields (mirror PublicSeat) + presentation-only flags. No
// foreign hole cards ever live here; `cards` is only the viewer's own pair or a legal reveal.
export interface PokerSeatView {
  readonly seatIndex: number
  readonly status: SeatStatus
  readonly displayName?: string | null
  readonly avatarUrl?: string | null
  readonly stack: number
  readonly committedThisStreet?: number
  readonly lastAction?: PokerActionType | null
  readonly allIn?: boolean
  readonly folded?: boolean
  readonly connected?: boolean
  readonly isButton?: boolean
  readonly isSmallBlind?: boolean
  readonly isBigBlind?: boolean
  readonly isCurrentActor?: boolean
  readonly isWinner?: boolean
  readonly winAmount?: number
  // own face-up cards or a legal showdown reveal; null + inHand ⇒ draw face-down backs
  readonly cards?: readonly [Card, Card] | null
  readonly inHand?: boolean
  readonly deadline?: number | null
  readonly turnTotalSeconds?: number
  readonly isSelf?: boolean
}

export type ConnUx = 'connecting' | 'connected' | 'reconnecting' | 'degraded' | 'offline'

// ── ConnectionIndicator ───────────────────────────────────────────────────────────────────────
// `dot` = tiny seat presence dot; `banner` = the always-visible room connection strip. Icon + label
// both carry the state (never colour alone).
export function ConnectionIndicator({
  status,
  variant = 'dot',
}: {
  status: ConnUx
  variant?: 'dot' | 'banner'
}) {
  const t = useTranslations('games.poker')
  const map: Record<ConnUx, { color: string; key: string }> = {
    connected: { color: 'var(--pk-emerald)', key: 'conn.connected' },
    connecting: { color: 'var(--pk-amber)', key: 'conn.connecting' },
    reconnecting: { color: 'var(--pk-amber)', key: 'conn.reconnecting' },
    degraded: { color: 'var(--pk-amber)', key: 'conn.degraded' },
    offline: { color: 'var(--pk-burgundy)', key: 'conn.offline' },
  }
  const s = map[status]
  const live = status !== 'connected'
  if (variant === 'dot') {
    return (
      <span className="inline-flex items-center gap-1" role="status" aria-label={t(s.key)} title={t(s.key)}>
        <span
          className="inline-block rounded-full"
          style={{ width: 8, height: 8, background: s.color, boxShadow: `0 0 6px ${s.color}` }}
        />
      </span>
    )
  }
  return (
    <span
      role="status"
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
      style={{ background: 'rgba(0,0,0,0.55)', border: `1px solid ${s.color}`, color: 'var(--pk-text-hi)' }}
    >
      <span
        className={`inline-block rounded-full ${live ? 'pk-anim-timer-flash' : ''}`}
        style={{ width: 9, height: 9, background: s.color, animation: live ? 'pk-timer-flash 1s ease-in-out infinite' : undefined }}
      />
      {t(s.key)}
    </span>
  )
}

// ── PlayerAvatarFrame ───────────────────────────────────────────────────────────────────────
// Circular avatar with a state-coloured ring (actor=champagne, winner=gold-glow, folded=muted,
// disconnected=burgundy). Falls back to initials when no avatar URL.
export function PlayerAvatarFrame({
  name,
  avatarUrl,
  size = 52,
  actor = false,
  winner = false,
  folded = false,
  disconnected = false,
}: {
  name?: string | null
  avatarUrl?: string | null
  size?: number
  actor?: boolean
  winner?: boolean
  folded?: boolean
  disconnected?: boolean
}) {
  const initials = seatInitials(name)
  // Google / Facebook avatar hosts are blocked when loaded directly (firewall / CSP), so — exactly
  // like the site-wide UserAvatar — route them through the same-origin /api/avatar proxy and bump
  // the size token for a crisp retina render. Supabase-hosted avatars go through /api/img; local /
  // data URLs pass through unchanged. Without this the felt fell back to initials for OAuth photos.
  const resolvedSrc = avatarSrc(bumpAvatarSize(avatarUrl, size))
  // A stored/OAuth avatar URL can be missing, revoked, or expired. Fall back to initials the
  // instant the image fails to load, and reset the flag whenever the URL changes so a seat reused
  // by a DIFFERENT player never inherits the previous occupant's broken/loaded state (privacy A9).
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [resolvedSrc])
  const showImage = !!resolvedSrc && !broken
  const ringColor = winner
    ? 'var(--pk-gold-soft)'
    : actor
      ? 'var(--pk-actor)'
      : disconnected
        ? 'var(--pk-burgundy)'
        : 'var(--pk-gold-line)'
  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-hidden ${winner ? 'pk-anim-winner' : actor ? 'pk-anim-actor' : ''}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `2px solid ${ringColor}`,
        background: 'radial-gradient(120% 120% at 50% 25%, #2a232f 0%, #16131b 100%)',
        filter: folded ? 'grayscale(0.7) brightness(0.7)' : undefined,
        boxShadow: !actor && !winner ? 'var(--pk-shadow-seat)' : undefined,
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          // Key by src so a new occupant's avatar remounts cleanly (no stale image reuse).
          key={resolvedSrc}
          src={resolvedSrc}
          alt={name ?? ''}
          className="w-full h-full object-cover"
          draggable={false}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="font-bold" style={{ color: 'var(--pk-gold-soft)', fontSize: size * 0.38 }} aria-hidden>
          {initials}
        </span>
      )}
    </span>
  )
}

// ── CurrentBetIndicator — committed-this-street chips beside the seat ──────────────────────────
export function CurrentBetIndicator({ amount, chipSize = 28 }: { amount: number; chipSize?: number }) {
  if (!amount || amount <= 0) return null
  return (
    <span
      className="pk-anim-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5"
      style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--pk-gold-line)' }}
      title={formatCoinsFull(amount)}
    >
      <PokerChip value={amount} size={chipSize} showLabel={false} />
      <span className="pk-felt-scrim font-bold tabular-nums" style={{ color: 'var(--pk-gold-soft)', fontSize: 12 }}>
        {formatCoinsShort(amount)}
      </span>
    </span>
  )
}

// Last-action chip (fold / check / call / bet / raise) — icon-free text pill, semantic colour.
function LastActionPill({ action }: { action: PokerActionType }) {
  const t = useTranslations('games.poker')
  const styleByAction: Record<PokerActionType, { bg: string; fg: string }> = {
    fold: { bg: 'rgba(110,98,88,0.85)', fg: '#efeae0' },
    check: { bg: 'rgba(45,91,142,0.85)', fg: '#eaf2fb' },
    call: { bg: 'rgba(47,158,111,0.85)', fg: '#e9f7ef' },
    bet: { bg: 'rgba(194,24,91,0.8)', fg: '#fdeef4' },
    raise: { bg: 'rgba(194,24,91,0.9)', fg: '#fdeef4' },
    all_in: { bg: 'rgba(217,152,54,0.9)', fg: '#1a1206' },
  }
  const s = styleByAction[action]
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-wide leading-none"
      style={{ background: s.bg, color: s.fg }}
    >
      {t(`action.${action}`)}
    </span>
  )
}

// ── PlayerInfoPanel — name + stack plate beneath the avatar ──────────────────────────────────
export function PlayerInfoPanel({
  name,
  stack,
  lowStack = false,
  compact = false,
}: {
  name?: string | null
  stack: number
  lowStack?: boolean
  compact?: boolean
}) {
  return (
    <span
      className="flex flex-col items-center rounded-lg px-2.5 py-1 min-w-[78px] max-w-[120px]"
      style={{
        background: 'linear-gradient(180deg, rgba(33,28,40,0.94), rgba(13,11,17,0.94))',
        border: '1px solid var(--pk-gold-line)',
        boxShadow: 'var(--pk-shadow-seat)',
      }}
    >
      <span
        className="w-full truncate text-center font-semibold"
        style={{ color: 'var(--pk-text-hi)', fontSize: compact ? 12 : 13 }}
        title={name ?? ''}
      >
        {name ?? '—'}
      </span>
      <span
        className="font-bold tabular-nums leading-tight"
        style={{ color: lowStack ? 'var(--pk-amber)' : 'var(--pk-gold-soft)', fontSize: compact ? 12.5 : 14 }}
        title={formatCoinsFull(stack)}
      >
        {formatCoinsShort(stack)}
      </span>
    </span>
  )
}

// ── SeatPocketCards — a seat's hole cards, drawn in the felt recess in front of the seat ───────
// Face-up for the viewer's own cards or a legal showdown reveal; otherwise face-down backs while
// the seat is in the hand. Renders nothing when the seat holds no cards (folded / not in hand).
export function SeatPocketCards({
  cards,
  inHand = false,
  folded = false,
  isWinner = false,
  w = 34,
}: {
  cards?: readonly [Card, Card] | null
  inHand?: boolean
  folded?: boolean
  isWinner?: boolean
  w?: number
}) {
  if (!cards && !(inHand && !folded)) return null
  return (
    <span className={`inline-flex items-end gap-0.5 ${folded ? 'opacity-60' : ''}`}>
      {cards ? (
        <>
          <PokerCard card={cards[0]} w={w} highlight={isWinner} />
          <PokerCard card={cards[1]} w={w} highlight={isWinner} />
        </>
      ) : (
        <>
          <PokerCardBack w={Math.round(w * 0.86)} />
          <PokerCardBack w={Math.round(w * 0.86)} />
        </>
      )}
    </span>
  )
}

// ── PlayerSeat — the composed pod ─────────────────────────────────────────────────────────────
// `cardOrientation` drives any fanning in a real table; here own/reveal cards render upright.
export function PlayerSeat({
  seat,
  avatarSize = 52,
  compact = false,
  lowStackThreshold = 0,
  hideCards = false,
}: {
  seat: PokerSeatView
  avatarSize?: number
  compact?: boolean
  lowStackThreshold?: number
  // When true the pod omits its own hole cards — the table renders them in the seat's card
  // pocket instead (rail-pad pod + felt-recess cards). Committed-street chips still show here.
  hideCards?: boolean
}) {
  const t = useTranslations('games.poker')
  const {
    status,
    displayName,
    avatarUrl,
    stack,
    committedThisStreet = 0,
    lastAction,
    allIn,
    folded,
    connected = true,
    // isButton / isSmallBlind remain in PublicSeat state (dealer + blind assignment untouched);
    // their avatar overlays are intentionally not rendered. Only the big-blind marker is shown.
    isBigBlind,
    isCurrentActor,
    isWinner,
    winAmount,
    cards,
    inHand,
    deadline,
    turnTotalSeconds = 15,
  } = seat

  // Empty / reserved seats are simple placeholders.
  if (status === 'empty') {
    return (
      <span
        className="flex flex-col items-center justify-center rounded-xl"
        style={{
          width: avatarSize + 56,
          height: avatarSize + 46,
          border: '1px dashed var(--pk-gold-line)',
          background: 'rgba(0,0,0,0.25)',
          color: 'var(--pk-text-low)',
        }}
      >
        <span className="text-[12px] font-medium">{t('seat.empty')}</span>
      </span>
    )
  }
  if (status === 'reserved') {
    return (
      <span
        className="flex flex-col items-center gap-1 rounded-xl px-3 py-2"
        style={{ border: '1px solid var(--pk-gold-line)', background: 'rgba(0,0,0,0.35)' }}
      >
        <PlayerAvatarFrame name={displayName} avatarUrl={avatarUrl} size={avatarSize} />
        <span className="text-[11.5px] font-medium" style={{ color: 'var(--pk-text-mid)' }}>
          {t('seat.reserved')}
        </span>
      </span>
    )
  }

  const lowStack = lowStackThreshold > 0 && stack <= lowStackThreshold
  const sittingOut = status === 'sitting_out'
  const leaving = status === 'leaving'
  const showActor = !!isCurrentActor && !folded && !sittingOut

  return (
    <span className="relative inline-flex flex-col items-center gap-1" style={{ opacity: folded ? 0.72 : 1 }}>
      {/* own / revealed cards above the avatar (unless the table draws them in the card pocket) */}
      {!hideCards && (cards || (inHand && !folded)) && (
        <span className="flex items-end gap-1" style={{ marginBottom: -6 }}>
          {cards ? (
            <>
              <PokerCard card={cards[0]} w={compact ? 30 : 36} highlight={isWinner} />
              <PokerCard card={cards[1]} w={compact ? 30 : 36} highlight={isWinner} />
            </>
          ) : (
            <>
              <PokerCardBack w={compact ? 26 : 30} />
              <PokerCardBack w={compact ? 26 : 30} />
            </>
          )}
        </span>
      )}

      {/* avatar + ring + markers */}
      <span className="relative">
        <PlayerAvatarFrame
          name={displayName}
          avatarUrl={avatarUrl}
          size={avatarSize}
          actor={showActor}
          winner={!!isWinner}
          folded={!!folded}
          disconnected={!connected}
        />

        {/* big-blind marker — top-right. Dealer ("D") and small-blind ("SB") avatar overlays are
            intentionally omitted (UI declutter); dealer/blind state itself is unchanged. The
            container renders only when a badge exists, so no empty placeholder or reserved space
            is left behind. */}
        {isBigBlind && (
          <span className="absolute -top-1 -right-2 flex flex-col items-end gap-0.5">
            <BigBlindBadge size={compact ? 18 : 20} />
          </span>
        )}

        {/* turn timer — bottom-left of avatar, isolated layer */}
        {showActor && deadline != null && (
          <span className="absolute -bottom-1 -left-2">
            <TurnTimer deadline={deadline} totalSeconds={turnTotalSeconds} size={compact ? 32 : 38} />
          </span>
        )}

        {/* presence dot — bottom-right */}
        {!connected && (
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full p-0.5" style={{ background: 'var(--pk-bg-base)' }}>
            <ConnectionIndicator status="offline" />
          </span>
        )}
      </span>

      {/* name + stack plate */}
      <PlayerInfoPanel name={displayName} stack={stack} lowStack={lowStack} compact={compact} />

      {/* status / action row */}
      <span className="flex items-center gap-1.5 min-h-[18px]">
        {isWinner && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10.5px] font-extrabold uppercase tracking-wide"
            style={{ background: 'linear-gradient(180deg,#e6cf95,#c9a14a)', color: '#241b18' }}
          >
            ★ {t('seat.winner')}
            {winAmount ? <span className="tabular-nums">+{formatCoinsShort(winAmount)}</span> : null}
          </span>
        )}
        {!isWinner && allIn && <AllInBadge small />}
        {!isWinner && !allIn && folded && (
          <span className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: 'var(--pk-fold)' }}>
            {t('seat.folded')}
          </span>
        )}
        {!isWinner && !allIn && !folded && sittingOut && (
          <span className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: 'var(--pk-text-low)' }}>
            {t('seat.sitting_out')}
          </span>
        )}
        {!isWinner && !allIn && !folded && leaving && (
          <span className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: 'var(--pk-amber)' }}>
            {t('seat.leaving')}
          </span>
        )}
        {!isWinner && !allIn && !folded && !sittingOut && !leaving && lastAction && <LastActionPill action={lastAction} />}
      </span>

      {/* committed-this-street chips */}
      {committedThisStreet > 0 && (
        <span className="mt-0.5">
          <CurrentBetIndicator amount={committedThisStreet} />
        </span>
      )}
    </span>
  )
}
