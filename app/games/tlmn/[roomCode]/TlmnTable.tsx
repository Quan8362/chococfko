'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import {
  parseCombo, beats, sortHand, legalMoves, isBomb, RANKS, DEFAULT_RULES,
  type Card, type Combo,
} from '@/lib/games/tlmn/engine'
import {
  fetchGameState, fetchMyHand, playCards, passTurn, tickTurnTimer, startNextRound, runBotTurn,
  fetchInteractionCatalog, spendInteraction, reportPlayer, fetchCoinBalances, leaveTable,
  type TlmnPublicGame, type TlmnSeat,
} from '../actions'
import { getWallet } from '../wallet'
import { CoinTierBadge } from '@/components/CoinTierBadge'
import CoinTierCelebration from '@/components/CoinTierCelebration'
import { getCoinTier, coinTierAria, type CoinTierTranslate, type CoinTier } from '@/lib/games/coinTier'
import { motion } from 'framer-motion'
import { CardFace, CardBack, OpponentFan, BotAvatar } from './TlmnCard'
import UserAvatar from '@/components/UserAvatar'
import { botThemeIndex } from '@/lib/games/tlmn/avatar'
import { useTlmnSound, type TlmnSoundName } from './useTlmnSound'
import { useTlmnInteractions, usePlayerMutes } from './useTlmnInteractions'
import { ReactionControl, PhraseBubbleLayer, ThrowableLayer, OpponentMenu, ReportDialog } from './TlmnInteractions'
import {
  getThrowable, resolveConfig, type CatalogConfig, type ReportReason,
} from '@/lib/games/tlmn/interactions'
import { TRANSITIONS, DURATIONS, EASINGS, MS } from '@/lib/games/motion'
import { useFullscreenLandscape } from '@/hooks/useFullscreenLandscape'
import { TlmnCards } from '../icons'

const cardKey = (c: Card) => `${c.rank}-${c.suit}`
const comboKeys = (cs: Card[]) => cs.map(cardKey)

// ── Custom table-board art (Run 6.3) ────────────────────────────────────────────────
// NOTE: the painted felt surface used for desktop / landscape / fullscreen. It is the
// ONLY place the asset path lives — swap this one constant to replace the board art. The
// board is sized in JS to BOARD_RATIO (its exact pixel ratio) so % anchors stay precise,
// and the scalable oval `.tlmn-felt` remains the working fallback (portrait + if the art
// is ever removed). Served from web/public/ → /tien-len-game-board-bg.webp.
const BOARD_SRC = '/tien-len-game-board-bg.webp'
const BOARD_W = 1672
const BOARD_H = 941
const BOARD_RATIO = BOARD_W / BOARD_H // ≈ 1.777 (16:9)

// Mobile / tablet LANDSCAPE table art. These REPLACE the old CSS-generated felt (rail +
// damask weave + medallion rings) on the full-bleed surface — one painted asset per
// breakpoint, selected by viewport width (mobile < 768 ≤ tablet < 1024 ≤ desktop). Served
// from web/public/. Rendered object-cover BEHIND the seats/pile/FX so the felt fills the
// stage edge-to-edge with no distortion; the tuned seat geometry (GEOMETRY.bleed/short) is
// unchanged, so all four seats + the centre pile stay aligned around the painted table.
const BOARD_MOBILE_SRC = '/tlmn-table-mobile-landscape.webp' // 1672×941 (16:9)
const BOARD_TABLET_SRC = '/tlmn-table-tablet-landscape.webp' // 1448×1086 (4:3)
const BLEED_TABLET_MIN = 768 // ≥ this width ⇒ tablet art, else mobile art
// Upper width bound for treating a COARSE-pointer (touch) device as a full-bleed tablet.
// Covers every common tablet landscape width — 1024, 1180, 1194, 1366 — so an iPad-class
// device never falls onto the desktop 16:9 board. A mouse desktop ignores this (fine pointer).
const TABLET_BLEED_MAX = 1366

// ── Game stacking order — SINGLE source of truth for layering ────────────────────────
// Within the board box:      table art (z-0) < seats (z-10) < centre pile (z-20) <
//                            visual FX (confetti/stars/crown z-30, throwables z-35) <
//                            in-pile combo badge (lives in the z-20 pile, painted above
//                            its own cards).
// Stage level (inside fs-root): result overlay z-[60] < top chrome z-[90] < menu z-[95].
// CRITICAL: `.tlmn-fs-root` sets a `transform`, which makes it the containing block AND a
// stacking context for EVERY absolute/fixed descendant. So an in-tree notification can never
// rise above the stage's own result overlay / chrome no matter its local z-index — it is
// capped by wherever its parent board box sits. Therefore ALL transient gameplay
// ANNOUNCEMENTS render in ONE body-portal layer at TLMN_NOTIFY_Z that escapes fs-root
// entirely and paints above every in-app layer, guaranteeing they are never hidden by cards,
// panels, effects, overlays or the responsive table art. It sits just BELOW the two blocking
// body-portal modals (portrait rotate ~2.147483e9, leave-confirm ~2.1474836e9) so those still
// own the screen when they are up. The layer is pointer-events:none (informational); any
// interactive notice opts pointer events back in on its own content only.
const TLMN_NOTIFY_Z = 2_147_482_000

// End-of-round presentation window: how long a live final move stays visible in the centre
// pile before the result modal reveals. Anchored to the card fly-in (MS.FLY) plus a readable
// hold so the last cards, their count and the combo badge can be identified — NOT an arbitrary
// timeout: the reveal is gated first on the authoritative ended state AND the final trick being
// present, then merely held this long so it can be seen.
const FINAL_PLAY_PRESENT_MS = Math.round(MS.FLY) + 1400

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

