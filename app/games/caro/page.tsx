import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import CaroLobby from './CaroLobby'
import CaroWaitingRooms from './CaroWaitingRooms'
import { fetchWaitingRooms } from './actions'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.caro')
  return { title: `${t('title')} · Chợ Cóc FKO` }
}

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

function relativeTime(iso: string, justNow: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1) return justNow
  if (diff < 60) return `${diff}m`
  const hrs = Math.floor(diff / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export default async function CaroPage() {
  const [t, tc, tCommon, supabase, admin] = await Promise.all([
    getTranslations('games.caro'),
    getTranslations('games'),
    getTranslations('common'),
    Promise.resolve(createClient()),
    Promise.resolve(createAdminClient()),
  ])

  const [{ data: { user } }, { data: history }, waitingRooms] = await Promise.all([
    supabase.auth.getUser(),
    admin
      .from('caro_games_history')
      .select('id,room_code,winner,player_x,player_o,player_x_name,player_o_name,finished_at')
      .limit(15),
    fetchWaitingRooms(),
  ])

  const rows = (history ?? []) as HistoryRow[]

  return (
    <div className="max-w-[860px] mx-auto px-5 sm:px-6 py-10 pb-20">

      <Link
        href="/games"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors group mb-7"
      >
        <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('breadcrumb')}
      </Link>

      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          {t('badge')}
        </span>
        <h1 className="font-serif font-bold text-[clamp(26px,4vw,40px)] leading-tight tracking-[-0.4px] text-ink mb-2">
          {t('title')}
        </h1>
        <p className="text-[14.5px] text-muted leading-relaxed max-w-[480px]">
          {t('long_desc')}
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-8 flex items-start gap-3">
        <span className="text-[18px] flex-none mt-0.5">📋</span>
        <div className="text-[13px] text-amber-800 leading-relaxed space-y-0.5">
          <p><strong>{t('rules_title')}:</strong> {t('rules_board')}</p>
          <p>{t('rules_win')}</p>
          <p>{t('rules_turn')}</p>
        </div>
      </div>

      {user ? (
        <CaroLobby />
      ) : (
        <div className="bg-gradient-to-br from-[#fdeef5] to-cream border border-rose/15 rounded-2xl px-6 py-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[14.5px] font-semibold text-ink mb-0.5">{t('login_heading')}</p>
            <p className="text-[13px] text-muted">{t('login_desc')}</p>
          </div>
          <Link
            href="/dang-nhap"
            className="flex-none font-semibold text-[13.5px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_10px_-2px_rgba(194,24,91,0.35)] whitespace-nowrap"
          >
            {t('login_btn')}
          </Link>
        </div>
      )}

      {/* ── Waiting Rooms Lobby ─────────────────────────────────────────────── */}
      <CaroWaitingRooms initialRooms={waitingRooms} userId={user?.id ?? null} />

      {rows.length > 0 && (
        <div className="mt-12">
          <h2 className="font-serif font-bold text-[20px] text-ink mb-4 flex items-center gap-2">
            📜 {t('history_heading')}
            <span className="text-[12px] font-normal text-muted/60 font-sans">({rows.length})</span>
          </h2>
          <div className="bg-paper border border-line rounded-2xl overflow-hidden">
            {/* overflow-x-auto + min-w to keep layout on small screens */}
            <div className="overflow-x-auto">
              {/* Header */}
              <div className="grid grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)_100px_80px] gap-x-3 px-4 py-2.5 bg-cream/80 border-b border-line text-[11px] font-bold text-muted/60 uppercase tracking-widest min-w-[480px]">
                <span className="flex items-center gap-1.5">
                  <span className="text-[9px] font-black text-blue-500">✕</span>
                  {t('history_player_x')}
                </span>
                <span className="flex items-center justify-center text-center">{t('history_vs')}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[9px] font-black text-rose">○</span>
                  {t('history_player_o')}
                </span>
                <span className="text-center">{t('history_result')}</span>
                <span className="text-right">{t('history_time')}</span>
              </div>
              {/* Rows */}
              {rows.map((row, idx) => {
                const isXWin = row.winner === 'X'
                const isOWin = row.winner === 'O'
                const isDraw = row.winner === 'draw'
                const myRow = user && (row.player_x === user.id || row.player_o === user.id)
                return (
                  <div
                    key={row.id}
                    className={`grid grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)_100px_80px] gap-x-3 px-4 py-3.5 items-center text-[13px] transition-colors hover:bg-cream/60 min-w-[480px]
                      ${myRow ? 'bg-rose/[0.03]' : ''}
                      ${idx < rows.length - 1 ? 'border-b border-line/50' : ''}
                    `}
                  >
                    <div className={`flex items-center gap-1.5 min-w-0 ${isXWin ? 'font-semibold text-blue-700' : 'text-ink/90'}`}>
                      <span className="text-[10px] font-black text-blue-500 flex-none">✕</span>
                      <span className="truncate">{row.player_x_name}</span>
                      {isXWin && <span className="text-[13px] flex-none leading-none">🏆</span>}
                    </div>
                    <div className="flex items-center justify-center">
                      <span className="text-[10px] font-bold text-muted/50 bg-line/70 px-2 py-0.5 rounded-md tracking-wide">{t('history_vs')}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 min-w-0 ${isOWin ? 'font-semibold text-rose' : 'text-ink/90'}`}>
                      <span className="text-[10px] font-black text-rose flex-none">○</span>
                      <span className="truncate">{row.player_o_name}</span>
                      {isOWin && <span className="text-[13px] flex-none leading-none">🏆</span>}
                    </div>
                    <div className="flex justify-center">
                      {isDraw ? (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">{t('draw')}</span>
                      ) : isXWin ? (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200 whitespace-nowrap">{t('win_x')}</span>
                      ) : (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose/10 text-rose border border-rose/20 whitespace-nowrap">{t('win_o')}</span>
                      )}
                    </div>
                    <div className="text-right text-[11.5px] text-muted/60 whitespace-nowrap">
                      {row.finished_at ? relativeTime(row.finished_at, tCommon('just_now')) : '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
