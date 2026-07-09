import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import PokerShell from '../_eco/PokerShell'
import ReportProblemButton from '../_components/ReportProblemButton'
import { fetchHandHistory } from '../ecosystem'
import { coins, signedCoins, dateTime } from '../_eco/format'
import { Icon } from '../_eco/icons'
import { PageHeader, Eyebrow, EmptyState, StatCard, CoinDelta } from '../_eco/ui'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker')
  return { title: `${t('history.title')} · ${t('title')}` }
}

export default async function PokerHistoryPage() {
  const [t, locale, supabase] = await Promise.all([
    getTranslations('games.poker'),
    getLocale(),
    Promise.resolve(createClient()),
  ])
  const { data: { user } } = await supabase.auth.getUser()

  const header = (
    <PageHeader
      eyebrow={<Eyebrow icon="clock">{t('nav.history')}</Eyebrow>}
      icon="clock"
      tone="royal"
      title={t('history.title')}
      subtitle={t('history.subtitle')}
      actions={<ReportProblemButton variant="inline" context={{ path: '/games/poker/history' }} />}
    />
  )

  if (!user) {
    return (
      <PokerShell>
        {header}
        <EmptyState icon="user" title={t('history.empty_title')}>
          <Link href="/login?next=/games/poker/history" className="pk-btn pk-btn-primary">
            {t('error.not_authenticated')}
          </Link>
        </EmptyState>
      </PokerShell>
    )
  }

  const res = await fetchHandHistory(50)
  const hands = res.ok ? res.hands : []

  if (!res.ok) {
    return (
      <PokerShell>
        {header}
        <EmptyState icon="alert" tone="coral" title={t('history.error_title')} />
      </PokerShell>
    )
  }
  if (hands.length === 0) {
    return (
      <PokerShell>
        {header}
        <EmptyState icon="cards" title={t('history.empty_title')} description={t('history.empty_hint')}>
          <Link href="/games/poker/lobby" className="pk-btn pk-btn-primary">
            <Icon name="play" size={16} /> {t('landing.quick_play')}
          </Link>
        </EmptyState>
      </PokerShell>
    )
  }

  // Summary derived from the loaded page (scoped to shown hands; labelled as such).
  const won = hands.filter((h) => h.result === 'won').length
  const lost = hands.filter((h) => h.result === 'lost').length
  const net = hands.reduce((a, h) => a + h.net, 0)
  const biggest = hands.reduce((m, h) => Math.max(m, h.potTotal), 0)

  return (
    <PokerShell>
      {header}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon="list" tone="royal" label={t('history.stat_shown')} value={coins(hands.length, locale)} />
        <StatCard icon="trophy" tone="emerald" label={t('history.stat_won')} value={coins(won, locale)} note={t('history.stat_lost_note', { count: lost })} />
        <StatCard icon="trending" tone={net >= 0 ? 'emerald' : 'coral'} label={t('stats.net_change')} value={signedCoins(net, locale)} valueClassName={net > 0 ? 'pk-win' : net < 0 ? 'pk-loss' : ''} />
        <StatCard icon="coins" tone="gold" label={t('stats.biggest_pot')} value={coins(biggest, locale)} />
      </div>
      <p className="mb-4 text-xs text-[color:var(--pkp-ink-3)]">{t('history.summary_note')}</p>

      {/* Desktop table */}
      <div className="pk-panel hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="pk-table">
            <thead>
              <tr>
                <th>{t('history.col_hand')}</th>
                <th>{t('history.col_table')}</th>
                <th>{t('history.col_blinds')}</th>
                <th className="!text-right">{t('history.col_pot')}</th>
                <th className="!text-right">{t('history.col_result')}</th>
                <th>{t('history.col_when')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {hands.map((h) => (
                <tr key={h.handId}>
                  <td className="font-semibold tabular-nums text-[color:var(--pkp-ink)]">#{h.handNo}</td>
                  <td className="max-w-[10rem] truncate">{h.tableName}</td>
                  <td className="tabular-nums text-[color:var(--pkp-ink-2)]">{coins(h.smallBlind, locale)}/{coins(h.bigBlind, locale)}</td>
                  <td className="text-right tabular-nums">{coins(h.potTotal, locale)}</td>
                  <td className="text-right">
                    {h.result === 'even'
                      ? <span className="pk-even">{t('history.even')}</span>
                      : <CoinDelta result={h.result}>{signedCoins(h.net, locale)}</CoinDelta>}
                  </td>
                  <td className="text-[color:var(--pkp-ink-2)]">{h.completedAt ? dateTime(h.completedAt, locale) : '—'}</td>
                  <td className="text-right">
                    <Link href={`/games/poker/history/${h.handId}`} className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--pkp-ruby-ink)] hover:underline">
                      {t('history.view')} <Icon name="chevronRight" size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <ul className="grid gap-3 md:hidden">
        {hands.map((h) => (
          <li key={h.handId}>
            <Link href={`/games/poker/history/${h.handId}`} className="pk-card flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold text-[color:var(--pkp-ink)]">
                  <span className="tabular-nums">#{h.handNo}</span>
                  <span className="truncate font-normal text-[color:var(--pkp-ink-2)]">{h.tableName}</span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[color:var(--pkp-ink-3)]">
                  <span className="tabular-nums">{coins(h.smallBlind, locale)}/{coins(h.bigBlind, locale)}</span>
                  <span>·</span>
                  <span className="tabular-nums">{t('history.col_pot')} {coins(h.potTotal, locale)}</span>
                  {h.completedAt && <><span>·</span><span>{dateTime(h.completedAt, locale)}</span></>}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {h.result === 'even'
                  ? <span className="pk-even text-sm font-semibold">{t('history.even')}</span>
                  : <CoinDelta result={h.result}>{signedCoins(h.net, locale)}</CoinDelta>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </PokerShell>
  )
}
