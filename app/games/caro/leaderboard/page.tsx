import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.caro')
  return { title: `${t('leaderboard_title')}` }
}

type LeaderboardRow = {
  user_id: string
  tournaments_played: number
  championships: number
  wins: number
  losses: number
  draws: number
  matches_played: number
  win_rate: number
}

export default async function CaroLeaderboardPage() {
  const t = await getTranslations('games.caro')
  const admin = createAdminClient()
  const supabase = createClient()

  const [
    { data: { user } },
    { data: rows, error },
  ] = await Promise.all([
    supabase.auth.getUser(),
    admin
      .from('caro_tournament_leaderboard')
      .select('*')
      .order('championships', { ascending: false })
      .order('wins', { ascending: false })
      .order('win_rate', { ascending: false })
      .limit(100),
  ])

  if (error) {
    console.error('[Caro leaderboard] view query failed — run migration_caro_leaderboard.sql', error)
  }

  const leaderboard = (rows ?? []) as LeaderboardRow[]

  const nameMap: Record<string, string> = {}
  if (leaderboard.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, display_name')
      .in('id', leaderboard.map(r => r.user_id))
    profiles?.forEach(p => {
      if (p.display_name) nameMap[p.id] = p.display_name
    })
  }

  return (
    <div className="max-w-[920px] mx-auto px-5 sm:px-6 py-10 pb-20">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12.5px] text-muted mb-7">
        <Link href="/games/caro" className="hover:text-rose transition-colors">
          {t('title')}
        </Link>
        <span>/</span>
        <span className="text-ink/70">{t('leaderboard_title')}</span>
      </div>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full mb-3">
            🏅 {t('leaderboard_title')}
          </span>
          <h1 className="font-serif font-bold text-[clamp(22px,3vw,34px)] leading-tight tracking-[-0.3px] text-ink mb-1.5">
            {t('leaderboard_title')}
          </h1>
          <p className="text-[14px] text-muted">{t('leaderboard_desc')}</p>
        </div>
        <Link
          href="/games/caro/tournaments"
          className="flex-none text-[12.5px] font-medium text-muted hover:text-rose transition-colors mt-1"
        >
          {t('tournaments_link')}
        </Link>
      </div>

      {/* Leaderboard table */}
      {leaderboard.length === 0 ? (
        <div className="text-center py-16 bg-cream/50 border border-dashed border-line rounded-2xl">
          <div className="text-[44px] mb-3">🏆</div>
          <p className="text-[15px] font-semibold text-ink mb-1">{t('leaderboard_empty')}</p>
          <p className="text-[13px] text-muted">{t('leaderboard_empty_sub')}</p>
          <Link
            href="/games/caro/tournaments"
            className="inline-block mt-5 text-[13px] font-semibold text-rose hover:underline"
          >
            {t('view_tournaments_link')}
          </Link>
        </div>
      ) : (
        <div className="bg-paper border border-line rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[640px]">
              <thead>
                <tr className="border-b border-line bg-cream/60">
                  <th className="text-left px-4 py-3 font-bold text-muted/60 w-12 text-[11px] uppercase tracking-wider">
                    {t('leaderboard_rank')}
                  </th>
                  <th className="text-left px-4 py-3 font-bold text-muted/60 text-[11px] uppercase tracking-wider">
                    {t('leaderboard_player')}
                  </th>
                  <th className="text-center px-3 py-3 font-bold text-amber-700 text-[11px] uppercase tracking-wider">
                    {t('leaderboard_championships')}
                  </th>
                  <th className="text-center px-3 py-3 font-bold text-muted/60 text-[11px] uppercase tracking-wider">
                    {t('leaderboard_tournaments')}
                  </th>
                  <th className="text-center px-3 py-3 font-bold text-muted/60 text-[11px] uppercase tracking-wider">
                    {t('leaderboard_matches')}
                  </th>
                  <th className="text-center px-3 py-3 font-bold text-emerald-700 text-[11px] uppercase tracking-wider">
                    {t('leaderboard_wins')}
                  </th>
                  <th className="text-center px-3 py-3 font-bold text-red-500 text-[11px] uppercase tracking-wider">
                    {t('leaderboard_losses')}
                  </th>
                  <th className="text-center px-3 py-3 font-bold text-amber-600 text-[11px] uppercase tracking-wider">
                    {t('leaderboard_draws')}
                  </th>
                  <th className="text-center px-3 py-3 font-bold text-teal text-[11px] uppercase tracking-wider whitespace-nowrap">
                    {t('leaderboard_win_rate')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, idx) => {
                  const isMe = user?.id === row.user_id
                  const displayName = nameMap[row.user_id] ?? row.user_id.slice(0, 8) + '…'
                  const winRate = Number(row.win_rate)

                  return (
                    <tr
                      key={row.user_id}
                      className={`border-b border-line/40 transition-colors last:border-0 ${
                        isMe
                          ? 'bg-rose/5'
                          : idx === 0
                          ? 'bg-amber-50/50'
                          : idx === 1
                          ? 'bg-slate-50/40'
                          : idx === 2
                          ? 'bg-orange-50/30'
                          : 'hover:bg-cream/60'
                      }`}
                    >
                      {/* Rank */}
                      <td className="px-4 py-3.5 font-mono text-[12px] text-center">
                        {idx === 0 ? (
                          <span className="text-[18px]">🥇</span>
                        ) : idx === 1 ? (
                          <span className="text-[18px]">🥈</span>
                        ) : idx === 2 ? (
                          <span className="text-[18px]">🥉</span>
                        ) : (
                          <span className="text-muted/40 font-medium">{idx + 1}</span>
                        )}
                      </td>

                      {/* Player */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-rose/10 flex-none flex items-center justify-center text-[11px] font-bold text-rose uppercase">
                            {displayName[0]}
                          </div>
                          <span className={`font-semibold truncate max-w-[180px] ${isMe ? 'text-rose' : 'text-ink'}`}>
                            {displayName}
                            {isMe && (
                              <span className="ml-1.5 text-[10px] font-normal text-rose/60">{t('you_label')}</span>
                            )}
                          </span>
                        </div>
                      </td>

                      {/* Championships */}
                      <td className="text-center px-3 py-3.5">
                        {row.championships > 0 ? (
                          <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                            🏆 {row.championships}
                          </span>
                        ) : (
                          <span className="text-muted/25">—</span>
                        )}
                      </td>

                      {/* Tournaments */}
                      <td className="text-center px-3 py-3.5 text-muted/70">{row.tournaments_played}</td>

                      {/* Matches */}
                      <td className="text-center px-3 py-3.5 text-muted/70">{row.matches_played}</td>

                      {/* Wins */}
                      <td className="text-center px-3 py-3.5 font-semibold text-emerald-700">{row.wins}</td>

                      {/* Losses */}
                      <td className="text-center px-3 py-3.5 text-red-500">{row.losses}</td>

                      {/* Draws */}
                      <td className="text-center px-3 py-3.5 text-amber-600">{row.draws}</td>

                      {/* Win rate */}
                      <td className="text-center px-3 py-3.5">
                        <span
                          className={`font-bold ${
                            winRate >= 70
                              ? 'text-emerald-600'
                              : winRate >= 50
                              ? 'text-teal'
                              : winRate > 0
                              ? 'text-muted/60'
                              : 'text-muted/30'
                          }`}
                        >
                          {winRate > 0 ? `${winRate}%` : '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 bg-cream/40 border-t border-line text-[11.5px] text-muted/50 text-center">
            {t('leaderboard_players_footer', { count: leaderboard.length })}
          </div>
        </div>
      )}
    </div>
  )
}