// Is the PRIMARY pointer coarse (finger)? True on phones + tablets, false on a mouse-driven
// desktop. Used ALONGSIDE width so a landscape tablet (iPad Pro is 1194/1366 CSS-wide — well
// past the 1024 desktop breakpoint) still gets the full-bleed touch table art instead of the
// framed desktop board. Reactive so a 2-in-1 that switches input modes re-evaluates.
function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(pointer: coarse)')
    const on = () => setCoarse(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return coarse
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

// Measure an element's content box (width + height). Used to size the board-image to the
// real available area so it can be fit to BOARD_RATIO with no distortion / no layout shift.
function useMeasuredSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      const cr = entries[0].contentRect
      setSize({ w: cr.width, h: cr.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

// Slot placement around the oval table, by number of OTHER players (clockwise from
// the seat after me). Spectators (no "me") fall back to the 4-slot ring.
const SLOTS: Record<number, string[]> = {
  1: ['top'],
  2: ['left', 'right'],
  3: ['right', 'top', 'left'],
  4: ['right', 'top', 'left', 'bottom'],
}
// ── Unified seat geometry — the SINGLE source of truth (Run 9 rebuild) ───────────────
// Every seat is placed by its AVATAR CENTRE as a breakpoint-aware % of the positioned
// stage box and consumed via translate(-50%,-50%), so the avatar sits ON its point — never
// above/below it (kills the "top avatar drifts to centre" / "side avatars drift up" bugs).
// The `band` is the EXCLUSIVE vertical strip the centre zone (pile + banner + label + hint)
// lives in, derived here so it can never overlap the top seat or the bottom hand dock. No
// element gets ad-hoc per-breakpoint coordinates anywhere else; they all derive from this.
type LayoutMode = 'desktop' | 'oval' | 'bleed' | 'short'
type SeatAnchor = { x: number; y: number; s?: number } // % centre (+ optional scale)
type SeatGeometry = {
  seats: Record<'top' | 'left' | 'right' | 'bottom', SeatAnchor>
  band: { top: number; bottom: number } // centre zone, % from the top edge
}
// Shared vertical centre for the desktop board's LEFT/RIGHT seats. Measured from the board
// artwork (web/public/tien-len-game-board-bg.webp, 1672×941): BOTH side-panel lotus emblems
// are radially symmetric about y ≈ 50.05% of the board image (verified independently per
// panel by vertical mirror-symmetry; the central mandala lands on the same line). Anchoring
// both side avatars to this ONE value lands each avatar's visual centre on its lotus and
// guarantees Bot 1 (right) and Bot 3 (left) share an identical Y. The previous value (47%)
// floated both avatars ~3% (≈14px rendered) above the lotuses. Consumed via the seat
// wrapper's translate(-50%,-50%) — the side-seat pod shrink-wraps to its avatar unit, so this
// is the avatar's true visual centre, not the cluster's. Only the horizontal x is mirrored.
const DESKTOP_SIDE_SEAT_CENTER_Y = 50
const GEOMETRY: Record<LayoutMode, SeatGeometry> = {
  // Desktop / landscape board image — roomy 16:9 felt.
  desktop: {
    seats: { top: { x: 50, y: 15 }, left: { x: 9, y: DESKTOP_SIDE_SEAT_CENTER_Y }, right: { x: 91, y: DESKTOP_SIDE_SEAT_CENTER_Y }, bottom: { x: 50, y: 86 } },
    // Centre band centred at 50% — the EXACT vertical centre of the board image, where the
    // painted central mandala (and the two side lotuses at y:50) live, so the played pile
    // lands ON the felt pattern and level with the left/right seats. Run 12f.
    band: { top: 42, bottom: 58 },
  },
  // Portrait oval fallback — sides pulled toward the upper corners + shrunk so their
  // vertical fans never spill off the narrow felt.
  oval: {
    seats: { top: { x: 50, y: 13 }, left: { x: 12, y: 33, s: 0.82 }, right: { x: 88, y: 33, s: 0.82 }, bottom: { x: 50, y: 88 } },
    band: { top: 30, bottom: 64 },
  },
  // Full-bleed mobile/tablet (edge-to-edge felt) — normal height. On these breakpoints the
  // top + side seats render in COMPACT mode (avatar + a horizontal info row that hangs to the
  // side, NOT a tall downward column), so the top seat hugs the top edge with ~one avatar's
  // height and the band below it is a clean, exclusive centre strip with a real gap. The band
  // is pushed DOWN to ≈ the true centre of the usable felt (below the top seat, above the
  // taller dock) so there's a generous empty gap under Bot 2 and the pile reads as the focus.
  bleed: {
    // Coordinate-space unification (Run 13): the full-bleed art is a STAGE-LEVEL background
    // (object-cover, centred) and the seat play area now spans that SAME box — the top chrome
    // OVERLAYS it rather than reserving a band above it — so image-% == area-%. The painted
    // side lotuses sit at the art's exact vertical centre, so the LEFT/RIGHT avatars anchor to
    // y:50 and land ON their lotus, perfectly mirrored and device-independent (50% is the one
    // cover-invariant line — it maps to image-centre at every viewport ratio). TOP hugs the
    // top edge (y:12), just clear of the compact overlay chrome whose CENTRE is empty (buttons
    // hug the corners) so the avatar never collides with a control. x:9/91 sits each side pod
    // in its lotus pocket, inset from the wooden rail so the name plate isn't pressed to it.
    seats: { top: { x: 50, y: 12 }, left: { x: 10, y: 50 }, right: { x: 90, y: 50 }, bottom: { x: 50, y: 90 } },
    // Centre band straddles the felt's OPTICAL centre — nudged a touch above the geometric
    // middle so the played pile clears the bottom hand while still reading on the central
    // mandala, with a clean gap under the top seat (y:12) and above the hand dock.
    band: { top: 39, bottom: 55 },
  },
  // Short-landscape phones (vh < 520) — same discipline as `bleed`. The overlay chrome is a
  // larger fraction of a short viewport, so TOP drops to y:15 to clear it; the sides stay on
  // the lotus (y:50); the band rides a touch higher since the compact dock owns more of the
  // short screen.
  short: {
    seats: { top: { x: 50, y: 15 }, left: { x: 9, y: 50 }, right: { x: 91, y: 50 }, bottom: { x: 50, y: 86 } },
    band: { top: 37, bottom: 54 },
  },
}
const seatTransform = (a: SeatAnchor) => `translate(-50%, -50%)${a.s ? ` scale(${a.s})` : ''}`

export default function TlmnTable({ roomId, seats, mySeat, isHost, inviteCode, onLeave }: Props) {
  const t = useTranslations('games.tlmn')
  const ct = useTranslations('coin_tier') as unknown as CoinTierTranslate
  const sound = useTlmnSound()
  const { w: vw, h: vh } = useViewport()
  const coarsePointer = useCoarsePointer()
  // Run 5 — fullscreen + landscape immersive mode (single source of truth).
  const fs = useFullscreenLandscape()
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // The rotate-overlay is portalled to <body> so it escapes the table's transformed +
  // overflow-clipped ancestors (iOS Safari mis-hit-tests an absolute layer inside those,
  // which made "Rời phòng" untappable). Portals need the DOM, so gate on mount.
  const [portalReady, setPortalReady] = useState(false)
  useEffect(() => { setPortalReady(true) }, [])
  const [trayRef, trayW] = useMeasuredWidth<HTMLDivElement>()
  // Live size of the play area — drives the aspect-correct board-image sizing (Run 6.3) AND
  // is the SINGLE positioning context every seat anchors to (see seatStyle). Seats are placed
  // as a % of THIS box, never relative to the page / window / chrome / PWA banner.
  const [areaRef, area] = useMeasuredSize<HTMLDivElement>()
  const [game, setGame] = useState<TlmnPublicGame | null>(null)
  const [hand, setHand] = useState<Card[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Stable interaction layer for the hand. The hit zones live in their own DOM layer
  // (hitLayerRef) with a fixed z-order, so a selected card's lift/z-index can never steal
  // a neighbour's tap target. dragRef tracks one in-flight pointer gesture (tap vs
  // horizontal drag-to-select) so each card toggles at most once per drag.
  const hitLayerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    card: Card
    key: string
    startX: number
    startY: number
    mode: 'pending' | 'drag'
    setTo: boolean
    toggled: Set<string>
  } | null>(null)
  // Hovered card index (mouse only) — drives a small desktop hover lift from the hit layer,
  // since the visual layer is pointer-events:none and can't receive :hover itself.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [sortMode, setSortMode] = useState<'rank' | 'suit'>('rank')
  const [error, setError] = useState<string | null>(null)
  const [dealing, setDealing] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // In-flight lock for play / pass / next-round. A plain boolean (NOT useTransition):
  // a server action wrapped in startTransition(async …) has no guaranteed release path,
  // so a rejected/slow/interrupted action could strand isPending TRUE and disable
  // EVERY action regardless of turn ("first play works, then stuck forever"). Here the
  // lock is set right before the request and ALWAYS cleared in finally + a safety
  // timeout, so it can only be true for the actual in-flight request.
  const [busy, setBusy] = useState(false)
  const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Voluntary-exit (forfeit) confirm flow: open the dialog only when leaving NOW would be
  // a penalised forfeit; track the in-flight settle so the confirm button can't double-fire.
  const [exitConfirm, setExitConfirm] = useState(false)
  const [exitBusy, setExitBusy] = useState(false)
  const [exitError, setExitError] = useState(false)
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
  // End-of-round PRESENTATION gate. `game.status === 'ended'` is the authoritative signal,
  // but the ended row also carries the winner's FINAL played cards (server keeps `trick`
  // populated on the out-play). We must render that final move in the centre pile BEFORE the
  // result modal / trophy covers it — otherwise the last cards flash invisibly behind the
  // podium. `resultReady` decouples the authoritative ended state from showing the result:
  // it flips only after the final trick has had time to fly in and be read.
  const [resultReady, setResultReady] = useState(false)
  const sawPlayingRef = useRef(false)  // did we watch THIS round live (vs. a cold load / reconnect into an ended round)
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevGameRef = useRef<TlmnPublicGame | null>(null)
  const reducedRef = useRef(false)

  useEffect(() => {
    try { reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch {}
  }, [])

  // Run 7 — my REAL persisted "xu" balance. Only my own wallet is readable (RLS
  // select-own), so other seats keep their session-derived display number. Loaded on
  // mount and re-fetched after each round settles so the display always matches the DB.
  const [myBalance, setMyBalance] = useState<number | null>(null)
  // Coin-rank badges at the table: my own balance is live (myBalance); opponents' current
  // balances are batch-read (authenticated RPC) and refreshed each new round. Tier is always
  // derived from the CURRENT balance — never a stored entitlement.
  const [seatBalances, setSeatBalances] = useState<Record<string, number>>({})
  // The REAL applied coin delta for my seat this round (post − pre balance, already
  // clamped server-side). Drives the podium delta; cleared when the next round deals.
  const [myRoundDelta, setMyRoundDelta] = useState<number | null>(null)
  const balanceRef = useRef<number | null>(null)
  const refreshBalance = useCallback(() => {
    getWallet().then(w => {
      if (!w || !mountedRef.current) return
      balanceRef.current = w.balance
      setMyBalance(w.balance)
    }).catch(() => {})
  }, [])
  useEffect(() => { refreshBalance() }, [refreshBalance])

  // ── Phase 3 — admin-configurable interaction economy ────────────────────────────────
  // Fetch the catalog config (cost / free-limit / enabled) once; visuals stay in code. A
  // key absent from the map is treated as enabled + free. Disabled items are hidden in the
  // panel. Empty map (pre-migration / error) ⇒ everything free, so the feature degrades safely.
  const [catalogMap, setCatalogMap] = useState<Map<string, CatalogConfig>>(new Map())
  useEffect(() => {
    let alive = true
    fetchInteractionCatalog()
      .then(rows => { if (alive && mountedRef.current) setCatalogMap(new Map(rows.map(r => [r.key, r]))) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // Phase 4 — per-player mute (client-only) + the opponent context menu / report dialog.
  const playerMutes = usePlayerMutes()
  const seatUserId = (seat: number): string | null => {
    const s = seats.find(x => x.seat_index === seat)
    return s && !s.is_bot ? (s.user_id ?? null) : null
  }
  // Batch-fetch seated opponents' current balances (re-run when the seated humans change
  // or a new round deals, so badges reflect post-settlement standings). My own seat uses the
  // live myBalance instead. Spectators/anon get {} (RPC is authenticated-only) → no badges.
  const seatHumanIdsKey = seats.filter(s => !s.is_bot && s.user_id).map(s => s.user_id).sort().join(',')
  useEffect(() => {
    const ids = seatHumanIdsKey ? seatHumanIdsKey.split(',') : []
    if (ids.length === 0) return
    let alive = true
    fetchCoinBalances(ids).then(map => { if (alive && mountedRef.current) setSeatBalances(prev => ({ ...prev, ...map })) })
    return () => { alive = false }
  }, [seatHumanIdsKey, game?.round_no])
  // Resolve a seat's coin tier (+ accessible label) from its CURRENT balance.
  const seatTier = (idx: number): { tier: CoinTier | null; label?: string } => {
    const uid = seatUserId(idx)
    if (!uid) return { tier: null }
    const bal = idx === mySeat && myBalance != null ? myBalance : seatBalances[uid]
    if (bal == null) return { tier: null }
    const def = getCoinTier(bal)
    return def ? { tier: def.key, label: coinTierAria(ct, def) } : { tier: null }
  }
  const [menuSeat, setMenuSeat] = useState<number | null>(null)
  const [reportSeat, setReportSeat] = useState<number | null>(null)
  const [reportSent, setReportSent] = useState(false)

  // ── Player interactions (Phase 1 bubbles + Phase 2 throwables + Phase 3 coin gate) ──
  // A transient broadcast layer kept fully separate from the authoritative game channel
  // (a reaction can never reorder a trick or delay a turn). onSpend server-validates a PAID
  // throwable BEFORE it's broadcast; always-free items skip the round-trip (instant).
  const interactions = useTlmnInteractions({
    roomId,
    mySeat,
    // Per-player mute: drop incoming events from a seat whose (human) user is muted by me.
    isSeatMuted: (seat: number) => playerMutes.isMuted(seatUserId(seat)),
    onSound: () => { if (!sound.muted && !reducedRef.current) sound.play('react') },
    onThrowImpact: (key: string) => {
      const def = getThrowable(key)
      if (!def) return
      if (!sound.muted) sound.play(def.sound as TlmnSoundName)
      if (def.vibrate && !reducedRef.current) sound.vibrate([0, 40, 30, 60])
    },
    onSpend: async (key, eventId) => {
      const cfg = resolveConfig(key, catalogMap)
      if (cfg.alwaysFree) return { ok: true } // no server round-trip for always-free items
      const res = await spendInteraction(roomId, key, eventId)
      if (res.ok) {
        if (mountedRef.current) { setMyBalance(res.balance); balanceRef.current = res.balance }
        return { ok: true }
      }
      return { ok: false, reason: res.error === 'insufficient_coins' ? 'insufficient' : 'error' }
    },
  })
  // Phase 2 — throwable target-selection mode (the picked item key, or null) + a brief
  // localized cooldown / insufficient-coins flash.
  const [targetingKey, setTargetingKey] = useState<string | null>(null)
  // A transient "this seat was just hit by a throwable" pulse — drives the avatar recoil on
  // the REAL target pod (synced to the burst's impact moment via ThrowableLayer.onImpact).
  // nonce re-triggers the CSS animation even when the same seat is hit twice in a row.
  const [hitPulse, setHitPulse] = useState<{ seat: number; impact: 'splat' | 'boom'; nonce: number } | null>(null)
  const hitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (hitTimerRef.current) clearTimeout(hitTimerRef.current) }, [])
  const onThrowImpactSeat = useCallback((toSeat: number, key: string) => {
    const def = getThrowable(key)
    if (!def || (def.impact !== 'splat' && def.impact !== 'boom')) return
    setHitPulse({ seat: toSeat, impact: def.impact, nonce: (typeof performance !== 'undefined' ? performance.now() : Date.now()) })
    if (hitTimerRef.current) clearTimeout(hitTimerRef.current)
    hitTimerRef.current = setTimeout(() => { if (mountedRef.current) setHitPulse(null) }, def.impact === 'boom' ? 620 : 520)
  }, [])
  const [reactCooldown, setReactCooldown] = useState(false)
  const [reactNotice, setReactNotice] = useState<string | null>(null)
  const reactCdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (reactCdTimer.current) clearTimeout(reactCdTimer.current) }, [])
  // Escape cancels target-selection cleanly (parity with the panel's Escape/outside-close).
  useEffect(() => {
    if (!targetingKey) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTargetingKey(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [targetingKey])

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

  // A fresh round (new game id) ⇒ drop any stale selection from the previous deal, and
  // reset the end-of-round presentation gate (this round has not been "watched live" yet
  // and its result must not be revealed until — and unless — it ends).
  useEffect(() => {
    setSelected(new Set()); setMyRoundDelta(null)
    setResultReady(false)
    sawPlayingRef.current = false
    if (revealTimerRef.current) { clearTimeout(revealTimerRef.current); revealTimerRef.current = null }
  }, [game?.id])

  // ── End-of-round presentation gate (the fix for "final move invisible behind result") ──
  // The server writes the winner's FINAL trick + status='ended' + result in ONE atomic row
  // update, so both clients receive the exact same final move alongside the ended flag. The
  // ordering we must guarantee on-screen is: (1) authoritative ended state confirmed, (2) the
  // final cards rendered in the centre pile + animated, then and only then (3) the result
  // modal / trophy. We therefore hold `resultReady` false while the final trick plays in, and
  // flip it after a short PRESENTATION window anchored to the card fly-in (not an arbitrary
  // constant — the modal is gated on the ended state AND the final trick being present first).
  // A cold load / reconnect into an already-ended round (we never saw it playing) and an
  // instant tới-trắng (no play was ever made) reveal the result immediately — there is no
  // final move to present.
  useEffect(() => {
    if (!game) return
    if (game.status === 'playing') { sawPlayingRef.current = true; return }
    if (game.status !== 'ended') return
    // Present the final move first only when we actually watched this round play out AND the
    // winning cards are in the authoritative snapshot; otherwise show the result at once.
    const hasFinalPlay = sawPlayingRef.current && !game.result?.instant && !!game.trick
    if (!hasFinalPlay) { setResultReady(true); return }
    if (resultReady || revealTimerRef.current) return // already revealed / reveal already scheduled
    revealTimerRef.current = setTimeout(() => {
      revealTimerRef.current = null
      if (mountedRef.current) setResultReady(true)
    }, FINAL_PLAY_PRESENT_MS)
  }, [game, resultReady])

  useEffect(() => () => { if (revealTimerRef.current) clearTimeout(revealTimerRef.current) }, [])

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
      setChac(null); setPassStamp(null)
      if (game.status === 'playing') {
        sound.play('deal')
        if (!reducedRef.current) setDealFxKey(Date.now()) // premium deal cascade
      }
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

      // Re-fetch the authoritative wallet after settlement (which runs server-side as
      // the round ends) and derive my REAL applied delta (post − pre). The short
      // delayed retry covers the tiny window between the realtime row update and
      // settle_round committing the coin deltas; both reads use the same `pre`.
      const pre = balanceRef.current
      const settle = () => getWallet().then(wal => {
        if (!wal || !mountedRef.current) return
        balanceRef.current = wal.balance
        setMyBalance(wal.balance)
        if (pre != null) setMyRoundDelta(wal.balance - pre)
      }).catch(() => {})
      settle()
      setTimeout(settle, 900)

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
  // Result-modal density: scale the WHOLE results panel (rows, avatars, fonts, footer)
  // down by viewport height so a 4-player round fits — title + all 4 rows + "VÁN MỚI" —
  // without scrolling on common landscape phones. Scroll is a fallback for very short
  // screens only (handled structurally in globals.css, never by hiding a row).
  const resultDensity: 'normal' | 'sm' | 'xs' = vh >= 520 ? 'normal' : vh >= 400 ? 'sm' : 'xs'
  // Run 8 — the bottom hand is a LOW, shallow fan tucked under the play area, so the
  // cards are deliberately smaller than the table props (pile/seats) and never dominate
  // the felt. Pile width is decoupled (≈ a touch larger) so the centre still reads big.
  const handW = shortVp
    ? Math.min(40, Math.round(vh * 0.115))
    : vw < 400 ? 46 : vw < 560 ? 50 : vw < 768 ? 54 : vw < 1024 ? 60 : 66
  const pileW = shortVp ? Math.round(handW * 0.9) : vw < 768 ? 54 : vw < 1024 ? 60 : 66
  const seatBackW = vw < 768 ? 15 : 18
  const tableHByWidth = vw < 560 ? 300 : vw < 768 ? 360 : vw < 1024 ? 420 : 480
  // Never let the table grow taller than the viewport can hold (landscape phones).
  const tableH = Math.min(tableHByWidth, Math.max(220, Math.round(vh * 0.52)))

  // ── Board surface mode (Run 6.3) ───────────────────────────────────────────────
  // Landscape / desktop / fullscreen ⇒ the custom WebP board (premium felt). Portrait
  // (clearly taller than wide) ⇒ the scalable oval `.tlmn-felt` fallback, re-tuned to
  // the board's green palette. The fixed-ratio image can't fit portrait, so this is the
  // one real limitation (Feature 7) — the rotate hint + fullscreen nudge it to landscape.
  const portrait = vh > vw * 1.05
  // Mobile + tablet ⇒ full-bleed responsive felt (Approach A): the table fills the whole
  // stage edge-to-edge — no 16:9 letterbox, no vignette surround. Desktop keeps the framed
  // board image + green surround exactly as before. The vw>0 guard keeps the SSR/first-paint
  // default (1024) on the desktop path until measured.
  //   • width < 1024                      → always full-bleed (phones + small tablets)
  //   • coarse pointer AND width ≤ 1366   → full-bleed too, so a landscape TABLET (iPad
  //     1024/1180/1194/1366 all sit above the old 1024 cutoff yet report a coarse primary
  //     pointer) uses the touch table art instead of falling onto the desktop board. A
  //     mouse-driven laptop keeps the desktop board even when narrowed below 1366.
  const fullBleed = vw > 0 && (vw < 1024 || (coarsePointer && vw <= TABLET_BLEED_MAX))
  // Which painted table art the full-bleed surface uses — tablet art from 768px up, mobile
  // art below. Same width breakpoint the rest of the board uses (minStrip / seatBackW).
  const bleedBoardSrc = vw >= BLEED_TABLET_MIN ? BOARD_TABLET_SRC : BOARD_MOBILE_SRC
  const useImage = !portrait
  // Fit the board to the live play area at the image's exact ratio (no distortion). The
  // area starts at 0 before the ResizeObserver fires; a viewport-based default keeps the
  // first paint sane (zero layout shift once measured, since the box already has its size).
  const board = useMemo(() => {
    const aw = area.w || Math.min(vw * 0.92, 1180)
    const ah = area.h || Math.max(240, vh * 0.62)
    if (aw / ah > BOARD_RATIO) return { w: Math.round(ah * BOARD_RATIO), h: Math.round(ah) }
    return { w: Math.round(aw), h: Math.round(aw / BOARD_RATIO) }
  }, [area.w, area.h, vw, vh])

  // Hand fan: spread cards across the measured tray, overlapping only as much as
  // needed so faces stay legible (never shrink the cards to fit). The fit formula
  //   overlap = clamp(minStrip, (containerW − cardW)/(n−1))   [+ a safety inset]
  // guarantees the LAST card is fully visible with symmetric padding — zero right
  // cutoff — at every breakpoint, while keeping each card's exposed strip tappable.
  const handCount = hand.length
  const FAN_SAFE = 14 // reserve px for rotation overhang at the fan's ends
  // Minimum exposed tap strip per card, by device, so two adjacent cards always present a
  // finger-sized target (mobile-landscape ≈28 · tablet ≈34 · desktop ≈38 px). The floor is
  // capped to whatever actually fits (and to ≤82% of the card so a slight overlap remains),
  // so the fan never overflows the tray on narrow screens.
  const minStrip = vw < 768 ? 28 : vw < 1024 ? 34 : 38
  const fanStep = useMemo(() => {
    if (handCount <= 1) return handW
    const fit = trayW > 0 ? (trayW - handW - FAN_SAFE) / (handCount - 1) : handW * 0.62
    // compact: spread to fill the tray but cap the overlap so the fan stays a slim strip.
    // floor: never tighter than the device's tappable minimum, unless that would overflow.
    const compact = Math.min(handW * 0.62, fit)
    const floor = Math.min(minStrip, handW * 0.82, fit)
    return Math.max(compact, floor)
  }, [trayW, handW, handCount, minStrip])
  // Arc + parabolic lift — kept SHALLOW so the hand reads as a low fan along the bottom
  // edge, never an arc that bows up into the play area (token --fan-arc).
  const maxArc = vw < 560 ? 5 : vw < 768 ? 6 : 7
  // Restrained selected-card lift: enough to read as "raised + grouped", small enough that
  // it never covers the next card's rank/suit (≈14px mobile · ≈18px desktop). Vertical only
  // — no scale, no sideways shift — so the hit zone stays aligned under each card.
  const liftSel = vw < 768 ? 14 : 18

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const setCardSelected = useCallback((c: Card, select: boolean) => {
    const k = cardKey(c)
    setError(null)
    setSelected(prev => {
      if (prev.has(k) === select) return prev
      const next = new Set(prev)
      if (select) next.add(k); else next.delete(k)
      return next
    })
  }, [])

  const toggleCard = (c: Card) => {
    setError(null)
    setSelected(prev => {
      const k = cardKey(c)
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  // ── Hand interaction: stable tap zones + horizontal drag-to-select ───────────────
  // Pointer events (mouse/touch/stylus) drive the hit layer. A press that doesn't move is a
  // plain tap (toggle on release); a press dragged horizontally paints every crossed card to
  // the first card's new state (each card once per gesture). A vertical drag is left to the
  // page (touch-action: pan-y) and abandons the gesture without selecting.
  const cardAtClientX = useCallback((x: number, y: number): Card | null => {
    const el = typeof document !== 'undefined' ? document.elementFromPoint(x, y) : null
    const hit = (el as HTMLElement | null)?.closest('[data-tlmn-card]') as HTMLElement | null
    if (!hit) return null
    const idx = Number(hit.dataset.tlmnCard)
    return Number.isInteger(idx) ? displayHand[idx] ?? null : null
  }, [displayHand])

  const onHitPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const card = cardAtClientX(e.clientX, e.clientY)
    if (!card) return
    dragRef.current = {
      pointerId: e.pointerId, card, key: cardKey(card),
      startX: e.clientX, startY: e.clientY, mode: 'pending',
      setTo: !selected.has(cardKey(card)), toggled: new Set([cardKey(card)]),
    }
    try { hitLayerRef.current?.setPointerCapture(e.pointerId) } catch { /* unsupported */ }
  }

  const onHitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (d.mode === 'pending') {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) { dragRef.current = null; return } // vertical → page scroll
      if (Math.abs(dx) < 8) return // not yet a deliberate horizontal drag
      d.mode = 'drag'
      setCardSelected(d.card, d.setTo)
      if (d.setTo) sound.vibrate(8)
    }
    e.preventDefault()
    const card = cardAtClientX(e.clientX, e.clientY)
    if (card) {
      const k = cardKey(card)
      if (!d.toggled.has(k)) {
        d.toggled.add(k)
        setCardSelected(card, d.setTo)
        if (d.setTo) sound.vibrate(8)
      }
    }
  }

  const endHitGesture = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (d && e.pointerId === d.pointerId) {
      if (d.mode === 'pending' && e.type === 'pointerup') {
        toggleCard(d.card) // plain tap
        if (d.setTo) sound.vibrate(8)
      }
      try { hitLayerRef.current?.releasePointerCapture(d.pointerId) } catch { /* noop */ }
    }
    dragRef.current = null
  }

  // Run a server action behind the in-flight lock. The lock is GUARANTEED to release:
  // finally clears it on success AND error/reject, and a safety timeout force-clears it
  // if the request hangs — so a missed realtime event or a thrown action can never
  // strand the buttons disabled. refreshAll() runs in finally so our own move advances
  // without waiting on realtime.
  const runLocked = useCallback((fn: () => Promise<{ error?: string } | null | void>) => {
    setBusy(true)
    if (busyTimer.current) clearTimeout(busyTimer.current)
    busyTimer.current = setTimeout(() => { if (mountedRef.current) setBusy(false) }, 6000)
    ;(async () => {
      try {
        const res = await fn()
        if (res && 'error' in res && res.error) { setError(res.error); setInvalidKey(k => k + 1); return }
        setSelected(new Set())
      } catch {
        setError('play_err_generic'); setInvalidKey(k => k + 1)
      } finally {
        if (busyTimer.current) { clearTimeout(busyTimer.current); busyTimer.current = null }
        if (mountedRef.current) setBusy(false)
        refreshAll()
      }
    })()
  }, [refreshAll])

  const doPlay = () => {
    if (!isMyTurn || selectedCards.length === 0 || busy) return
    if (!canPlay) { setInvalidKey(k => k + 1); setError('illegal_move'); sound.vibrate(20); return }
    setError(null)
    runLocked(() => playCards(roomId, selectedCards))
  }

  const doPass = () => {
    if (!canPass || busy) return
    setError(null)
    runLocked(() => passTurn(roomId))
  }

  const doNextRound = () => {
    if (busy) return
    runLocked(() => startNextRound(roomId))
  }

  // Leaving NOW is a penalised forfeit iff a round is live AND I still hold cards (so NOT
  // on the result screen, NOT already out). Mirrors the server's authoritative check; the
  // server re-verifies and is idempotent, so this only decides whether to warn first.
  const exitWouldForfeit =
    !!game && game.status === 'playing' && mySeat != null &&
    (game.card_counts?.[String(mySeat)] ?? 0) > 0

  // Run the actual leave: settle on the server FIRST (forfeit or plain), and only navigate
  // away once it succeeds. On failure keep the player at the table and surface the error.
  const runExit = useCallback(async () => {
    if (exitBusy) return
    setExitBusy(true)
    setExitError(false)
    try {
      const res = await leaveTable(roomId)
      if ('error' in res) { setExitError(true); setExitBusy(false); return }
      onLeave()
    } catch {
      setExitError(true)
      setExitBusy(false)
    }
  }, [roomId, onLeave, exitBusy])

  // Exit button entry point: warn before a forfeit, leave straight away otherwise.
  const requestExit = useCallback(() => {
    if (exitBusy) return
    if (exitWouldForfeit) { setExitError(false); setExitConfirm(true) }
    else void runExit()
  }, [exitBusy, exitWouldForfeit, runExit])

  // Clear the safety timer on unmount.
  useEffect(() => () => { if (busyTimer.current) clearTimeout(busyTimer.current) }, [])

  // TEMP DIAGNOSTIC (Run-7 action-bar fix) — remove after verification. Fires only at a
  // genuinely-stuck moment: it's my turn yet BOTH actions are disabled while the lock is
  // held OR an active pile exists (i.e. NOT the legitimate "I lead, nothing selected"
  // state). Captures every gating boolean + the server turn vs my seat.
  useEffect(() => {
    if (!isMyTurn) return
    const playDisabled = selectedCards.length === 0 || busy || !canPlay
    const passDisabled = !canPass || busy
    if (playDisabled && passDisabled && (busy || !!game?.trick)) {
      // eslint-disable-next-line no-console
      console.warn('[TLMN action-bar STUCK]', {
        isMyTurn, busy, canPlay, canPass, selected: selectedCards.length,
        turn_seat: game?.turn_seat, mySeat, hasTrick: !!game?.trick, status: game?.status,
      })
    }
  }, [isMyTurn, busy, canPlay, canPass, selectedCards.length, game, mySeat])

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

  // ── Surface-mode placement (Run 6.3) ───────────────────────────────────────────
  // The SAME seat/center/FX layer renders over either surface; only the % anchors, the
  // deal-cascade dimensions, and the centre block's vertical band change per mode. In
  // image mode the hand-dock overlays the board's bottom, so the centre sits in the
  // upper band (clear of the dock); in oval mode the dock is a flow bar below the felt.
  const compactDock = (fullBleed || useImage) && shortVp
  // One layout mode selects ONE geometry; seats + centre band both derive from it.
  const mode: LayoutMode = fullBleed
    ? (shortVp ? 'short' : 'bleed')
    : !useImage ? 'oval' : shortVp ? 'short' : 'desktop'
  // Desktop board-image layout — the ONLY mode that gets the rebuilt bottom dock (player
  // info panel replacing Gợi ý in the action row + Sắp xếp anchored to the hand's
  // top-right). Mobile/tablet (bleed) and portrait (oval) keep their existing docks.
  const isDesktop = mode === 'desktop'
  const geom = GEOMETRY[mode]
  // EVERY seat is anchored purely as a % of the inner play area (areaRef / the board box) —
  // the single positioning context. No seat is ever tied to the page, window, browser
  // toolbar/chrome height, or the PWA install banner: those are out-of-flow overlays that
  // must never move a seat. On full-bleed the play area spans the WHOLE stage (the compact
  // chrome overlays its top edge), so it shares the painted art's coordinate box 1:1 — the
  // side seats' y:50 lands on the lotus and the top seat's low y clears the corner controls
  // (whose centre is empty). Scales fluidly from a 320px phone to a 1366px tablet, no per-
  // device coordinates.
  const seatStyle = (place: string): CSSProperties => {
    const a = geom.seats[(place as 'top' | 'left' | 'right' | 'bottom')] ?? geom.seats.top
    return { left: `${a.x}%`, top: `${a.y}%`, transform: seatTransform(a) }
  }
  // The exclusive centre band: a flex strip whose top sits below the top seat and whose
  // bottom stays above the hand dock, so the pile/banner own their own vertical space.
  const centerWrapStyle: CSSProperties = { top: `${geom.band.top}%`, bottom: `${100 - geom.band.bottom}%` }
  // Phrase bubbles reuse the SAME seat geometry as the pods, so a bubble always hangs off
  // the correct avatar at every breakpoint (my seat → bottom dock, others → their felt edge).
  const bubblePlace = (seat: number): string => (mySeat != null && seat === mySeat ? 'bottom' : placeOfSeat(seat))
  const bubbleAnchor = (seat: number): CSSProperties => seatStyle(bubblePlace(seat))
  // Pixel coords of a seat's avatar within the board box — the SAME % geometry the pods
  // use, scaled by the board's measured pixel size (dealW/dealH). Feeds the throwable arc.
  const throwCoord = (seat: number): { x: number; y: number } => {
    const a = geom.seats[(bubblePlace(seat) as 'top' | 'left' | 'right' | 'bottom')] ?? geom.seats.top
    return { x: (a.x / 100) * dealW, y: (a.y / 100) * dealH }
  }
  const flashReactCooldown = (notice?: string) => {
    setReactNotice(notice ?? null)
    setReactCooldown(true)
    if (reactCdTimer.current) clearTimeout(reactCdTimer.current)
    reactCdTimer.current = setTimeout(() => { if (mountedRef.current) { setReactCooldown(false); setReactNotice(null) } }, 1800)
  }
  const throwAt = (seat: number) => {
    if (!targetingKey) return
    const key = targetingKey
    setTargetingKey(null)
    void interactions.sendThrowable(key, seat).then(res => {
      if (!mountedRef.current) return
      if (res === 'insufficient') flashReactCooldown(t('react_insufficient'))
      else if (res === 'error') flashReactCooldown(t('react_send_failed'))
      else if (res === 'cooldown') flashReactCooldown()
    })
  }
  // ── Phase 4: opponent context menu + report ──────────────────────────────────────────
  const openSeatMenu = (seat: number) => {
    if (targetingKey) return                       // targeting owns the seats during a throw
    if (mySeat != null && seat === mySeat) return  // not my own seat
    if (!seatUserId(seat)) return                  // human opponents only (no bots)
    setMenuSeat(seat)
  }
  const handleMutePlayer = (seat: number) => {
    const uid = seatUserId(seat)
    if (uid) playerMutes.toggle(uid)
    setMenuSeat(null)
  }
  const handleSubmitReport = (reason: ReportReason) => {
    const seat = reportSeat
    setReportSeat(null)
    if (seat == null) return
    const uid = seatUserId(seat)
    if (!uid) return
    // Attach ONLY recent interaction keys/seats from this player — no chat, no PII.
    const recent = { keys: interactions.getRecentForSeat(seat) }
    void reportPlayer(uid, roomId, reason, recent).then(res => {
      if (mountedRef.current && res.ok) {
        setReportSent(true)
        setTimeout(() => { if (mountedRef.current) setReportSent(false) }, 2400)
      }
    })
  }
  const dealW = fullBleed ? (area.w || vw) : useImage ? board.w : feltW
  const dealH = fullBleed ? (area.h || vh) : useImage ? board.h : tableH
  const boardEntrance = reduced ? false : { opacity: 0, scale: 0.975 }
  const boardTransition = reduced ? { duration: 0 } : { duration: DURATIONS.SETTLE, ease: EASINGS.settle }

  // Seats + centre pile + transient FX — positioned by % so they scale exactly with the
  // surface (board image OR oval felt). Real elements win over the painted slots.
  const boardContents = (
    <>
      {/* Opponent / other seats. data-seat-slot drives the portrait corner-seat CSS
          (oval mode only); in image mode the anchors land seats in the painted slots. */}
      {orderedOthers.map((idx, i) => {
        const human = !!seatUserId(idx)
        const playerMuted = human && playerMutes.isMuted(seatUserId(idx))
        const st = seatTier(idx)
        return (
        <div key={idx} data-seat-slot={slotList[i] ?? 'top'} className="tlmn-seat absolute z-10" style={seatStyle(slotList[i] ?? 'top')}>
          <SeatPod
            seat={seatOf(idx)}
            name={seatName(idx)}
            isMe={false}
            tier={st.tier}
            tierLabel={st.label}
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
            compact={fullBleed}
            reduced={reducedRef.current}
            hit={hitPulse && hitPulse.seat === idx ? { impact: hitPulse.impact, nonce: hitPulse.nonce } : null}
            t={t}
          />
          {/* Phase 4: tap to mute/report this opponent (human seats only, not while targeting). */}
          {human && !targetingKey && (
            <button
              type="button"
              onClick={() => openSeatMenu(idx)}
              aria-label={t('react_player_menu', { name: seatName(idx) })}
              className="tlmn-seat-menu-btn absolute -top-1 -right-1 z-20"
            >⋯</button>
          )}
          {playerMuted && (
            <span className="absolute -bottom-0.5 -right-0.5 z-20 text-[12px] drop-shadow" title={t('react_muted_player')} aria-hidden>🔇</span>
          )}
        </div>
        )
      })}

      {/* PROTECTED CENTRE PILE — the SINGLE place any played card renders. Its own exclusive
          band (z-20, above the seat wrappers at z-10) so the pile is never covered by an
          avatar, chip stack or opponent fan, and never extends up into the top seat or down
          into the hand (the band's top/bottom are derived to sit clear of both). The round
          result is a separate overlay. */}
      <div className="tlmn-center-zone absolute left-0 right-0 z-20 flex items-center justify-center px-4 pointer-events-none" style={centerWrapStyle}>
        {/* The painted table art carries its own centre design on full-bleed mobile/tablet, so
            the old CSS medallion rings were removed here (obsolete CSS-generated artwork). */}
        {/* While an ended round is still PRESENTING its final move (resultReady=false and a
            final trick exists), keep rendering that trick's cards in the pile so the last play
            stays visible + animates in; only swap to the winner trophy once the result reveals
            (or there was no final play, e.g. tới trắng). */}
        {ended && (resultReady || !game.trick) ? (
          <CenterEnd game={game} seatName={seatName} t={t} />
        ) : game.trick ? (
          // `relative` + the badge below positioned ABSOLUTELY → the card pile is the ONLY
          // in-flow content, so it sits exactly at the band centre (on the felt medallion),
          // never nudged up by the special-combo badge.
          <div key={comboKeys(game.trick.cards).join()} className="relative flex flex-col items-center">
            {/* PROTECTED CENTRE ZONE — only the played cards live here. No actor label, no
                "to beat" hint, no big combo pill. Attribution is handled at each seat (turn
                ring + thinking dots), and the cards themselves communicate the combo. The
                ONLY chrome allowed is a tiny, low-emphasis badge for SPECIAL combos (tứ quý
                / đôi thông), rendered BELOW the pile so it never overlaps a card. */}
            {/* Faint ghost of the prior stacked plays, giving the pile depth. */}
            <div className="relative flex justify-center mt-0.5" style={{ perspective: 700 }}>
              {sortHand(game.trick.cards).map((c, i) => {
                const mine = mySeat != null && game.trick!.by_seat === mySeat
                const ml = i === 0 ? 0 : -Math.round(pileW * 0.28)
                if (reduced) {
                  return <span key={cardKey(c)} style={{ marginLeft: ml }}><CardFace card={c} w={pileW} /></span>
                }
                // Each card flies in from its actor's seat and settles. Opponent cards
                // (face-down) also flip face-up mid-flight; my own cards are already
                // face-up so they just fly. A small mini settles by the actor in parallel.
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
            {/* Tiny special-combo badge — outside the played-card box, low emphasis. */}
            {tableCombo && (() => {
              const b = comboBanner(tableCombo, t)
              if (!b.special) return null
              return (
                <span className="tlmn-combo-banner tlmn-banner-shine tlmn-banner-in absolute top-full left-1/2 -translate-x-1/2 mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide opacity-90 whitespace-nowrap">
                  {b.label}
                </span>
              )
            })()}
          </div>
        ) : (
          // Lead / no-trick state: ONLY the localized "X ra bài tự do" status, centred in the
          // same protected band the pile uses. The decorative 2♥ deuce graphic (a two-card
          // icon) was removed — it read as two stray miniature cards floating by the centre
          // pile. Attribution is already carried by the active seat's turn ring + thinking dots.
          <p className="text-[12px] text-white/75 text-center">
            {game.turn_seat != null ? t('lead_free_by', { name: seatName(game.turn_seat) }) : ''}
          </p>
        )}
      </div>

      {/* Chặt! felt FLASH only — a background white flash of the felt. The readable "Chặt
          heo/bom" banner + đền line render in the topmost body-portal notify layer (see
          notifyLayer), so the announcement can never be trapped behind the played pile, the
          seat pods, the FX or the result overlay. This flash stays under the cards by design. */}
      {chac && <div className="absolute inset-0 bg-white tlmn-flash pointer-events-none" />}

      {/* Premium round-deal cascade — cards fan from the centre deck out to every seat,
          staggered around the table. Reduced-motion never triggers it. Cosmetic only. */}
      {dealFxOn && <DealFx places={dealPlaces} feltW={dealW} feltH={dealH} cardW={dealBackW} />}

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

      {/* Penalty (thối heo / đền / cóng) toast now renders in the topmost notify layer (see
          notifyLayer) — at round end the result overlay used to cover this seat-anchored toast;
          in the portal it stays visible above the podium and carries the seat name for context. */}

      {/* Player-interaction phrase bubbles — anchored to each sender's avatar, transient,
          pointer-events:none (never blocks card/button taps or shifts the layout). */}
      <PhraseBubbleLayer bubbles={interactions.bubbles} anchorStyle={bubbleAnchor} placeOf={bubblePlace} t={t} />

      {/* Throwables in flight + their impact bursts (Phase 2). */}
      <ThrowableLayer throws={interactions.throws} coordOf={throwCoord} reduced={reduced} onImpact={onThrowImpactSeat} />

      {/* Target-selection mode: dim backdrop (tap to cancel) + a pulsing pick ring over
          each opponent avatar. Only opponents are selectable; tapping sends the item. */}
      {targetingKey && (
        <>
          <button
            type="button"
            aria-label={t('react_cancel')}
            onClick={() => setTargetingKey(null)}
            className="absolute inset-0 z-[56] bg-black/45 backdrop-blur-[1px] cursor-pointer"
          />
          <div className="absolute left-1/2 -translate-x-1/2 z-[59] flex items-center gap-2 tlmn-banner-pop" style={{ top: '5%' }}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-paper/95 px-3 py-1.5 text-[12px] font-bold text-ink shadow-lg">
              <span aria-hidden>{getThrowable(targetingKey)?.emoji}</span>
              {t('react_pick_target')}
            </span>
            <button
              type="button"
              onClick={() => setTargetingKey(null)}
              className="rounded-full bg-rose text-white px-3.5 py-1.5 text-[12px] font-bold hover:bg-rose-deep transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {t('react_cancel')}
            </button>
          </div>
          {orderedOthers.map((idx, i) => (
            <button
              key={idx}
              type="button"
              onClick={e => { e.stopPropagation(); throwAt(idx) }}
              aria-label={t('react_send_item_to', { item: t(`react_item_${targetingKey}` as Parameters<typeof t>[0]), name: seatName(idx) })}
              className="tlmn-target-pick absolute z-[58]"
              style={seatStyle(slotList[i] ?? 'top')}
            >
              <span className="tlmn-target-ring" aria-hidden />
            </button>
          ))}
        </>
      )}

      {/* Throwable notice flash (cooldown / insufficient-coins / failed) now renders in the
          topmost notify layer (see notifyLayer) so it is never trapped behind the felt. */}

      {/* Phase 4: opponent context menu (mute / report) anchored at the seat. */}
      {menuSeat != null && (
        <OpponentMenu
          style={seatStyle(bubblePlace(menuSeat))}
          name={seatName(menuSeat)}
          muted={playerMutes.isMuted(seatUserId(menuSeat))}
          onMute={() => handleMutePlayer(menuSeat)}
          onReport={() => { const s = menuSeat; setMenuSeat(null); setReportSeat(s) }}
          onClose={() => setMenuSeat(null)}
          t={t}
        />
      )}
      {/* Report dialog (reason picker) — centered modal, kept below the chrome z so the exit stays usable. */}
      {reportSeat != null && (
        <ReportDialog name={seatName(reportSeat)} onSubmit={handleSubmitReport} onClose={() => setReportSeat(null)} t={t} />
      )}

      {/* Voluntary-exit confirm — shown ONLY when leaving now would forfeit (live round, cards
          in hand). PORTALLED to <body> at a z ABOVE the portrait rotate overlay (which is also
          a body portal at ~2.1e9): otherwise this dialog rendered INSIDE the transformed stage
          at z-[100] and was hidden BEHIND the rotate overlay, so "Rời phòng" looked dead and
          trapped the player in portrait. As a body portal it's always visible + tappable. */}
      {exitConfirm && portalReady && createPortal(
        <div role="dialog" aria-modal="true" aria-label={t('leave_confirm_title')} className="fixed inset-0 flex items-center justify-center px-4" style={{ zIndex: 2147483600, background: 'rgba(6,14,10,0.72)' }}>
          <button type="button" aria-label={t('leave_confirm_stay')} onClick={() => { if (!exitBusy) setExitConfirm(false) }} className="absolute inset-0" />
          <div className="tlmn-banner-pop relative w-full max-w-[340px] rounded-2xl bg-paper shadow-2xl border border-line p-4">
            <p className="text-[15px] font-bold text-ink mb-1.5">{t('leave_confirm_title')}</p>
            <p className="text-[12.5px] text-muted mb-3 leading-relaxed">{t('leave_confirm_desc')}</p>
            {exitError && (
              <p className="text-[12px] font-semibold text-rose bg-rose/10 border border-rose/25 rounded-lg px-3 py-2 mb-3">{t('leave_confirm_error')}</p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={runExit}
                disabled={exitBusy}
                className="w-full rounded-xl bg-rose hover:bg-rose-deep text-white text-[13.5px] font-bold py-2.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {exitBusy ? t('leave_confirm_processing') : t('leave_confirm_leave')}
              </button>
              <button
                type="button"
                onClick={() => { if (!exitBusy) setExitConfirm(false) }}
                disabled={exitBusy}
                className="w-full rounded-xl bg-ink/5 text-muted text-[13.5px] font-bold py-2.5 hover:bg-ink/10 disabled:opacity-60"
              >
                {t('leave_confirm_stay')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {/* Report-sent confirmation now renders in the topmost notify layer (see notifyLayer). */}
    </>
  )

  // Human (bottom-seat) avatar + turn-timer + the Sắp xếp pill, factored out so the
  // SAME nodes serve the normal portrait/desktop info row AND the compact short-landscape
  // corner layout (where they move into the hand-tray's bottom corners, out of the dock's
  // vertical flow). Only rendered inside the `mySeat != null` dock, so the mySeat! is safe.
  const humanAvatar = mySeat == null ? null : (
    // shrink-0 + aspect-square: the gold-frame wrapper is a flex child of the (width-
    // constrained) desktop info panel, so without these it gets compressed horizontally
    // into an oval when the name/balance competes for space. Keep it a fixed square circle.
    <span className={`relative inline-flex shrink-0 aspect-square rounded-full p-[3px] tlmn-frame-gold ${isMyTurn && !reduced ? 'tlmn-frame-active' : ''}`}>
      <PodAvatar name={seatName(mySeat)} url={seatOf(mySeat)?.avatar_url ?? null} size={compactDock ? 34 : vw < 560 ? 38 : 46} />
      {/* My live coin-rank badge (top-left, clear of the turn timer at bottom-right). */}
      {(() => {
        const st = seatTier(mySeat)
        return st.tier && st.label ? (
          <span className="absolute -left-1.5 -top-1 z-20">
            <CoinTierBadge tier={st.tier} size={compactDock ? 'xs' : 'sm'} label={st.label} />
          </span>
        ) : null
      })()}
      {isMyTurn && secondsLeft != null && (
        <span
          className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center ${secondsLeft <= 5 ? 'tlmn-timer-warn' : ''}`}
          style={{ background: `conic-gradient(${secondsLeft <= 5 ? '#ff5a8c' : '#7fe3f0'} ${turnFrac * 360}deg, rgba(0,0,0,0.45) 0deg)` }}
        >
          <span className="absolute inset-[2px] rounded-full bg-ink flex items-center justify-center text-[10px] font-bold text-white">{secondsLeft}</span>
        </span>
      )}
    </span>
  )
  const sortButton = (
    // A secondary utility, not a primary action — so on full-bleed (mobile/tablet) it is
    // deliberately smaller than the gold gradient would otherwise read, keeping it from
    // dominating the felt or competing with Đánh/Bỏ lượt. Desktop keeps the roomier pill.
    <button
      type="button"
      onClick={() => setSortMode(m => (m === 'rank' ? 'suit' : 'rank'))}
      className={`tlmn-btn-gold flex-none font-black uppercase tracking-wide rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
        fullBleed ? 'text-[10.5px] px-2.5 py-1' : 'text-[12px] px-3.5 py-1.5'
      }`}
    >
      ↕ {t('sort_btn')}
    </button>
  )

  // Unified local-player info panel — lives in the bottom-left of the action row on EVERY
  // surface (desktop, mobile/tablet bleed, portrait oval, short-landscape), permanently
  // REPLACING the removed "Gợi ý" button. A flat pill (not a button) so it can never be
  // mistaken for an action control; the name truncates with ellipsis and the balance sits
  // beneath it. The turn-status line is dropped in the compact short-landscape dock so the
  // panel stays single-row and the dock never grows tall. This is the single place the
  // local player's identity renders inside the bottom control zone — it never floats up
  // beside Bot 3 or into the centre play zone.
  const localInfoPanel = mySeat == null ? null : (
    // Horizontal pill: avatar on the left, then a min-w-0 column holding TWO compact rows —
    // (1) name (ellipsis), (2) balance · turn-status inline. It grows in WIDTH (flex child of
    // the widened action-row cell), never in height, so it can never drive the action buttons
    // taller. Fixed compact height keeps it level with the buttons via the row's items-center.
    <div className={`flex items-center min-w-0 w-fit max-w-full rounded-2xl bg-black/40 backdrop-blur-[1px] ${compactDock ? 'gap-2 h-[42px] pl-1 pr-2.5' : 'gap-2.5 h-[48px] pl-1.5 pr-3'}`}>
      {humanAvatar}
      <div className="min-w-0 leading-tight">
        <p className="text-[13px] font-bold text-white truncate flex items-center gap-1">
          {game.nhat_seat === mySeat && <span className="shrink-0 text-gold">🏆</span>}
          <span className="truncate">{seatName(mySeat)}</span>
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
          <span className="tlmn-chip-balance text-[11px] font-black inline-flex items-center gap-0.5 shrink-0">
            <span aria-hidden className="text-[9px]">🪙</span>
            {formatChips(myBalance ?? chipsFromScore(seatOf(mySeat)?.cumulative_score ?? 0))}
          </span>
          {!compactDock && (isMyTurn ? (
            <span className="text-[10px] font-bold text-rose-200 flex items-center gap-1 min-w-0">
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-rose-200 animate-pulse" />
              <span className="truncate">{t('your_turn')}</span>
            </span>
          ) : (
            <span className="text-[10px] text-white/60 italic truncate min-w-0">{t('thinking')}</span>
          ))}
        </div>
      </div>
    </div>
  )

  // The bottom content: human dock (plate + hand + decision + actions) / finished / spectator
  // / end-of-round podium. In image mode this overlays the board's bottom; in oval mode it
  // sits in flow below the felt. Identical markup either way (zero-cutoff hand preserved).
  const bottomContent = (
    <>
      {mySeat != null && playing && myFinished && (
        <div className="relative z-20 px-3 sm:px-6 pt-1 pb-6" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
          <div role="status" className="max-w-[680px] mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-300/30 px-5 py-6 text-center tlmn-banner-pop">
            <p className="text-[28px] leading-none">✓</p>
            <p className="text-[15px] font-bold text-emerald-100 mt-2">{t('you_finished')}</p>
          </div>
        </div>
      )}

      {mySeat != null && playing && !myFinished && (
        <div className={`tlmn-dock-safe relative z-20 px-3 sm:px-6 pt-1 ${compactDock ? 'tlmn-dock-compact' : ''}`} aria-busy={busy} style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          {/* The local-player identity no longer renders as a free-floating cluster above the
              hand (which read as belonging next to Bot 3). On EVERY surface it lives ONLY in
              the action row's bottom-left, where "Gợi ý" used to be — see localInfoPanel
              below. Sắp xếp anchors to the hand tray's corner (below) on every surface. */}

          {/* Cream hand tray with the fanned cards. Extra top room so the arced middle
              cards + any selected lift are never clipped. Also the positioned context for
              the COMPACT corner widgets. */}
          <div className="tlmn-tray relative z-[1] rounded-xl px-2 sm:px-4 max-w-[760px] mx-auto" style={{ minHeight: Math.round(handW * 1.4) + (compactDock ? 14 : 22) }}>
            {/* Sắp xếp stays welded to the local hand (never drifts toward Bot 1). COMPACT
                short-landscape: it sits in the tray's bottom-RIGHT corner, overlapping the
                empty end of the centred fan so it adds ZERO vertical height. Every other
                surface: anchored to the hand zone's top-right corner (above the fan's lower
                right edge). The local avatar/identity is NOT here anymore — it lives in the
                action row's bottom-left (localInfoPanel), replacing the removed Gợi ý. */}
            {compactDock ? (
              <span className="absolute right-0 bottom-0 z-[6]">{sortButton}</span>
            ) : (
              <span className="absolute right-0 -top-1 z-[6]">{sortButton}</span>
            )}
            <div
              key={invalidKey}
              ref={trayRef}
              className={`relative h-full ${invalidKey ? 'tlmn-invalid' : ''}`}
            >
              {/* VISUAL LAYER — the transformed card faces. Purely presentational
                  (pointer-events: none): every tap / drag is owned by the hit layer below,
                  so a selected card's upward lift + z-index can NEVER cover or steal a
                  neighbouring card's tap target. */}
              <div className="pointer-events-none flex justify-center items-end h-full pb-1.5 pt-4">
                {displayHand.map((c, i) => {
                  const sel = selected.has(cardKey(c))
                  const isPlayable = playableKeys ? playableKeys.has(cardKey(c)) : false
                  const dim = playableKeys ? !isPlayable && !sel : false
                  // Fan geometry: evenly tilt −maxArc → +maxArc across the hand, with a
                  // parabolic lift peaking at the centre. Pivot at bottom-centre so the
                  // cards splay like a held fan. A selected card lifts a restrained amount
                  // (liftSel) and comes to the front (z-50) — vertical only, never sideways,
                  // so its slot (and the hit zone beneath it) stays put. The OUTER motion.div
                  // owns layout (so a Sắp xếp reflow slides cards to their new slot); the
                  // INNER motion.span owns the deal entrance + arc/lift transform.
                  const n = displayHand.length
                  const mid = (n - 1) / 2
                  const norm = mid === 0 ? 0 : (i - mid) / mid // −1 … +1
                  const angle = norm * maxArc
                  const lift = Math.round((1 - norm * norm) * (handW * 0.1))
                  const ty = -lift - (sel ? liftSel : hoverIdx === i ? 7 : 0)
                  return (
                    <motion.div
                      key={`${game.id}-${cardKey(c)}`}
                      layout
                      transition={{ layout: reduced ? { duration: 0 } : { duration: DURATIONS.SETTLE, ease: EASINGS.settle } }}
                      className="relative"
                      style={{ marginLeft: i === 0 ? 0 : fanStep - handW, zIndex: sel ? 50 : i }}
                    >
                      <motion.span
                        className="relative block"
                        initial={reduced ? false : { opacity: 0, y: -150, scale: 0.7, rotate: -6 }}
                        animate={{ opacity: 1, y: ty, scale: 1, rotate: angle }}
                        transition={reduced ? { duration: 0 } : { ...TRANSITIONS.lift, delay: dealing ? Math.min(i * 0.022, 0.34) : 0 }}
                        style={{ transformOrigin: 'bottom center' }}
                      >
                        <CardFace card={c} w={handW} selected={sel} dim={dim} playable={isPlayable && !sel} interactive />
                      </motion.span>
                    </motion.div>
                  )
                })}
              </div>
              {/* HIT LAYER — one transparent tap zone per card, in the SAME flex layout +
                  margins as the visuals so each zone sits exactly over its card's slot. The
                  z-index is the stable fan order (never bumped by selection), so each card's
                  exposed strip always resolves to that card. Owns tap + horizontal
                  drag-to-select for mouse/touch/stylus; touch-action:pan-y lets vertical page
                  scrolling pass through while we claim only the horizontal selection gesture. */}
              <div
                ref={hitLayerRef}
                className="absolute inset-0 flex justify-center items-stretch"
                onPointerDown={onHitPointerDown}
                onPointerMove={onHitPointerMove}
                onPointerUp={endHitGesture}
                onPointerCancel={endHitGesture}
              >
                {displayHand.map((c, i) => {
                  const sel = selected.has(cardKey(c))
                  return (
                    <button
                      key={cardKey(c)}
                      type="button"
                      data-tlmn-card={i}
                      aria-label={cardAria(c, t) + (sel ? `, ${t('card_selected')}` : '')}
                      aria-pressed={sel}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                          e.preventDefault()
                          toggleCard(c)
                        }
                      }}
                      onPointerEnter={e => { if (e.pointerType === 'mouse') setHoverIdx(i) }}
                      onPointerLeave={e => { if (e.pointerType === 'mouse') setHoverIdx(h => (h === i ? null : h)) }}
                      className="block h-full m-0 p-0 bg-transparent border-0 select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose rounded-[8px]"
                      style={{ width: handW, marginLeft: i === 0 ? 0 : fanStep - handW, zIndex: i, touchAction: 'pan-y' }}
                    />
                  )
                })}
              </div>
            </div>
          </div>

          {/* Decision bar: required combo chip (left) + live selection feedback (right).
              Hidden in the compact (short-landscape) dock — the play button echoes the
              detected combo, so the feedback is still surfaced. */}
          <div className="tlmn-dock-decision flex items-center justify-between gap-2 mt-2 min-h-[26px] max-w-[680px] mx-auto">
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

          {/* Action buttons — balanced row, identical on EVERY surface: bottom-left is the
              local-player info panel (permanently replacing the removed Gợi ý button — it
              no longer renders anywhere), centre is the primary Đánh, right is Bỏ lượt. Đánh
              is the wider primary but NOT absurdly wide, and the whole row is capped so it
              never sprawls. */}
          {/* items-center (NOT stretch): the buttons own an explicit compact height and never
              stretch to match the info panel — the panel can NEVER make them taller.
              ON EVERY SURFACE a 3-column grid [1fr | auto | 1fr] places Đánh (the auto centre
              column) at the EXACT horizontal centre of the table edge; the info panel anchors
              to the far left of col-1 and Bỏ lượt hugs Đánh's right in col-3. Widths clamp down
              on phones so the panel/pass still fit either side of the centred Đánh. */}
          <div className="tlmn-action-row grid items-center gap-2 mt-2 mx-auto w-full max-w-[760px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <div className="justify-self-end max-w-[300px] min-w-0 flex items-center">
              {localInfoPanel}
            </div>
            <button
              type="button"
              onClick={doPlay}
              disabled={!isMyTurn || selectedCards.length === 0 || busy || !canPlay}
              className={`tlmn-btn-primary justify-self-center w-[clamp(140px,24vw,240px)] min-w-0 flex items-center justify-center font-bold text-[15px] px-4 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tg-gold-bright)] ${
                compactDock ? 'h-[42px]' : 'h-[48px]'
              } ${isMyTurn && canPlay && !busy ? 'tlmn-play-pulse' : ''}`}
            >
              <span className="truncate">
                {t('play_btn')}
                {canPlay && selectionInfo?.name ? ` · ${selectionInfo.name}` : selectedCards.length ? ` · ${selectedCards.length}` : ''}
              </span>
            </button>
            <button
              type="button"
              onClick={doPass}
              disabled={!canPass || busy}
              className={`tlmn-btn-ghost justify-self-start w-[clamp(96px,14vw,150px)] min-w-0 flex items-center justify-center font-bold text-[14px] px-3 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tg-gold-bright)] ${
                compactDock ? 'h-[42px]' : 'h-[48px]'
              }`}
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
    </>
  )

  // ── End-of-round result — a CENTERED, scrollable overlay over the whole stage ───────
  // Decoupled from the bottom dock (which used to pin it to the bottom edge and let the
  // top of a tall podium overflow under the chrome). As an inset-0 flex overlay it is
  // always fully on-screen: vertically centred when it fits, top-aligned + internally
  // scrollable when it doesn't, so "VÁN MỚI" is always reachable. z-[60] sits above the
  // table (seats/centre/dock ≤ z-30) yet BELOW the top chrome (z-[90]) so the X stays
  // tappable. Safe-area padded top + bottom; never cut off by the table frame.
  // Gated on `resultReady` (not raw `ended`) so the modal opens only AFTER the final move has
  // been presented in the pile — it can never instantly erase the last played cards.
  const resultOverlay = ended && resultReady ? (
    <div
      className="tlmn-result-overlay absolute inset-0 z-[60] flex items-start sm:items-center justify-center overflow-y-auto overscroll-contain px-3"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 54px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
        background: 'rgba(6,14,10,0.55)',
      }}
    >
      {/* In short / landscape viewports tlmn-result-modal caps the height + owns the
          scroll (globals.css) so the page body never scrolls and the footer stays put. */}
      <div className="tlmn-result-modal w-full max-w-[600px] my-auto flex flex-col gap-3">
        {game.result?.instant && <ToiTrangBanner game={game} seatName={seatName} t={t} />}
        <Podium game={game} seats={seats} seatName={seatName} reduced={reduced} mySeat={mySeat} myBalance={myBalance} myRoundDelta={myRoundDelta} density={resultDensity} t={t} />
        <div className="tlmn-result-footer text-center pb-1">
          {isHost ? (
            <button
              type="button"
              onClick={doNextRound}
              disabled={busy}
              className={`tlmn-btn-gold inline-flex items-center gap-2 font-black uppercase tracking-wide rounded-xl transition-all disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                resultDensity === 'xs' ? 'text-[12.5px] px-5 py-2'
                  : resultDensity === 'sm' ? 'text-[13.5px] px-6 py-2.5'
                  : 'text-[15px] px-8 py-3.5'
              }`}
            >
              <TlmnCards className={shortVp ? 'w-4 h-4' : 'w-5 h-5'} />
              {t('new_round_btn')}
            </button>
          ) : (
            <p className="text-[12.5px] text-white/75">{t('waiting_host_next')}</p>
          )}
          {error && <p className="text-[12px] text-rose-200 mt-2">{tErr(t, error)}</p>}
        </div>
      </div>
    </div>
  ) : null

  // ── Topmost gameplay-notification layer (ONE layer for every transient announcement) ──
  // Body-portalled so it escapes `.tlmn-fs-root`'s transform stacking context entirely — it
  // therefore paints above the played cards, seats, panels, FX, the responsive table art AND
  // the result overlay, on every breakpoint, without any per-notification z-index hacks (see
  // TLMN_NOTIFY_Z). Fixed to the viewport, pointer-events:none (purely informational — never
  // blocks a card tap or an action button); each notice keeps its own text/i18n, animation
  // (tlmn-banner-*), and lifetime. Edge/safe-area insets keep every notice on-screen.
  const notifyLayer = portalReady ? createPortal(
    <div
      aria-live="polite"
      className="tlmn-notify-root pointer-events-none"
      style={{ position: 'fixed', inset: 0, zIndex: TLMN_NOTIFY_Z }}
    >
      {/* Chặt! — the signature announcement (e.g. tứ quý cutting a 2). Centred on-screen. */}
      {chac && (
        <div key={chac.key} className="absolute inset-0 flex flex-col items-center justify-center px-4 pointer-events-none">
          <div className="tlmn-stamp tlmn-combo-banner tlmn-banner-shine px-5 py-2 rounded-2xl shadow-2xl">
            <span className="font-serif font-black text-[clamp(26px,5vw,38px)] tracking-tight">
              ✂️ {t(chac.kind === 'heo' ? 'banner_chat_heo' : 'banner_chat_bom')}
            </span>
          </div>
          {chac.amount > 0 && (
            <p className="mt-2 text-[13px] font-bold text-rose-deep bg-white/90 px-3 py-1 rounded-full tlmn-banner-pop text-center">
              {t('den_line', { victim: seatName(chac.victim), cutter: seatName(chac.cutter), amount: chac.amount })}
            </p>
          )}
        </div>
      )}

      {/* Penalty (thối heo / đền / cóng) — brief muted toast, carries the affected seat name
          for context now that it no longer sits on that seat. Top-centre, clear of chrome. */}
      {penaltyToast && (
        <div
          key={penaltyToast.key}
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
          style={{ top: 'calc(env(safe-area-inset-top) + 60px)' }}
        >
          <span className="tlmn-banner-pop inline-flex items-center gap-1 rounded-lg bg-black/75 border border-white/20 px-3 py-1.5 text-[11px] font-bold text-white/90 whitespace-nowrap shadow-lg">
            ⚠️ {seatName(penaltyToast.seat)} · {penaltyToast.label}
          </span>
        </div>
      )}

      {/* Throwable notice — cooldown (rate-limited) or insufficient-coins / send failed. */}
      {reactCooldown && (
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black/75 text-white text-[12px] font-semibold px-3.5 py-1.5 tlmn-banner-pop whitespace-nowrap pointer-events-none"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 16%)' }}
        >
          {reactNotice ?? t('react_cooldown')}
        </div>
      )}

      {/* Report-sent confirmation. */}
      {reportSent && (
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 text-white text-[12px] font-semibold px-3.5 py-1.5 tlmn-banner-pop pointer-events-none"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 16%)' }}
        >
          {t('react_report_sent')}
        </div>
      )}
    </div>,
    document.body,
  ) : null

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    // Full-bleed breakout: the table escapes the page's narrow column to become an
    // immersive green-felt surface — the dominant element on the page. In fullscreen /
    // pseudo-fullscreen (Run 5) the .tlmn-fs-root rules make this fill 100dvh/dvw.
    <div ref={fs.rootRef} className="tlmn-fs-root relative w-screen left-1/2 -translate-x-1/2">
      {/* Non-blocking coin-rank promotion / demotion notice, driven by my live balance. */}
      <CoinTierCelebration balance={myBalance} />
      <div
        key={shakeKey}
        className={`tlmn-stage relative flex flex-col min-h-[86vh] overflow-hidden ${fullBleed ? 'tlmn-stage--bleed' : ''} ${shakeKey ? 'tlmn-shake' : ''}`}
      >
        {/* Full-bleed table surface (mobile/tablet). The painted table art now provides the
            felt + rail + centre design, so the old CSS-generated damask/rail/medallion layers
            are gone. CRITICAL: the art is a STAGE-LEVEL background (below) — it bleeds to every
            edge INCLUDING behind the compact top chrome. It used to live only inside the seat
            region BELOW the toolbar, so the toolbar's flex band exposed the .tlmn-stage--bleed
            felt as a green strip across the top of the table; rendering it at stage level fixes
            that at the source. The bleed felt colour only shows for the one frame before the
            image paints (fill + priority ⇒ zero layout shift). */}
        {fullBleed && (
          <Image
            src={bleedBoardSrc}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center select-none pointer-events-none z-0"
            draggable={false}
          />
        )}

        {/* Polite ARIA live region — localized play / pass / turn-change narration. */}
        <div role="status" aria-live="polite" aria-atomic="true" aria-label={t('a11y_region_label')} className="sr-only">
          {liveMsg}
        </div>

        {/* ── Minimal dark chrome ──────────────────────────────────────────────
            z-[90]: ALWAYS above the dock/hand so the X / exit / fullscreen controls
            stay tappable in every orientation (a safety exit even if anything below
            misbehaves). The rotate-overlay is portalled to <body> and intentionally
            leaves this top strip uncovered so the X stays reachable in portrait too. */}
        <div className={`tlmn-chrome-bar ${fullBleed ? 'is-compact absolute inset-x-0 top-0' : 'relative'} z-[90] flex items-center justify-between px-3 sm:px-5`}
          style={{ paddingLeft: 'max(0.75rem, env(safe-area-inset-left))', paddingRight: 'max(0.75rem, env(safe-area-inset-right))', paddingTop: `max(${fullBleed ? '0.375rem' : '0.75rem'}, env(safe-area-inset-top))` }}>
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
                  /* exit fullscreen — 4 arrows pointing IN (compress) */
                  <svg width={18} height={18} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" /></svg>
                ) : (
                  /* enter fullscreen — 4 arrows pointing OUT (expand) */
                  <svg width={18} height={18} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9m11.25-5.25v4.5m0-4.5h-4.5m4.5 0L15 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15m11.25 5.25v-4.5m0 4.5h-4.5m4.5 0L15 15" /></svg>
                )}
              </button>
            )}
            {/* Player reactions (taunts / emotes). Lives in the chrome toolbar so it never
                overlaps cards, the centre pile, the sort/play/pass controls, or any seat.
                HIDDEN for spectators (mySeat == null): they have no seat to anchor a bubble
                to and sending would no-op, so we never show a clickable control that does
                nothing — they still RECEIVE others' bubbles + can mute via... (n/a, hidden). */}
            {mySeat != null && (
              <ReactionControl
                t={t}
                sendPhrase={interactions.sendPhrase}
                onPickThrowable={key => setTargetingKey(key)}
                catalog={catalogMap}
                muted={interactions.muted}
                onToggleMuted={interactions.toggleMuted}
              />
            )}
            <button type="button" onClick={sound.toggleMute} aria-label={sound.muted ? t('sound_off') : t('sound_on')} title={sound.muted ? t('sound_off') : t('sound_on')} className="tlmn-chrome">
              {sound.muted ? (
                <svg width={18} height={18} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 9l4 4m0-4l-4 4" /></svg>
              ) : (
                <svg width={18} height={18} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728" /></svg>
              )}
            </button>
            <button type="button" onClick={requestExit} aria-label={t('leave_btn')} title={t('leave_btn')} className="tlmn-chrome">
              <svg width={18} height={18} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>

        {/* Menu panel (rules summary) */}
        {menuOpen && (
          <div className="absolute z-[95] top-14 left-3 sm:left-5 w-[280px] max-w-[calc(100vw-24px)] rounded-2xl bg-paper shadow-2xl border border-line p-3 tlmn-banner-pop">
            <RulesSummary game={game} t={t} />
          </div>
        )}

        {/* ── Table region (custom board image OR scalable oval fallback) ────────
            Run 6.3: landscape/desktop/fullscreen use the painted WebP board; portrait
            falls back to the scalable oval felt. Same seats/center/FX layer (boardContents)
            renders over either surface — the image is just the backdrop. */}
        {fullBleed ? (
          // Mobile/tablet full-bleed. The painted table art is a STAGE-LEVEL background
          // (rendered above, behind the chrome bar); this region only hosts the seats/centre/
          // FX + hand dock ON TOP of it, hence z-10. It is sized by the flex layout (it fills
          // the stage below the top chrome), so every % seat anchor + the centre band resolve
          // INSIDE the visible play area — unchanged from before, seats do not move.
          <div ref={areaRef} className="relative z-10 flex-1 min-h-0">
            {/* Content box. Left/right safe-area keeps seats off a landscape notch; the TOP
                notch is already cleared by the chrome bar above, so no top pad here (avoids
                double-insetting the top safe-area). */}
            <div
              className="absolute inset-0"
              style={{
                paddingLeft: 'env(safe-area-inset-left)',
                paddingRight: 'env(safe-area-inset-right)',
              }}
            >
              {boardContents}
              {/* Hand-dock overlay anchored to the felt's bottom edge (bottom safe-area is
                  handled inside the dock itself, so it isn't double-padded here). */}
              <div className="absolute inset-x-0 bottom-0 z-20">
                <div className="tlmn-dock-scrim" aria-hidden />
                <div className="relative">{bottomContent}</div>
              </div>
            </div>
          </div>
        ) : useImage ? (
          <div ref={areaRef} className="relative flex-1 flex items-center justify-center min-h-0 px-2 sm:px-4 py-2 overflow-hidden">
            <motion.div
              className="tlmn-board--image relative"
              style={{ width: board.w, height: board.h }}
              initial={boardEntrance}
              animate={{ opacity: 1, scale: 1 }}
              transition={boardTransition}
            >
              {/* The painted felt — aspect-locked to its exact ratio (no distortion),
                  priority-loaded so it's ready above the fold with zero layout shift. */}
              <Image
                src={BOARD_SRC}
                alt=""
                fill
                priority
                sizes="(max-width: 1180px) 100vw, 1180px"
                className="object-contain select-none pointer-events-none"
                draggable={false}
              />
              {boardContents}
              {/* Hand-dock overlay anchored to the board's bottom seat region. */}
              <div className="absolute inset-x-0 bottom-0 z-20">
                <div className="tlmn-dock-scrim" aria-hidden />
                <div className="relative">{bottomContent}</div>
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="relative flex-1 flex items-center justify-center px-3 sm:px-6 py-2">
            <motion.div
              className="tlmn-felt relative w-full"
              style={{ maxWidth: 'min(88vw, 1000px)', height: tableH }}
              initial={boardEntrance}
              animate={{ opacity: 1, scale: 1 }}
              transition={boardTransition}
            >
              {boardContents}
            </motion.div>
          </div>
        )}

        {/* Bottom content — image + full-bleed modes render it as a bottom overlay
            (above); oval mode renders it here in flow below the felt. */}
        {!fullBleed && !useImage && bottomContent}

        {/* End-of-round result — centered, scrollable, fully on-screen (all modes). */}
        {resultOverlay}

        {/* Topmost transient-notification layer (body-portalled; above every in-app layer). */}
        {notifyLayer}

        {/* ── Run 5/8: portrait rotate prompt (active game only) ───────────────
            PORTALLED TO <body>: rendered as a position:fixed top layer OUTSIDE the
            table's transformed (.tlmn-fs-root) + overflow-clipped (.tlmn-stage)
            ancestors. That ancestor combo made iOS Safari mis-hit-test an absolute
            overlay, so "Rời phòng" silently swallowed taps and trapped the player.
            As a portal the buttons reliably receive taps. It starts BELOW the top
            chrome strip so the page X / exit stay reachable in portrait too — two
            independent, always-working exits. iOS-critical: orientation.lock no-ops
            here, so the rotate guidance is the best we can offer. */}
        {playing && portalReady && fs.isMobileOrTablet && !fs.isLandscape && createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('rotate_hint')}
            className="fixed left-0 right-0 bottom-0 flex flex-col items-center justify-center gap-5 px-8 text-center"
            style={{
              zIndex: 2147483000,
              top: 'calc(env(safe-area-inset-top) + 56px)',
              background: 'rgba(8,18,12,0.97)',
              pointerEvents: 'auto',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)',
            }}
          >
            <span className="tlmn-rotate-icon text-[64px] leading-none" aria-hidden>📱</span>
            <p className="font-serif font-black text-[22px] text-white">{t('rotate_hint')}</p>
            <p className="text-[13.5px] text-white/70 max-w-[280px] leading-relaxed">{t('rotate_subtext')}</p>
            <button
              type="button"
              onClick={requestExit}
              className="mt-2 inline-flex items-center justify-center min-h-[48px] font-bold text-[14px] text-white bg-rose hover:bg-rose-deep active:bg-rose-deep rounded-xl px-7 py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {t('leave_btn')}
            </button>
          </div>,
          document.body,
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
  secondsLeft, turnFrac, av, backW, place, compact = false, reduced, t, tier = null, tierLabel, hit = null,
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
  /** Coin-rank tier (from the seat's CURRENT balance) + its localized badge label. */
  tier?: CoinTier | null
  tierLabel?: string
  // Mobile/tablet (full-bleed): render the plate as a compact horizontal name+coin row and,
  // for the TOP seat, lay the whole pod out horizontally so it hugs the top edge instead of
  // hanging a tall column down into the protected centre zone.
  compact?: boolean
  reduced: boolean
  // Transient throwable-hit recoil ('splat' = tomato, 'boom' = bomb). nonce re-triggers the
  // shake when the same seat is hit again. null = no active hit.
  hit?: { impact: 'splat' | 'boom'; nonce: number } | null
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
  const isSide = place === 'left' || place === 'right'

  // Avatar + its decorations (gold frame, active/winner ring, turn timer, count badge) as
  // ONE self-contained unit. For LEFT/RIGHT seats this unit is the geometric centre of the
  // positioned block, so the wrapper's translate(-50%,-50%) lands the AVATAR's middle — not
  // the cluster's — on the painted lotus seat-marker, identically at every board size.
  // Throwable-hit recoil: a transform-only shake on the avatar (never moves layout). Skipped
  // entirely under reduced motion. Keyed by nonce so a repeat hit re-fires the animation.
  const hitCls = !reduced && hit ? (hit.impact === 'boom' ? 'tlmn-hit-boom' : 'tlmn-hit-splat') : ''
  const avatarUnit = (
    <span key={hit?.nonce ?? 'still'} className={`relative inline-flex flex-none ${hitCls}`}>
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
        {/* Dynamic coin-rank badge — TOP-LEFT so it never covers the count badge / turn
            timer (bottom-right) or the report menu (top-right). */}
        {tier && tierLabel && (
          <span className="absolute -left-1.5 -top-1 z-20">
            <CoinTierBadge tier={tier} size={av >= 52 ? 'sm' : 'xs'} label={tierLabel} />
          </span>
        )}
      </span>
      {/* "Bỏ lượt" stamp — anchored to the AVATAR (centred over it) with the highest seat
          z-index so it is never covered by the name plate / fan / a neighbouring seat and
          never clipped by a parent. Identical for left / right / top seats. Transient. */}
      {passed && (
        <span
          key={passKey}
          className="tlmn-stamp absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 text-[9px] sm:text-[10px] font-black uppercase text-white bg-rose/95 border border-white/55 rounded-md px-1.5 py-0.5 tracking-wide whitespace-nowrap shadow-lg pointer-events-none"
        >
          {t('passed')}
        </span>
      )}
    </span>
  )

  // Compact (mobile/tablet): name + coin sit BESIDE each other on one short line, so the
  // seat is a slim horizontal pill — [name] [🪙 1M] — that never grows tall toward the
  // centre. Desktop keeps the original stacked plate (name over coin).
  const plateUnit = compact ? (
    <span className="max-w-full inline-flex items-center gap-1.5 rounded-xl tlmn-plate px-2 py-0.5 leading-tight">
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/95 min-w-0">
        {isNhat && <span className="text-gold flex-none">🏆</span>}
        <span className="truncate max-w-[9ch]">{name}</span>
      </span>
      <span className="tlmn-chip-balance inline-flex items-center gap-0.5 text-[10px] font-black tracking-wide flex-none">
        <span aria-hidden className="text-[9px]">🪙</span>{formatChips(chips)}
      </span>
    </span>
  ) : (
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
  )

  const statusUnit = (offline || finished) ? (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${offline ? 'bg-amber-500/30 text-amber-100' : 'bg-emerald-500/30 text-emerald-100'}`}
      role="status"
    >
      {offline ? `📵 ${t('seat_offline')}` : `✓ ${t('seat_finished')}`}
    </span>
  ) : null

  // "đang suy nghĩ…" — a subtle animated 3-dot under the active opponent.
  const dotsUnit = (isTurn && !passed) ? (
    <span
      className="inline-flex items-center gap-[3px] rounded-full bg-black/45 px-2 py-1 pointer-events-none z-20"
      role="status"
      aria-label={t('thinking')}
      title={t('thinking')}
    >
      {[0, 1, 2].map(d => (
        <span key={d} className="tlmn-think-dot w-[3px] h-[3px] rounded-full bg-white/85" style={{ animationDelay: `${d * 180}ms` }} />
      ))}
    </span>
  ) : null

  // ── LEFT / RIGHT seats ─ avatar IS the anchored centroid ──────────────────────────
  // The root shrink-wraps the avatar unit, so the wrapper's translate(-50%,-50%) centres
  // the AVATAR on its point. On mobile/tablet (compact) the name plate + (capped) fan are
  // stacked just to the INNER side (toward the table centre) and vertically CENTRED on the
  // avatar, so the seat is ONE tight horizontal pod (the same shape as the compact TOP seat)
  // — nothing dangles below into the play zone. Desktop keeps the avatar-on-lotus + plate-
  // below layout (its side seats are locked to the painted board-art lotus markers). All
  // mirrored identically L/R.
  if (isSide) {
    // Avatar IS the anchored centroid (root shrink-wraps it) → it NEVER moves. The face-down
    // fan is VERTICAL (cards held sideways), centred on the avatar toward the table centre.
    // The name plate hangs BELOW via `top-full` (TOP-anchored), so when transient bits
    // (status / thinking dots) appear they grow DOWNWARD and never push the avatar or the
    // name/coin. Mirrored identically L/R.
    return (
      <div className="relative inline-flex flex-none">
        {avatarUnit}
        <span className={`absolute top-1/2 -translate-y-1/2 inline-flex items-center justify-center ${place === 'left' ? 'left-full ml-1' : 'right-full mr-1'}`}>
          <OpponentFan count={count} w={backW} orientation={fanOrientation} />
        </span>
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 flex flex-col items-center gap-0.5 w-max z-30">
          {plateUnit}
          {statusUnit}
          {dotsUnit}
        </div>
      </div>
    )
  }

  // ── TOP seat, COMPACT (mobile/tablet) ─ horizontal pod hugging the top edge ──────────
  // Instead of hanging a tall column (plate → fan) straight DOWN into the protected centre,
  // the compact top seat lays out HORIZONTALLY — avatar beside a slim info column (name+coin
  // row, then a short face-down fan). Its total height is ≈ one avatar, so it stays anchored
  // near the top edge (matching the side seats' edge distance) and can never droop into the
  // centre play zone. Played cards NEVER render here — only in the centre pile.
  if (compact && place === 'top') {
    return (
      <div className="relative inline-flex items-center gap-2 flex-none">
        {avatarUnit}
        <div className="inline-flex flex-col items-start gap-0.5 w-max z-30">
          {plateUnit}
          {/* Bot 2 sits ACROSS the table → its face-down fan faces the other way (180°). */}
          <span className="inline-flex rotate-180"><OpponentFan count={count} w={backW} orientation="top" /></span>
        </div>
        {/* Transient status / thinking dots as an absolute overlay so they never resize the
            pod (which would re-centre it via the wrapper translate and shift the avatar). */}
        {(statusUnit || dotsUnit) && (
          <div className="absolute top-full left-0 mt-0.5 flex items-center gap-1.5 z-30">
            {statusUnit}
            {dotsUnit}
          </div>
        )}
      </div>
    )
  }

  // ── TOP / BOTTOM seats ─ avatar IS the anchored centroid (same discipline as sides) ──
  // The root shrink-wraps the avatar, so the wrapper's translate(-50%,-50%) lands the
  // AVATAR on its point near the top edge — it never drifts toward the centre because the
  // plate/fan/last-played hang OFF it absolutely (downward for a top seat, upward for the
  // bottom spectator seat) instead of growing the anchored box. The name plate is z-30 so a
  // card can never sit on top of the label.
  const hangBelow = place !== 'bottom'
  return (
    <div className="relative inline-flex flex-none">
      {avatarUnit}
      <div
        className={`absolute left-1/2 -translate-x-1/2 ${hangBelow ? 'top-full mt-1 flex-col' : 'bottom-full mb-1 flex-col-reverse'} flex items-center gap-1 w-max z-30`}
      >
        {plateUnit}
        {statusUnit}
        {/* Opponent face-down fan (horizontal), hung toward the table centre. The TOP seat's
            fan is flipped 180° so its concave arc curves UP into the avatar above it (a player
            sitting across the table); the bottom spectator's avatar is below, so it stays. */}
        <span className={`relative inline-flex items-center justify-center flex-none ${place === 'top' ? 'rotate-180' : ''}`}>
          <OpponentFan count={count} w={backW} orientation="top" />
        </span>
        {dotsUnit}
      </div>
    </div>
  )
}

function PodAvatar({ name, url, size = 28, isBot = false, seed = 0 }: { name: string; url: string | null; size?: number; isBot?: boolean; seed?: number }) {
  // Bots NEVER use a profile image — a fixed card-suit emblem keyed on the bot number
  // (Bot 1 spade · Bot 2 diamond · Bot 3 club), resolved from its own name/seat.
  if (isBot) return <span className="flex-none"><BotAvatar seed={botThemeIndex(name, seed)} size={size} /></span>
  // Real players go through the canonical site avatar: provider-proxy, retina bump,
  // referrer-less load, and a deterministic initials fallback on missing/broken images.
  return <UserAvatar src={url} name={name} size={size} className="flex-none" />
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
  game, seats, seatName, reduced, mySeat, myBalance, myRoundDelta, density = 'normal', t,
}: {
  game: TlmnPublicGame
  seats: TlmnSeat[]
  seatName: (i: number) => string
  reduced: boolean
  mySeat: number | null
  myBalance: number | null
  myRoundDelta: number | null
  // Result-panel density, scaled by viewport height so a 4-player round always fits.
  //   normal — portrait / tall viewports (full size)
  //   sm     — landscape phones (vh < 520): tighter rows, smaller avatars + fonts
  //   xs     — very short landscape (vh < 400): tightest, so 4 rows + footer still fit
  density?: 'normal' | 'sm' | 'xs'
  t: ReturnType<typeof useTranslations>
}) {
  const compact = density !== 'normal'
  const xs = density === 'xs'
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
    <div className={`tlmn-results-card rounded-2xl overflow-hidden ${xs ? 'p-2' : compact ? 'p-2.5' : 'p-3 sm:p-4'}`}>
      <p className={`font-black text-[var(--tg-gold-bright)] uppercase tracking-[2px] text-center ${xs ? 'text-[9px] pb-1.5' : compact ? 'text-[10px] pb-2' : 'text-[11px] pb-3'}`}>
        {t('podium_title')}
      </p>
      <div className={`tlmn-results-list flex flex-col ${xs ? 'gap-1' : compact ? 'gap-1.5' : 'gap-2'}`}>
        {rows.map((r, rank) => {
          const cum = cumulativeOf(r.seat)
          // My seat shows the REAL persisted wallet balance + REAL applied delta;
          // every other seat keeps the session-derived display number.
          const isMyRow = mySeat != null && r.seat === mySeat
          const chips = isMyRow && myBalance != null ? myBalance : chipsFromScore(cum)
          const chipDelta = isMyRow && myRoundDelta != null ? myRoundDelta : r.total * CHIP_RATE
          const first = rank === 0
          const avSize = first ? (xs ? 34 : compact ? 42 : 46) : (xs ? 28 : compact ? 34 : 38)
          return (
            <div
              key={r.seat}
              className={`flex items-center rounded-xl ${xs ? 'gap-1.5 px-2 py-1' : compact ? 'gap-2 px-2.5 py-1.5' : 'gap-3 px-3 py-2.5'} ${first ? 'tlmn-podium-1' : 'tlmn-podium-row'}`}
            >
              <span className="relative inline-flex flex-none">
                {first && <span className={`absolute left-1/2 -translate-x-1/2 text-[18px] tlmn-crown-sweep z-10 ${xs ? '-top-2.5' : compact ? '-top-3' : '-top-4'}`} aria-hidden>👑</span>}
                <span className={`inline-flex rounded-full p-[2.5px] ${first ? 'tlmn-frame-gold' : 'bg-white/15'}`}>
                  <PodAvatar name={seatName(r.seat)} url={seatOf(r.seat)?.avatar_url ?? null} size={avSize} isBot={!!seatOf(r.seat)?.is_bot} seed={r.seat} />
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className={`font-bold truncate flex items-center gap-1.5 ${first ? `${xs ? 'text-[12.5px]' : compact ? 'text-[14px]' : 'text-[15px]'} text-[var(--tg-gold-bright)]` : `${xs ? 'text-[11px]' : compact ? 'text-[12px]' : 'text-[13px]'} text-white/90`}`}>
                  <span aria-hidden>{medals[rank] ?? '🏅'}</span>
                  <span className="truncate">{seatName(r.seat)}</span>
                </p>
                <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-white/55 ${xs ? 'text-[9px]' : compact ? 'text-[9.5px]' : 'text-[10px]'}`}>
                  {r.isWinner ? <span className="text-[var(--tg-gold-bright)] font-bold">{t('score_winner')}</span> : <span>{t('score_cards', { n: r.cardsLeft })}</span>}
                  {r.cong && <span className="text-rose-200">{t('score_cong')}</span>}
                  {r.heldTwos > 0 && r.thoiHeoMult > 1 && <span className="text-rose-200">{t('score_thoiheo')} ×{r.thoiHeoMult}</span>}
                  {r.thoiBomUnits > 0 && <span className="text-rose-200">{t('score_thoibom')}</span>}
                </div>
              </div>
              <div className="text-right flex-none">
                <p className={`font-black leading-none ${r.total > 0 ? 'text-emerald-300' : r.total < 0 ? 'text-rose-300' : 'text-white/60'} ${first ? (xs ? 'text-[14px]' : compact ? 'text-[16px]' : 'text-[18px]') : (xs ? 'text-[12.5px]' : compact ? 'text-[14px]' : 'text-[15px]')}`}>
                  {r.total > 0 ? `+${r.total}` : r.total}
                </p>
                <p className={`text-white/45 mt-0.5 ${compact ? 'text-[9px]' : 'text-[9.5px]'}`}>{t('score_total')}: {cum}</p>
                <p className={`tlmn-chip-balance font-black mt-0.5 inline-flex items-center gap-0.5 ${compact ? 'text-[9.5px]' : 'text-[10px]'}`}>
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
    'wrong_combo_type', 'wrong_combo_length', 'play_not_high_enough', 'invalid_chop',
    'must_include_three_spade', 'cannot_pass_leading', 'no_active_game', 'conflict',
    'round_in_progress', 'not_enough_players', 'hint_none',
  ]
  const key = known.includes(code) ? `play_err_${code}` : 'play_err_generic'
  return t(key as Parameters<typeof t>[0])
}
