import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import PokerShell from '../_eco/PokerShell'
import { coins } from '../_eco/format'
import { getPokerAccess, pokerAccessTournamentVisible, pokerAccessTournamentOperator } from '../access'
import { listTournaments, type TournamentListItem } from '../tournament-actions'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker.tournaments')
  return { title: t('title') }
}

function prizeOf(tr: TournamentListItem): number {
  return Math.max(tr.guaranteed_prize_pool, tr.entry_fee * tr.registered)
}

export default async function TournamentsPage() {
  const acc = await getPokerAccess()
  if (!pokerAccessTournamentVisible(acc)) notFound()
  const isOperator = pokerAccessTournamentOperator(acc)
  const [t, locale, res] = await Promise.all([
    getTranslations('games.poker.tournaments'),
    getLocale(),
    listTournaments(),
  ])

  return (
    <PokerShell>
      <section className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700">{t('alpha_badge')}</span>
          </div>
          <p className="text-sm text-ink/70">{t('subtitle')}</p>
          <p className="mt-1 text-xs text-ink/50">{t('coin_note')}</p>
        </div>
        {isOperator && (
          <Link href="/games/poker/tournaments/create"
            className="inline-flex items-center justify-center rounded-lg bg-rose px-4 py-2 font-medium text-white transition-opacity hover:opacity-90">
            {t('operator.create_cta')}
          </Link>
        )}
      </section>

      {!res.ok ? (
        <p role="alert" className="rounded-xl border border-line bg-paper p-6 text-center text-sm text-rose">{t('list_error')}</p>
      ) : res.tournaments.length === 0 ? (
        <p className="rounded-xl border border-line bg-paper p-8 text-center text-sm text-ink/60">{t('list_empty')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {res.tournaments.map((tr) => (
            <li key={tr.id}>
              <Link href={`/games/poker/tournaments/${tr.id}`}
                className="block rounded-xl border border-line bg-paper p-4 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-rose">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-ink">{tr.title}</span>
                  <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-ink/70">{t(`state.${tr.state}`)}</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-ink/60">{t('field.entry_fee')}</dt>
                  <dd className="text-right text-ink">{coins(tr.entry_fee, locale)} xu</dd>
                  <dt className="text-ink/60">{t('field.players')}</dt>
                  <dd className="text-right text-ink">{t('field.registered', { count: tr.registered, max: tr.max_entries })}</dd>
                  <dt className="text-ink/60">{t('field.prize_pool')}</dt>
                  <dd className="text-right text-ink">{coins(prizeOf(tr), locale)} xu</dd>
                </dl>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded bg-ink/5 px-2 py-0.5 text-xs text-ink/60">{t('private_badge')}</span>
                  {tr.myEntryState && tr.myEntryState !== 'WITHDRAWN' && (
                    <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700">{t('registered_badge')}</span>
                  )}
                  {tr.myTableNo != null && (
                    <span className="rounded bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-700">{t('field.table_seat', { table: tr.myTableNo, seat: '•' })}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PokerShell>
  )
}
