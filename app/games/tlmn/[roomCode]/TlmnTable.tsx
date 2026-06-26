'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import {
  parseCombo, beats, sortHand, legalMoves, strength, DEFAULT_RULES,
  type Card, type Combo,
} from '@/lib/games/tlmn/engine'
import {
  fetchGameState, fetchMyHand, playCards, passTurn, tickTurnTimer, startNextRound, runBotTurn,
  type TlmnPublicGame, type TlmnSeat,
} from '../actions'
import { CardFace, FannedBacks } from './TlmnCard'
import { useTlmnSound } from './useTlmnSound'

const cardKey = (c: Card) => `${c.rank}-${c.suit}`
const comboKeys = (cs: Card[]) => cs.map(cardKey)

type Props = {
  roomId: string
  seats: TlmnSeat[]
  mySeat: number | null
  isHost: boolean
}

// Slot placement around the oval table, by number of OTHER players (clockwise from
// the seat after me). Spectators (no "me") fall back to the 4-slot ring.
const SLOTS: Record<number, string[]> = {
  1: ['top'],
  2: ['top-right', 'top-left'],
  3: ['right', 'top', 'left'],
  4: ['right', 'top', 'left', 'bottom'],
}
const SLOT_POS: Record<string, string> = {
  top: 'top-2 left-1/2 -translate-x-1/2',
  'top-left': 'top-2 left-2',
  'top-right': 'top-2 right-2',
  left: 'top-1/2 left-2 -translate-y-1/2',
  right: 'top-1/2 right-2 -translate-y-1/2',
  bottom: 'bottom-2 left-1/2 -translate-x-1/2',
}

