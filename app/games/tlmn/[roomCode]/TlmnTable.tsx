'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import {
  parseCombo, beats, sortHand, legalMoves, strength, isBomb, RANKS, DEFAULT_RULES,
  type Card, type Combo,
} from '@/lib/games/tlmn/engine'
import {
  fetchGameState, fetchMyHand, playCards, passTurn, tickTurnTimer, startNextRound, runBotTurn,
  type TlmnPublicGame, type TlmnSeat,
} from '../actions'
import { motion } from 'framer-motion'
import { CardFace, CardBack, OpponentFan, BotAvatar } from './TlmnCard'
import { useTlmnSound } from './useTlmnSound'
import { TRANSITIONS, DURATIONS, EASINGS, MS } from '@/lib/games/motion'
import { useFullscreenLandscape } from '@/hooks/useFullscreenLandscape'

const cardKey = (c: Card) => `${c.rank}-${c.suit}`
const comboKeys = (cs: Card[]) => cs.map(cardKey)

// ── Virtual chips (social-casino flavour) — DISPLAY ONLY, not real money. ───────────
// Each seat starts at CHIP_SEED; the running balance is derived from the seat's
// persisted cumulative đếm-lá score × a fixed chip rate, so it's idempotent and
// survives reconnects with no new gameplay/economy rules. TODO(persist-chips): if a
// dedicated chip column is ever added, read it instead of deriving from the score.
const CHIP_SEED = 1_000_000
const CHIP_RATE = 1000
const chipsFromScore = (cumulativeScore: number) => Math.max(0, CHIP_SEED + cumulativeScore * CHIP_RATE)

// Compact social-casino formatting: 4.35M / 269K / 9.3K / 940.
function formatChips(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`.replace(/\.0+M$/, 'M')
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`.replace(/\.0K$/, 'K')
  return `${Math.round(n)}`
}

// Localized screen-reader label for a card (rank + suit), e.g. "7 Cơ" / "7 of Hearts".
// Suit index: 0 ♠ bích, 1 ♣ chuồn, 2 ♦ rô, 3 ♥ cơ.
const SUIT_KEY = ['suit_spade', 'suit_club', 'suit_diamond', 'suit_heart'] as const
const cardAria = (c: Card, t: ReturnType<typeof useTranslations>) =>
  t('card_aria', { rank: RANKS[c.rank], suit: t(SUIT_KEY[c.suit]) })

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
  2: ['left', 'right'],
  3: ['right', 'top', 'left'],
  4: ['right', 'top', 'left', 'bottom'],
}
const SLOT_POS: Record<string, string> = {
  top: 'top-[5%] left-1/2 -translate-x-1/2',
  left: 'top-1/2 left-[2.5%] -translate-y-1/2',
  right: 'top-1/2 right-[2.5%] -translate-y-1/2',
  bottom: 'bottom-[5%] left-1/2 -translate-x-1/2',
}

