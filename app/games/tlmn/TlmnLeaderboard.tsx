'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import UserAvatar from '@/components/UserAvatar'
import {
  fetchTlmnLeaderboard, type TlmnLeaderboardRow, type TlmnLeaderboardTab,
} from './actions'
import { formatCoinsShort, formatCoinsFull } from '@/lib/game/economy'
import { formatWinRate } from '@/lib/games/winRate'
import {
  getCoinTier, coinTierName, coinTierAria, type CoinTierTranslate, type CoinTier,
} from '@/lib/games/coinTier'

const PAGE_SIZE = 20

type TabState = {
  rows: TlmnLeaderboardRow[]
  loaded: boolean
  loading: boolean
  loadingMore: boolean
  error: boolean
  hasMore: boolean
}

const emptyTab = (): TabState => ({
  rows: [], loaded: false, loading: false, loadingMore: false, error: false, hasMore: false,
})

export default function TlmnLeaderboard({
  currentUserId,
  initialWins,
}: {
  currentUserId: string | null
  initialWins: TlmnLeaderboardRow[]
}) {
  const t = useTranslations('games.tlmn')
  const ctRaw = useTranslations('coin_tier')
  const ct = ctRaw as unknown as CoinTierTranslate

  const [tab, setTab] = useState<TlmnLeaderboardTab>('wins')
  const [state, setState] = useState<Record<TlmnLeaderboardTab, TabState>>(() => ({
    wins: {
      rows: initialWins,
      loaded: true,
      loading: false,
      loadingMore: false,
      error: false,
      hasMore: initialWins.length >= PAGE_SIZE,
    },
    coins: emptyTab(),
  }))
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  const load = useCallback(async (which: TlmnLeaderboardTab, mode: 'fresh' | 'more') => {
    setState(s => ({
      ...s,
      [which]: {
        ...s[which],
        loading: mode === 'fresh',
        loadingMore: mode === 'more',
        error: false,
      },
    }))
    const offset = mode === 'more' ? state[which].rows.length : 0
    const res = await fetchTlmnLeaderboard(which, PAGE_SIZE, offset)
    if (!mounted.current) return
    setState(s => {
      const prev = s[which]
      if (res.error) {
        return { ...s, [which]: { ...prev, loading: false, loadingMore: false, error: true, loaded: true } }
      }
      const merged = mode === 'more' ? dedupe([...prev.rows, ...res.rows]) : res.rows
      return {
        ...s,
        [which]: {
          rows: merged,
          loaded: true,
          loading: false,
          loadingMore: false,
          error: false,
          hasMore: res.rows.length >= PAGE_SIZE,
        },
      }
    })
  }, [state])

  // Lazy-load a tab the first time it's opened (wins is seeded from SSR).
  const selectTab = (which: TlmnLeaderboardTab) => {
    setTab(which)
    const ts = state[which]
    if (!ts.loaded && !ts.loading) void load(which, 'fresh')
  }

  const tierInfo = (balance: number): { tier: CoinTier | null; label?: string; name?: string } => {
    const def = getCoinTier(balance)
    if (!def) return { tier: null }
    return { tier: def.key, label: coinTierAria(ct, def), name: coinTierName(ct, def) }
  }

  const active = state[tab]

  return (
    <section className="mt-10" aria-labelledby="tlmn-lb-title">
      <h2
        id="tlmn-lb-title"
        className="font-serif font-bold text-[20px] tl-section-title mb-1 flex items-center gap-2.5"
      >
        <TrophyIcon className="flex-none w-[22px] h-[22px] text-[var(--tl-gold-deep)]" />
        {t('lb_section_title')}
      </h2>
      <p className="text-[13.5px] tl-section-sub mb-4 leading-relaxed">{t('lb_section_desc')}</p>

      <div className="tl-panel overflow-hidden">
        {/* Tabs */}
        <div role="tablist" aria-label={t('lb_section_title')} className="flex gap-1 p-2 border-b border-[var(--tl-cream-line)]">
          {(['wins', 'coins'] as const).map(key => {
            const selected = tab === key
            return (
              <button
                key={key}
                role="tab"
                id={`tlmn-lb-tab-${key}`}
                aria-selected={selected}
                aria-controls="tlmn-lb-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(key)}
                onKeyDown={e => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault()
                    selectTab(key === 'wins' ? 'coins' : 'wins')
                  }
                }}
                className={`flex-1 text-[13px] font-bold px-4 py-2.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tl-red)] ${
                  selected
                    ? 'bg-[var(--tl-red)] text-white shadow-[0_4px_12px_-5px_rgba(124,18,38,0.6)]'
                    : 'text-[var(--tl-text-soft)] hover:bg-[var(--tl-red)]/8'
                }`}
              >
                {key === 'wins' ? t('lb_tab_wins') : t('lb_tab_coins')}
              </button>
            )
          })}
        </div>

        <div id="tlmn-lb-panel" role="tabpanel" aria-labelledby={`tlmn-lb-tab-${tab}`}>
          {active.loading ? (
            <LeaderboardSkeleton />
          ) : active.error ? (
            <div className="px-5 py-12 text-center">
              <p className="text-[14px] font-semibold text-[var(--tl-red)] mb-1">{t('lb_error_title')}</p>
              <p className="text-[12.5px] text-[var(--tl-text-soft)] mb-4">{t('lb_error_desc')}</p>
              <button onClick={() => load(tab, 'fresh')} className="tl-btn-ghost text-[12.5px] px-5 py-2.5">
                {t('lb_retry')}
              </button>
            </div>
          ) : active.rows.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <TrophyIcon className="w-9 h-9 mx-auto mb-3 text-[var(--tl-gold)]/70" />
              <p className="text-[14px] font-semibold text-[var(--tl-text)] mb-1">{t('lb_empty_title')}</p>
              <p className="text-[12.5px] text-[var(--tl-text-soft)] max-w-[320px] mx-auto">{t('lb_empty_desc')}</p>
            </div>
          ) : (
            <>
              {/* ── Desktop / tablet table ── */}
              <div className="hidden sm:block">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--tl-cream-line)] text-[10.5px] uppercase tracking-wider text-[var(--tl-text-soft)]/70">
                      <th scope="col" className="text-center font-bold px-3 py-3 w-12">{t('lb_col_rank')}</th>
                      <th scope="col" className="text-left font-bold px-3 py-3">{t('lb_col_player')}</th>
                      <th scope="col" className="text-center font-bold px-3 py-3">{t('lb_col_matches')}</th>
                      <th scope="col" className="text-center font-bold px-3 py-3 text-[var(--tl-red)]">{t('lb_col_wins')}</th>
                      <th scope="col" className="text-center font-bold px-3 py-3">{t('lb_col_winrate')}</th>
                      <th scope="col" className="text-right font-bold px-3 py-3 text-[var(--tl-gold-deep)]">{t('lb_col_coins')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.rows.map(row => {
                      const ti = tierInfo(row.balance)
                      const isMe = currentUserId === row.user_id
                      const name = row.display_name?.trim() || t('lb_anon')
                      return (
                        <tr
                          key={row.user_id}
                          className={`border-b border-[var(--tl-cream-line)]/50 last:border-0 ${rowTint(row.rank, isMe)}`}
                        >
                          <td className="text-center px-3 py-3"><RankCell rank={row.rank} /></td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <UserAvatar src={row.avatar_url} name={name} size={34} tier={ti.tier} tierLabel={ti.label} />
                              <span className="min-w-0">
                                <span className={`font-semibold truncate block max-w-[200px] ${isMe ? 'text-[var(--tl-red)]' : 'text-[var(--tl-text)]'}`}>
                                  {name}
                                  {isMe && <span className="ml-1.5 text-[10px] font-normal text-[var(--tl-red)]/60">{t('lb_you')}</span>}
                                </span>
                                {ti.tier && (
                                  <span className="text-[10.5px] font-bold text-[var(--tl-gold-deep)]">{ti.name}</span>
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="text-center px-3 py-3 text-[var(--tl-text-soft)] tabular-nums">{row.total_games}</td>
                          <td className="text-center px-3 py-3 font-bold text-[var(--tl-red)] tabular-nums">{row.total_wins}</td>
                          <td className="text-center px-3 py-3 tabular-nums">
                            <WinRate rate={row.win_rate} games={row.total_games} dash={t('lb_dash')} />
                          </td>
                          <td className="text-right px-3 py-3">
                            <span className="font-black text-[var(--tl-gold-deep)] tabular-nums" title={`${formatCoinsFull(row.balance)} ${t('lb_coins_unit')}`}>
                              {formatCoinsShort(row.balance)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Mobile cards ── */}
              <ul className="sm:hidden divide-y divide-[var(--tl-cream-line)]/50">
                {active.rows.map(row => {
                  const ti = tierInfo(row.balance)
                  const isMe = currentUserId === row.user_id
                  const name = row.display_name?.trim() || t('lb_anon')
                  return (
                    <li key={row.user_id} className={`flex items-center gap-3 px-3.5 py-3 ${rowTint(row.rank, isMe)}`}>
                      <RankCell rank={row.rank} />
                      <UserAvatar src={row.avatar_url} name={name} size={40} tier={ti.tier} tierLabel={ti.label} />
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold truncate text-[14px] ${isMe ? 'text-[var(--tl-red)]' : 'text-[var(--tl-text)]'}`}>
                          {name}
                          {isMe && <span className="ml-1.5 text-[10px] font-normal text-[var(--tl-red)]/60">{t('lb_you')}</span>}
                        </p>
                        {/* Secondary stats — compact second row */}
                        <p className="text-[11px] text-[var(--tl-text-soft)] mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>{t('lb_col_wins')}: <b className="text-[var(--tl-red)] tabular-nums">{row.total_wins}</b></span>
                          <span aria-hidden>·</span>
                          <span>{t('lb_col_matches')}: <span className="tabular-nums">{row.total_games}</span></span>
                          <span aria-hidden>·</span>
                          <WinRate rate={row.win_rate} games={row.total_games} dash={t('lb_dash')} inline />
                        </p>
                      </div>
                      {/* Primary metric for the active tab */}
                      <div className="text-right flex-none">
                        {tab === 'coins' ? (
                          <span className="font-black text-[15px] text-[var(--tl-gold-deep)] tabular-nums" title={`${formatCoinsFull(row.balance)} ${t('lb_coins_unit')}`}>
                            {formatCoinsShort(row.balance)}
                          </span>
                        ) : (
                          <span className="font-black text-[16px] text-[var(--tl-red)] tabular-nums">{row.total_wins}</span>
                        )}
                        <p className="text-[9.5px] uppercase tracking-wide text-[var(--tl-text-soft)]/60">
                          {tab === 'coins' ? t('lb_col_coins') : t('lb_col_wins')}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>

              {/* Load more */}
              {active.hasMore && (
                <div className="px-5 py-4 text-center border-t border-[var(--tl-cream-line)]">
                  <button
                    onClick={() => load(tab, 'more')}
                    disabled={active.loadingMore}
                    className="tl-btn-ghost text-[12.5px] px-6 py-2.5 disabled:opacity-50"
                  >
                    {active.loadingMore ? t('lb_loading') : t('lb_load_more')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <p className="text-[11px] text-[var(--tl-text-soft)]/60 mt-2.5 text-center">{t('lb_footnote')}</p>
    </section>
  )
}

function dedupe(rows: TlmnLeaderboardRow[]): TlmnLeaderboardRow[] {
  const seen = new Set<string>()
  const out: TlmnLeaderboardRow[] = []
  for (const r of rows) {
    if (seen.has(r.user_id)) continue
    seen.add(r.user_id)
    out.push(r)
  }
  return out
}

// Top-3 get a restrained gold/silver/bronze tint; the current user is highlighted in rose.
// Plain rgba() arbitrary values render reliably (opacity-on-CSS-var is not portable).
function rowTint(rank: number, isMe: boolean): string {
  if (isMe) return 'bg-[rgba(194,24,91,0.06)]'
  if (rank === 1) return 'bg-[rgba(224,179,65,0.12)]'
  if (rank === 2) return 'bg-[rgba(195,204,214,0.20)]'
  if (rank === 3) return 'bg-[rgba(200,123,70,0.12)]'
  return ''
}

function RankCell({ rank }: { rank: number }) {
  if (rank <= 3) {
    const cls =
      rank === 1 ? 'from-[#f7e3a1] to-[#a9801f] text-[#5a3d05]'
      : rank === 2 ? 'from-[#f4f6f8] to-[#8a96a4] text-[#3b434d]'
      : 'from-[#e8b88a] to-[#8a4a23] text-[#3d1d0c]'
    return (
      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br ${cls} font-black text-[12px] shadow-sm flex-none`}>
        {rank}
      </span>
    )
  }
  return <span className="inline-block w-7 text-center font-semibold text-[var(--tl-text-soft)]/50 tabular-nums">{rank}</span>
}

// Dash (–) means "no games yet" — keyed on the match count, NOT on the rate, so a player
// who has played but never won correctly shows 0% (not –). Formatting in lib/games/winRate.
function WinRate({ rate, games, dash, inline = false }: { rate: number; games: number; dash: string; inline?: boolean }) {
  if (games <= 0) return <span className={inline ? '' : 'text-[var(--tl-text-soft)]/40'}>{dash}</span>
  const color = rate >= 60 ? 'text-emerald-600' : rate >= 40 ? 'text-[var(--tl-text)]' : 'text-[var(--tl-text-soft)]/70'
  return (
    <span className={inline ? '' : `font-bold ${color}`}>
      {formatWinRate(rate)}
    </span>
  )
}

function LeaderboardSkeleton() {
  return (
    <ul className="divide-y divide-[var(--tl-cream-line)]/50" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-3.5 py-3.5">
          <span className="w-7 h-7 rounded-full bg-[var(--tl-cream-line)]/60 animate-pulse flex-none" />
          <span className="w-9 h-9 rounded-full bg-[var(--tl-cream-line)]/60 animate-pulse flex-none" />
          <span className="flex-1 h-3.5 rounded bg-[var(--tl-cream-line)]/60 animate-pulse max-w-[160px]" />
          <span className="w-10 h-3.5 rounded bg-[var(--tl-cream-line)]/60 animate-pulse flex-none" />
        </li>
      ))}
    </ul>
  )
}

function TrophyIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 5h2.5a1.5 1.5 0 0 1 0 5H16M8 5H5.5a1.5 1.5 0 0 0 0 5H8M10 14.5h4M9 20h6M12 17v3" />
    </svg>
  )
}
