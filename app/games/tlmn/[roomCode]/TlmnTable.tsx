'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import {
  RANKS, parseCombo, beats, sortHand,
  type Card, type Combo,
} from '@/lib/games/tlmn/engine'
import {
  fetchGameState, fetchMyHand, playCards, passTurn, tickTurnTimer, startNextRound,
  type TlmnPublicGame, type TlmnSeat,
} from '../actions'

const SUIT_CHAR = ['♠', '♣', '♦', '♥'] // index = suit
const cardKey = (c: Card) => `${c.rank}-${c.suit}`

type Props = {
  roomId: string
  seats: TlmnSeat[]
  mySeat: number | null
  isHost: boolean
}

export default function TlmnTable({ roomId, seats, mySeat, isHost }: Props) {
  const t = useTranslations('games.tlmn')
  const [game, setGame] = useState<TlmnPublicGame | null>(null)
  const [hand, setHand] = useState<Card[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [isPending, startTransition] = useTransition()
  const mountedRef = useRef(true)
  const tickRef = useRef<string | null>(null) // last turn we already nudged the reaper for

  const refreshHand = useCallback(() => {
    fetchMyHand(roomId).then(h => {
      if (!mountedRef.current) return
      setHand(h ? sortHand(h.cards) : [])
    }).catch(() => {})
  }, [roomId])

  const refreshAll = useCallback(() => {
    fetchGameState(roomId).then(g => {
      if (!mountedRef.current) return
      setGame(g)
      setSelected(new Set())
    }).catch(() => {})
    refreshHand()
  }, [roomId, refreshHand])

  // ── Realtime: the public game row ──────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    const sb = createClient()
    const ch = sb
      .channel(`tlmn-game:${roomId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tlmn_games', filter: `room_id=eq.${roomId}`,
      }, () => { if (mountedRef.current) refreshAll() })
      .subscribe(status => { if (status === 'SUBSCRIBED' && mountedRef.current) refreshAll() })
    return () => { mountedRef.current = false; sb.removeChannel(ch) }
  }, [roomId, refreshAll])

  // ── Local clock for the turn countdown ─────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  // ── Timeout reaper nudge: once a turn's deadline passes, ask the server to act ──
  useEffect(() => {
    if (!game || game.status !== 'playing' || !game.turn_deadline || !game.turn_started_at) return
    const expired = now > new Date(game.turn_deadline).getTime() + 3500
    if (!expired) return
    if (tickRef.current === game.turn_started_at) return // already nudged for this turn
    tickRef.current = game.turn_started_at
    tickTurnTimer(roomId).catch(() => {})
  }, [now, game, roomId])

  if (!game) {
    return <p className="text-center text-[13.5px] text-muted py-10">{t('dealing')}</p>
  }

  const rules = game.rules
  const tableCombo: Combo | null = game.trick ? parseCombo(game.trick.cards) : null
  const isMyTurn = mySeat != null && game.turn_seat === mySeat && game.status === 'playing'
  const selectedCards = hand.filter(c => selected.has(cardKey(c)))
  const selectedCombo = selectedCards.length ? parseCombo(selectedCards) : null
  // The 3♠ opening rule is enforced server-side; the client only gates by legality.
  const canPlay = isMyTurn && !!selectedCombo && beats(selectedCombo, tableCombo, rules)
  const canPass = isMyTurn && !!game.trick // can't pass while leading

  const secondsLeft = game.turn_deadline
    ? Math.max(0, Math.ceil((new Date(game.turn_deadline).getTime() - now) / 1000))
    : null

  const toggleCard = (c: Card) => {
    const k = cardKey(c)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  const doPlay = () => {
    if (!canPlay) return
    setError(null)
    startTransition(async () => {
      const res = await playCards(roomId, selectedCards)
      if (res?.error) setError(res.error)
      else setSelected(new Set())
    })
  }

  const doPass = () => {
    if (!canPass) return
    setError(null)
    startTransition(async () => {
      const res = await passTurn(roomId)
      if (res?.error) setError(res.error)
    })
  }

  const doNextRound = () => {
    startTransition(async () => {
      const res = await startNextRound(roomId)
      if (res?.error) setError(res.error)
    })
  }

  const seatName = (idx: number) =>
    seats.find(s => s.seat_index === idx)?.display_name || t('player_fallback', { n: idx + 1 })

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">

      {/* Locked rules summary */}
      <RulesSummary game={game} t={t} />

      {/* Opponents / seat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {game.seats.map(idx => {
          const count = game.card_counts?.[String(idx)] ?? 0
          const passed = game.pass_flags?.includes(idx)
          const isTurn = game.turn_seat === idx && game.status === 'playing'
          const isNhat = game.nhat_seat === idx
          return (
            <div
              key={idx}
              className={`rounded-xl border p-2.5 text-center transition-all ${
                isTurn ? 'border-rose bg-rose/5 ring-1 ring-rose/30'
                : isNhat ? 'border-gold/50 bg-gold/5' : 'border-line bg-paper'
              }`}
            >
              <p className="text-[12.5px] font-semibold text-ink truncate">
                {seatName(idx)}{idx === mySeat ? ` (${t('you_badge')})` : ''}
              </p>
              <p className="text-[11px] text-muted mt-0.5">
                🂠 {t('cards_left', { n: count })}
              </p>
              <div className="flex items-center justify-center gap-1.5 mt-1 min-h-[16px]">
                {isNhat && <span className="text-[10px] font-bold text-gold">🏆 {t('nhat')}</span>}
                {passed && game.status === 'playing' && (
                  <span className="text-[10px] font-semibold text-muted/70">{t('passed')}</span>
                )}
                {isTurn && secondsLeft != null && (
                  <span className={`text-[10px] font-bold ${secondsLeft <= 5 ? 'text-rose' : 'text-emerald-600'}`}>
                    ⏱ {secondsLeft}s
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* The table / current trick */}
      <div className="rounded-2xl border border-line bg-cream/40 p-4 min-h-[96px] flex flex-col items-center justify-center gap-2">
        {game.status === 'ended' ? (
          <RoundResult game={game} seatName={seatName} t={t} />
        ) : game.trick ? (
          <>
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">
              {t('table_play_by', { name: seatName(game.trick.by_seat) })}
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {sortHand(game.trick.cards).map(c => <CardChip key={cardKey(c)} card={c} />)}
            </div>
          </>
        ) : (
          <p className="text-[12.5px] text-muted">
            {game.turn_seat != null ? t('waiting_lead', { name: seatName(game.turn_seat) }) : ''}
          </p>
        )}
      </div>

      {/* Last chặt event */}
      {game.chat_events && game.chat_events.length > 0 && (
        <p className="text-center text-[12px] font-semibold text-rose">
          ✂️ {t('chat_cut', {
            cutter: seatName(game.chat_events[game.chat_events.length - 1].cutter),
            victim: seatName(game.chat_events[game.chat_events.length - 1].cutVictim),
          })}
        </p>
      )}

      {/* My hand */}
      {mySeat != null && game.status === 'playing' && (
        <div className="rounded-2xl border border-line bg-paper p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-muted uppercase tracking-[1.5px]">
              {t('your_hand')} ({hand.length})
            </p>
            {isMyTurn && (
              <span className="text-[11px] font-bold text-rose animate-pulse">{t('your_turn')}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {hand.map(c => {
              const sel = selected.has(cardKey(c))
              return (
                <button key={cardKey(c)} type="button" onClick={() => toggleCard(c)}>
                  <CardChip card={c} selected={sel} />
                </button>
              )
            })}
          </div>

          {error && (
            <p className="text-[12px] text-rose mt-2.5">{tErr(t, error)}</p>
          )}

          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={doPlay}
              disabled={!canPlay || isPending}
              className="flex-1 font-semibold text-[14px] px-5 py-2.5 rounded-xl bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-40 disabled:hover:bg-rose"
            >
              {t('play_btn')}{selectedCards.length ? ` (${selectedCards.length})` : ''}
            </button>
            <button
              type="button"
              onClick={doPass}
              disabled={!canPass || isPending}
              className="flex-1 font-semibold text-[14px] px-5 py-2.5 rounded-xl border border-line text-ink hover:bg-line transition-all disabled:opacity-40"
            >
              {t('pass_btn')}
            </button>
          </div>
        </div>
      )}

      {/* Ván mới (host, round ended) */}
      {game.status === 'ended' && (
        <div className="text-center">
          {isHost ? (
            <button
              type="button"
              onClick={doNextRound}
              disabled={isPending}
              className="font-semibold text-[14px] px-6 py-3 rounded-xl bg-ink text-white hover:bg-ink/85 transition-all disabled:opacity-60"
            >
              🃏 {t('new_round_btn')}
            </button>
          ) : (
            <p className="text-[12.5px] text-muted">{t('waiting_host_next')}</p>
          )}
          {error && <p className="text-[12px] text-rose mt-2">{tErr(t, error)}</p>}
        </div>
      )}
    </div>
  )
}

// ── Card chip ───────────────────────────────────────────────────────────────────
function CardChip({ card, selected }: { card: Card; selected?: boolean }) {
  const red = card.suit >= 2 // ♦ ♥
  return (
    <span
      className={`inline-flex flex-col items-center justify-center rounded-lg border bg-white font-bold leading-none w-9 h-12 transition-transform ${
        selected ? 'border-rose ring-2 ring-rose/40 -translate-y-1.5' : 'border-line'
      } ${red ? 'text-rose-600' : 'text-ink'}`}
    >
      <span className="text-[14px]">{RANKS[card.rank]}</span>
      <span className="text-[15px]">{SUIT_CHAR[card.suit]}</span>
    </span>
  )
}

// ── Locked rules summary ─────────────────────────────────────────────────────────
function RulesSummary({ game, t }: { game: TlmnPublicGame; t: ReturnType<typeof useTranslations> }) {
  const r = game.rules
  const on = (b: boolean) => (b ? '✓' : '×')
  return (
    <div className="rounded-xl border border-line bg-paper px-3.5 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
      <span className="font-bold uppercase tracking-wide text-ink/70">{t('round_label', { n: game.round_no })}</span>
      <span>{t('rule_toiTrangEnabled')} {on(r.toiTrangEnabled)}</span>
      <span>{t('rule_thoiHeoEnabled')} {on(r.thoiHeoEnabled)}</span>
      <span>{t('rule_congEnabled')} {on(r.congEnabled)}</span>
      <span>{t('rule_denEnabled')} {on(r.denEnabled)}</span>
      <span>{t('rule_turnSeconds')}: {r.turnSeconds}s</span>
    </div>
  )
}

// ── Round result ──────────────────────────────────────────────────────────────────
function RoundResult({
  game, seatName, t,
}: {
  game: TlmnPublicGame
  seatName: (i: number) => string
  t: ReturnType<typeof useTranslations>
}) {
  const result = game.result
  const winner = result?.winner ?? game.nhat_seat
  const winType = result?.instant?.type
  return (
    <div className="w-full text-center">
      <p className="text-[15px] font-serif font-bold text-ink">
        🏆 {winner != null ? t('winner_is', { name: seatName(winner) }) : t('round_over')}
      </p>
      {winType && (
        <p className="text-[12px] font-semibold text-gold mt-0.5">
          {t('instant_win')}: {t(`win_${winType}` as Parameters<typeof t>[0])}
        </p>
      )}
      {result?.deltas && (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
          {Object.entries(result.deltas).map(([seat, d]) => (
            <span key={seat} className="text-[12.5px]">
              <span className="text-muted">{seatName(Number(seat))}: </span>
              <span className={`font-bold ${d > 0 ? 'text-emerald-600' : d < 0 ? 'text-rose' : 'text-muted'}`}>
                {d > 0 ? `+${d}` : d}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// Map a server error code to a localized message (falls back to a generic one).
function tErr(t: ReturnType<typeof useTranslations>, code: string): string {
  const known = [
    'not_your_turn', 'turn_expired', 'illegal_move', 'invalid_combo', 'cards_not_held',
    'must_include_three_spade', 'cannot_pass_leading', 'no_active_game', 'conflict',
    'round_in_progress', 'not_enough_players',
  ]
  const key = known.includes(code) ? `play_err_${code}` : 'play_err_generic'
  return t(key as Parameters<typeof t>[0])
}
