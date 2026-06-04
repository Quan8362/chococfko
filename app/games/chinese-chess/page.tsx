import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import ChineseChessLobby from './ChineseChessLobby'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.chinese_chess')
  return { title: `${t('title')} · Chợ Cóc FKO` }
}

type HistoryRow = {
  id: string
  room_code: string
  winner: 'red' | 'black' | 'draw' | null
  end_reason: string | null
  player_red: string | null
  player_black: string | null
  player_red_name: string
  player_black_name: string
  move_count: number
  finished_at: string | null
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1) return 'vừa xong'
  if (diff < 60) return `${diff}m`
  const hrs = Math.floor(diff / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export default async function ChineseChessPage() {
  const [t, supabase, admin] = await Promise.all([
    getTranslations('games.chinese_chess'),
    Promise.resolve(createClient()),
    Promise.resolve(createAdminClient()),
  ])

  const [{ data: { user } }, { data: history }] = await Promise.all([
    supabase.auth.getUser(),
    admin
      .from('chinese_chess_history')
      .select('id,room_code,winner,end_reason,player_red,player_black,player_red_name,player_black_name,move_count,finished_at')
      .limit(10),
  ])

  const rows = (history ?? []) as HistoryRow[]

  return (
    <div className="max-w-[900px] mx-auto px-5 sm:px-6 py-10 pb-20">

      {/* ── Breadcrumb ── */}
      <Link
        href="/games"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors group mb-8"
      >
        <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('breadcrumb')}
      </Link>

      {/* ── Hero ── */}
      <div className="mb-10">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          {t('badge')}
        </span>
        <h1 className="font-serif font-bold text-[clamp(28px,4.5vw,44px)] leading-tight tracking-[-0.5px] text-ink mb-3">
          {t('title')}
        </h1>
        <p className="text-[15px] text-muted leading-relaxed max-w-[520px]">
          {t('subtitle')}
        </p>
      </div>

      {/* ── Main content: 2 cols on md ── */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] gap-8 items-start mb-12">

        {/* Left: Action cards */}
        <div className="flex flex-col gap-4 min-w-0">
          {user ? (
            <ChineseChessLobby />
          ) : (
            /* Login prompt */
            <div className="bg-gradient-to-br from-[#fdeef5] to-cream border border-rose/20 rounded-2xl px-6 py-6">
              <p className="font-serif font-bold text-[20px] text-ink mb-1">{t('login_heading')}</p>
              <p className="text-[13.5px] text-muted leading-relaxed mb-4">{t('login_desc')}</p>
              <Link
                href="/dang-nhap"
                className="inline-flex font-semibold text-[14px] px-7 py-3 rounded-2xl bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_4px_18px_-4px_rgba(194,24,91,0.45)]"
              >
                {t('login_btn')}
              </Link>
            </div>
          )}

          {/* Piece reference */}
          <div className="bg-paper border border-line rounded-2xl px-5 py-4">
            <p className="text-[11px] font-bold text-muted uppercase tracking-wide mb-3">
              {t('piece_legend')}
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {[
                { red: '帥', black: '將', name: 'Tướng' },
                { red: '仕', black: '士', name: 'Sĩ' },
                { red: '相', black: '象', name: 'Tượng' },
                { red: '馬', black: '馬', name: 'Mã' },
                { red: '車', black: '車', name: 'Xe' },
                { red: '炮', black: '砲', name: 'Pháo' },
                { red: '兵', black: '卒', name: 'Tốt' },
              ].map(({ red, black, name }) => (
                <div key={name} className="flex items-center gap-2.5">
                  <div className="flex gap-1 flex-none">
                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-red-400 to-red-700 text-white text-[13px] font-bold font-serif border border-red-900/40 flex items-center justify-center shadow-sm">
                      {red}
                    </span>
                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-900 text-amber-100 text-[13px] font-bold font-serif border border-zinc-950/60 flex items-center justify-center shadow-sm">
                      {black}
                    </span>
                  </div>
                  <span className="text-[12.5px] text-muted">{name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: How to play */}
        <div className="min-w-0">
          <div className="bg-paper border border-line rounded-2xl px-5 py-5">
            <p className="font-serif font-bold text-[17px] text-ink mb-4">{t('how_to_play')}</p>
            <div className="flex flex-col gap-4">
              {[
                { icon: '🚪', step: t('how_step_1') },
                { icon: '🔗', step: t('how_step_2') },
                { icon: '♟️', step: t('how_step_3') },
                { icon: '🏆', step: t('how_step_4') },
              ].map(({ icon, step }, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-8 h-8 rounded-xl bg-rose/10 flex items-center justify-center text-[16px] flex-none mt-0.5">
                    {icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-[12.5px] text-muted uppercase tracking-widest font-semibold mb-0.5">
                      {t('step_label', { n: i + 1 })}
                    </p>
                    <p className="text-[13.5px] text-ink leading-snug">{step}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick rules */}
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 text-[12.5px] text-amber-800 leading-relaxed space-y-1.5">
            <p className="font-semibold flex items-center gap-1.5"><span>📋</span> {t('rules_title')}</p>
            <p>• {t('rules_board')}</p>
            <p>• {t('rules_win')}</p>
            <p>• {t('rules_turn')}</p>
          </div>
        </div>
      </div>

      {/* ── Match history ── */}
      {rows.length > 0 && (
        <div>
          <h2 className="font-serif font-bold text-[20px] text-ink mb-4 flex items-center gap-2">
            📜 {t('history_heading')}
            <span className="text-[12px] font-normal text-muted/50 font-sans">({rows.length})</span>
          </h2>
          <div className="bg-paper border border-line rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_32px_1fr_80px_44px] gap-x-2 px-4 py-2 bg-cream/60 border-b border-line text-[11px] font-bold text-muted/60 uppercase tracking-widest">
              <span>{t('history_red')}</span>
              <span className="text-center">vs</span>
              <span>{t('history_black')}</span>
              <span className="text-center">Kết quả</span>
              <span className="text-right">Time</span>
            </div>
            {rows.map((row, idx) => {
              const isRW = row.winner === 'red'
              const isBW = row.winner === 'black'
              const isDraw = row.winner === 'draw'
              const myRow = user && (row.player_red === user.id || row.player_black === user.id)
              return (
                <div
                  key={row.id}
                  className={[
                    'grid grid-cols-[1fr_32px_1fr_80px_44px] gap-x-2 px-4 py-2.5 items-center text-[12.5px]',
                    myRow ? 'bg-rose/[0.03]' : '',
                    idx < rows.length - 1 ? 'border-b border-line/50' : '',
                  ].join(' ')}
                >
                  <div className={`flex items-center gap-1.5 min-w-0 ${isRW ? 'font-semibold text-red-700' : 'text-ink'}`}>
                    <span className="w-2 h-2 rounded-full bg-red-500 flex-none" />
                    <span className="truncate">{row.player_red_name}</span>
                    {isRW && <span className="flex-none text-[13px]">🏆</span>}
                  </div>
                  <span className="text-center text-[10px] font-bold text-muted/35">vs</span>
                  <div className={`flex items-center gap-1.5 min-w-0 ${isBW ? 'font-semibold text-ink' : 'text-ink'}`}>
                    <span className="w-2 h-2 rounded-full bg-zinc-700 flex-none" />
                    <span className="truncate">{row.player_black_name}</span>
                    {isBW && <span className="flex-none text-[13px]">🏆</span>}
                  </div>
                  <div className="flex justify-center">
                    {isDraw ? (
                      <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">{t('draw')}</span>
                    ) : isRW ? (
                      <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">{t('win_red')}</span>
                    ) : (
                      <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700 border border-zinc-300">{t('win_black')}</span>
                    )}
                  </div>
                  <div className="text-right text-[11px] text-muted/55 whitespace-nowrap">
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