export default function TlmnTable({ roomId, seats, mySeat, isHost, inviteCode, onLeave }: Props) {
  const t = useTranslations('games.tlmn')
  const sound = useTlmnSound()
  const { w: vw, h: vh } = useViewport()
  // Run 5 — fullscreen + landscape immersive mode (single source of truth).
  const fs = useFullscreenLandscape()
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [trayRef, trayW] = useMeasuredWidth<HTMLDivElement>()
  const [game, setGame] = useState<TlmnPublicGame | null>(null)
  const [hand, setHand] = useState<Card[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sortMode, setSortMode] = useState<'rank' | 'suit'>('rank')
  const [error, setError] = useState<string | null>(null)
  const [dealing, setDealing] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [isPending, startTransition] = useTransition()
  // Phase 7 — a polite ARIA live message (plays / passes / turn changes), localized.
  const [liveMsg, setLiveMsg] = useState('')
  // Phase 8 — realtime connection health for the in-play surface (the lobby has its
  // own; once the table mounts we track the game channel so a dropped socket shows).
  const [connState, setConnState] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting')
  const mountedRef = useRef(true)
  // Latest game/seats mirrored into refs so the bot/timeout DRIVER (a steady interval)
  // always reads fresh values — no stale closure, no fire-once dedup.
  const gameRef = useRef<TlmnPublicGame | null>(null)
  const seatsRef = useRef(seats)

  // ── Transient FX state ───────────────────────────────────────────────────────
  const [chac, setChac] = useState<{ cutter: number; victim: number; amount: number; kind: 'heo' | 'bom'; key: number } | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const [passStamp, setPassStamp] = useState<{ seat: number; key: number } | null>(null)
  const [invalidKey, setInvalidKey] = useState(0)
  const [confettiKey, setConfettiKey] = useState(0)
  const [starKey, setStarKey] = useState(0)   // gold star burst (special combos / chặt)
  const [crownKey, setCrownKey] = useState(0)  // crown sweep + edge glow (tới trắng / win)
  const [penaltyToast, setPenaltyToast] = useState<{ seat: number; label: string; key: number } | null>(null)
  const [dealFxKey, setDealFxKey] = useState(0) // premium round-deal overlay trigger
  // Phase 2 — per-seat last-played mirror. Read-only: derived purely by observing
  // public trick transitions (no DB / game-logic change). Cleared on a new round.
  const [lastPlayed, setLastPlayed] = useState<Record<number, Card[]>>({})
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
      .subscribe(status => {
        if (!mountedRef.current) return
        if (status === 'SUBSCRIBED') { setConnState('connected'); refreshAll() }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConnState('reconnecting')
      })
    return () => { mountedRef.current = false; sb.removeChannel(ch) }
  }, [roomId, refreshAll])

  // ── Polling safety net ─────────────────────────────────────────────────────────
  // Realtime is the fast path, but a single dropped tlmn_games broadcast otherwise
  // strands the client on a stale turn (the play button never re-enables, bots look
  // frozen) until the next round forces a refetch. A light poll guarantees the board,
  // turn and hand re-sync even when realtime misses an event.
  useEffect(() => {
    const id = setInterval(() => { if (mountedRef.current) refreshAll() }, 2500)
    return () => clearInterval(id)
  }, [refreshAll])

  // ── Local clock for the turn countdown ────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  // A fresh round (new game id) ⇒ drop any stale selection from the previous deal.
  useEffect(() => { setSelected(new Set()) }, [game?.id])

  // A fresh deal staggers the hand-card entrance; the flag clears shortly after so
  // later interactions (select / sort reflow) animate instantly without the stagger.
  useEffect(() => {
    setDealing(true)
    const id = setTimeout(() => { if (mountedRef.current) setDealing(false) }, 650)
    return () => clearTimeout(id)
  }, [game?.id])

  // Mirror the latest game + seats into refs for the driver below (read-only).
  useEffect(() => { gameRef.current = game }, [game])
  useEffect(() => { seatsRef.current = seats }, [seats])

  // ── Bot-turn + timeout DRIVER (retrying — the fix for the turn-state stall) ──────
  // Bots have no browser and there is NO long-lived server, so seated clients must
  // nudge the server to (a) play a bot / AFK-takeover seat and (b) reap a timed-out
  // turn. The previous version fired each nudge exactly ONCE per turn and then
  // dedup-blocked it forever (keyed by turn_started_at). A single no-op — e.g. minor
  // client-AHEAD clock skew makes the server's randomized think-delay gate reject the
  // call as "too early" — or one dropped request therefore STRANDED the bot's turn
  // permanently: the turn never came back to the human and "Đánh" stayed disabled
  // ("Chưa tới lượt bạn"). We now RETRY on a steady interval until the turn actually
  // advances. Both server actions are idempotent and guarded (commitRound updates only
  // when status='playing' AND turn_seat=actingSeat), so repeats are safe — exactly one
  // application ever wins. Reads game/seats from refs ⇒ no stale closure.
  useEffect(() => {
    let lastKey = ''   // turn_started_at we last nudged
    let lastAt = 0     // when we last nudged (throttle, but always retry next window)
    const RETRY_MS = 1100
    const id = setInterval(() => {
      if (!mountedRef.current) return
      const g = gameRef.current
      if (!g || g.status !== 'playing' || g.turn_seat == null || !g.turn_started_at) return
      const key = g.turn_started_at
      const startedAt = new Date(key).getTime()
      const elapsed = Date.now() - startedAt
      // One nudge per RETRY_MS for a given turn — but as soon as RETRY_MS elapses and
      // the turn still hasn't moved, nudge again (this is what guarantees progress).
      if (key === lastKey && Date.now() - lastAt < RETRY_MS) return

      const turnSeat = seatsRef.current.find(s => s.seat_index === g.turn_seat)
      const isBotSeat = !!turnSeat && (turnSeat.is_bot || turnSeat.bot_takeover)
      const deadlinePassed = !!g.turn_deadline && Date.now() > new Date(g.turn_deadline).getTime() + 3500

      if (isBotSeat && elapsed >= 1500) {
        lastKey = key; lastAt = Date.now()
        runBotTurn(roomId).then(() => { if (mountedRef.current) refreshAll() }).catch(() => {})
      } else if (deadlinePassed) {
        // Works for a timed-out HUMAN seat too (auto-pass / AFK takeover), exactly as
        // before — just retried instead of fired once.
        lastKey = key; lastAt = Date.now()
        tickTurnTimer(roomId).then(() => { if (mountedRef.current) refreshAll() }).catch(() => {})
      }
    }, 600)
    return () => clearInterval(id)
  }, [roomId, refreshAll])

  // ── React to game transitions: sounds, haptics, FX ─────────────────────────────
  useEffect(() => {
    if (!game) return
    const prev = prevGameRef.current
    prevGameRef.current = game

    // First load — establish baseline, no retroactive effects.
    if (!prev) return

    const newRound = game.id !== prev.id
    if (newRound) {
      setChac(null); setPassStamp(null); setLastPlayed({})
      if (game.status === 'playing') {
        sound.play('deal')
        if (!reducedRef.current) setDealFxKey(Date.now()) // premium deal cascade
      }
    }

    // Mirror the latest play to its actor's seat (read-only attribution slot).
    if (!newRound && game.trick && (!prev.trick || prev.trick.by_seat !== game.trick.by_seat || comboKeys(prev.trick.cards).join() !== comboKeys(game.trick.cards).join())) {
      const by = game.trick.by_seat
      const cards = game.trick.cards
      setLastPlayed(p => ({ ...p, [by]: cards }))
    }

    // A chặt event landed → the signature moment.
    if (game.chat_events.length > prev.chat_events.length) {
      const ev = game.chat_events[game.chat_events.length - 1]
      const amount = !game.rules.denEnabled ? 0 : ev.kind === 'heo' ? game.rules.denHeo : game.rules.denBom
      setChac({ cutter: ev.cutter, victim: ev.cutVictim, amount, kind: ev.kind, key: Date.now() })
      setShakeKey(k => k + 1)
      setStarKey(Date.now()) // chặt heo / chặt bom → gold star burst
      sound.play('chat')
      sound.vibrate([0, 40, 30, 60])
    } else if (!newRound && game.trick && (!prev.trick || prev.trick.by_seat !== game.trick.by_seat || comboKeys(prev.trick.cards).join() !== comboKeys(game.trick.cards).join())) {
      // A normal play hit the table — bombs (tứ quý / đôi thông) also burst gold stars.
      sound.play('play')
      const c = parseCombo(game.trick.cards)
      if (c && isBomb(c)) setStarKey(Date.now())
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

    // ── ARIA live announcements (localized) ───────────────────────────────────────
    // Priority within a single transition: a new play > a pass > a turn change. All
    // announced via the polite live region; the screen reader voices them in order.
    const trickChanged = !newRound && !!game.trick && (!prev.trick || prev.trick.by_seat !== game.trick.by_seat || comboKeys(prev.trick.cards).join() !== comboKeys(game.trick.cards).join())
    if (trickChanged && game.trick) {
      const c = parseCombo(game.trick.cards)
      setLiveMsg(t('a11y_play', { name: seatName(game.trick.by_seat), combo: c ? comboName(c, t) : '' }))
    } else if (!newRound && game.pass_flags.length > prev.pass_flags.length) {
      const passer = game.pass_flags.find(s => !prev.pass_flags.includes(s))
      if (passer != null) setLiveMsg(passer === mySeat ? t('a11y_your_pass') : t('a11y_pass', { name: seatName(passer) }))
    } else if (game.status === 'playing' && game.turn_seat != null && game.turn_seat !== prev.turn_seat) {
      setLiveMsg(game.turn_seat === mySeat ? t('a11y_your_turn') : t('a11y_turn', { name: seatName(game.turn_seat) }))
    }

    // Round just ended → celebration.
    const justEnded = (newRound || prev.status === 'playing') && game.status === 'ended'
    if (justEnded) {
      const instant = game.result?.instant
      if (instant) { sound.play('toitrang'); sound.vibrate([0, 60, 40, 90]); setCrownKey(Date.now()) }
      else if (game.result?.winner != null) { sound.play('win'); setCrownKey(Date.now()) }
      if (!reducedRef.current) setConfettiKey(Date.now())
      const w = game.result?.winner ?? game.nhat_seat
      setLiveMsg(w != null ? t('a11y_round_over', { name: seatName(w) }) : t('round_over'))

      // A brief NON-celebratory toast by a penalised seat (cóng / thối heo / thối bom)
      // so the player understands what happened. Derived from the đếm-lá breakdown only.
      const bd = game.result?.breakdown
      if (bd) {
        for (const r of bd.seats) {
          const label = r.cong ? t('penalty_cong')
            : (r.heldTwos > 0 && r.thoiHeoMult > 1) ? t('penalty_thoiheo')
            : r.thoiBomUnits > 0 ? t('penalty_thoibom')
            : null
          if (label) { setPenaltyToast({ seat: r.seat, label, key: Date.now() }); break }
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, mySeat, sound, t])

  // Auto-clear the chặt overlay.
  useEffect(() => {
    if (!chac) return
    const id = setTimeout(() => { if (mountedRef.current) setChac(null) }, 1900)
    return () => clearTimeout(id)
  }, [chac])

  // Auto-clear the pass stamp (its lifetime is the shared PASS_CHIP timing).
  useEffect(() => {
    if (!passStamp) return
    const id = setTimeout(() => { if (mountedRef.current) setPassStamp(null) }, MS.PASS_CHIP)
    return () => clearTimeout(id)
  }, [passStamp])

  // Auto-clear the premium round-deal overlay once the cascade has finished.
  const [dealFxOn, setDealFxOn] = useState(false)
  useEffect(() => {
    if (!dealFxKey) return
    setDealFxOn(true)
    const id = setTimeout(() => { if (mountedRef.current) setDealFxOn(false) }, MS.DEAL + 13 * MS.DEAL_STAGGER + 120)
    return () => clearTimeout(id)
  }, [dealFxKey])

  // Auto-clear confetti.
  const [confettiOn, setConfettiOn] = useState(false)
  useEffect(() => {
    if (!confettiKey) return
    setConfettiOn(true)
    const id = setTimeout(() => { if (mountedRef.current) setConfettiOn(false) }, 1900)
    return () => clearTimeout(id)
  }, [confettiKey])

  // Auto-clear the gold star burst.
  const [starOn, setStarOn] = useState(false)
  useEffect(() => {
    if (!starKey) return
    if (reducedRef.current) return
    setStarOn(true)
    const id = setTimeout(() => { if (mountedRef.current) setStarOn(false) }, 1250)
    return () => clearTimeout(id)
  }, [starKey])

  // Auto-clear the crown sweep + edge glow.
  const [crownOn, setCrownOn] = useState(false)
  useEffect(() => {
    if (!crownKey) return
    setCrownOn(true)
    const id = setTimeout(() => { if (mountedRef.current) setCrownOn(false) }, 2300)
    return () => clearTimeout(id)
  }, [crownKey])

  // Auto-clear the penalty toast.
  useEffect(() => {
    if (!penaltyToast) return
    const id = setTimeout(() => { if (mountedRef.current) setPenaltyToast(null) }, 2600)
    return () => clearTimeout(id)
  }, [penaltyToast])

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

  // ── Decision support ─────────────────────────────────────────────────────────
  // Required combo chip ("Tự do" when leading, else the table's shape) + live
  // feedback on the current multi-selection (detected name + legality + a one-line
  // reason). All derived from the SAME engine the server validates with — no rules
  // are duplicated here.
  const requiredLabel = isMyTurn ? requiredComboLabel(tableCombo, t) : null
  const selectionInfo = useMemo<
    { name: string | null; valid: boolean; reason: string | null } | null
  >(() => {
    if (selectedCards.length === 0) return null
    if (!selectedCombo) return { name: null, valid: false, reason: 'sel_invalid_combo' }
    const name = comboName(selectedCombo, t)
    if (!isMyTurn) return { name, valid: false, reason: 'sel_not_turn' }
    if (beats(selectedCombo, tableCombo, rules ?? DEFAULT_RULES)) return { name, valid: true, reason: null }
    if (tableCombo && selectedCombo.type !== tableCombo.type && !isBomb(selectedCombo))
      return { name, valid: false, reason: 'sel_wrong_type' }
    return { name, valid: false, reason: 'sel_too_weak' }
  }, [selectedCards, selectedCombo, isMyTurn, tableCombo, rules, t])

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
  const lastPlayW = vw < 560 ? 18 : vw < 1024 ? 20 : 22 // per-seat last-played mini
  const tableHByWidth = vw < 560 ? 300 : vw < 768 ? 360 : vw < 1024 ? 420 : 480
  // Never let the table grow taller than the viewport can hold (landscape phones).
  const tableH = Math.min(tableHByWidth, Math.max(220, Math.round(vh * 0.52)))

  // Hand fan: spread cards across the measured tray, overlapping only as much as
  // needed so faces stay legible (never shrink the cards to fit). The fit formula
  //   overlap = clamp(minStrip, (containerW − cardW)/(n−1))   [+ a safety inset]
  // guarantees the LAST card is fully visible with symmetric padding — zero right
  // cutoff — at every breakpoint, while keeping each card's exposed strip tappable.
  const handCount = hand.length
  const FAN_SAFE = 14 // reserve px for rotation overhang at the fan's ends
  const fanStep = useMemo(() => {
    if (handCount <= 1) return handW
    const fit = trayW > 0 ? (trayW - handW - FAN_SAFE) / (handCount - 1) : handW * 0.7
    // minStrip keeps a tappable sliver even when packed; max keeps a pleasant spread.
    return Math.max(handW * 0.28, Math.min(handW * 0.72, fit))
  }, [trayW, handW, handCount])
  // Arc + parabolic lift, capped tighter on small screens (token --fan-arc).
  const maxArc = vw < 560 ? 8 : vw < 768 ? 10 : 12

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
      refreshAll() // don't wait on realtime to advance my own move
    })
  }

  const doPass = () => {
    if (!canPass || isPending) return
    setError(null)
    startTransition(async () => {
      const res = await passTurn(roomId)
      if (res?.error) setError(res.error)
      refreshAll()
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
      refreshAll()
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

  // Which edge of the felt a seat sits on — drives the fly-in origin for its plays.
  const placeOfSeat = (idx: number): 'top' | 'left' | 'right' | 'bottom' => {
    if (mySeat != null && idx === mySeat) return 'bottom'
    const pos = orderedOthers.indexOf(idx)
    return (slotList[pos] as 'top' | 'left' | 'right' | 'bottom') ?? 'top'
  }
  const flyOrigin = (place: string) =>
    place === 'top' ? { x: 0, y: -110 } :
    place === 'left' ? { x: -150, y: 0 } :
    place === 'right' ? { x: 150, y: 0 } : { x: 0, y: 130 }

  // Seats that receive cards in the premium round-deal cascade (mine + every
  // opponent), each tagged with the felt edge it sits on so the deck fans toward it.
  const dealPlaces: ('top' | 'left' | 'right' | 'bottom')[] = [
    ...(mySeat != null ? (['bottom'] as const) : []),
    ...orderedOthers.map((_, i) => (slotList[i] as 'top' | 'left' | 'right' | 'bottom') ?? 'top'),
  ]
  const feltW = Math.min(vw * 0.88, 1000)
  const dealBackW = Math.max(13, Math.round(pileW * 0.5))

  const playing = game.status === 'playing'
  const ended = game.status === 'ended'
  const reduced = reducedRef.current
  const winnerSeat = ended ? (game.result?.winner ?? game.nhat_seat ?? null) : null
  // I emptied my hand but the round is still running for the others → show placement
  // instead of an empty tray + dead action buttons.
  const myFinished = mySeat != null && (game.card_counts?.[String(mySeat)] ?? 1) === 0

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    // Full-bleed breakout: the table escapes the page's narrow column to become an
    // immersive deep-red surface — the dominant element on the page. In fullscreen /
    // pseudo-fullscreen (Run 5) the .tlmn-fs-root rules make this fill 100dvh/dvw.
    <div ref={fs.rootRef} className="tlmn-fs-root relative w-screen left-1/2 -translate-x-1/2">
      <div
        key={shakeKey}
        className={`tlmn-stage relative flex flex-col min-h-[86vh] overflow-hidden ${shakeKey ? 'tlmn-shake' : ''}`}
      >
        {/* Polite ARIA live region — localized play / pass / turn-change narration. */}
        <div role="status" aria-live="polite" aria-atomic="true" aria-label={t('a11y_region_label')} className="sr-only">
          {liveMsg}
        </div>

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
            {connState !== 'connected' && (
              <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/25 px-2.5 py-1 text-[10.5px] font-bold text-amber-100">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-300 motion-safe:animate-pulse" />
                {t(connState === 'connecting' ? 'connecting' : 'reconnecting')}
              </span>
            )}
            <span className="tlmn-badge-gold rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[1.5px]">
              {t('round_label', { n: game.round_no })}
            </span>
            {/* Fullscreen toggle — expand ⇄ compress. Shown wherever the hook can act
                (native on Android/desktop, pseudo on iOS); hidden on desktop browsers
                with no Fullscreen API. enter() runs inside this tap (gesture-safe). */}
            {fs.mode !== 'unsupported' && (
              <button
                type="button"
                onClick={() => { void fs.toggle() }}
                aria-label={fs.isFullscreen ? t('fullscreen_exit') : t('fullscreen_enter')}
                title={fs.isFullscreen ? t('fullscreen_exit') : t('fullscreen_enter')}
                aria-pressed={fs.isFullscreen}
                className="tlmn-chrome"
              >
                {fs.isFullscreen ? (
                  <svg width={18} height={18} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V5H5m0 0l4 4m6-4v4h4m0 0l-4-4M9 15v4H5m0 0l4-4m6 4v-4h4m0 0l-4 4" /></svg>
                ) : (
                  <svg width={18} height={18} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" /></svg>
                )}
              </button>
            )}
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
            style={{ maxWidth: 'min(88vw, 1000px)', height: tableH }}
          >
            {/* Opponent / other seats around the oval. data-seat-slot lets the CSS
                pull the left/right seats into the upper corners (and shrink them) on
                mobile portrait, where the felt is too narrow for mid-edge side seats. */}
            {orderedOthers.map((idx, i) => (
              <div key={idx} data-seat-slot={slotList[i] ?? 'top'} className={`tlmn-seat absolute z-10 ${SLOT_POS[slotList[i]] ?? SLOT_POS.top}`}>
                <SeatPod
                  seat={seatOf(idx)}
                  name={seatName(idx)}
                  isMe={false}
                  count={game.card_counts?.[String(idx)] ?? 0}
                  chips={chipsFromScore(seatOf(idx)?.cumulative_score ?? 0)}
                  isTurn={game.turn_seat === idx && playing}
                  isNhat={game.nhat_seat === idx}
                  isWinner={winnerSeat === idx}
                  passed={!!passStamp && passStamp.seat === idx}
                  passKey={passStamp?.key}
                  secondsLeft={game.turn_seat === idx ? secondsLeft : null}
                  turnFrac={game.turn_seat === idx ? turnFrac : 0}
                  av={vw < 560 ? 42 : vw < 1024 ? 50 : 58}
                  backW={seatBackW}
                  place={slotList[i] ?? 'top'}
                  lastPlayed={lastPlayed[idx] ?? null}
                  lastW={lastPlayW}
                  reduced={reducedRef.current}
                  t={t}
                />
              </div>
            ))}

            {/* Center: current trick / lead hint / round result */}
            <div className="absolute inset-0 flex items-center justify-center px-4 pointer-events-none">
              {ended ? (
                <CenterEnd game={game} seatName={seatName} t={t} />
              ) : game.trick ? (
                <div key={comboKeys(game.trick.cards).join()} className="flex flex-col items-center gap-2">
                  {/* Gold combo banner — driven by the combo type (no recompute of rules). */}
                  {tableCombo && (() => {
                    const b = comboBanner(tableCombo, t)
                    return (
                      <span
                        className={`tlmn-banner-in inline-flex items-center rounded-full px-3.5 py-1 text-[13px] font-black uppercase ${
                          b.special ? 'tlmn-combo-banner tlmn-banner-shine' : 'tlmn-combo-banner--plain'
                        }`}
                      >
                        {b.label}
                      </span>
                    )
                  })()}
                  <p className="text-[10.5px] font-bold text-white/70 uppercase tracking-[1.5px]">
                    {t('table_play_by', { name: seatName(game.trick.by_seat) })}
                  </p>
                  {/* Faint ghost of the prior stacked plays, giving the pile depth. */}
                  <div className="relative flex justify-center" style={{ perspective: 700 }}>
                    <span aria-hidden className="absolute left-1/2 top-1 rounded-[7px] bg-black/25" style={{ width: pileW, height: Math.round(pileW * 1.4), transform: 'translateX(-50%) rotate(-7deg) translateY(4px)' }} />
                    <span aria-hidden className="absolute left-1/2 top-1 rounded-[7px] bg-black/20" style={{ width: pileW, height: Math.round(pileW * 1.4), transform: 'translateX(-50%) rotate(6deg) translateY(4px)' }} />
                    {sortHand(game.trick.cards).map((c, i) => {
                      const mine = mySeat != null && game.trick!.by_seat === mySeat
                      const ml = i === 0 ? 0 : -Math.round(pileW * 0.28)
                      if (reduced) {
                        return <span key={cardKey(c)} style={{ marginLeft: ml }}><CardFace card={c} w={pileW} /></span>
                      }
                      // Each card flies in from its actor's seat and settles. Opponent
                      // cards (face-down) also flip face-up mid-flight; my own cards are
                      // already face-up so they just fly (no duplicate pop — the card has
                      // already left my hand). A small mini settles by the actor in parallel.
                      const o = flyOrigin(placeOfSeat(game.trick!.by_seat))
                      return (
                        <motion.span
                          key={cardKey(c)}
                          initial={{ x: o.x, y: o.y, rotateY: mine ? 0 : 90, scale: 0.82, opacity: mine ? 0.85 : 0.5 }}
                          animate={{ x: 0, y: 0, rotateY: 0, scale: 1, opacity: 1 }}
                          transition={mine ? TRANSITIONS.fly : { ...TRANSITIONS.fly, rotateY: { duration: DURATIONS.FLIP } }}
                          style={{ marginLeft: ml, transformStyle: 'preserve-3d' }}
                        >
                          <CardFace card={c} w={pileW} />
                        </motion.span>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-white/70">{t('to_beat')}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[32px] opacity-80">🃏</span>
                  <p className="text-[12px] text-white/75 text-center">
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
                  <div className="tlmn-stamp tlmn-combo-banner tlmn-banner-shine px-5 py-2 rounded-2xl shadow-2xl">
                    <span className="font-serif font-black text-[clamp(26px,5vw,38px)] tracking-tight">
                      ✂️ {t(chac.kind === 'heo' ? 'banner_chat_heo' : 'banner_chat_bom')}
                    </span>
                  </div>
                  {chac.amount > 0 && (
                    <p className="mt-2 text-[13px] font-bold text-rose-deep bg-white/90 px-3 py-1 rounded-full tlmn-banner-pop">
                      {t('den_line', { victim: seatName(chac.victim), cutter: seatName(chac.cutter), amount: chac.amount })}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Premium round-deal cascade — cards fan from the centre deck out to
                every seat, staggered around the table. Reduced-motion never triggers
                it (guarded at the trigger site). Purely cosmetic, behind the pile. */}
            {dealFxOn && <DealFx places={dealPlaces} feltW={feltW} feltH={tableH} cardW={dealBackW} />}

            {/* Win celebration — on-brand emoji burst + geometric confetti. */}
            {confettiOn && (
              <>
                <Confetti seed={confettiKey} />
                <EmojiBurst seed={confettiKey} />
              </>
            )}

            {/* Gold star burst — special combos (tứ quý / đôi thông) + chặt. */}
            {starOn && <GoldStars seed={starKey} />}

            {/* Instant-win (tới trắng) — crown sweep + screen-edge gold glow. */}
            {crownOn && ended && game.result?.instant && (
              <>
                <span className="tlmn-edge-glow" />
                <div className="absolute inset-0 flex items-start justify-center pt-[8%] pointer-events-none z-30">
                  <span className="tlmn-crown-sweep text-[clamp(44px,9vw,72px)]" aria-hidden>👑</span>
                </div>
              </>
            )}

            {/* Penalty (thối heo / đền / cóng) — a brief, NON-celebratory muted toast by
                the affected seat. No gold; just enough to explain what happened. */}
            {penaltyToast && (
              <div key={penaltyToast.key} className={`absolute z-30 pointer-events-none ${SLOT_POS[mySeat != null && penaltyToast.seat === mySeat ? 'bottom' : placeOfSeat(penaltyToast.seat)] ?? SLOT_POS.top}`}>
                <span className="tlmn-banner-pop inline-flex items-center gap-1 rounded-lg bg-black/70 border border-white/20 px-2.5 py-1 text-[10.5px] font-bold text-white/90 whitespace-nowrap">
                  ⚠️ {penaltyToast.label}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom dock ──────────────────────────────────────────────────── */}
        {mySeat != null && playing && myFinished && (
          <div className="relative z-20 px-3 sm:px-6 pt-1 pb-6" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
            <div role="status" className="max-w-[680px] mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-300/30 px-5 py-6 text-center tlmn-banner-pop">
              <p className="text-[28px] leading-none">✓</p>
              <p className="text-[15px] font-bold text-emerald-100 mt-2">{t('you_finished')}</p>
            </div>
          </div>
        )}

        {mySeat != null && playing && !myFinished && (
          <div className="relative z-20 px-3 sm:px-6 pt-1" aria-busy={isPending} style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
            {/* Human seat (bottom-left) + sort pill */}
            <div className="flex items-end justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2.5">
                <span className={`relative inline-flex rounded-full p-[3px] tlmn-frame-gold ${isMyTurn && !reduced ? 'tlmn-frame-active' : ''}`}>
                  <PodAvatar name={seatName(mySeat)} url={seatOf(mySeat)?.avatar_url ?? null} size={vw < 560 ? 38 : 46} />
                  {isMyTurn && secondsLeft != null && (
                    <span
                      className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center ${secondsLeft <= 5 ? 'tlmn-timer-warn' : ''}`}
                      style={{ background: `conic-gradient(${secondsLeft <= 5 ? '#ff5a8c' : '#7fe3f0'} ${turnFrac * 360}deg, rgba(0,0,0,0.45) 0deg)` }}
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
                    <span className="tlmn-chip-balance text-[10px] font-black inline-flex items-center gap-0.5"><span aria-hidden className="text-[9px]">🪙</span>{formatChips(chipsFromScore(seatOf(mySeat)?.cumulative_score ?? 0))}</span>
                  </p>
                  {isMyTurn ? (
                    <span className="text-[11px] font-bold text-rose-200 flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-200 animate-pulse" />{t('your_turn')}
                    </span>
                  ) : (
                    <span className="text-[11px] text-white/70 italic mt-0.5 inline-block">{t('thinking')}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSortMode(m => (m === 'rank' ? 'suit' : 'rank'))}
                className="tlmn-btn-gold flex-none text-[12px] font-black uppercase tracking-wide rounded-full px-3.5 py-1.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                ↕ {t('sort_btn')}
              </button>
            </div>

            {/* Cream hand tray with the fanned cards. Extra top room so the arced
                middle cards + any selected lift are never clipped. */}
            <div className="tlmn-tray rounded-2xl px-3 sm:px-5" style={{ minHeight: Math.round(handW * 1.4) + 46 }}>
              <div
                key={invalidKey}
                ref={trayRef}
                className={`relative flex justify-center items-end h-full pb-3 pt-7 ${invalidKey ? 'tlmn-invalid' : ''}`}
              >
                {displayHand.map((c, i) => {
                  const sel = selected.has(cardKey(c))
                  const isPlayable = playableKeys ? playableKeys.has(cardKey(c)) : false
                  const dim = playableKeys ? !isPlayable && !sel : false
                  // Fan geometry: evenly tilt −maxArc → +maxArc across the hand, with a
                  // parabolic lift peaking at the centre. Pivot at bottom-centre so the
                  // cards splay like a held fan. A selected card lifts further + comes
                  // to the front. The OUTER motion.button owns layout (so a Sắp xếp reflow
                  // slides cards to their new slot); the INNER motion.span owns the deal
                  // entrance + arc/lift transform — keeping the two transform spaces apart.
                  const n = displayHand.length
                  const mid = (n - 1) / 2
                  const norm = mid === 0 ? 0 : (i - mid) / mid // −1 … +1
                  const angle = norm * maxArc
                  const lift = Math.round((1 - norm * norm) * (handW * 0.16))
                  const ty = -lift - (sel ? 18 : 0)
                  return (
                    <motion.button
                      key={`${game.id}-${cardKey(c)}`}
                      layout
                      type="button"
                      onClick={() => toggleCard(c)}
                      aria-label={cardAria(c, t)}
                      aria-pressed={sel}
                      transition={{ layout: reduced ? { duration: 0 } : { duration: DURATIONS.SETTLE, ease: EASINGS.settle } }}
                      className="relative focus:outline-none focus-visible:ring-2 focus-visible:ring-rose rounded-[8px]"
                      style={{ marginLeft: i === 0 ? 0 : fanStep - handW, zIndex: sel ? 50 : i }}
                    >
                      {/* Selected card is raised to the top (z-50): widen its hit area
                          past the fan overlap so re-tapping to deselect stays ≥44px. */}
                      {sel && <span aria-hidden className="absolute -inset-x-2 -bottom-3 top-0" />}
                      <motion.span
                        className="relative block"
                        initial={reduced ? false : { opacity: 0, y: -150, scale: 0.7, rotate: -6 }}
                        animate={{ opacity: 1, y: ty, scale: 1, rotate: angle }}
                        transition={reduced ? { duration: 0 } : { ...TRANSITIONS.lift, delay: dealing ? Math.min(i * 0.022, 0.34) : 0 }}
                        style={{ transformOrigin: 'bottom center' }}
                      >
                        <CardFace card={c} w={handW} selected={sel} dim={dim} playable={isPlayable && !sel} interactive />
                        {sel && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)]" style={{ width: Math.round(handW * 0.7) }} />}
                      </motion.span>
                    </motion.button>
                  )
                })}
              </div>
            </div>

            {/* Decision bar: required combo chip (left) + live selection feedback (right) */}
            <div className="flex items-center justify-between gap-2 mt-2 min-h-[26px] max-w-[680px] mx-auto">
              {isMyTurn && requiredLabel ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-bold whitespace-nowrap">
                  <span className="text-white/45 uppercase tracking-wide text-[9.5px]">{t('req_prefix')}</span>
                  <span className={tableCombo ? 'text-rose-200' : 'text-emerald-200'}>{requiredLabel}</span>
                </span>
              ) : <span />}
              {selectionInfo && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ${
                    selectionInfo.valid ? 'bg-emerald-500/25 text-emerald-100' : 'bg-rose/25 text-rose-100'
                  }`}
                >
                  {selectionInfo.name && <span>{selectionInfo.name}</span>}
                  {selectionInfo.valid ? (
                    <span aria-hidden>✓</span>
                  ) : (
                    <span className="font-medium opacity-90">· {t(selectionInfo.reason as Parameters<typeof t>[0])}</span>
                  )}
                </span>
              )}
            </div>

            {error && <p className="text-[12px] text-rose-200 mt-1.5 text-center font-semibold">{tErr(t, error)}</p>}

            {/* Action buttons */}
            <div className="flex gap-2 mt-2 max-w-[680px] mx-auto">
              <button
                type="button"
                onClick={doHint}
                disabled={!isMyTurn || isPending}
                className="tlmn-btn-ghost font-bold text-[13px] px-4 py-3 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tg-gold-bright)]"
              >
                💡 {t('hint_btn')}
              </button>
              <button
                type="button"
                onClick={doPlay}
                disabled={!isMyTurn || selectedCards.length === 0 || isPending || !canPlay}
                className={`tlmn-btn-primary flex-1 font-bold text-[15px] px-5 py-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tg-gold-bright)] ${
                  isMyTurn && canPlay && !isPending ? 'tlmn-play-pulse' : ''
                }`}
              >
                {t('play_btn')}
                {canPlay && selectionInfo?.name ? ` · ${selectionInfo.name}` : selectedCards.length ? ` · ${selectedCards.length}` : ''}
              </button>
              <button
                type="button"
                onClick={doPass}
                disabled={!canPass || isPending}
                className="tlmn-btn-ghost font-bold text-[14px] px-5 py-3 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tg-gold-bright)]"
              >
                {t('pass_btn')}
              </button>
            </div>

            {/* Landscape-for-better-play hint (portrait phones only) */}
            <p className="tlmn-rotate-hint text-center text-[11px] text-white/60 mt-2">↺ {t('rotate_hint')}</p>
          </div>
        )}

        {/* Spectator hint */}
        {mySeat == null && playing && (
          <p className="relative z-20 text-center text-[13px] text-white/75 py-4">{t('spectating')}</p>
        )}

        {/* ── End-of-round: banner, scoreboard, next round ─────────────────── */}
        {ended && (
          <div className="relative z-20 w-full max-w-[600px] mx-auto px-3 sm:px-4 flex flex-col gap-3" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
            {game.result?.instant && <ToiTrangBanner game={game} seatName={seatName} t={t} />}
            <Podium game={game} seats={seats} seatName={seatName} reduced={reduced} t={t} />
            <div className="text-center">
              {isHost ? (
                <button
                  type="button"
                  onClick={doNextRound}
                  disabled={isPending}
                  className="tlmn-btn-gold font-black text-[15px] uppercase tracking-wide px-8 py-3.5 rounded-xl transition-all disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  🃏 {t('new_round_btn')}
                </button>
              ) : (
                <p className="text-[12.5px] text-white/75">{t('waiting_host_next')}</p>
              )}
              {error && <p className="text-[12px] text-rose-200 mt-2">{tErr(t, error)}</p>}
            </div>
          </div>
        )}

        {/* ── Run 5: portrait rotate prompt (active game only) ─────────────────
            Full-cover, on-brand. Encourages landscape while a hand is in play — it
            covers only the table; the lobby/menus live in TlmnRoom and are never
            blocked. iOS-critical: it's all we can do where orientation.lock no-ops.
            Includes its own leave control so a portrait player is never trapped. */}
        {playing && fs.isMobileOrTablet && !fs.isLandscape && (
          <div role="dialog" aria-label={t('rotate_hint')} className="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-5 px-8 text-center" style={{ background: 'rgba(22,3,9,0.96)' }}>
            <span className="tlmn-rotate-icon text-[64px] leading-none" aria-hidden>📱</span>
            <p className="font-serif font-black text-[22px] text-white">{t('rotate_hint')}</p>
            <p className="text-[13.5px] text-white/70 max-w-[280px] leading-relaxed">{t('rotate_subtext')}</p>
            <button type="button" onClick={onLeave} className="mt-2 text-[12.5px] font-semibold text-white/60 hover:text-white border border-white/20 rounded-xl px-4 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
              {t('leave_btn')}
            </button>
          </div>
        )}

        {/* ── Run 5: landscape one-tap fullscreen nudge ────────────────────────
            The closest we can get to "auto-fullscreen on rotate": auto-entering
            fullscreen without a user gesture is blocked, so we surface a one-tap
            prompt whose tap calls enter(). Dismissible. */}
        {playing && fs.isMobileOrTablet && fs.isLandscape && !fs.isFullscreen && !nudgeDismissed && (
          <div className="absolute left-1/2 -translate-x-1/2 z-[55] flex items-center gap-1.5 tlmn-banner-pop" style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
            <button type="button" onClick={() => { void fs.enter() }} className="inline-flex items-center gap-2 rounded-full bg-rose text-white font-semibold text-[12.5px] px-4 py-2.5 shadow-[0_6px_22px_-6px_rgba(214,0,108,0.8)] hover:bg-rose-deep transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <svg width={15} height={15} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" /></svg>
              {t('tap_fullscreen')}
            </button>
            <button type="button" onClick={() => setNudgeDismissed(true)} aria-label={t('close_label')} title={t('close_label')} className="tlmn-chrome" style={{ width: 34, height: 34 }}>
              <svg width={15} height={15} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
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
  seat, name, isMe, count, chips, isTurn, isNhat, isWinner = false, passed, passKey,
  secondsLeft, turnFrac, av, backW, place, lastPlayed, lastW, reduced, t,
}: {
  seat: TlmnSeat | undefined
  name: string
  isMe: boolean
  count: number
  chips: number
  isTurn: boolean
  isNhat: boolean
  isWinner?: boolean
  passed: boolean
  passKey?: number
  secondsLeft: number | null
  turnFrac: number
  av: number
  backW: number
  place: string
  lastPlayed: Card[] | null
  lastW: number
  reduced: boolean
  t: ReturnType<typeof useTranslations>
}) {
  void isMe
  // Phase 8 edge states: a human seat auto-piloted after going AFK / losing its
  // socket (bot_takeover on a non-bot) reads as "disconnected"; an empty hand mid-
  // round reads as "finished" (the nhất already carries its own trophy).
  const offline = !!seat && seat.bot_takeover && !seat.is_bot
  const finished = count === 0 && !isNhat
  // The winner of a finished round gets the celebratory gold ring (steady when the
  // user has asked for reduced motion, a soft pulse otherwise).
  // Every seat wears a decorative gold frame; the active player's frame glows, the
  // round winner's gets the grander celebration ring.
  const ringCls = isWinner
    ? `tlmn-frame-gold ${reduced ? '' : 'tlmn-win-glow'}`
    : isTurn
      ? `tlmn-frame-gold ${reduced ? '' : 'tlmn-frame-active'}`
      : 'tlmn-frame-gold'
  const fanOrientation: 'top' | 'left' | 'right' = place === 'left' ? 'left' : place === 'right' ? 'right' : 'top'
  // The whole seat is ONE positioned block: avatar/name/count cluster + the hand-fan,
  // arranged so the fan sits toward the table CENTER (below a top seat, to the inner
  // side of left/right). The count badge stays UPRIGHT in the non-rotated cluster.
  const blockDir =
    place === 'left' ? 'flex-row' :
    place === 'right' ? 'flex-row-reverse' :
    place === 'bottom' ? 'flex-col-reverse' : 'flex-col'

  const cluster = (
    <div className="relative flex flex-col items-center gap-1 flex-none" style={{ width: av + 30 }}>
      {isTurn && !isWinner && <span className="absolute left-1/2 -translate-x-1/2 -top-1 rounded-full tlmn-ring pointer-events-none" style={{ width: av + 8, height: av + 8 }} />}
      {isWinner && <span className="absolute left-1/2 -translate-x-1/2 -top-5 text-[18px] tlmn-banner-pop pointer-events-none z-20" aria-hidden>👑</span>}
      <span className={`relative inline-flex rounded-full p-[3px] ${ringCls}`}>
        <PodAvatar name={name} url={seat?.avatar_url ?? null} size={av} isBot={!!seat?.is_bot} seed={seat?.seat_index ?? 0} />
        {isTurn && secondsLeft != null && (
          <span
            className={`absolute -bottom-1 -right-1 rounded-full flex items-center justify-center ${secondsLeft <= 5 ? 'tlmn-timer-warn' : ''}`}
            style={{ width: av * 0.46, height: av * 0.46, background: `conic-gradient(${secondsLeft <= 5 ? '#ff5a8c' : '#7fe3f0'} ${turnFrac * 360}deg, rgba(0,0,0,0.5) 0deg)` }}
          >
            <span className="absolute inset-[2px] rounded-full bg-ink flex items-center justify-center font-bold text-white" style={{ fontSize: Math.max(9, av * 0.2) }}>
              {secondsLeft}
            </span>
          </span>
        )}
        {/* Upright count badge — the ONLY number on a seat. */}
        <span className="absolute -right-1.5 -bottom-1 text-[10px] font-black text-ink bg-cream rounded-full px-1.5 py-0.5 shadow ring-1 ring-rose-deep/30 leading-none">
          {count}
        </span>
      </span>
      <span className="max-w-full inline-flex flex-col items-center rounded-xl tlmn-plate px-2.5 py-0.5 leading-tight">
        <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-white/95">
          {isNhat && <span className="text-gold flex-none">🏆</span>}
          <span className="truncate max-w-[12ch]">{name}</span>
        </span>
        {/* Virtual chips — social-casino style. DISPLAY ONLY, not real money. */}
        <span className="tlmn-chip-balance inline-flex items-center gap-0.5 text-[10px] font-black tracking-wide">
          <span aria-hidden className="text-[9px]">🪙</span>{formatChips(chips)}
        </span>
      </span>
      {(offline || finished) && (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${offline ? 'bg-amber-500/30 text-amber-100' : 'bg-emerald-500/30 text-emerald-100'}`}
          role="status"
        >
          {offline ? `📵 ${t('seat_offline')}` : `✓ ${t('seat_finished')}`}
        </span>
      )}
      {/* "đang suy nghĩ…" — a subtle animated 3-dot under the active opponent (absolute
          so it never reflows the compact seat cluster). */}
      {isTurn && !passed && (
        <span
          className="absolute left-1/2 -translate-x-1/2 -bottom-3 inline-flex items-center gap-[3px] rounded-full bg-black/45 px-2 py-1 pointer-events-none z-20"
          role="status"
          aria-label={t('thinking')}
          title={t('thinking')}
        >
          {[0, 1, 2].map(d => (
            <span key={d} className="tlmn-think-dot w-[3px] h-[3px] rounded-full bg-white/85" style={{ animationDelay: `${d * 180}ms` }} />
          ))}
        </span>
      )}
      {/* Per-seat last-played slot, beside the avatar (small, overlapped). */}
      {lastPlayed && lastPlayed.length > 0 && (
        <SeatLastPlayed cards={lastPlayed} w={lastW} reduced={reduced} />
      )}
    </div>
  )

  return (
    <div className={`relative flex items-center gap-2 ${blockDir}`}>
      {cluster}
      {/* Opponent hand fan (vertical on sides, horizontal on top). */}
      <span className="relative inline-flex items-center justify-center flex-none">
        <OpponentFan count={count} w={backW} orientation={fanOrientation} />
      </span>

      {/* Bỏ lượt stamp */}
      {passed && (
        <span key={passKey} className="absolute -bottom-2 left-1/2 -translate-x-1/2 tlmn-stamp text-[10px] font-black uppercase text-white bg-rose/90 border border-white/40 rounded-md px-1.5 py-0.5 tracking-wide whitespace-nowrap z-20">
          {t('passed')}
        </span>
      )}
    </div>
  )
}

// ── Per-seat last-played mini ───────────────────────────────────────────────────────
// A small overlapped row of the actor's most recent play, sitting beside the avatar.
// Shares a framer-motion layoutId with the centre pile so the SAME element morphs
// seat → centre (no duplicate-pop). Face-up, tiny; reduced-motion = instant.
function SeatLastPlayed({ cards, w, reduced }: { cards: Card[]; w: number; reduced: boolean }) {
  return (
    <div className="flex justify-center -mt-0.5">
      {sortHand(cards).map((c, i) => (
        <motion.span
          key={cardKey(c)}
          initial={reduced ? false : { scale: 0.6, opacity: 0, y: -6 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={TRANSITIONS.settle}
          style={{ marginLeft: i === 0 ? 0 : -Math.round(w * 0.42) }}
        >
          <CardFace card={c} w={w} />
        </motion.span>
      ))}
    </div>
  )
}

function PodAvatar({ name, url, size = 28, isBot = false, seed = 0 }: { name: string; url: string | null; size?: number; isBot?: boolean; seed?: number }) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase()
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="rounded-full object-cover flex-none" style={{ width: size, height: size }} />
  }
  // Bots (no real avatar) get a DISTINCT generated portrait so Bot 1/2/3/4 differ.
  if (isBot) return <span className="flex-none"><BotAvatar seed={seed} size={size} /></span>
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

// ── Results podium (đếm lá — gold podium ranking) ─────────────────────────────────────
// Replaces the flat scoreboard: 1st place is raised + gold + crowned; the rest step
// down. Each row shows avatar, name, "Còn N lá", the round delta, running total and the
// animated virtual-CHIP delta. The đếm-lá MATH is unchanged — display only.
function Podium({
  game, seats, seatName, reduced, t,
}: {
  game: TlmnPublicGame
  seats: TlmnSeat[]
  seatName: (i: number) => string
  reduced: boolean
  t: ReturnType<typeof useTranslations>
}) {
  const breakdown = game.result?.breakdown
  const deltas = game.result?.deltas ?? {}
  const seatOf = (idx: number) => seats.find(s => s.seat_index === idx)
  const cumulativeOf = (idx: number) => seatOf(idx)?.cumulative_score ?? 0

  const rawRows = breakdown
    ? breakdown.seats.map(r => ({ seat: r.seat, isWinner: r.isWinner, cardsLeft: r.cardsLeft, cong: r.cong, heldTwos: r.heldTwos, thoiHeoMult: r.thoiHeoMult, thoiBomUnits: r.thoiBomUnits, total: r.total }))
    : game.seats.map(seat => ({
        seat, isWinner: game.result?.winner === seat,
        cardsLeft: game.card_counts?.[String(seat)] ?? 0,
        cong: false, heldTwos: 0, thoiHeoMult: 1, thoiBomUnits: 0,
        total: deltas[String(seat)] ?? 0,
      }))

  // Rank: winner first, then fewest cards left, then highest round delta.
  const rows = rawRows.slice().sort((a, b) =>
    Number(b.isWinner) - Number(a.isWinner) || a.cardsLeft - b.cardsLeft || b.total - a.total)
  const medals = ['🥇', '🥈', '🥉', '🏅']

  return (
    <div className="tlmn-results-card rounded-2xl overflow-hidden p-3 sm:p-4">
      <p className="text-[11px] font-black text-[var(--tg-gold-bright)] uppercase tracking-[2px] text-center pb-3">
        {t('podium_title')}
      </p>
      <div className="flex flex-col gap-2">
        {rows.map((r, rank) => {
          const cum = cumulativeOf(r.seat)
          const chips = chipsFromScore(cum)
          const chipDelta = r.total * CHIP_RATE
          const first = rank === 0
          return (
            <div
              key={r.seat}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${first ? 'tlmn-podium-1' : 'tlmn-podium-row'}`}
            >
              <span className="relative inline-flex flex-none">
                {first && <span className="absolute left-1/2 -translate-x-1/2 -top-4 text-[18px] tlmn-crown-sweep z-10" aria-hidden>👑</span>}
                <span className={`inline-flex rounded-full p-[2.5px] ${first ? 'tlmn-frame-gold' : 'bg-white/15'}`}>
                  <PodAvatar name={seatName(r.seat)} url={seatOf(r.seat)?.avatar_url ?? null} size={first ? 46 : 38} isBot={!!seatOf(r.seat)?.is_bot} seed={r.seat} />
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className={`font-bold truncate flex items-center gap-1.5 ${first ? 'text-[15px] text-[var(--tg-gold-bright)]' : 'text-[13px] text-white/90'}`}>
                  <span aria-hidden>{medals[rank] ?? '🏅'}</span>
                  <span className="truncate">{seatName(r.seat)}</span>
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[10px] text-white/55">
                  {r.isWinner ? <span className="text-[var(--tg-gold-bright)] font-bold">{t('score_winner')}</span> : <span>{t('score_cards', { n: r.cardsLeft })}</span>}
                  {r.cong && <span className="text-rose-200">{t('score_cong')}</span>}
                  {r.heldTwos > 0 && r.thoiHeoMult > 1 && <span className="text-rose-200">{t('score_thoiheo')} ×{r.thoiHeoMult}</span>}
                  {r.thoiBomUnits > 0 && <span className="text-rose-200">{t('score_thoibom')}</span>}
                </div>
              </div>
              <div className="text-right flex-none">
                <p className={`font-black leading-none ${r.total > 0 ? 'text-emerald-300' : r.total < 0 ? 'text-rose-300' : 'text-white/60'} ${first ? 'text-[18px]' : 'text-[15px]'}`}>
                  {r.total > 0 ? `+${r.total}` : r.total}
                </p>
                <p className="text-[9.5px] text-white/45 mt-0.5">{t('score_total')}: {cum}</p>
                <p className="tlmn-chip-balance text-[10px] font-black mt-0.5 inline-flex items-center gap-0.5">
                  <span aria-hidden className="text-[8px]">🪙</span>
                  <CountUp to={chips} reduced={reduced} format={formatChips} />
                  {chipDelta !== 0 && (
                    <span className={`ml-0.5 text-[9px] ${chipDelta > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {chipDelta > 0 ? '+' : ''}{formatChips(Math.abs(chipDelta)).replace(/^/, chipDelta < 0 ? '−' : '')}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Animated number tally (counts up/down to `to`). Reduced-motion shows it instantly.
function CountUp({ to, reduced, format }: { to: number; reduced: boolean; format: (n: number) => string }) {
  const [val, setVal] = useState(reduced ? to : Math.max(0, to - to * 0.04))
  useEffect(() => {
    if (reduced) { setVal(to); return }
    const from = val
    const start = performance.now()
    const dur = 900
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(from + (to - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, reduced])
  return <>{format(Math.round(val))}</>
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

// ── Emoji burst (gated behind reduced-motion by the caller) ─────────────────────────
// On-brand celebration in the site's design language — 🎉 / ✨ / 🥳 rise and fade from
// the centre of the felt. Pure overlay; never affects layout.
function EmojiBurst({ seed }: { seed: number }) {
  const glyphs = ['🎉', '✨', '🎊', '🥳', '💖', '⭐']
  const pieces = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => {
      const ang = ((seed * (i + 3) + i * 53) % 360) * (Math.PI / 180)
      const dist = 80 + ((seed * (i + 5)) % 90)
      return {
        glyph: glyphs[(seed + i) % glyphs.length],
        dx: Math.round(Math.cos(ang) * dist),
        dy: Math.round(Math.sin(ang) * dist) - 60, // bias upward
        delay: (i % 7) * 0.04,
        size: 20 + ((i * 7) % 16),
        rot: ((i * 47) % 60) - 30,
      }
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [seed])
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none z-20">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute"
          style={{ fontSize: p.size }}
          initial={{ x: 0, y: 0, scale: 0.4, opacity: 0, rotate: 0 }}
          animate={{ x: p.dx, y: p.dy, scale: 1, opacity: [0, 1, 1, 0], rotate: p.rot }}
          transition={{ duration: DURATIONS.BURST, ease: EASINGS.glide, delay: p.delay }}
        >
          {p.glyph}
        </motion.span>
      ))}
    </div>
  )
}

// ── Gold star burst (special combos / chặt — gated behind reduced-motion) ───────────
// A row of gold stars arcs up above the centre pile, like the reference's stars over
// a big play. Pure transform/opacity, capped count; reduced-motion never mounts it.
function GoldStars({ seed }: { seed: number }) {
  const stars = useMemo(() =>
    Array.from({ length: 9 }, (_, i) => {
      const t = (i / 8) - 0.5 // −0.5 … +0.5 across the arc
      return {
        sx: Math.round(t * 240),
        sy: Math.round(-90 - (1 - t * t * 4 > 0 ? (1 - t * t * 4) : 0) * 46), // parabola peak in the middle
        sr: ((seed + i * 53) % 90) - 45,
        size: 18 + ((i * 5) % 12),
        delay: (i % 5) * 0.035,
      }
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [seed])
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-visible pointer-events-none z-30">
      {stars.map((s, i) => (
        <span
          key={i}
          className="tlmn-star absolute"
          style={{
            // CSS custom props drive the keyframe end-state.
            ['--sx' as string]: `${s.sx}px`,
            ['--sy' as string]: `${s.sy}px`,
            ['--sr' as string]: `${s.sr}deg`,
            fontSize: s.size,
            animationDelay: `${s.delay}s`,
            color: '#f6d989',
          }}
        >
          ★
        </span>
      ))}
    </div>
  )
}

// ── Premium round-deal cascade (gated behind reduced-motion by the caller) ──────────
// Card backs fan out from the centre deck to every seat, one per DEAL_STAGGER, so the
// new round visibly "deals" around the table. Cosmetic only — the real hand has already
// been dealt server-side; this just animates the moment.
function DealFx({
  places, feltW, feltH, cardW,
}: { places: ('top' | 'left' | 'right' | 'bottom')[]; feltW: number; feltH: number; cardW: number }) {
  const dest = (place: 'top' | 'left' | 'right' | 'bottom') => {
    const hx = feltW * 0.4, hy = feltH * 0.4
    switch (place) {
      case 'top': return { x: 0, y: -hy, r: 0 }
      case 'bottom': return { x: 0, y: hy, r: 0 }
      case 'left': return { x: -hx, y: -feltH * 0.12, r: -90 }
      case 'right': return { x: hx, y: -feltH * 0.12, r: 90 }
    }
  }
  // Round-robin a few cards to each seat so the deal cascades evenly around the table.
  const PER = 3
  const seq: { place: 'top' | 'left' | 'right' | 'bottom'; n: number }[] = []
  for (let r = 0; r < PER; r++) for (const p of places) seq.push({ place: p, n: r })
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      {seq.map((s, i) => {
        const d = dest(s.place)
        return (
          <motion.span
            key={i}
            className="absolute"
            initial={{ x: 0, y: 0, scale: 0.7, opacity: 0, rotate: 0 }}
            animate={{ x: d.x, y: d.y, scale: 0.92, opacity: [0, 1, 1, 0], rotate: d.r }}
            transition={{
              duration: DURATIONS.DEAL, ease: EASINGS.settle,
              delay: i * DURATIONS.DEAL_STAGGER,
            }}
          >
            <CardBack w={cardW} />
          </motion.span>
        )
      })}
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

// Human-readable name of a detected selection, e.g. "Đôi 7", "Sảnh 3–7", "Tứ quý K".
function comboName(c: Combo, t: ReturnType<typeof useTranslations>): string {
  const high = RANKS[c.high.rank]
  switch (c.type) {
    case 'single': return t('comboname_single', { rank: high })
    case 'pair': return t('comboname_pair', { rank: high })
    case 'triple': return t('comboname_triple', { rank: high })
    case 'four': return t('comboname_four', { rank: high })
    case 'straight': {
      const s = sortHand(c.cards)
      return t('comboname_straight', { lo: RANKS[s[0].rank], hi: RANKS[s[s.length - 1].rank] })
    }
    case 'pairsRun': return t('comboname_pairsRun', { n: c.count / 2 })
  }
}

// Gold combo banner copy + whether it's a SPECIAL (full-gold + shine + stars) combo.
// Driven purely by the engine's combo TYPE — no rules are recomputed here. Bombs
// (tứ quý / đôi-thông) are the special ones; chặt-heo + tới-trắng get their own FX.
function comboBanner(c: Combo, t: ReturnType<typeof useTranslations>): { label: string; special: boolean } {
  switch (c.type) {
    case 'single': return { label: t('banner_single'), special: false }
    case 'pair': return { label: t('banner_pair'), special: false }
    case 'triple': return { label: t('banner_triple'), special: false }
    case 'straight': return { label: t('banner_straight', { n: c.count }), special: false }
    case 'four': return { label: t('banner_four'), special: true }
    case 'pairsRun': return { label: t('banner_pairsRun', { n: c.count / 2 }), special: true }
  }
}

// The combo shape the current player must match/beat (chip text). "Tự do" when leading.
function requiredComboLabel(table: Combo | null, t: ReturnType<typeof useTranslations>): string {
  if (!table) return t('req_free')
  switch (table.type) {
    case 'single': return t('req_single')
    case 'pair': return t('req_pair')
    case 'triple': return t('req_triple')
    case 'four': return t('req_four')
    case 'straight': return t('req_straight', { n: table.count })
    case 'pairsRun': return t('req_pairsRun', { n: table.count / 2 })
  }
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
