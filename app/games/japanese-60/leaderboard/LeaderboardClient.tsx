'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import UserAvatar from '@/components/UserAvatar'
import { getJp60Leaderboard, type LeaderboardResult, type LeaderboardScope } from '../leaderboard-actions'

const LEVELS = ['all', 'N5', 'N4', 'N3', 'N2', 'N1', 'MIXED']

export function LeaderboardClient() {
  const t = useTranslations('games.jp60')
  const [scope, setScope] = useState<LeaderboardScope>('today')
  const [mode, setMode] = useState<'all' | 'daily' | 'rush'>('all')
  const [level, setLevel] = useState('all')
  const [data, setData] = useState<LeaderboardResult | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const res = await getJp60Leaderboard({ scope, mode, level })
      setData(res)
    })
  }, [scope, mode, level])

  return (
    <div className="max-w-[640px] mx-auto px-5 sm:px-6 py-8 pb-20">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-serif font-bold text-[24px] text-ink">{t('lb_title')}</h1>
        <Link href="/games/japanese-60" className="text-[13px] text-rose font-semibold hover:underline">{t('play_now')}</Link>
      </div>

      <div role="tablist" className="flex gap-1 bg-paper border border-line rounded-xl p-1 mb-3">
        {(['today', 'week', 'alltime'] as const).map((s) => (
          <button key={s} role="tab" aria-selected={scope === s} onClick={() => setScope(s)}
            className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition-colors ${scope === s ? 'bg-rose text-white' : 'text-muted hover:text-ink'}`}>
            {t(`lb_${s === 'week' ? 'week' : s}`)}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        <select value={mode} onChange={(e) => setMode(e.target.value as any)} aria-label={t('lb_filter_mode')} className="flex-1 border border-line rounded-lg px-3 py-2 text-[13px] bg-paper">
          <option value="all">{t('lb_mode_all')}</option>
          <option value="daily">{t('lb_mode_daily')}</option>
          <option value="rush">{t('lb_mode_rush')}</option>
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label={t('lb_filter_level')} className="flex-1 border border-line rounded-lg px-3 py-2 text-[13px] bg-paper">
          {LEVELS.map((l) => <option key={l} value={l}>{l === 'all' ? t('lb_mode_all') : l === 'MIXED' ? t('level_mixed') : l}</option>)}
        </select>
      </div>

      {pending && !data ? (
        <p className="text-center text-muted py-12 animate-pulse">{t('loading')}</p>
      ) : !data || data.rows.length === 0 ? (
        <p className="text-center text-muted py-12">{t('lb_empty')}</p>
      ) : (
        <div className="bg-paper border border-line rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[36px_1fr_56px_64px] gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted border-b border-line">
            <span>{t('lb_rank')}</span><span>{t('lb_player')}</span><span className="text-right">{t('lb_player_level')}</span><span className="text-right">{t('lb_score')}</span>
          </div>
          {data.rows.map((r) => <Row key={r.rank} r={r} t={t} />)}
          {data.me && (
            <>
              <div className="text-center text-muted py-1 text-[11px]">···</div>
              <Row r={data.me} t={t} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ r, t }: { r: any; t: any }) {
  return (
    <div className={`grid grid-cols-[36px_1fr_56px_64px] gap-2 px-4 py-2.5 items-center border-b border-line/50 last:border-0 ${r.isCurrentUser ? 'bg-rose/5' : ''}`}>
      <span className="text-[14px] font-bold text-ink tabular-nums">{medal(r.rank)}</span>
      <span className="flex items-center gap-2 min-w-0">
        {/* Same canonical resolver as the header — proxies OAuth/Supabase avatars
            and falls back to initials on missing/failed images (no broken icon). */}
        <UserAvatar src={r.avatarUrl} name={r.displayName} size={28} alt={t('lb_avatar_alt', { name: r.displayName })} />
        <span className="text-[14px] text-ink truncate min-w-0">
          {r.displayName}
          {r.isCurrentUser && <span className="text-rose shrink-0"> ({t('lb_you')})</span>}
        </span>
      </span>
      <span className="text-right text-[12px] text-muted tabular-nums whitespace-nowrap">{t('lb_level_value', { n: r.level })}</span>
      <span className="text-right text-[14px] font-bold text-rose tabular-nums">{r.score}</span>
    </div>
  )
}

function medal(rank: number): string {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank)
}
