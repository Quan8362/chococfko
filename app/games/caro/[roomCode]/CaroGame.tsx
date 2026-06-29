'use client'

import { useEffect, useRef, useState, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { makeMove, surrenderGame, heartbeatWaitingRoom, refetchRoom, resolveTimeout, joinCaroRoom, type CaroRoom } from '../actions'
import { applyRoomUpdate, parseBoard, parseWinningCells } from '@/lib/caro/realtimePayload'
import { setCaroRuntime } from '@/lib/caro/runtimeState'
import CaroChat from './CaroChat'

const SIZE = 15
const TURN_SECONDS = 15
// Client fires authoritative timeout resolution this long AFTER the displayed
// deadline (a touch beyond the server's 2s grace) so the server reliably accepts
// it; retried while still expired to absorb clock skew. The server re-validates.
const CLIENT_TIMEOUT_GRACE_MS = 2500
// Recovery watchdog: while a game is in progress, reconcile with the authoritative
// row on this cadence so a silently-missed realtime event (mobile tab freeze,
// brief network loss that never surfaces as CLOSED, the re-auth gap after an
// hourly token refresh) is repaired without a manual page refresh. Realtime stays
// primary; this is only a safety net, hence a slow 12s tick, not polling.
const WATCHDOG_MS = 12000

type Props = {
  initialRoom: CaroRoom
  userId: string | null
  myName: string
  playerXName: string
  playerOName: string | null
}

export default function CaroGame({ initialRoom, userId, myName, playerXName, playerOName }: Props) {
  const t = useTranslations('games.caro')
  const router = useRouter()
  const [room, setRoom] = useState<CaroRoom>(initialRoom)
  const [error, setError] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pendingCell, setPendingCell] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS)
  const opponentJoinedNotifiedRef = useRef(initialRoom.player_o !== null)
  const opponentToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showOpponentToast, setShowOpponentToast] = useState(false)
  // Transport state from the realtime channel; combined below with online/sync
  // status into the user-facing connection state.
  const [connState, setConnState] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting')
  const [online, setOnline] = useState(true)
  const [syncFailing, setSyncFailing] = useState(false)
  const mountedRef = useRef(true)
  // Authoritative reconciliation plumbing. roomIdRef keeps the latest room id for
  // async callbacks; reconcileInFlightRef collapses overlapping refetches into one.
  const roomIdRef = useRef(room.id)
  roomIdRef.current = room.id
  const reconcileInFlightRef = useRef(false)

  // Pull the authoritative room row and merge it on (monotonic-guarded so a lagging
  // read can never regress newer state). Used on subscribe, on channel errors, by
  // the watchdog, on tab-resume/online, and when a payload looks malformed.
  const reconcile = useCallback(() => {
    if (reconcileInFlightRef.current) return
    reconcileInFlightRef.current = true
    refetchRoom(roomIdRef.current)
      .then((fresh) => {
        if (!mountedRef.current) return
        if (fresh) {
          setRoom((prev) => {
            const { room: next } = applyRoomUpdate(prev, fresh)
            setCaroRuntime({ matchStatus: next.status })
            return next
          })
        }
        setSyncFailing(false)
      })
      .catch(() => { if (mountedRef.current) setSyncFailing(true) })
      .finally(() => { reconcileInFlightRef.current = false })
  }, [])

  const board = parseBoard(room.board)
  const winCells = new Set<number>(parseWinningCells(room.winning_cells))

  const mySymbol: 'X' | 'O' | null =
    userId === room.player_x ? 'X' : userId === room.player_o ? 'O' : null
  const isMyTurn = room.status === 'playing' && room.current_turn === mySymbol

  // A logged-in viewer who isn't already a player may explicitly take the open O
  // seat. The host (player X) can never join as O.
  const canJoin =
    !!userId && room.status === 'waiting' && !room.player_o && room.player_x !== userId

  // User-facing connection state, derived from transport + network + sync health.
  const conn: 'connecting' | 'connected' | 'reconnecting' | 'degraded' | 'offline' =
    !online ? 'offline'
    : connState === 'connecting' ? 'connecting'
    : connState === 'reconnecting' ? 'reconnecting'
    : syncFailing ? 'degraded'
    : 'connected'
  // Only block moves when we genuinely cannot confirm authoritative state: offline,
  // or still establishing the first connection. While reconnecting/degraded we keep
  // the last confirmed state and let the server reject anything stale.
  const canConfirmState = online && conn !== 'connecting'

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/games/caro/${room.room_code}`
      : ''

  // ── Sound: two-tone chime for opponent joining ────────────────────────────
  const playJoinSound = () => {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(660, ctx.currentTime)
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12)
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } catch {}
  }

  // Track mount status so async realtime / refetch callbacks never set state
  // after unmount. Also publish a diagnostics snapshot for the error boundary.
  useEffect(() => {
    mountedRef.current = true
    setCaroRuntime({
      roomCode: initialRoom.room_code,
      matchStatus: initialRoom.status,
      loaded: { room: true, player: initialRoom.player_o !== null, game: true },
    })
    return () => {
      mountedRef.current = false
      if (opponentToastTimerRef.current) clearTimeout(opponentToastTimerRef.current)
    }
  }, [initialRoom.room_code, initialRoom.status, initialRoom.player_o])

  // ── Realtime subscription ──────────────────────────────────────────────────
  // A single channel per room.id. Payloads are MERGED onto the last known state
  // (mergeRoomUpdate) so a partial/empty/TOAST UPDATE can never wipe the board or
  // players mid-match. On every (re)subscribe we refetch the authoritative row to
  // reconcile any events missed between the initial server render and the channel
  // being established, or after a dropped connection.
  useEffect(() => {
    const roomId = room.id
    const supabase = createClient()

    const channel = supabase
      .channel(`caro:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'caro_rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (!mountedRef.current) return
          // Ignore events that somehow arrive for another room (defensive — the
          // server filter already scopes to this id).
          const incomingId = (payload.new as { id?: unknown } | null)?.id
          if (typeof incomingId === 'string' && incomingId !== roomId) return
          setCaroRuntime({ lastRealtimeEvent: payload.eventType ?? 'UPDATE' })
          let needsRefetch = false
          setRoom((prev) => {
            const { room: next, refetch } = applyRoomUpdate(prev, payload.new)
            needsRefetch = refetch
            setCaroRuntime({ matchStatus: next.status })
            // Host-only: notify once when the first opponent actually joins.
            if (
              userId &&
              userId === next.player_x &&
              !opponentJoinedNotifiedRef.current &&
              prev.player_o === null &&
              next.player_o !== null
            ) {
              opponentJoinedNotifiedRef.current = true
              queueMicrotask(() => {
                if (!mountedRef.current) return
                setShowOpponentToast(true)
                playJoinSound()
                if (opponentToastTimerRef.current) clearTimeout(opponentToastTimerRef.current)
                opponentToastTimerRef.current = setTimeout(() => setShowOpponentToast(false), 4000)
              })
            }
            return next
          })
          // A malformed/unexpected board payload was rejected — pull authoritative
          // state so the board can never get stuck on stale forever.
          if (needsRefetch) reconcile()
          setPendingCell(null)
          setError(null)
        },
      )
      .subscribe((status) => {
        setCaroRuntime({ channelStatus: status })
        if (!mountedRef.current) return
        if (status === 'SUBSCRIBED') {
          setConnState('connected')
          // Reconcile any events missed between the server render and the channel
          // being (re)established.
          reconcile()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnState('reconnecting')
          // Try to repair immediately; the watchdog keeps retrying while down.
          reconcile()
        }
      })

    // Keep the Realtime socket authenticated across token refreshes. supabase-js
    // also does this internally, but doing it explicitly + reconciling closes the
    // brief window where a refreshed JWT could otherwise stall the subscription.
    // Never log the token.
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        if (session?.access_token) supabase.realtime.setAuth(session.access_token)
        if (mountedRef.current) reconcile()
      }
    })

    return () => {
      authSub.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [room.id, userId, reconcile])

  // ── Recovery watchdog ─────────────────────────────────────────────────────
  // Only while a game is in progress. Periodically reconciles, and also on
  // tab-resume / network-restore, so a silently-missed event is repaired. Stops
  // entirely once the game is no longer 'playing'. Reconcile itself is overlap-
  // and regression-safe (in-flight guard + monotonic merge).
  useEffect(() => {
    if (room.status !== 'playing') return

    const onVisible = () => { if (document.visibilityState === 'visible') reconcile() }
    const onOnline = () => reconcile()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)

    const interval = setInterval(() => {
      // Don't burn refetches while the tab is hidden; resume handles that.
      if (document.visibilityState === 'visible') reconcile()
    }, WATCHDOG_MS)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      clearInterval(interval)
    }
  }, [room.status, room.id, reconcile])

  // ── Online/offline tracking ────────────────────────────────────────────────
  useEffect(() => {
    const update = () => setOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  // ── Heartbeat: keep waiting room alive in lobby ───────────────────────────
  // Fires every 25s while room is 'waiting' and current user is host (player X).
  // Stops automatically when room transitions to playing/finished.
  useEffect(() => {
    if (room.status !== 'waiting' || mySymbol !== 'X') return
    heartbeatWaitingRoom(room.id)
    const interval = setInterval(() => heartbeatWaitingRoom(room.id), 25000)
    return () => clearInterval(interval)
  }, [room.id, room.status, mySymbol])

  const roomRef = useRef(room)
  roomRef.current = room

  // ── Server-authoritative turn timer ────────────────────────────────────────
  // Both players derive the SAME countdown from the server `turn_deadline`. The
  // browser never decides the outcome: when the deadline (+grace) passes, ANY
  // open client requests authoritative resolution (caro_resolve_timeout), which
  // the DB only honours if its own clock confirms expiry. A timed-out player
  // loses. Refresh/reconnect cannot extend the deadline — it's a fixed server
  // instant, reset only by a valid move or game start. Retried while expired so
  // a skewed/slow request still lands.
  const timeoutAttemptRef = useRef(0)
  useEffect(() => {
    if (room.status !== 'playing' || !room.turn_deadline) {
      setTimeLeft(TURN_SECONDS)
      return
    }
    const deadlineMs = Date.parse(room.turn_deadline)
    if (Number.isNaN(deadlineMs)) { setTimeLeft(TURN_SECONDS); return }

    const tick = () => {
      const remainMs = deadlineMs - Date.now()
      setTimeLeft(Math.max(0, Math.min(TURN_SECONDS, Math.ceil(remainMs / 1000))))
      if (remainMs <= -CLIENT_TIMEOUT_GRACE_MS && document.visibilityState === 'visible') {
        const now = Date.now()
        if (now - timeoutAttemptRef.current > 3000) {
          timeoutAttemptRef.current = now
          const cur = roomRef.current
          startTransition(async () => { await resolveTimeout(cur.id, cur.state_version ?? null) })
        }
      }
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [room.status, room.turn_deadline, room.id])

  // ── Cell click ────────────────────────────────────────────────────────────
  const handleClick = useCallback((index: number) => {
    if (!isMyTurn || isPending || board[index] || room.status !== 'playing') return
    // Don't submit a move we can't safely base on confirmed authoritative state.
    if (!canConfirmState) { setError(t('conn_offline')); return }
    setPendingCell(index)
    setError(null)
    startTransition(async () => {
      const result = await makeMove(room.id, index, roomRef.current.state_version ?? null)
      if (result?.error) {
        setError(t('error_move'))
        setPendingCell(null)
      }
    })
  }, [isMyTurn, isPending, board, room.id, room.status, canConfirmState, t])

  // ── Explicit join ─────────────────────────────────────────────────────────
  const handleJoin = () => {
    setJoinError(null)
    startTransition(async () => {
      const result = await joinCaroRoom(room.id)
      if (result?.error) {
        setJoinError(
          result.error === 'full' ? t('join_full')
          : result.error === 'host_cannot_join' ? t('join_host')
          : result.error === 'stale' ? t('join_stale')
          : t('join_error'),
        )
      }
      // Re-render from the server either way: success makes us O with names; a lost
      // race drops us into spectating the now-playing room.
      router.refresh()
    })
  }

  // ── Surrender ────────────────────────────────────────────────────────────
  const handleSurrender = () => {
    if (!window.confirm(t('surrender_confirm'))) return
    startTransition(async () => { await surrenderGame(room.id) })
  }

  // ── Copy link ─────────────────────────────────────────────────────────────
  const copyLink = () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Status label ──────────────────────────────────────────────────────────
  const statusLabel = (() => {
    if (room.status === 'waiting') return t('status_waiting')
    if (room.status === 'finished') {
      if (room.winner === 'draw') return t('status_draw')
      if (room.winner === mySymbol) return t('status_you_win')
      if (room.winner && mySymbol) return t('status_you_lose')
      const winnerName = room.winner === 'X' ? playerXName : (playerOName ?? 'O')
      return t('status_x_win', { name: winnerName })
    }
    if (isMyTurn) return t('status_your_turn')
    const oppName = room.current_turn === 'X' ? playerXName : (playerOName ?? 'O')
    return t('status_opp_turn', { name: oppName })
  })()

  const timerPct = (timeLeft / TURN_SECONDS) * 100
  const timerDanger = timeLeft <= 5 && isMyTurn && room.status === 'playing'

  return (
    <>
      {/* ── Opponent joined toast ──────────────────────────────────────────── */}
      {showOpponentToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 bg-ink text-white px-5 py-3.5 rounded-2xl shadow-2xl text-[14px] font-semibold whitespace-nowrap pointer-events-none select-none border border-white/10">
          <span className="text-lg">⚔️</span>
          {t('opponent_joined')}
        </div>
      )}
    <div className="flex flex-col lg:flex-row gap-5 items-start pb-10">

      {/* ── LEFT: game area ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col items-center gap-4 w-full">

        {/* Room code banner */}
        <div className="w-full bg-gradient-to-r from-ink to-[#3a2d22] rounded-2xl px-5 py-4 flex items-center justify-between gap-3 shadow-lg">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[2px] text-white/50 mb-0.5">{t('room_code_label')}</p>
            <p className="font-mono font-black text-[28px] text-white tracking-[0.2em] leading-none">
              {room.room_code}
            </p>
          </div>
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all border border-white/15"
          >
            {copied ? (
              <><svg className="w-3.5 h-3.5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>{t('copied')}</>
            ) : (
              <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>{t('copy_link')}</>
            )}
          </button>
        </div>

        {/* Players row — includes undo status */}
        <div className="w-full flex items-center gap-2">
          <PlayerCard
            symbol="X" name={playerXName}
            active={room.status === 'playing' && room.current_turn === 'X'}
            winner={room.winner === 'X'}
          />
          <span className="text-[13px] font-black text-muted/30 flex-none">VS</span>
          <PlayerCard
            symbol="O" name={playerOName ?? (room.player_o ? '…' : null)}
            active={room.status === 'playing' && room.current_turn === 'O'}
            winner={room.winner === 'O'}
          />
        </div>

        {/* Status + timer */}
        <div className="w-full overflow-hidden rounded-xl border border-line">
          {room.status === 'playing' && room.player_o && (
            <div className="h-1.5 w-full bg-line/50">
              <div
                className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                  timerDanger ? 'bg-red-500' : isMyTurn ? 'bg-rose' : 'bg-blue-400'
                }`}
                style={{ width: `${timerPct}%` }}
              />
            </div>
          )}
          <div className={`flex items-center justify-between px-4 py-2.5 text-[13.5px] font-semibold ${
            room.status === 'finished'
              ? room.winner === mySymbol
                ? 'bg-emerald-50 text-emerald-700'
                : room.winner === 'draw'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-red-50 text-red-600'
              : 'bg-cream text-ink'
          }`}>
            <span>{statusLabel}</span>
            {room.status === 'playing' && room.player_o && room.turn_deadline && (
              <span className={`font-mono text-[15px] font-black tabular-nums ${timerDanger ? 'text-red-500 animate-pulse' : 'text-ink/50'}`}>
                {timeLeft}s
              </span>
            )}
          </div>
        </div>

        {/* Waiting hint (host) */}
        {room.status === 'waiting' && mySymbol === 'X' && (
          <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-[13px] text-amber-800 text-center">
            {t('waiting_hint', { code: room.room_code })}
          </div>
        )}

        {/* Explicit join panel — shown to an eligible viewer of a waiting room */}
        {canJoin && (
          <div className="w-full bg-gradient-to-br from-[#fdeef5] to-cream border border-rose/20 rounded-2xl px-5 py-4 flex flex-col items-center gap-3 text-center">
            <p className="text-[14px] font-semibold text-ink">{t('join_room_prompt')}</p>
            <button
              onClick={handleJoin}
              disabled={isPending}
              className="font-semibold text-[14px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_10px_-2px_rgba(194,24,91,0.35)] disabled:opacity-60"
            >
              {isPending ? '…' : t('join_room_btn')}
            </button>
            {joinError && <p className="text-[12.5px] text-red-600">{joinError}</p>}
          </div>
        )}

        {/* Login prompt — logged-out viewer of an open waiting room */}
        {!userId && room.status === 'waiting' && !room.player_o && (
          <a
            href="/login"
            className="w-full bg-paper border border-rose/20 rounded-2xl px-5 py-4 text-center text-[13.5px] font-semibold text-rose hover:bg-rose/5 transition-all"
          >
            {t('lobby_login_to_join')}
          </a>
        )}

        {/* Connection state — small, non-blocking */}
        {conn !== 'connected' && room.status !== 'finished' && (
          <p className={`text-[13px] px-4 py-2 rounded-xl border w-full text-center flex items-center justify-center gap-2 ${
            conn === 'offline'
              ? 'text-red-600 bg-red-50 border-red-100'
              : conn === 'connecting'
              ? 'text-muted bg-cream border-line'
              : 'text-amber-700 bg-amber-50 border-amber-200'
          }`}>
            <span className={`inline-block w-2 h-2 rounded-full ${
              conn === 'offline' ? 'bg-red-500' : conn === 'connecting' ? 'bg-muted/40' : 'bg-amber-500 animate-pulse'
            }`} />
            {conn === 'offline' ? t('conn_offline')
              : conn === 'connecting' ? t('conn_connecting')
              : conn === 'reconnecting' ? t('conn_reconnecting')
              : t('conn_degraded')}
          </p>
        )}

        {error && (
          <p className="text-[13px] text-red-600 bg-red-50 px-4 py-2 rounded-xl border border-red-100 w-full text-center">
            {error}
          </p>
        )}

        {/* Board */}
        <div className="overflow-x-auto w-full flex justify-center pb-1">
          <div
            className={`inline-grid border-2 rounded-xl select-none shadow-md ${
              room.status === 'finished' ? 'border-line/60'
              : timerDanger ? 'border-red-400'
              : isMyTurn ? 'border-rose/50'
              : 'border-line'
            }`}
            style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)`, background: '#f0d4a0' }}
          >
            {Array.from({ length: 225 }, (_, i) => {
              const cell = i === pendingCell && !board[i] ? mySymbol : board[i]
              const isWin = winCells.has(i)
              // Highlight the undo-able cell (last move, if canUndo)
              const canClick = isMyTurn && !board[i] && i !== pendingCell && room.status === 'playing' && canConfirmState
              return (
                <button
                  key={i}
                  onClick={() => handleClick(i)}
                  disabled={!canClick || isPending}
                  className={`w-9 h-9 sm:w-10 sm:h-10 border border-[#c8a870]/50 flex items-center justify-center transition-colors
                    ${isWin ? 'bg-yellow-300' : ''}
                    ${canClick ? 'hover:bg-rose/20 cursor-pointer' : 'cursor-default'}
                    ${i === pendingCell ? 'opacity-50' : ''}
                  `}
                >
                  {cell === 'X' && <span className="font-black text-[17px] sm:text-[20px] text-blue-700 leading-none select-none">✕</span>}
                  {cell === 'O' && <span className="font-black text-[17px] sm:text-[20px] text-rose leading-none select-none">○</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 flex-wrap justify-center">

          {room.status === 'playing' && mySymbol && (
            <button
              onClick={handleSurrender}
              disabled={isPending}
              className="text-[13px] font-semibold px-5 py-2.5 rounded-xl border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-all disabled:opacity-50"
            >
              {t('surrender')}
            </button>
          )}
          {room.status === 'finished' && (
            <a
              href="/games/caro"
              className="inline-flex items-center gap-2 text-[13.5px] font-semibold px-5 py-2.5 rounded-xl bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_12px_-2px_rgba(194,24,91,0.4)]"
            >
              {t('play_again')}
            </a>
          )}
          <a
            href="/games/caro"
            className="text-[13px] font-medium px-5 py-2.5 rounded-xl border border-line text-muted hover:bg-line transition-all"
          >
            {t('back_lobby')}
          </a>
        </div>
      </div>

      {/* ── RIGHT: chat ─────────────────────────────────────────────────── */}
      <div className="w-full lg:w-[300px] lg:flex-none lg:sticky lg:top-[80px]" style={{ height: 'clamp(360px, 60vh, 560px)' }}>
        <CaroChat
          roomId={room.id}
          userId={userId}
          mySymbol={mySymbol}
          myName={myName}
        />
      </div>
    </div>
    </>
  )
}

// ── PlayerCard ────────────────────────────────────────────────────────────────
function PlayerCard({
  symbol, name, active, winner,
}: {
  symbol: 'X' | 'O'
  name: string | null
  active: boolean
  winner: boolean
}) {
  const t = useTranslations('games.caro')
  const isX = symbol === 'X'
  return (
    <div className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
      active
        ? isX ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-rose/40 bg-rose/5 shadow-sm'
        : 'border-line bg-cream/50'
    }`}>
      <span className={`text-[18px] font-black flex-none ${isX ? 'text-blue-600' : 'text-rose'}`}>
        {isX ? '✕' : '○'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted/50">{isX ? t('player_x_label') : t('player_o_label')}</p>
        <p className="text-[13px] font-semibold text-ink truncate">
          {name ?? <span className="text-muted/40 italic text-[12px]">{t('waiting_player')}</span>}
        </p>
      </div>
      {active && (
        <span className={`ml-auto text-[9.5px] font-bold px-1.5 py-0.5 rounded-full flex-none ${
          isX ? 'bg-blue-500 text-white' : 'bg-rose text-white'
        }`}>
          {t('turn_badge')}
        </span>
      )}
      {winner && <span className="ml-auto text-[16px] flex-none">🏆</span>}
    </div>
  )
}
