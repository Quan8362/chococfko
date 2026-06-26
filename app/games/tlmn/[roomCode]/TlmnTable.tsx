'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
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
  inviteCode: string
  onLeave: () => void
}

// ── Responsive sizing — scale the whole board as one system ────────────────────────
// Track the viewport width so every piece (cards, seats, center pile, tray) scales
// proportionally and the cards stay legible from ~360px up to a wide desktop table.
function useViewport() {
  const [vp, setVp] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1024,
    h: typeof window !== 'undefined' ? window.innerHeight : 768,
  }))
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    on()
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on) }
  }, [])
  return vp
}

// Measure an element's content width (for the hand fan, so cards overlap exactly
// enough to fit without overflow or layout shift).
function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => { setW(entries[0].contentRect.width) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
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
  top: 'top-[3%] left-1/2 -translate-x-1/2',
  'top-left': 'top-[9%] left-[3%]',
  'top-right': 'top-[9%] right-[3%]',
  left: 'top-[42%] left-[2%] -translate-y-1/2',
  right: 'top-[42%] right-[2%] -translate-y-1/2',
  bottom: 'bottom-[4%] left-1/2 -translate-x-1/2',
}

export default function TlmnTable({ roomId, seats, mySeat, isHost, inviteCode, onLeave }: Props) {
  const t = useTranslations('games.tlmn')
  const sound = useTlmnSound()
  const { w: vw, h: vh } = useViewport()
  const [menuOpen, setMenuOpen] = useState(false)
  const [trayRef, trayW] = useMeasuredWidth<HTMLDivElement>()
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

  // ── Responsive scale ──────────────────────────────────────────────────────────
  // Card sizes grow with the viewport; the whole board (table, seats, pile, tray)
  // is derived from these so proportions stay correct at every width.
  const shortVp = vh < 520 // landscape phones
  const handW = shortVp
    ? Math.min(64, Math.round(vh * 0.16))
    : vw < 400 ? 60 : vw < 560 ? 64 : vw < 768 ? 70 : vw < 1024 ? 78 : 88
  const pileW = Math.round(handW * 0.82)
  const seatBackW = vw < 768 ? 15 : 18
  const tableHByWidth = vw < 560 ? 300 : vw < 768 ? 360 : vw < 1024 ? 420 : 480
  // Never let the table grow taller than the viewport can hold (landscape phones).
  const tableH = Math.min(tableHByWidth, Math.max(220, Math.round(vh * 0.52)))

  // Hand fan: spread cards across the measured tray, overlapping only as much as
  // needed so faces stay legible (never shrink the cards to fit).
  const handCount = hand.length
  const fanStep = useMemo(() => {
    if (handCount <= 1) return handW
    const fit = trayW > 0 ? (trayW - handW) / (handCount - 1) : handW * 0.7
    return Math.max(handW * 0.32, Math.min(handW * 0.72, fit))
  }, [trayW, handW, handCount])

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

  const playing = game.status === 'playing'
  const ended = game.status === 'ended'

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    // Full-bleed breakout: the table escapes the page's narrow column to become an
    // immersive deep-red surface — the dominant element on the page.
    <div className="relative w-screen left-1/2 -translate-x-1/2">
      <div
        key={shakeKey}
        className={`tlmn-stage relative flex flex-col min-h-[86vh] overflow-hidden ${shakeKey ? 'tlmn-shake' : ''}`}
      >
        {/* ── Minimal dark chrome ──────────────────────────────────────────── */}
        <div className="relative z-30 flex items-center justify-between px-3 sm:px-5 pt-3">
          <div className="flex items-center gap-2">
            <Link href="/games/tlmn" aria-label={t('close_label')} title={t('close_label')} className="tlmn-chrome">
              <svg className="w-4.5 h-4.5" width={18} height={18} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" /></svg>
            </Link>
            <button type="button" onClick={() => setMenuOpen(o => !o)} aria-label={t('menu_label')} title={t('menu_label')} aria-expanded={menuOpen} className="tlmn-chrome">
              <svg width={18} height={18} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-[11px] font-mono font-bold tracking-[0.18em] text-white/75">
              {inviteCode}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-black/30 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[1.5px] text-white/70">
              {t('round_label', { n: game.round_no })}
            </span>
            <button type="button" onClick={sound.toggleMute} aria-label={sound.muted ? t('sound_off') : t('sound_on')} title={sound.muted ? t('sound_off') : t('sound_on')} className="tlmn-chrome">
              {sound.muted ? (
                <svg width={18} height={18} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 9l4 4m0-4l-4 4" /></svg>
              ) : (
                <svg width={18} height={18} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728" /></svg>
              )}
            </button>
            <button type="button" onClick={onLeave} aria-label={t('leave_btn')} title={t('leave_btn')} className="tlmn-chrome">
              <svg width={18} height={18} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>

        {/* Menu panel (rules summary) */}
        {menuOpen && (
          <div className="absolute z-40 top-14 left-3 sm:left-5 w-[280px] max-w-[calc(100vw-24px)] rounded-2xl bg-paper shadow-2xl border border-line p-3 tlmn-banner-pop">
            <RulesSummary game={game} t={t} />
          </div>
        )}

        {/* ── Table region ─────────────────────────────────────────────────── */}
        <div className="relative flex-1 flex items-center justify-center px-3 sm:px-6 py-2">
          <div
            className="tlmn-felt relative w-full"
            style={{ maxWidth: 'min(94vw, 1200px)', height: tableH }}
          >
            {/* Opponent / other seats around the oval */}
            {orderedOthers.map((idx, i) => (
              <div key={idx} className={`absolute z-10 ${SLOT_POS[slotList[i]] ?? SLOT_POS.top}`}>
                <SeatPod
                  seat={seatOf(idx)}
                  name={seatName(idx)}
                  isMe={false}
                  count={game.card_counts?.[String(idx)] ?? 0}
                  isTurn={game.turn_seat === idx && playing}
                  isNhat={game.nhat_seat === idx}
                  passed={!!passStamp && passStamp.seat === idx}
                  passKey={passStamp?.key}
                  secondsLeft={game.turn_seat === idx ? secondsLeft : null}
                  turnFrac={game.turn_seat === idx ? turnFrac : 0}
                  lastTrick={game.trick?.by_seat === idx ? game.trick.cards : null}
                  av={vw < 560 ? 42 : vw < 1024 ? 50 : 58}
                  backW={seatBackW}
                  pileW={pileW}
                  t={t}
                />
              </div>
            ))}

            {/* Center: current trick / lead hint / round result */}
            <div className="absolute inset-0 flex items-center justify-center px-4 pointer-events-none">
              {ended ? (
                <CenterEnd game={game} seatName={seatName} t={t} />
              ) : game.trick ? (
                <div key={comboKeys(game.trick.cards).join()} className="flex flex-col items-center gap-2 tlmn-play-in">
                  <p className="text-[10.5px] font-bold text-white/70 uppercase tracking-[1.5px]">
                    {t('table_play_by', { name: seatName(game.trick.by_seat) })}
                  </p>
                  <div className="flex justify-center">
                    {sortHand(game.trick.cards).map((c, i) => (
                      <span key={cardKey(c)} style={{ marginLeft: i === 0 ? 0 : -Math.round(pileW * 0.28) }}>
                        <CardFace card={c} w={pileW} />
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-white/45">{t('to_beat')}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[32px] opacity-80">🃏</span>
                  <p className="text-[12px] text-white/55 text-center">
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
                    <span className="font-serif font-black text-[clamp(26px,5vw,38px)] tracking-tight">✂️ {t('chat_word')}</span>
                  </div>
                  {chac.amount > 0 && (
                    <p className="mt-2 text-[13px] font-bold text-rose-deep bg-white/90 px-3 py-1 rounded-full tlmn-banner-pop">
                      {t('den_line', { victim: seatName(chac.victim), cutter: seatName(chac.cutter), amount: chac.amount })}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Confetti */}
            {confettiOn && <Confetti seed={confettiKey} />}
          </div>
        </div>

        {/* ── Bottom dock ──────────────────────────────────────────────────── */}
        {mySeat != null && playing && (
          <div className="relative z-20 px-3 sm:px-6 pb-3 pt-1">
            {/* Human seat (bottom-left) + sort pill */}
            <div className="flex items-end justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2.5">
                <span className={`relative inline-flex rounded-full p-[2px] ${isMyTurn ? 'tlmn-glow bg-rose' : 'bg-white/20'}`}>
                  <PodAvatar name={seatName(mySeat)} url={seatOf(mySeat)?.avatar_url ?? null} size={vw < 560 ? 38 : 46} />
                  {isMyTurn && secondsLeft != null && (
                    <span
                      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ background: `conic-gradient(${secondsLeft <= 5 ? '#ffd1e0' : '#7fe3f0'} ${turnFrac * 360}deg, rgba(0,0,0,0.45) 0deg)` }}
                    >
                      <span className="absolute inset-[2px] rounded-full bg-ink flex items-center justify-center text-[10px] font-bold text-white">{secondsLeft}</span>
                    </span>
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-white truncate max-w-[44vw] flex items-center gap-1.5">
                    {game.nhat_seat === mySeat && <span className="text-gold">🏆</span>}
                    {seatName(mySeat)}
                    <span className="text-[10px] font-bold text-white/60 bg-white/15 rounded-full px-1.5 py-0.5">{t('you_badge')}</span>
                  </p>
                  {isMyTurn ? (
                    <span className="text-[11px] font-bold text-rose-200 flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-200 animate-pulse" />{t('your_turn')}
                    </span>
                  ) : (
                    <span className="text-[11px] text-white/45 italic mt-0.5 inline-block">{t('thinking')}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSortMode(m => (m === 'rank' ? 'suit' : 'rank'))}
                className="flex-none text-[12px] font-bold text-ink bg-cream hover:bg-white rounded-full px-3.5 py-1.5 shadow-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                ↕ {t('sort_btn')}
              </button>
            </div>

            {/* Cream hand tray with the fanned cards */}
            <div className="tlmn-tray rounded-2xl px-3 sm:px-4" style={{ minHeight: Math.round(handW * 1.4) + 26 }}>
              <div
                key={invalidKey}
                ref={trayRef}
                className={`relative flex justify-center items-end h-full py-3 ${invalidKey ? 'tlmn-invalid' : ''}`}
              >
                {displayHand.map((c, i) => {
                  const sel = selected.has(cardKey(c))
                  const dim = playableKeys ? !playableKeys.has(cardKey(c)) && !sel : false
                  return (
                    <button
                      key={`${game.id}-${cardKey(c)}`}
                      type="button"
                      onClick={() => toggleCard(c)}
                      className="relative tlmn-deal focus:outline-none focus-visible:ring-2 focus-visible:ring-rose rounded-[8px]"
                      style={{ marginLeft: i === 0 ? 0 : fanStep - handW, animationDelay: `${i * 28}ms`, zIndex: sel ? 50 : i }}
                    >
                      <CardFace card={c} w={handW} selected={sel} raised={sel} dim={dim} />
                      {sel && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-1.5 rounded-full bg-rose" style={{ width: Math.round(handW * 0.7) }} />}
                    </button>
                  )
                })}
              </div>
            </div>

            {error && <p className="text-[12px] text-rose-200 mt-2 text-center font-semibold">{tErr(t, error)}</p>}

            {/* Action buttons */}
            <div className="flex gap-2 mt-2.5 max-w-[680px] mx-auto">
              <button
                type="button"
                onClick={doHint}
                disabled={!isMyTurn || isPending}
                className="font-bold text-[13px] px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white hover:bg-white/20 transition-all disabled:opacity-30"
              >
                💡 {t('hint_btn')}
              </button>
              <button
                type="button"
                onClick={doPlay}
                disabled={!isMyTurn || selectedCards.length === 0 || isPending || !canPlay}
                className="flex-1 font-bold text-[15px] px-5 py-3 rounded-xl bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-30 disabled:hover:bg-rose shadow-[0_6px_22px_-6px_rgba(214,0,108,0.8)]"
              >
                {t('play_btn')}{selectedCards.length ? ` · ${selectedCards.length}` : ''}
              </button>
              <button
                type="button"
                onClick={doPass}
                disabled={!canPass || isPending}
                className="font-bold text-[14px] px-5 py-3 rounded-xl bg-white/10 border border-white/15 text-white hover:bg-white/20 transition-all disabled:opacity-30"
              >
                {t('pass_btn')}
              </button>
            </div>

            {/* Landscape-for-better-play hint (portrait phones only) */}
            <p className="tlmn-rotate-hint text-center text-[11px] text-white/40 mt-2">↺ {t('rotate_hint')}</p>
          </div>
        )}

        {/* Spectator hint */}
        {mySeat == null && playing && (
          <p className="relative z-20 text-center text-[13px] text-white/60 py-4">{t('spectating')}</p>
        )}

        {/* ── End-of-round: banner, scoreboard, next round ─────────────────── */}
        {ended && (
          <div className="relative z-20 w-full max-w-[600px] mx-auto px-3 sm:px-4 pb-5 flex flex-col gap-3">
            {game.result?.instant && <ToiTrangBanner game={game} seatName={seatName} t={t} />}
            <Scoreboard game={game} seats={seats} seatName={seatName} t={t} />
            <div className="text-center">
              {isHost ? (
                <button
                  type="button"
                  onClick={doNextRound}
                  disabled={isPending}
                  className="font-bold text-[14px] px-6 py-3 rounded-xl bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-60 shadow-[0_6px_22px_-6px_rgba(214,0,108,0.8)]"
                >
                  🃏 {t('new_round_btn')}
                </button>
              ) : (
                <p className="text-[12.5px] text-white/55">{t('waiting_host_next')}</p>
              )}
              {error && <p className="text-[12px] text-rose-200 mt-2">{tErr(t, error)}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Seat pod ──────────────────────────────────────────────────────────────────────
// A circular avatar with a ring/frame, a name plate, and a face-down card stack with
// a count badge beside it. NO money/score number is ever shown under the name — the
// only number on a seat is the card-count badge on the face-down stack.
function SeatPod({
  seat, name, isMe, count, isTurn, isNhat, passed, passKey,
  secondsLeft, turnFrac, lastTrick, av, backW, pileW, t,
}: {
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
  av: number
  backW: number
  pileW: number
  t: ReturnType<typeof useTranslations>
}) {
  void isMe
  const ringCls = isTurn
    ? 'tlmn-glow bg-rose'
    : isNhat ? 'bg-gold' : 'bg-white/20'
  return (
    <div className="relative flex flex-col items-center gap-1" style={{ width: av + 56 }}>
      {isTurn && <span className="absolute left-1/2 -translate-x-1/2 -top-1 rounded-full tlmn-ring pointer-events-none" style={{ width: av + 8, height: av + 8 }} />}

      {/* Avatar with frame ring + countdown badge */}
      <span className={`relative inline-flex rounded-full p-[2.5px] ${ringCls}`}>
        <PodAvatar name={name} url={seat?.avatar_url ?? null} size={av} />
        {isTurn && secondsLeft != null && (
          <span
            className="absolute -bottom-1 -right-1 rounded-full flex items-center justify-center"
            style={{ width: av * 0.46, height: av * 0.46, background: `conic-gradient(${secondsLeft <= 5 ? '#ffd1e0' : '#7fe3f0'} ${turnFrac * 360}deg, rgba(0,0,0,0.5) 0deg)` }}
          >
            <span className="absolute inset-[2px] rounded-full bg-ink flex items-center justify-center font-bold text-white" style={{ fontSize: Math.max(9, av * 0.2) }}>
              {secondsLeft}
            </span>
          </span>
        )}
      </span>

      {/* Name plate (no number) */}
      <span className="max-w-full inline-flex items-center gap-1 rounded-full bg-black/35 backdrop-blur px-2.5 py-0.5 text-[11.5px] font-semibold text-white/95">
        {isNhat && <span className="text-gold flex-none">🏆</span>}
        <span className="truncate">{name}</span>
      </span>

      {/* Face-down stack with the only seat number — the card count */}
      <span className="relative inline-flex items-center justify-center">
        <FannedBacks count={count} w={backW} />
        <span className="absolute -right-2 -bottom-1 text-[10px] font-black text-ink bg-cream rounded-full px-1.5 py-0.5 shadow ring-1 ring-rose-deep/30 leading-none">
          {count}
        </span>
      </span>

      {/* Last played combo (mini) under the active opponent */}
      {lastTrick && (
        <div className="flex mt-0.5">
          {sortHand(lastTrick).slice(0, 6).map((c, i) => (
            <span key={cardKey(c)} style={{ marginLeft: i === 0 ? 0 : -Math.round(pileW * 0.5) }}>
              <CardFace card={c} w={Math.round(pileW * 0.55)} />
            </span>
          ))}
        </div>
      )}

      {/* Bỏ lượt stamp */}
      {passed && (
        <span key={passKey} className="absolute -bottom-2 tlmn-stamp text-[10px] font-black uppercase text-white bg-rose/90 border border-white/40 rounded-md px-1.5 py-0.5 tracking-wide">
          {t('passed')}
        </span>
      )}
    </div>
  )
}

function PodAvatar({ name, url, size = 28 }: { name: string; url: string | null; size?: number }) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase()
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="rounded-full object-cover flex-none" style={{ width: size, height: size }} />
  }
  return (
    <div
      className="rounded-full bg-gradient-to-br from-rose/80 to-rose-deep flex items-center justify-center font-serif font-bold text-white flex-none"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
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
      <p className="text-[clamp(40px,8vw,64px)] leading-none">🏆</p>
      <p className="text-[clamp(18px,3.5vw,26px)] font-serif font-bold text-white mt-2 drop-shadow">
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
