import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import ChineseChessLobby from './ChineseChessLobby'
import ChineseChessWaitingRooms from './ChineseChessWaitingRooms'
import ChineseChessHistoryClient, { type ChessHistoryRow } from './ChineseChessHistoryClient'
import { fetchWaitingChessRooms, finalizeExpiredChessGames } from './actions'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.chinese_chess')
  return { title: `${t('title')}` }
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

function relativeTime(iso: string, justNow: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1) return justNow
  if (diff < 60) return `${diff}m`
  const hrs = Math.floor(diff / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export default async function ChineseChessPage() {
  const [t, tCommon, supabase, admin] = await Promise.all([
    getTranslations('games.chinese_chess'),
    getTranslations('common'),
    Promise.resolve(createClient()),
    Promise.resolve(createAdminClient()),
  ])

  // Server-authoritative safety net: finalize games whose per-turn deadline expired
  // while BOTH clients were offline (nobody claimed the timeout) BEFORE reading
  // history, so completed-but-stranded matches surface immediately. Fair (uses the
  // authoritative deadline), idempotent, browser-independent. Requires the
  // finalize_expired_chinese_chess_games RPC (migration_chinese_chess_finalize_timeout.sql).
  await finalizeExpiredChessGames().catch(() => { /* never block the lobby on this */ })

  const [{ data: { user } }, { data: history }, waitingRooms] = await Promise.all([
    supabase.auth.getUser(),
    admin
      .from('chinese_chess_history')
      .select('id,room_code,winner,end_reason,player_red,player_black,player_red_name,player_black_name,move_count,finished_at')
      .order('finished_at', { ascending: false })
      .limit(100),
    fetchWaitingChessRooms(),
  ])

  const rawRows = (history ?? []) as HistoryRow[]
  const justNow = tCommon('just_now')
  const historyRows: ChessHistoryRow[] = rawRows.map(r => ({
    id: r.id,
    winner: r.winner,
    player_red: r.player_red,
    player_black: r.player_black,
    player_red_name: r.player_red_name,
    player_black_name: r.player_black_name,
    time_label: r.finished_at ? relativeTime(r.finished_at, justNow) : '—',
  }))

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
            <>
              <ChineseChessLobby />
              {/* Link to personal history */}
              <Link
                href="/games/chinese-chess/history"
                className="flex items-center justify-between bg-paper border border-line hover:border-rose/30 rounded-2xl px-5 py-3.5 transition-colors group"
              >
                <span className="flex items-center gap-2.5 text-[13.5px] font-semibold text-ink group-hover:text-rose transition-colors">
                  📜 {t('my_history_link')}
                </span>
                <svg className="w-4 h-4 text-muted/40 group-hover:text-rose/60 transition-colors flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </>
          ) : (
            /* Login prompt */
            <div className="bg-gradient-to-br from-[#fdeef5] to-cream border border-rose/20 rounded-2xl px-6 py-6">
              <p className="font-serif font-bold text-[20px] text-ink mb-1">{t('login_heading')}</p>
              <p className="text-[13.5px] text-muted leading-relaxed mb-4">{t('login_desc')}</p>
              <Link
                href="/login"
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
                { red: '帥', black: '將', key: 'piece_general'  as const },
                { red: '仕', black: '士', key: 'piece_advisor'  as const },
                { red: '相', black: '象', key: 'piece_elephant' as const },
                { red: '馬', black: '馬', key: 'piece_horse'    as const },
                { red: '車', black: '車', key: 'piece_chariot'  as const },
                { red: '炮', black: '砲', key: 'piece_cannon'   as const },
                { red: '兵', black: '卒', key: 'piece_soldier'  as const },
              ].map(({ red, black, key }) => (
                <div key={key} className="flex items-center gap-2.5">
                  <div className="flex gap-1 flex-none">
                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-red-400 to-red-700 text-white text-[13px] font-bold font-serif border border-red-900/40 flex items-center justify-center shadow-sm">
                      {red}
                    </span>
                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-900 text-amber-100 text-[13px] font-bold font-serif border border-zinc-950/60 flex items-center justify-center shadow-sm">
                      {black}
                    </span>
                  </div>
                  <span className="text-[12.5px] text-muted">{t(key)}</span>
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

      {/* ── Waiting rooms lobby ── */}
      <ChineseChessWaitingRooms initialRooms={waitingRooms} userId={user?.id ?? null} />

      {/* ── Match history ── */}
      <ChineseChessHistoryClient rows={historyRows} userId={user?.id ?? null} />
    </div>
  )
}
