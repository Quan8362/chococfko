import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import CaroLobby from './CaroLobby'

export const metadata = { title: 'Cờ Caro Online · Chợ Cóc FKO' }
export const dynamic = 'force-dynamic'

export default async function CaroPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="max-w-[800px] mx-auto px-5 sm:px-6 py-10 pb-20">

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
    </div>
  )
}
