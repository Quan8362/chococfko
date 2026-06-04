'use client'

import { useEffect, useState, useCallback, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { makeMove, surrenderGame, type CaroRoom } from '../actions'

const SIZE = 15

type Props = {
  initialRoom: CaroRoom
  userId: string | null
  playerXName: string
  playerOName: string | null
}

function parseBoard(raw: unknown): (string | null)[] {
  const arr = Array.isArray(raw) ? raw : []
  return arr.length === 225 ? arr : Array(225).fill(null)
}

export default function CaroGame({ initialRoom, userId, playerXName, playerOName }: Props) {
  const [room, setRoom] = useState<CaroRoom>(initialRoom)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pendingCell, setPendingCell] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const board = parseBoard(room.board)
  const winCells = new Set<number>(room.winning_cells ?? [])

  const mySymbol: 'X' | 'O' | null =
    userId === room.player_x ? 'X' : userId === room.player_o ? 'O' : null

  const isMyTurn = room.status === 'playing' && room.current_turn === mySymbol

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/games/caro/${room.room_code}`
      : ''

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`caro:${room.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'caro_rooms', filter: `id=eq.${room.id}` },
        (payload) => {
          setRoom(payload.new as CaroRoom)
          setPendingCell(null)
          setError(null)
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [room.id])

  // ── Handle cell click ──────────────────────────────────────────────────────
  const handleClick = useCallback((index: number) => {
    if (!isMyTurn || isPending || board[index] || room.status !== 'playing') return
    setPendingCell(index)
    setError(null)
    startTransition(async () => {
      const result = await makeMove(room.id, index)
      if (result?.error) {
        setError('Không thể đi nước này. Thử lại!')
        setPendingCell(null)
      }
    })
  }, [isMyTurn, isPending, board, room.id, room.status])

  // ── Handle surrender ──────────────────────────────────────────────────────
  const handleSurrender = () => {
    if (!window.confirm('Bạn chắc chắn muốn đầu hàng?')) return
    startTransition(async () => {
      await surrenderGame(room.id)
    })
  }

  // ── Copy invite link ───────────────────────────────────────────────────────
  const copyLink = () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Status label ──────────────────────────────────────────────────────────
  const statusLabel = (() => {
    if (room.status === 'waiting') return '⏳ Đang chờ người chơi thứ 2…'
    if (room.status === 'finished') {
      if (room.winner === 'draw') return '🤝 Hòa!'
      if (room.winner === mySymbol) return '🎉 Bạn thắng!'
      if (room.winner && mySymbol) return '😢 Bạn thua!'
      return room.winner === 'X' ? `🎉 ${playerXName} thắng!` : `🎉 ${playerOName ?? 'O'} thắng!`
    }
    if (room.current_turn === mySymbol) return '👆 Đến lượt bạn!'
    return `⏳ Đợi ${room.current_turn === 'X' ? playerXName : (playerOName ?? 'O')} đi…`
  })()

  return (
    <div className="flex flex-col items-center gap-5 pb-16">

      {/* Room info bar */}
      <div className="w-full max-w-[500px] bg-paper border border-line rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="text-[11px] text-muted/60 font-medium uppercase tracking-wider">Mã phòng</span>
          <p className="font-mono font-bold text-[18px] text-ink tracking-widest">{room.room_code}</p>
        </div>
        <button
          onClick={copyLink}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-2 rounded-xl bg-cream border border-line hover:bg-rose/5 hover:border-rose/30 transition-all text-ink"
        >
          {copied ? (
            <><svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Đã sao chép!</>
          ) : (
            <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Copy link mời</>
          )}
        </button>
      </div>

      {/* Players + status */}
      <div className="w-full max-w-[500px]">
        <div className="flex items-center gap-2 mb-2">
          {/* X */}
          <div className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
            room.status === 'playing' && room.current_turn === 'X'
              ? 'border-blue-300 bg-blue-50 shadow-sm'
              : 'border-line bg-cream/50'
          }`}>
            <span className="text-[18px] font-black text-blue-600">✕</span>
            <div className="min-w-0">
              <p className="text-[12px] text-muted/60">Người chơi X</p>
              <p className="text-[13.5px] font-semibold text-ink truncate">{playerXName}</p>
            </div>
            {room.status === 'playing' && room.current_turn === 'X' && (
              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500 text-white">Lượt</span>
            )}
            {room.winner === 'X' && <span className="ml-auto text-[16px]">🏆</span>}
          </div>

          <span className="text-[13px] font-bold text-muted/50">VS</span>

          {/* O */}
          <div className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
            room.status === 'playing' && room.current_turn === 'O'
              ? 'border-rose/50 bg-rose/5 shadow-sm'
              : 'border-line bg-cream/50'
          }`}>
            {room.player_o ? (
              <>
                <span className="text-[18px] font-black text-rose">○</span>
                <div className="min-w-0">
                  <p className="text-[12px] text-muted/60">Người chơi O</p>
                  <p className="text-[13.5px] font-semibold text-ink truncate">{playerOName ?? '…'}</p>
                </div>
                {room.status === 'playing' && room.current_turn === 'O' && (
                  <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose text-white">Lượt</span>
                )}
                {room.winner === 'O' && <span className="ml-auto text-[16px]">🏆</span>}
              </>
            ) : (
              <div className="flex items-center gap-2 text-muted/50">
                <span className="text-[18px]">👤</span>
                <p className="text-[13px]">Chờ người chơi…</p>
              </div>
            )}
          </div>
        </div>

        {/* Status banner */}
        <div className={`text-center text-[13.5px] font-semibold py-2 px-4 rounded-xl ${
          room.status === 'finished'
            ? room.winner === mySymbol
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : room.winner === 'draw'
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'bg-red-50 text-red-600 border border-red-200'
            : 'bg-cream border border-line text-ink'
        }`}>
          {statusLabel}
        </div>
      </div>

      {/* Waiting overlay hint */}
      {room.status === 'waiting' && mySymbol === 'X' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5 text-[13px] text-amber-800 text-center max-w-[400px]">
          Chia sẻ link mời hoặc mã phòng <strong>{room.room_code}</strong> để bạn bè tham gia.
        </div>
      )}

      {error && (
        <p className="text-[13px] text-red-600 bg-red-50 px-4 py-2 rounded-xl border border-red-100">
          {error}
        </p>
      )}

      {/* Board */}
      <div className="overflow-x-auto w-full flex justify-center pb-2">
        <div
          className={`inline-grid border-2 rounded-lg select-none ${
            room.status === 'finished' ? 'border-line' : isMyTurn ? 'border-rose/40' : 'border-line'
          }`}
          style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)`, background: '#f0d4a0' }}
        >
          {Array.from({ length: 225 }, (_, i) => {
            const cell = i === pendingCell && !board[i] ? mySymbol : board[i]
            const isWin = winCells.has(i)
            const canClick = isMyTurn && !board[i] && i !== pendingCell && room.status === 'playing'

            return (
              <button
                key={i}
                onClick={() => handleClick(i)}
                disabled={!canClick || isPending}
                className={`w-9 h-9 sm:w-10 sm:h-10 border border-[#c8a870]/50 flex items-center justify-center transition-colors relative
                  ${isWin ? 'bg-yellow-300' : ''}
                  ${canClick ? 'hover:bg-rose/20 cursor-pointer' : 'cursor-default'}
                  ${i === pendingCell ? 'opacity-60' : ''}
                `}
              >
                {cell === 'X' && (
                  <span className="font-black text-[17px] sm:text-[20px] text-blue-700 leading-none select-none">✕</span>
                )}
                {cell === 'O' && (
                  <span className="font-black text-[17px] sm:text-[20px] text-rose leading-none select-none">○</span>
                )}
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
            🏳️ Đầu hàng
          </button>
        )}
        {room.status === 'finished' && (
          <a
            href="/games/caro"
            className="inline-flex items-center gap-2 text-[13.5px] font-semibold px-5 py-2.5 rounded-xl bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_12px_-2px_rgba(194,24,91,0.4)]"
          >
            ♟️ Chơi ván mới
          </a>
        )}
        <a
          href="/games/caro"
          className="text-[13px] font-medium px-5 py-2.5 rounded-xl border border-line text-muted hover:bg-line transition-all"
        >
          ← Về lobby
        </a>
      </div>
    </div>
  )
}
