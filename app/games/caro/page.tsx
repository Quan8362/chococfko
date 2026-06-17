import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import CaroLobby from './CaroLobby'
import CaroWaitingRooms from './CaroWaitingRooms'
import CaroHistoryClient, { type CaroHistoryRow } from './CaroHistoryClient'
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
      .order('finished_at', { ascending: false })
      .limit(100),
    fetchWaitingRooms(),
  ])

  const rawRows = (history ?? []) as HistoryRow[]
  const justNow = tCommon('just_now')
  const historyRows: CaroHistoryRow[] = rawRows.map(r => ({
    id: r.id,
    winner: r.winner,
    player_x: r.player_x,
    player_o: r.player_o,
    player_x_name: r.player_x_name,
    player_o_name: r.player_o_name,
    time_label: r.finished_at ? relativeTime(r.finished_at, justNow) : '—',
  }))

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

      {/* ── Tournament + Leaderboard banners ─────────────────────────────── */}
      <div className="mb-6 space-y-2">
        <Link
          href="/games/caro/tournaments"
          className="flex items-center justify-between gap-3 bg-gradient-to-r from-ink to-[#3a2d22] rounded-2xl px-5 py-4 hover:from-ink/90 transition-all group"
        >
          <div className="flex items-center gap-3">
            <span className="text-[28px]">🏆</span>
            <div>
              <p className="text-[14px] font-bold text-white">{t('tournament_page_title')}</p>
              <p className="text-[12px] text-white/60">{t('tournament_page_desc')}</p>
            </div>
          </div>
          <svg className="w-5 h-5 text-white/50 group-hover:text-white/80 transition-colors flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
        <Link
          href="/games/caro/leaderboard"
          className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 hover:bg-amber-100/70 transition-all group"
        >
          <div className="flex items-center gap-3">
            <span className="text-[22px]">🏅</span>
            <div>
              <p className="text-[13.5px] font-bold text-amber-900">{t('leaderboard_title')}</p>
              <p className="text-[11.5px] text-amber-700/70">{t('leaderboard_desc')}</p>
            </div>
          </div>
          <svg className="w-4 h-4 text-amber-400 group-hover:text-amber-600 transition-colors flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
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
            href="/login"
            className="flex-none font-semibold text-[13.5px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_10px_-2px_rgba(194,24,91,0.35)] whitespace-nowrap"
          >
            {t('login_btn')}
          </Link>
        </div>
      )}

      {/* ── Waiting Rooms Lobby ─────────────────────────────────────────────── */}
      <CaroWaitingRooms initialRooms={waitingRooms} userId={user?.id ?? null} />

      <CaroHistoryClient rows={historyRows} userId={user?.id ?? null} />
    </div>
  )
}
