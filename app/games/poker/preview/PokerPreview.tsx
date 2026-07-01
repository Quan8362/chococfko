'use client'

// ── Poker design-system preview (isolated) ───────────────────────────────────────────────────
//
// Renders every reusable component + every player-seat state in isolation, on the dark Poker
// lounge theme, with a live responsive-classification readout and a composed mini-table mock.
// This is a design/QA surface — NOT the gameplay page (no realtime, no server actions).

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import '../_design/poker-theme.css'
import { CHIP_DENOMS, palette } from '../_design/tokens'
import { useViewportClass } from '../_design/useViewportClass'
import {
  PokerCard,
  PokerCardBack,
  CommunityCardSlot,
  PokerChip,
  PokerChipStack,
  DealerButton,
  SmallBlindBadge,
  BigBlindBadge,
  AllInBadge,
  PlayerSeat,
  ConnectionIndicator,
  PotDisplay,
  SidePotDisplay,
  StreetIndicator,
  ActionButton,
  BettingAmountControl,
  WinnerHighlight,
  InlineGameMessage,
  RotateDeviceOverlay,
  TableBackground,
  type PokerSeatView,
  type StreetName,
} from '../_components'
import type { Card, Pots } from '@/lib/games/poker/types'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2
        className="font-serif"
        style={{ color: 'var(--pk-gold-soft)', fontSize: 19, borderBottom: '1px solid var(--pk-gold-line)', paddingBottom: 6 }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

function Cell({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col items-center justify-end gap-2 rounded-xl p-3"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', minHeight: 120 }}
    >
      <div className="flex flex-1 items-center justify-center">{children}</div>
      <span className="text-center text-[11px]" style={{ color: 'var(--pk-text-low)' }}>
        {caption}
      </span>
    </div>
  )
}

const SAMPLE_BOARD: Card[] = ['Ah', 'Kd', 'Qs', 'Jc', 'Th']
const SAMPLE_POTS: Pots = {
  main: { amount: 4_250_000, eligibleSeatIndexes: [0, 1, 2, 3] },
  sides: [
    { amount: 1_500_000, eligibleSeatIndexes: [0, 2, 3] },
    { amount: 600_000, eligibleSeatIndexes: [2, 3] },
  ],
}

export default function PokerPreview() {
  const t = useTranslations('games.poker')
  const vp = useViewportClass()
  const [showRotate, setShowRotate] = useState(false)
  // a live deadline so the TurnTimer ring actually sweeps in the preview
  const [deadline, setDeadline] = useState<number>(() => Date.now() + 15_000)

  const bettingModel = {
    callAmount: 200_000,
    minRaiseTo: 400_000,
    maxRaiseTo: 5_000_000,
    pot: 4_250_000,
    currentContribution: 100_000,
    bigBlind: 100_000,
  }

  // ── Seat states (every case from the visual spec) ─────────────────────────────────────────
  const seatCases: { caption: string; seat: PokerSeatView }[] = useMemo(() => {
    const base: PokerSeatView = {
      seatIndex: 1,
      status: 'sitting_in',
      displayName: 'Minh',
      stack: 2_400_000,
      committedThisStreet: 0,
      connected: true,
      inHand: true,
    }
    return [
      { caption: t('preview.seat_case.empty'), seat: { seatIndex: 0, status: 'empty', stack: 0 } },
      { caption: t('preview.seat_case.reserved'), seat: { seatIndex: 0, status: 'reserved', displayName: 'Lan', stack: 0 } },
      { caption: t('preview.seat_case.active'), seat: { ...base, committedThisStreet: 100_000, lastAction: 'call' } },
      {
        caption: t('preview.seat_case.current_actor'),
        seat: { ...base, isCurrentActor: true, deadline, committedThisStreet: 200_000, lastAction: 'bet' },
      },
      { caption: t('preview.seat_case.folded'), seat: { ...base, folded: true, lastAction: 'fold', inHand: false } },
      { caption: t('preview.seat_case.all_in'), seat: { ...base, allIn: true, committedThisStreet: 2_400_000, lastAction: 'all_in', stack: 0 } },
      { caption: t('preview.seat_case.sitting_out'), seat: { ...base, status: 'sitting_out', inHand: false } },
      { caption: t('preview.seat_case.disconnected'), seat: { ...base, connected: false } },
      { caption: t('preview.seat_case.leaving'), seat: { ...base, status: 'leaving', inHand: false } },
      { caption: t('preview.seat_case.winner'), seat: { ...base, isWinner: true, winAmount: 4_250_000, cards: ['As', 'Ad'] } },
      { caption: t('preview.seat_case.showdown'), seat: { ...base, cards: ['Kh', 'Kc'], isSelf: true } },
      { caption: t('preview.seat_case.long_name'), seat: { ...base, displayName: 'NguyễnHoàngLongVân2026' } },
      { caption: t('preview.seat_case.big_stack'), seat: { ...base, stack: 12_750_000_000 } },
      { caption: t('preview.seat_case.low_stack'), seat: { ...base, stack: 35_000 } },
      {
        caption: t('preview.seat_case.timer_warning'),
        seat: { ...base, isCurrentActor: true, deadline: Date.now() + 4_000, committedThisStreet: 200_000 },
      },
    ]
  }, [t, deadline])

  return (
    <div className="poker-root min-h-screen w-full" style={{ background: 'var(--pk-bg-void)' }}>
      {showRotate && <RotateDeviceOverlay />}

      <div className="mx-auto flex max-w-[1100px] flex-col gap-10 px-5 py-10 pb-24 sm:px-6">
        {/* header + live layout readout */}
        <header className="flex flex-col gap-3">
          <h1 className="font-serif" style={{ color: 'var(--pk-gold-soft)', fontSize: 30 }}>
            {t('preview.title')}
          </h1>
          <p style={{ color: 'var(--pk-text-mid)', fontSize: 15, maxWidth: 640 }}>{t('preview.subtitle')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full px-3 py-1 text-[12.5px] font-semibold" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--pk-gold-line)', color: 'var(--pk-gold-soft)' }}>
              {t('preview.layout_label')}: {t(`preview.layout.${vp.layout}`)}
            </span>
            <span className="rounded-full px-3 py-1 text-[12.5px] tabular-nums" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--pk-text-mid)' }}>
              {vp.width}×{vp.height} · {vp.aspect.toFixed(2)}
            </span>
            <button
              type="button"
              onClick={() => setShowRotate((v) => !v)}
              className="rounded-full px-3 py-1 text-[12.5px] font-semibold"
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--pk-gold-line)', color: 'var(--pk-text-hi)' }}
            >
              {showRotate ? t('preview.hide_rotate') : t('preview.show_rotate')}
            </button>
          </div>
        </header>

        {/* ── Tokens ─────────────────────────────────────────────────────────────────────── */}
        <Section title={t('preview.section.tokens')}>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['Void', palette.bgVoid],
                ['Charcoal', palette.charcoal],
                ['Leather', palette.leather],
                ['Felt', palette.felt],
                ['Gold', palette.gold],
                ['Gold soft', palette.goldSoft],
                ['Emerald', palette.emerald],
                ['Burgundy', palette.burgundy],
                ['Navy', palette.navy],
                ['Amber', palette.amber],
                ['Pink', palette.pink],
                ['Text hi', palette.textHi],
              ] as const
            ).map(([name, hex]) => (
              <div key={name} className="flex flex-col items-center gap-1">
                <span className="block rounded-lg" style={{ width: 64, height: 44, background: hex, border: '1px solid rgba(255,255,255,0.12)' }} />
                <span className="text-[10.5px]" style={{ color: 'var(--pk-text-low)' }}>
                  {name}
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Cards ──────────────────────────────────────────────────────────────────────── */}
        <Section title={t('preview.section.cards')}>
          <div className="flex flex-wrap items-center gap-2">
            {(['As', 'Kh', 'Qd', 'Jc', 'Ts', '9h', '7c', '2d'] as Card[]).map((c) => (
              <PokerCard key={c} card={c} w={54} />
            ))}
            <PokerCardBack w={54} />
            <PokerCard card={'Ah'} w={54} highlight />
            <PokerCard card={'5s'} w={54} dim />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[12px]" style={{ color: 'var(--pk-text-low)' }}>{t('preview.board')}:</span>
            {[0, 1, 2, 3, 4].map((i) => (
              <CommunityCardSlot key={i} card={i < 4 ? SAMPLE_BOARD[i] : null} w={56} highlight={i === 0} />
            ))}
          </div>
        </Section>

        {/* ── Chips ──────────────────────────────────────────────────────────────────────── */}
        <Section title={t('preview.section.chips')}>
          <div className="flex flex-wrap items-center gap-3">
            {CHIP_DENOMS.map((d) => (
              <div key={d.value} className="flex flex-col items-center gap-1">
                <PokerChip denom={d} size={40} />
                <span className="text-[10.5px] tabular-nums" style={{ color: 'var(--pk-text-low)' }}>
                  {d.value.toLocaleString('en-US')}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-8">
            <PokerChipStack amount={1_375} />
            <PokerChipStack amount={486_500} />
            <PokerChipStack amount={4_250_000} />
            <PokerChipStack amount={12_750_000_000} />
            <PokerChipStack amount={486_500} compact chipSize={24} />
          </div>
        </Section>

        {/* ── Markers ────────────────────────────────────────────────────────────────────── */}
        <Section title={t('preview.section.markers')}>
          <div className="flex flex-wrap items-center gap-5">
            <DealerButton size={28} />
            <SmallBlindBadge size={24} />
            <BigBlindBadge size={24} />
            <AllInBadge />
            <AllInBadge small />
            <ConnectionIndicator status="connected" variant="banner" />
            <ConnectionIndicator status="reconnecting" variant="banner" />
            <ConnectionIndicator status="offline" variant="banner" />
          </div>
        </Section>

        {/* ── Pots & streets ─────────────────────────────────────────────────────────────── */}
        <Section title={t('preview.section.pots')}>
          <div className="flex flex-wrap items-start gap-8">
            <div className="flex flex-col items-center gap-2">
              <PotDisplay pots={SAMPLE_POTS} />
              <span className="text-[11px]" style={{ color: 'var(--pk-text-low)' }}>{t('preview.pot_desktop')}</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <PotDisplay pots={SAMPLE_POTS} compact />
              <span className="text-[11px]" style={{ color: 'var(--pk-text-low)' }}>{t('preview.pot_mobile')}</span>
            </div>
            <div className="w-[260px]">
              <SidePotDisplay pots={SAMPLE_POTS} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(['PREFLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN'] as StreetName[]).map((s) => (
              <StreetIndicator key={s} street={s} />
            ))}
          </div>
        </Section>

        {/* ── Player seats — every state ─────────────────────────────────────────────────── */}
        <Section title={t('preview.section.seats')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {seatCases.map((c) => (
              <Cell key={c.caption} caption={c.caption}>
                <PlayerSeat seat={c.seat} lowStackThreshold={50_000} />
              </Cell>
            ))}
          </div>
        </Section>

        {/* ── Action controls ────────────────────────────────────────────────────────────── */}
        <Section title={t('preview.section.actions')}>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton variant="fold" label={t('action.fold')} />
            <ActionButton variant="check" label={t('action.check')} />
            <ActionButton variant="call" label={t('action.call')} sublabel="200K" />
            <ActionButton variant="raise" label={t('action.raise')} sublabel="400K" />
            <ActionButton variant="allin" label={t('action.all_in')} />
            <ActionButton variant="neutral" label={t('action.check')} disabled />
          </div>
          <div className="mt-3 max-w-[420px]">
            <BettingAmountControl model={bettingModel} onConfirm={() => undefined} onCancel={() => undefined} />
          </div>
        </Section>

        {/* ── Overlays & messages ────────────────────────────────────────────────────────── */}
        <Section title={t('preview.section.overlays')}>
          <div className="flex flex-wrap items-center gap-3">
            <InlineGameMessage tone="turn" pulse>
              {t('message.your_turn')}
            </InlineGameMessage>
            <InlineGameMessage tone="info">{t('message.waiting')}</InlineGameMessage>
            <InlineGameMessage tone="warning">{t('conn.reconnecting')}</InlineGameMessage>
            <InlineGameMessage tone="danger">{t('conn.offline')}</InlineGameMessage>
            <InlineGameMessage tone="success">{t('message.hand_complete')}</InlineGameMessage>
          </div>
          <div className="mt-3">
            <WinnerHighlight winnerName="Minh" amount={4_250_000} handName={t('preview.sample_hand')} />
          </div>
        </Section>

        {/* ── Composed mini-table mock ───────────────────────────────────────────────────── */}
        <Section title={t('preview.section.table')}>
          <div
            className="relative w-full overflow-hidden rounded-2xl"
            style={{ aspectRatio: '16 / 9', border: '1px solid var(--pk-gold-line)' }}
          >
            <TableBackground layout={vp.layout === 'portrait' ? 'mobile' : vp.layout}>
              {/* board + pot centred */}
              <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
                <div className="flex items-center gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <CommunityCardSlot key={i} card={i < 3 ? SAMPLE_BOARD[i] : null} w={vp.layout === 'mobile' ? 34 : 46} />
                  ))}
                </div>
                <PotDisplay pots={{ main: SAMPLE_POTS.main, sides: [] }} compact={vp.layout === 'mobile'} />
                <StreetIndicator street="FLOP" compact />
              </div>

              {/* opponents top */}
              <div className="absolute left-1/2 top-3 -translate-x-1/2">
                <PlayerSeat seat={{ seatIndex: 3, status: 'sitting_in', displayName: 'Lan', stack: 3_200_000, isCurrentActor: true, deadline, committedThisStreet: 200_000, inHand: true, connected: true }} compact />
              </div>
              <div className="absolute left-4 top-1/3">
                <PlayerSeat seat={{ seatIndex: 2, status: 'sitting_in', displayName: 'Huy', stack: 1_050_000, lastAction: 'call', committedThisStreet: 200_000, inHand: true, connected: true, isBigBlind: true }} compact />
              </div>
              <div className="absolute right-4 top-1/3">
                <PlayerSeat seat={{ seatIndex: 4, status: 'sitting_in', displayName: 'An', stack: 0, allIn: true, lastAction: 'all_in', committedThisStreet: 800_000, inHand: true, connected: true }} compact />
              </div>

              {/* local seat bottom-center */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                <PlayerSeat
                  seat={{ seatIndex: 0, status: 'sitting_in', displayName: 'You', stack: 2_400_000, cards: ['As', 'Kd'], committedThisStreet: 200_000, inHand: true, connected: true, isButton: true, isSelf: true }}
                  compact
                />
              </div>
            </TableBackground>
          </div>
          <p className="text-[11.5px]" style={{ color: 'var(--pk-text-low)' }}>
            {t('preview.table_note')}
          </p>
        </Section>

        <div className="flex justify-center">
          <ActionButton variant="neutral" label={t('preview.deal_again')} onClick={() => setDeadline(Date.now() + 15_000)} />
        </div>
      </div>
    </div>
  )
}