export default function TlmnTable({ roomId, seats, mySeat, isHost }: Props) {
  const t = useTranslations('games.tlmn')
  const sound = useTlmnSound()
  const [game, setGame] = useState<TlmnPublicGame | null>(null)
  const [hand, setHand] = useState<Card[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sortMode, setSortMode] = useState<'rank' | 'suit'>('rank')
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [isPending, startTransition] = useTransition()
  const mountedRef = useRef(true)
  const tickRef = useRef<string | null>(null)
  const botRef = useRef<string | null>(null)

  // ── Transient FX state ───────────────────────────────────────────────────────
  const [chac, setChac] = useState<{ cutter: number; victim: number; amount: number; key: number } | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const [passStamp, setPassStamp] = useState<{ seat: number; key: number } | null>(null)
  const [invalidKey, setInvalidKey] = useState(0)
  const [confettiKey, setConfettiKey] = useState(0)
  const prevGameRef = useRef<TlmnPublicGame | null>(null)
  const reducedRef = useRef(false)

  useEffect(() => {
    try { reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch {}
  }, [])

  const refreshHand = useCallback(() => {
    fetchMyHand(roomId).then(h => {
      if (!mountedRef.current) return
      const next = h ? sortHand(h.cards) : []
      setHand(next)
      // Keep the selection in sync with the real hand: drop any card no longer held
      // (e.g. once our own play commits) but never clear a still-valid selection — a
      // routine state refresh must not wipe a card the player just picked.
      setSelected(prev => {
        if (prev.size === 0) return prev
        const live = new Set(next.map(cardKey))
        const pruned = new Set<string>()
        prev.forEach(k => { if (live.has(k)) pruned.add(k) })
        return pruned.size === prev.size ? prev : pruned
      })
    }).catch(() => {})
  }, [roomId])

  const refreshAll = useCallback(() => {
    fetchGameState(roomId).then(g => {
      if (!mountedRef.current) return
      setGame(g)
    }).catch(() => {})
    refreshHand()
  }, [roomId, refreshHand])

  // ── Realtime: the public game row ─────────────────────────────────────────────
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

  // ── Local clock for the turn countdown ────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  // A fresh round (new game id) ⇒ drop any stale selection from the previous deal.
  useEffect(() => { setSelected(new Set()) }, [game?.id])

  // ── Timeout reaper nudge ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!game || game.status !== 'playing' || !game.turn_deadline || !game.turn_started_at) return
    const expired = now > new Date(game.turn_deadline).getTime() + 3500
    if (!expired) return
    if (tickRef.current === game.turn_started_at) return
    tickRef.current = game.turn_started_at
    tickTurnTimer(roomId).catch(() => {})
  }, [now, game, roomId])

  // ── Bot-turn nudge ──────────────────────────────────────────────────────────────
  // When the current turn belongs to a bot seat (a real lobby bot OR a human under
  // AFK takeover), prompt the server to make its move. The server re-checks the seat
  // + gates on its own randomized think delay, so this just needs to fire once per
  // turn after that window has comfortably passed. (If it's ever missed, the timeout
  // reaper above still auto-moves the bot — so bots always progress.)
  useEffect(() => {
    if (!game || game.status !== 'playing' || game.turn_seat == null || !game.turn_started_at) return
    const turnSeat = seats.find(s => s.seat_index === game.turn_seat)
    if (!turnSeat || !(turnSeat.is_bot || turnSeat.bot_takeover)) return
    if (now - new Date(game.turn_started_at).getTime() < 1500) return // ≥ server max delay
    if (botRef.current === game.turn_started_at) return
    botRef.current = game.turn_started_at
    runBotTurn(roomId).catch(() => {})
  }, [now, game, seats, roomId])

  // ── React to game transitions: sounds, haptics, FX ─────────────────────────────
  useEffect(() => {
    if (!game) return
    const prev = prevGameRef.current
    prevGameRef.current = game

    // First load — establish baseline, no retroactive effects.
    if (!prev) return

    const newRound = game.id !== prev.id
    if (newRound) {
      setChac(null); setPassStamp(null)
      if (game.status === 'playing') sound.play('deal')
    }

    // A chặt event landed → the signature moment.
    if (game.chat_events.length > prev.chat_events.length) {
      const ev = game.chat_events[game.chat_events.length - 1]
      const amount = !game.rules.denEnabled ? 0 : ev.kind === 'heo' ? game.rules.denHeo : game.rules.denBom
      setChac({ cutter: ev.cutter, victim: ev.cutVictim, amount, key: Date.now() })
      setShakeKey(k => k + 1)
      sound.play('chat')
      sound.vibrate([0, 40, 30, 60])
    } else if (!newRound && game.trick && (!prev.trick || prev.trick.by_seat !== game.trick.by_seat || comboKeys(prev.trick.cards).join() !== comboKeys(game.trick.cards).join())) {
      // A normal play hit the table.
      sound.play('play')
    }

    // Someone passed (pass_flags grew within the same trick).
    if (!newRound && game.pass_flags.length > prev.pass_flags.length) {
      const passer = game.pass_flags.find(s => !prev.pass_flags.includes(s))
      if (passer != null) {
        setPassStamp({ seat: passer, key: Date.now() })
        sound.play('pass')
      }
    }

    // It became my turn.
    if (game.status === 'playing' && mySeat != null && game.turn_seat === mySeat && prev.turn_seat !== mySeat) {
      sound.play('turn')
      sound.vibrate(35)
    }

    // Round just ended → celebration.
    const justEnded = (newRound || prev.status === 'playing') && game.status === 'ended'
    if (justEnded) {
      const instant = game.result?.instant
      if (instant) { sound.play('toitrang'); sound.vibrate([0, 60, 40, 90]) }
      else if (game.result?.winner != null) sound.play('win')
      if (!reducedRef.current) setConfettiKey(Date.now())
    }
  }, [game, mySeat, sound])

  // Auto-clear the chặt overlay.
  useEffect(() => {
    if (!chac) return
    const id = setTimeout(() => { if (mountedRef.current) setChac(null) }, 1900)
    return () => clearTimeout(id)
  }, [chac])

  // Auto-clear the pass stamp.
  useEffect(() => {
    if (!passStamp) return
    const id = setTimeout(() => { if (mountedRef.current) setPassStamp(null) }, 1300)
    return () => clearTimeout(id)
  }, [passStamp])

  // Auto-clear confetti.
  const [confettiOn, setConfettiOn] = useState(false)
  useEffect(() => {
    if (!confettiKey) return
    setConfettiOn(true)
    const id = setTimeout(() => { if (mountedRef.current) setConfettiOn(false) }, 1900)
    return () => clearTimeout(id)
  }, [confettiKey])

  // ── Derived state ──────────────────────────────────────────────────────────────
  const rules = game?.rules
  const tableCombo: Combo | null = game?.trick ? parseCombo(game.trick.cards) : null
  const isMyTurn = !!game && mySeat != null && game.turn_seat === mySeat && game.status === 'playing'
  const selectedCards = useMemo(() => hand.filter(c => selected.has(cardKey(c))), [hand, selected])
  const selectedCombo = selectedCards.length ? parseCombo(selectedCards) : null
  // `beats` defaults to DEFAULT_RULES, so a momentarily-missing rules object must NOT
  // make a legal play look illegal — only the turn + a valid, table-beating combo gate it.
  const canPlay = isMyTurn && !!selectedCombo && beats(selectedCombo, tableCombo, rules ?? DEFAULT_RULES)
  const canPass = isMyTurn && !!game?.trick

  const displayHand = useMemo(() => {
    if (sortMode === 'suit') {
      return hand.slice().sort((a, b) => a.suit - b.suit || a.rank - b.rank)
    }
    return hand
  }, [hand, sortMode])

  // Cards that appear in at least one legal play this turn (cosmetic dim only).
  const playableKeys = useMemo(() => {
    if (!isMyTurn || !rules) return null
    const set = new Set<string>()
    for (const m of legalMoves(hand, tableCombo, rules)) for (const c of m.cards) set.add(cardKey(c))
    return set
  }, [isMyTurn, hand, tableCombo, rules])

  const secondsLeft = game?.turn_deadline
    ? Math.max(0, Math.ceil((new Date(game.turn_deadline).getTime() - now) / 1000))
    : null
  const turnFrac = game && rules && secondsLeft != null
    ? Math.max(0, Math.min(1, secondsLeft / rules.turnSeconds))
    : 0

  const seatOf = (idx: number) => seats.find(s => s.seat_index === idx)
  const seatName = (idx: number) =>
    seatOf(idx)?.display_name || t('player_fallback', { n: idx + 1 })

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const toggleCard = (c: Card) => {
    const k = cardKey(c)
    setError(null)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  const doPlay = () => {
    if (!isMyTurn || selectedCards.length === 0 || isPending) return
    if (!canPlay) { setInvalidKey(k => k + 1); setError('illegal_move'); sound.vibrate(20); return }
    setError(null)
    startTransition(async () => {
      const res = await playCards(roomId, selectedCards)
      if (res?.error) { setError(res.error); setInvalidKey(k => k + 1) }
      else setSelected(new Set())
    })
  }

  const doPass = () => {
    if (!canPass || isPending) return
    setError(null)
    startTransition(async () => {
      const res = await passTurn(roomId)
      if (res?.error) setError(res.error)
    })
  }

  const doHint = () => {
    if (!isMyTurn || !rules) return
    const moves = legalMoves(hand, tableCombo, rules)
    if (moves.length === 0) { setError('hint_none'); return }
    // Lowest legal play: fewest cards, then weakest high card.
    moves.sort((a, b) => a.count - b.count || strength(a.high) - strength(b.high))
    setError(null)
    setSelected(new Set(comboKeys(moves[0].cards)))
  }

  const doNextRound = () => {
    startTransition(async () => {
      const res = await startNextRound(roomId)
      if (res?.error) setError(res.error)
    })
  }

  // ── Loading ────────────────────────────────────────────────────────────────────
  if (!game) {
    return (
      <div className="rounded-2xl border border-line bg-cream/40 py-12 flex flex-col items-center gap-3">
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <span key={i} className="w-2.5 h-2.5 rounded-full bg-rose/60 animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
        <p className="text-[13px] text-muted">{t('dealing')}</p>
      </div>
    )
  }

  const others = game.seats.filter(s => mySeat == null || s !== mySeat)
  const orderedOthers = mySeat == null
    ? others
    : others.slice().sort((a, b) => ((a - mySeat + 4) % 4) - ((b - mySeat + 4) % 4))
  const slotList = SLOTS[orderedOthers.length] ?? SLOTS[4]

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <RulesSummary game={game} t={t} />
        <button
          type="button"
          onClick={sound.toggleMute}
          title={sound.muted ? t('sound_off') : t('sound_on')}
          aria-label={sound.muted ? t('sound_off') : t('sound_on')}
          className="flex-none w-9 h-9 rounded-xl border border-line bg-paper text-ink/70 hover:text-rose hover:border-rose/30 transition-colors flex items-center justify-center"
        >
          {sound.muted ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 9l4 4m0-4l-4 4" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728" /></svg>
          )}
        </button>
      </div>

      {/* ── The oval table ───────────────────────────────────────────────── */}
      <div
        key={shakeKey}
        className={`relative w-full mx-auto max-w-[540px] h-[320px] sm:h-[360px] rounded-[40px] border border-rose/15 overflow-hidden ${shakeKey ? 'tlmn-shake' : ''}`}
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 45%, rgba(214,0,108,0.13), rgba(214,0,108,0.04) 55%, rgba(250,244,234,0.9) 100%)',
          boxShadow: 'inset 0 0 0 6px rgba(255,253,248,0.55), inset 0 2px 26px rgba(214,0,108,0.08)',
        }}
      >
        {/* Opponent / other seats */}
        {orderedOthers.map((idx, i) => (
          <div key={idx} className={`absolute ${SLOT_POS[slotList[i]] ?? SLOT_POS.top}`}>
            <SeatPod
              idx={idx}
              seat={seatOf(idx)}
              name={seatName(idx)}
              isMe={idx === mySeat}
              count={game.card_counts?.[String(idx)] ?? 0}
              isTurn={game.turn_seat === idx && game.status === 'playing'}
              isNhat={game.nhat_seat === idx}
              passed={!!passStamp && passStamp.seat === idx}
              passKey={passStamp?.key}
              secondsLeft={game.turn_seat === idx ? secondsLeft : null}
              turnFrac={game.turn_seat === idx ? turnFrac : 0}
              lastTrick={game.trick?.by_seat === idx ? game.trick.cards : null}
              t={t}
            />
          </div>
        ))}

        {/* The "you" anchor at the bottom of the table (hand is below) */}
        {mySeat != null && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
            <SeatPod
              idx={mySeat}
              seat={seatOf(mySeat)}
              name={seatName(mySeat)}
              isMe
              count={game.card_counts?.[String(mySeat)] ?? hand.length}
              isTurn={isMyTurn}
              isNhat={game.nhat_seat === mySeat}
              passed={false}
              secondsLeft={isMyTurn ? secondsLeft : null}
              turnFrac={isMyTurn ? turnFrac : 0}
              lastTrick={null}
              compact
              t={t}
            />
          </div>
        )}

        {/* Center: current trick / lead hint / round result */}
        <div className="absolute inset-0 flex items-center justify-center px-4 pointer-events-none">
          {game.status === 'ended' ? (
            <CenterEnd game={game} seatName={seatName} t={t} />
          ) : game.trick ? (
            <div key={comboKeys(game.trick.cards).join()} className="flex flex-col items-center gap-1.5 tlmn-play-in">
              <p className="text-[10px] font-bold text-rose/70 uppercase tracking-[1.5px]">
                {t('table_play_by', { name: seatName(game.trick.by_seat) })}
              </p>
              <div className="flex justify-center" style={{ paddingLeft: 0 }}>
                {sortHand(game.trick.cards).map((c, i) => (
                  <span key={cardKey(c)} style={{ marginLeft: i === 0 ? 0 : -10 }}>
                    <CardFace card={c} w={42} />
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-muted">{t('to_beat')}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[26px]">🃏</span>
              <p className="text-[11.5px] text-muted text-center">
                {game.turn_seat != null ? t('lead_free_by', { name: seatName(game.turn_seat) }) : ''}
              </p>
            </div>
          )}
        </div>

        {/* Chặt! signature overlay */}
        {chac && (
          <>
            <div className="absolute inset-0 bg-white tlmn-flash pointer-events-none" />
            <div key={chac.key} className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="tlmn-stamp px-5 py-2 rounded-2xl bg-rose text-white shadow-2xl border-2 border-white/70">
                <span className="font-serif font-black text-[30px] tracking-tight">✂️ {t('chat_word')}</span>
              </div>
              {chac.amount > 0 && (
                <p className="mt-2 text-[13px] font-bold text-rose-deep bg-white/85 px-3 py-1 rounded-full tlmn-banner-pop">
                  {t('den_line', { victim: seatName(chac.victim), cutter: seatName(chac.cutter), amount: chac.amount })}
                </p>
              )}
            </div>
          </>
        )}

        {/* Confetti */}
        {confettiOn && <Confetti seed={confettiKey} />}
      </div>

      {/* Tới trắng banner (instant win on the deal) */}
      {game.status === 'ended' && game.result?.instant && (
        <ToiTrangBanner game={game} seatName={seatName} t={t} />
      )}

      {/* ── My hand ──────────────────────────────────────────────────────── */}
      {mySeat != null && game.status === 'playing' && (
        <div className="rounded-2xl border border-line bg-paper p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-muted uppercase tracking-[1.5px]">
              {t('your_hand')} · {hand.length}
            </p>
            <div className="flex items-center gap-2">
              {isMyTurn ? (
                <span className="text-[11px] font-bold text-rose flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose animate-pulse" />{t('your_turn')}
                </span>
              ) : (
                <span className="text-[11px] text-muted/70 italic">{t('thinking')}</span>
              )}
              <button
                type="button"
                onClick={() => setSortMode(m => (m === 'rank' ? 'suit' : 'rank'))}
                className="text-[11px] font-semibold text-muted hover:text-rose border border-line rounded-lg px-2 py-1 transition-colors"
              >
                ↕ {t('sort_btn')}
              </button>
            </div>
          </div>

          <div key={invalidKey} className={`flex justify-center flex-wrap pt-3 ${invalidKey ? 'tlmn-invalid' : ''}`}>
            {displayHand.map((c, i) => {
              const sel = selected.has(cardKey(c))
              const dim = playableKeys ? !playableKeys.has(cardKey(c)) && !sel : false
              return (
                <button
                  key={cardKey(c)}
                  type="button"
                  onClick={() => toggleCard(c)}
                  className="focus:outline-none focus-visible:ring-2 focus-visible:ring-rose rounded-[7px]"
                  style={{ marginLeft: i === 0 ? 0 : -14, marginBottom: 6 }}
                >
                  <CardFace card={c} w={46} selected={sel} raised={sel} dim={dim} />
                </button>
              )
            })}
          </div>

          {error && <p className="text-[12px] text-rose mt-2 text-center">{tErr(t, error)}</p>}

          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={doHint}
              disabled={!isMyTurn || isPending}
              className="font-semibold text-[13px] px-3.5 py-2.5 rounded-xl border border-line text-ink hover:bg-line transition-all disabled:opacity-40"
            >
              💡 {t('hint_btn')}
            </button>
            <button
              type="button"
              onClick={doPlay}
              disabled={!isMyTurn || selectedCards.length === 0 || isPending || !canPlay}
              className="flex-1 font-semibold text-[14px] px-5 py-2.5 rounded-xl bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-40 disabled:hover:bg-rose shadow-[0_4px_16px_-5px_rgba(214,0,108,0.5)]"
            >
              {t('play_btn')}{selectedCards.length ? ` · ${selectedCards.length}` : ''}
            </button>
            <button
              type="button"
              onClick={doPass}
              disabled={!canPass || isPending}
              className="font-semibold text-[14px] px-4 py-2.5 rounded-xl border border-line text-ink hover:bg-line transition-all disabled:opacity-40"
            >
              {t('pass_btn')}
            </button>
          </div>
        </div>
      )}

      {/* Spectator hint */}
      {mySeat == null && game.status === 'playing' && (
        <p className="text-center text-[12.5px] text-muted py-2">{t('spectating')}</p>
      )}

      {/* ── Round-end scoreboard (đếm lá) ───────────────────────────────────── */}
      {game.status === 'ended' && (
        <Scoreboard game={game} seats={seats} seatName={seatName} t={t} />
      )}

      {/* Ván mới */}
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

// ── Seat pod ──────────────────────────────────────────────────────────────────────
function SeatPod({
  idx, seat, name, isMe, count, isTurn, isNhat, passed, passKey,
  secondsLeft, turnFrac, lastTrick, compact, t,
}: {
  idx: number
  seat: TlmnSeat | undefined
  name: string
  isMe: boolean
  count: number
  isTurn: boolean
  isNhat: boolean
  passed: boolean
  passKey?: number
  secondsLeft: number | null
  turnFrac: number
  lastTrick: Card[] | null
  compact?: boolean
  t: ReturnType<typeof useTranslations>
}) {
  void idx
  return (
    <div className="relative flex flex-col items-center gap-1" style={{ width: compact ? 110 : 96 }}>
      {isTurn && <span className="absolute -inset-1.5 rounded-2xl border-2 border-rose tlmn-ring pointer-events-none" />}
      <div
        className={`relative rounded-2xl border px-2 py-1.5 w-full text-center transition-all ${
          isTurn ? 'border-rose bg-rose-soft shadow-[0_4px_14px_-6px_rgba(214,0,108,0.5)]'
          : isNhat ? 'border-gold/50 bg-gold-light/40' : 'border-line bg-paper/90'
        }`}
      >
        <div className="flex items-center justify-center gap-1.5">
          <PodAvatar name={name} url={seat?.avatar_url ?? null} />
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold text-ink truncate max-w-[64px] leading-tight">
              {name}{isMe ? ` · ${t('you_badge')}` : ''}
            </p>
            <p className="text-[10px] text-muted leading-tight">
              {isNhat ? `🏆 ${t('nhat')}` : `Σ ${seat?.cumulative_score ?? 0}`}
            </p>
          </div>
        </div>

        {/* Card-count indicator (fanned face-down backs, never real cards) */}
        <div className="flex items-center justify-center gap-1.5 mt-1">
          {!isMe && <FannedBacks count={count} w={18} />}
          <span className="text-[10px] font-bold text-ink/70 bg-cream rounded-full px-1.5 py-0.5">
            {t('cards_left', { n: count })}
          </span>
        </div>

        {/* Turn countdown */}
        {isTurn && secondsLeft != null && (
          <div className="flex items-center justify-center gap-1 mt-1">
            <span
              className="relative w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: `conic-gradient(${secondsLeft <= 5 ? '#d6006c' : '#1f8fa6'} ${turnFrac * 360}deg, rgba(0,0,0,0.08) 0deg)` }}
            >
              <span className="absolute inset-[2px] rounded-full bg-paper flex items-center justify-center text-[9px] font-bold text-ink">
                {secondsLeft}
              </span>
            </span>
            {/* "đang suy nghĩ" is for an opponent we're waiting on — never on my own
                active seat (the hand panel already shows "Lượt của bạn!"). */}
            {!isMe && <span className="text-[9.5px] text-muted italic">{t('thinking')}</span>}
          </div>
        )}
      </div>

      {/* Last played combo (mini) under the active opponent */}
      {lastTrick && !compact && (
        <div className="flex">
          {sortHand(lastTrick).slice(0, 6).map((c, i) => (
            <span key={cardKey(c)} style={{ marginLeft: i === 0 ? 0 : -8 }}>
              <CardFace card={c} w={20} />
            </span>
          ))}
        </div>
      )}

      {/* Bỏ lượt stamp */}
      {passed && (
        <span key={passKey} className="absolute -bottom-1 tlmn-stamp text-[10px] font-black uppercase text-muted bg-white/90 border border-line rounded-md px-1.5 py-0.5 tracking-wide">
          {t('passed')}
        </span>
      )}
    </div>
  )
}

function PodAvatar({ name, url }: { name: string; url: string | null }) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase()
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="w-7 h-7 rounded-full object-cover flex-none border border-line" />
  }
  return (
    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-rose/25 to-gold/15 flex items-center justify-center font-serif font-bold text-[13px] text-rose flex-none">
      {initial}
    </div>
  )
}

// ── Center: end-of-round headline ──────────────────────────────────────────────────
function CenterEnd({
  game, seatName, t,
}: { game: TlmnPublicGame; seatName: (i: number) => string; t: ReturnType<typeof useTranslations> }) {
  const winner = game.result?.winner ?? game.nhat_seat
  return (
    <div className="text-center tlmn-banner-pop">
      <p className="text-[34px] leading-none">🏆</p>
      <p className="text-[16px] font-serif font-bold text-ink mt-1">
        {winner != null ? t('winner_is', { name: seatName(winner) }) : t('round_over')}
      </p>
    </div>
  )
}

// ── Tới trắng banner ───────────────────────────────────────────────────────────────
function ToiTrangBanner({
  game, seatName, t,
}: { game: TlmnPublicGame; seatName: (i: number) => string; t: ReturnType<typeof useTranslations> }) {
  const instant = game.result!.instant!
  return (
    <div className="rounded-2xl bg-gradient-to-r from-gold via-[#e6b34d] to-gold text-white px-4 py-3 text-center shadow-lg tlmn-banner-pop border border-white/40">
      <p className="text-[11px] font-bold uppercase tracking-[3px] text-white/80">✨ {t('instant_win')} ✨</p>
      <p className="text-[19px] font-serif font-black mt-0.5">
        {t(`win_${instant.type}` as Parameters<typeof t>[0])}
      </p>
      <p className="text-[13px] font-semibold mt-0.5">
        {t('toitrang_winner', { name: seatName(instant.seat) })}
        {' · '}
        {t('toitrang_each', { n: game.rules.toiTrangPayout })}
      </p>
    </div>
  )
}

// ── Scoreboard (đếm lá) ──────────────────────────────────────────────────────────────
function Scoreboard({
  game, seats, seatName, t,
}: {
  game: TlmnPublicGame
  seats: TlmnSeat[]
  seatName: (i: number) => string
  t: ReturnType<typeof useTranslations>
}) {
  const breakdown = game.result?.breakdown
  const deltas = game.result?.deltas ?? {}
  const cumulativeOf = (idx: number) => seats.find(s => s.seat_index === idx)?.cumulative_score ?? 0

  const rows = breakdown
    ? breakdown.seats
    : game.seats.map(seat => ({
        seat, isWinner: game.result?.winner === seat,
        cardsLeft: game.card_counts?.[String(seat)] ?? 0,
        cong: false, heldTwos: 0, thoiHeoMult: 1, thoiBomUnits: 0,
        thoiBomPenalty: 0, cardPayment: 0, denDelta: 0,
        total: deltas[String(seat)] ?? 0,
      }))

  return (
    <div className="rounded-2xl border border-line bg-paper overflow-hidden">
      <p className="text-[11px] font-bold text-muted uppercase tracking-[1.5px] px-4 py-2.5 border-b border-line bg-cream/50">
        🧮 {t('score_title')}
      </p>
      <div className="divide-y divide-line">
        {rows.map(r => {
          const cum = cumulativeOf(r.seat)
          return (
            <div key={r.seat} className="px-4 py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink truncate flex items-center gap-1.5">
                  {r.isWinner && <span className="text-gold">🏆</span>}
                  {seatName(r.seat)}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {r.isWinner ? (
                    <Chip tone="gold">{t('score_winner')}</Chip>
                  ) : (
                    <>
                      <Chip>{t('score_cards', { n: r.cardsLeft })}</Chip>
                      {r.cong && <Chip tone="rose">{t('score_cong')}</Chip>}
                      {r.heldTwos > 0 && r.thoiHeoMult > 1 && (
                        <Chip tone="rose">{t('score_thoiheo')} ×{r.thoiHeoMult}</Chip>
                      )}
                      {r.thoiBomUnits > 0 && (
                        <Chip tone="rose">{t('score_thoibom')} −{r.thoiBomPenalty}</Chip>
                      )}
                    </>
                  )}
                  {r.denDelta !== 0 && (
                    <Chip tone={r.denDelta > 0 ? 'emerald' : 'rose'}>
                      {t('score_den')} {r.denDelta > 0 ? `+${r.denDelta}` : r.denDelta}
                    </Chip>
                  )}
                </div>
              </div>
              <div className="text-right flex-none">
                <p className={`text-[16px] font-black leading-none ${r.total > 0 ? 'text-emerald-600' : r.total < 0 ? 'text-rose' : 'text-muted'}`}>
                  {r.total > 0 ? `+${r.total}` : r.total}
                </p>
                <p className="text-[10px] text-muted mt-0.5">{t('score_total')}: {cum}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'rose' | 'gold' | 'emerald' }) {
  const cls = {
    neutral: 'bg-cream text-muted',
    rose: 'bg-rose-soft text-rose',
    gold: 'bg-gold-light/60 text-gold',
    emerald: 'bg-emerald-50 text-emerald-700',
  }[tone]
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${cls}`}>{children}</span>
}

// ── Confetti (gated behind reduced-motion by the caller) ────────────────────────────
function Confetti({ seed }: { seed: number }) {
  const colors = ['#d6006c', '#c99a3d', '#1f8fa6', '#e0607e', '#f5e8cc']
  const pieces = useMemo(() =>
    Array.from({ length: 36 }, (_, i) => ({
      left: Math.round((seed * (i + 7)) % 100),
      delay: (i % 9) * 60,
      color: colors[i % colors.length],
      rot: (i * 37) % 360,
    })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [seed])
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 tlmn-confetti-piece"
          style={{
            left: `${p.left}%`,
            width: 7, height: 11,
            background: p.color,
            transform: `rotate(${p.rot}deg)`,
            animationDelay: `${p.delay}ms`,
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  )
}

// ── Locked rules summary ─────────────────────────────────────────────────────────
function RulesSummary({ game, t }: { game: TlmnPublicGame; t: ReturnType<typeof useTranslations> }) {
  const r = game.rules
  const on = (b: boolean) => (b ? '✓' : '×')
  return (
    <div className="rounded-xl border border-line bg-paper px-3 py-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-muted flex-1 min-w-0">
      <span className="font-bold uppercase tracking-wide text-ink/70">{t('round_label', { n: game.round_no })}</span>
      <span>{t('rule_toiTrangEnabled')} {on(r.toiTrangEnabled)}</span>
      <span>{t('rule_thoiHeoEnabled')} {on(r.thoiHeoEnabled)}</span>
      <span>{t('rule_congEnabled')} {on(r.congEnabled)}</span>
      <span>{t('rule_denEnabled')} {on(r.denEnabled)}</span>
      <span>{r.turnSeconds}s</span>
    </div>
  )
}

// Map a server error code to a localized message (falls back to a generic one).
function tErr(t: ReturnType<typeof useTranslations>, code: string): string {
  const known = [
    'not_your_turn', 'turn_expired', 'illegal_move', 'invalid_combo', 'cards_not_held',
    'must_include_three_spade', 'cannot_pass_leading', 'no_active_game', 'conflict',
    'round_in_progress', 'not_enough_players', 'hint_none',
  ]
  const key = known.includes(code) ? `play_err_${code}` : 'play_err_generic'
  return t(key as Parameters<typeof t>[0])
}
