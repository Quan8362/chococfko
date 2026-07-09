import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import PokerShell from '../_eco/PokerShell'
import PokerAvatar from '../_eco/PokerAvatar'
import { fetchPokerStats, fetchHandHistory } from '../ecosystem'
import { getPokerAccess, pokerAccessSocial } from '../access'
import { coins, signedCoins, dateShort } from '../_eco/format'
import { Icon, type IconName } from '../_eco/icons'
import { EmptyState, SectionTitle, StatCard, CoinDelta, type Tone } from '../_eco/ui'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker')
  return { title: `${t('profile.title')} · ${t('title')}` }
}

function pct(n: number, d: number, locale: string): string {
  if (d <= 0) return '—'
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(n / d)
}

export default async function PokerProfilePage() {
  const [t, locale, supabase] = await Promise.all([
    getTranslations('games.poker'),
    getLocale(),
    Promise.resolve(createClient()),
  ])
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <PokerShell>
        <EmptyState icon="user" title={t('profile.title')} description={t('profile.subtitle')}>
          <Link href="/login?next=/games/poker/profile" className="pk-btn pk-btn-primary">
            {t('profile.sign_in')}
          </Link>
        </EmptyState>
      </PokerShell>
    )
  }

  const [{ data: profile }, statsRes, histRes, access] = await Promise.all([
    supabase.from('profiles').select('display_name, avatar_url, created_at').eq('id', user.id).maybeSingle(),
    fetchPokerStats(),
    fetchHandHistory(8),
    getPokerAccess(),
  ])
  const showSocialLink = pokerAccessSocial(access, 'achievements') || pokerAccessSocial(access, 'missions')
  const s = statsRes.ok ? statsRes.stats : { handsPlayed: 0, handsWon: 0, showdownsReached: 0, showdownsWon: 0, biggestPotWon: 0, netChange: 0 }
  const recent = histRes.ok ? histRes.hands : []
  const displayName = profile?.display_name ?? t('profile.anonymous')

  interface Metric { label: string; value: string; note?: string; icon: IconName; tone: Tone; cls?: string }
  const groups: { key: string; title: string; icon: IconName; tone: Tone; metrics: Metric[] }[] = [
    {
      key: 'overall', title: t('profile.group_overall'), icon: 'cards', tone: 'ruby',
      metrics: [
        { label: t('stats.hands_played'), value: coins(s.handsPlayed, locale), icon: 'layers', tone: 'ruby' },
        { label: t('stats.hands_won'), value: coins(s.handsWon, locale), icon: 'trophy', tone: 'emerald' },
        { label: t('stats.win_rate'), value: pct(s.handsWon, s.handsPlayed, locale), note: t('stats.win_rate_note'), icon: 'target', tone: 'gold' },
      ],
    },
    {
      key: 'showdown', title: t('profile.group_showdown'), icon: 'eye', tone: 'royal',
      metrics: [
        { label: t('stats.showdowns'), value: coins(s.showdownsReached, locale), icon: 'eye', tone: 'royal' },
        { label: t('stats.showdowns_won'), value: coins(s.showdownsWon, locale), icon: 'trophy', tone: 'emerald' },
        { label: t('stats.showdown_rate'), value: pct(s.showdownsWon, s.showdownsReached, locale), note: t('stats.showdown_rate_note'), icon: 'target', tone: 'gold' },
      ],
    },
    {
      key: 'pot', title: t('profile.group_pot'), icon: 'coins', tone: 'amber',
      metrics: [
        { label: t('stats.biggest_pot'), value: coins(s.biggestPotWon, locale), icon: 'coins', tone: 'gold' },
      ],
    },
    {
      key: 'stack', title: t('profile.group_stack'), icon: 'trending', tone: 'emerald',
      metrics: [
        { label: t('stats.net_change'), value: signedCoins(s.netChange, locale), note: t('stats.net_note'), icon: 'trending', tone: s.netChange >= 0 ? 'emerald' : 'coral', cls: s.netChange > 0 ? 'pk-win' : s.netChange < 0 ? 'pk-loss' : '' },
      ],
    },
  ]

  return (
    <PokerShell>
      {/* Premium header */}
      <div className="pk-plum pk-fade-up pk-portal-on-plum relative mb-6 overflow-hidden rounded-[20px] p-6 sm:p-7">
        <Icon name="spade" size={160} className="pk-suit-watermark -right-4 -top-8 rotate-12" />
        <div className="relative flex items-center gap-4">
          <PokerAvatar src={profile?.avatar_url} name={displayName} size={72} ring decorative />
          <div className="min-w-0">
            <h1 className="truncate font-serif text-2xl font-bold text-[color:var(--pkp-on-plum)]">{displayName}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {profile?.created_at && (
                <span className="inline-flex items-center gap-1 text-sm text-[color:var(--pkp-on-plum-2)]">
                  <Icon name="clock" size={13} />
                  {t('profile.member_since', { date: dateShort(new Date(profile.created_at).getTime(), locale) })}
                </span>
              )}
              <span className="pk-badge pk-badge-onplum">
                <Icon name="coins" size={12} /> {t('landing.responsible')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {showSocialLink && (
        <Link href="/games/poker/achievements" className="pk-card mb-6 flex items-center gap-3 p-4">
          <span className="pk-ichip pk-ichip-amber h-10 w-10">
            <Icon name="trophy" size={20} />
          </span>
          <span className="flex-1 font-medium text-[color:var(--pkp-ink)]">{t('achievements.open')}</span>
          <Icon name="chevronRight" size={18} className="text-[color:var(--pkp-ink-3)]" />
        </Link>
      )}

      {/* Grouped metrics */}
      <div className="flex flex-col gap-6">
        {groups.map((g) => (
          <section key={g.key}>
            <SectionTitle icon={g.icon} tone={g.tone}>{g.title}</SectionTitle>
            <div className={`grid gap-3 ${g.metrics.length === 1 ? 'sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
              {g.metrics.map((m) => (
                <StatCard key={m.label} icon={m.icon} tone={m.tone} label={m.label} value={m.value} note={m.note} valueClassName={m.cls} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Recent hands */}
      <div className="mt-8">
        <SectionTitle
          icon="clock"
          tone="royal"
          action={
            <Link href="/games/poker/history" className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--pkp-ruby-ink)] hover:underline">
              {t('profile.view_history')} <Icon name="chevronRight" size={14} />
            </Link>
          }
        >
          {t('profile.recent_title')}
        </SectionTitle>
        {recent.length === 0 ? (
          <EmptyState icon="cards" title={t('profile.no_recent')}>
            <Link href="/games/poker/lobby" className="pk-btn pk-btn-primary">
              <Icon name="play" size={16} /> {t('landing.quick_play')}
            </Link>
          </EmptyState>
        ) : (
          <ul className="grid gap-2">
            {recent.map((h) => (
              <li key={h.handId}>
                <Link href={`/games/poker/history/${h.handId}`} className="pk-card flex items-center justify-between gap-3 p-3.5">
                  <span className="min-w-0 font-medium text-[color:var(--pkp-ink)]">
                    <span className="tabular-nums">#{h.handNo}</span>
                    <span className="ml-1.5 font-normal text-[color:var(--pkp-ink-2)]">{h.tableName}</span>
                  </span>
                  {h.result === 'even'
                    ? <span className="pk-even text-sm font-semibold">{t('history.even')}</span>
                    : <CoinDelta result={h.result}>{signedCoins(h.net, locale)}</CoinDelta>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PokerShell>
  )
}
