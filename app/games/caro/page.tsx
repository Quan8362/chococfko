import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import CaroLobby from './CaroLobby'

export const metadata = { title: 'Cờ Caro Online · Chợ Cóc FKO' }
export const dynamic = 'force-dynamic'

type HistoryRow = {
  id: string
  room_code: string
  winner: 'X' | 'O' | 'draw' | null
  player_x: string | null
  player_o: string | null
  player_x_name: string
  player_o_name: string
  finished_at: string | null
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1) return 'vừa xong'
  if (diff < 60) return `${diff} phút trước`
  const hrs = Math.floor(diff / 60)
  if (hrs < 24) return `${hrs} giờ trước`
  return `${Math.floor(hrs / 24)} ngày trước`
}

export default async function CaroPage() {
  const supabase = createClient()
  const admin = createAdminClient()

  const [{ data: { user } }, { data: history }] = await Promise.all([
    supabase.auth.getUser(),
    admin
      .from('caro_games_history')
      .select('id,room_code,winner,player_x,player_o,player_x_name,player_o_name,finished_at')
      .limit(15),
  ])

  const rows = (history ?? []) as HistoryRow[]

  return (
    <div className="max-w-[860px] mx-auto px-5 sm:px-6 py-10 pb-20">

      {/* Breadcrumb */}
      <Link
        href="/games"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors group mb-7"
      >
        <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Mini Game
      </Link>

      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          ⚫ Cờ Caro
        </span>
        <h1 className="font-serif font-bold text-[clamp(26px,4vw,40px)] leading-tight tracking-[-0.4px] text-ink mb-2">
          Cờ Caro Online Realtime
        </h1>
        <p className="text-[14.5px] text-muted leading-relaxed max-w-[480px]">
          Tạo phòng, mời bạn bè và đấu cờ caro trực tiếp. Ai có 5 quân liên tiếp thì thắng!
        </p>
      </div>

      {/* Rules */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-8 flex items-start gap-3">
        <span className="text-[18px] flex-none mt-0.5">📋</span>
        <div className="text-[13px] text-amber-800 leading-relaxed space-y-0.5">
          <p><strong>Luật chơi:</strong> Bàn cờ 15×15, 2 người chơi X và O.</p>
          <p>Người nào xếp được <strong>5 quân liên tiếp</strong> (ngang, dọc, chéo) trước thì thắng.</p>
          <p>Người tạo phòng đi trước (X). Mỗi lượt chỉ được đi một nước.</p>
        </div>
      </div>

      {/* Lobby or Login prompt */}
      {user ? (
        <CaroLobby />
      ) : (
        <div className="bg-gradient-to-br from-[#fdeef5] to-cream border border-rose/15 rounded-2xl px-6 py-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[14.5px] font-semibold text-ink mb-0.5">Đăng nhập để chơi</p>
            <p className="text-[13px] text-muted">Bạn cần đăng nhập để tạo phòng hoặc tham gia.</p>
          </div>
          <Link
            href="/dang-nhap"
            className="flex-none font-semibold text-[13.5px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_10px_-2px_rgba(194,24,91,0.35)] whitespace-nowrap"
          >
            Đăng nhập
          </Link>
        </div>
      )}

      {/* ── GAME HISTORY ─────────────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="mt-12">
          <h2 className="font-serif font-bold text-[20px] text-ink mb-4 flex items-center gap-2">
            📜 Lịch sử ván đấu
            <span className="text-[12px] font-normal text-muted/60 font-sans">({rows.length} ván gần nhất)</span>
          </h2>

          <div className="bg-paper border border-line rounded-2xl overflow-hidden">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_40px_1fr_80px_70px] gap-x-3 px-4 py-2.5 bg-cream/60 border-b border-line text-[11.5px] font-semibold text-muted/70 uppercase tracking-wide">
              <span>Người chơi X</span>
              <span className="text-center">VS</span>
              <span>Người chơi O</span>
              <span className="text-center">Kết quả</span>
              <span className="text-right">Thời gian</span>
            </div>

            {rows.map((row, idx) => {
              const isXWin = row.winner === 'X'
              const isOWin = row.winner === 'O'
              const isDraw = row.winner === 'draw'
              const myRow = user && (row.player_x === user.id || row.player_o === user.id)

              return (
                <div
                  key={row.id}
                  className={`grid grid-cols-[1fr_40px_1fr_80px_70px] gap-x-3 px-4 py-3 items-center text-[13.5px] transition-colors
                    ${myRow ? 'bg-rose/[0.03]' : ''}
                    ${idx < rows.length - 1 ? 'border-b border-line/60' : ''}
                  `}
                >
                  {/* Player X */}
                  <div className={`flex items-center gap-1.5 min-w-0 ${isXWin ? 'font-semibold text-blue-700' : 'text-ink'}`}>
                    <span className="text-[11px] font-black text-blue-600 flex-none">✕</span>
                    <span className="truncate">{row.player_x_name}</span>
                    {isXWin && <span className="text-[14px] flex-none">🏆</span>}
                  </div>

                  <span className="text-center text-[11px] font-bold text-muted/40">VS</span>

                  {/* Player O */}
                  <div className={`flex items-center gap-1.5 min-w-0 ${isOWin ? 'font-semibold text-rose' : 'text-ink'}`}>
                    <span className="text-[11px] font-black text-rose flex-none">○</span>
                    <span className="truncate">{row.player_o_name}</span>
                    {isOWin && <span className="text-[14px] flex-none">🏆</span>}
                  </div>

                  {/* Result badge */}
                  <div className="flex justify-center">
                    {isDraw ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Hòa</span>
                    ) : isXWin ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">X thắng</span>
                    ) : (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose/10 text-rose border border-rose/20">O thắng</span>
                    )}
                  </div>

                  {/* Time */}
                  <div className="text-right text-[11.5px] text-muted/60 whitespace-nowrap">
                    {row.finished_at ? relativeTime(row.finished_at) : '—'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
