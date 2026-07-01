import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import PokerShell from '../_eco/PokerShell'
import { fetchHandHistory } from '../ecosystem'
import { coins, signedCoins, dateTime } from '../_eco/format'

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

  if (!user) {
    return (
      <PokerShell>
        <Header t={t} />
        <div className="rounded-xl border border-dashed border-line bg-paper/60 px-6 py-16 text-center">
          <p className="font-serif text-lg font-semibold">{t('history.empty_title')}</p>
          <Link href="/login?next=/games/poker/history" className="mt-3 inline-block rounded-lg bg-rose px-4 py-2 text-sm font-medium text-white">
            {t('error.not_authenticated')}
          </Link>
        </div>
      </PokerShell>
    )
  }

  const res = await fetchHandHistory(50)
  const hands = res.ok ? res.hands : []

  return (
    <PokerShell>
      <Header t={t} />
      {!res.ok ? (
        <div className="rounded-xl border border-dashed border-line bg-paper/60 px-6 py-16 text-center">
          <p className="font-serif text-lg font-semibold">{t('history.error_title')}</p>
        </div>
      ) : hands.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-paper/60 px-6 py-16 text-center">
          <p className="font-serif text-lg font-semibold">{t('history.empty_title')}</p>
          <p className="mt-1 text-sm text-muted">{t('history.empty_hint')}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-paper">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-cream/60 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">{t('history.col_hand')}</th>
                <th className="px-4 py-3">{t('history.col_table')}</th>
                <th className="hidden px-4 py-3 sm:table-cell">{t('history.col_blinds')}</th>
                <th className="px-4 py-3 text-right">{t('history.col_pot')}</th>
                <th className="px-4 py-3 text-right">{t('history.col_result')}</th>
                <th className="hidden px-4 py-3 sm:table-cell">{t('history.col_when')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {hands.map((h) => (
                <tr key={h.handId} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                  <td className="px-4 py-3 font-medium">#{h.handNo}</td>
                  <td className="max-w-[10rem] truncate px-4 py-3">{h.tableName}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {coins(h.smallBlind, locale)}/{coins(h.bigBlind, locale)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{coins(h.potTotal, locale)}</td>
                  <td
                    className={`px-4 py-3 text-right font-medium tabular-nums ${
                      h.result === 'won' ? 'text-emerald-600' : h.result === 'lost' ? 'text-rose' : 'text-muted'
                    }`}
                  >
                    {h.result === 'even' ? t('history.even') : signedCoins(h.net, locale)}
                  </td>
                  <td className="hidden px-4 py-3 text-muted sm:table-cell">
                    {h.completedAt ? dateTime(h.completedAt, locale) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/games/poker/history/${h.handId}`} className="text-rose hover:underline">
                      {t('history.view')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PokerShell>
  )
}

function Header({ t }: { t: (k: string) => string }) {
  return (
    <div className="mb-5">
      <h1 className="font-serif text-2xl font-bold">{t('history.title')}</h1>
      <p className="text-sm text-muted">{t('history.subtitle')}</p>
    </div>
  )
}
