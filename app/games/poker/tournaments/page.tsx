import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import PokerShell from '../_eco/PokerShell'
import { coins } from '../_eco/format'
import { getPokerAccess, pokerAccessTournamentVisible, pokerAccessTournamentOperator } from '../access'
import { listTournaments, type TournamentListItem } from '../tournament-actions'
import { Icon } from '../_eco/icons'
import { PageHeader, Eyebrow, EmptyState, type Tone } from '../_eco/ui'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker.tournaments')
  return { title: t('title') }
}

function prizeOf(tr: TournamentListItem): number {
  return Math.max(tr.guaranteed_prize_pool, tr.entry_fee * tr.registered)
}

// Real lifecycle states → semantic tone (defaults to neutral for anything unmapped).
const STATE_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  SCHEDULED: 'royal',
  REGISTRATION_OPEN: 'emerald',
  STARTING: 'amber',
  RUNNING: 'emerald',
  BREAK: 'amber',
  FINAL_TABLE: 'violet',
  COMPLETED: 'neutral',
  CANCELLED: 'coral',
  PAUSED_FOR_REVIEW: 'amber',
}

export default async function TournamentsPage() {
  const acc = await getPokerAccess()
  if (!pokerAccessTournamentVisible(acc)) notFound()
  const isOperator = pokerAccessTournamentOperator(acc)
  const [t, tp, locale, res] = await Promise.all([
    getTranslations('games.poker.tournaments'),
    getTranslations('games.poker'),
    getLocale(),
    listTournaments(),
  ])

  return (
    <PokerShell>
      <PageHeader
        eyebrow={<Eyebrow icon="trophy">{t('nav')}</Eyebrow>}
        icon="trophy"
        tone="amber"
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {t('title')}
            <span className="pk-badge pk-badge-amber">{t('alpha_badge')}</span>
          </span>
        }
        subtitle={t('subtitle')}
        actions={
          isOperator ? (
            <Link href="/games/poker/tournaments/create" className="pk-btn pk-btn-primary pk-btn-gold">
              <Icon name="plus" size={17} /> {t('operator.create_cta')}
            </Link>
          ) : undefined
        }
      />
      <p className="mb-6 inline-flex items-center gap-1.5 text-xs text-[color:var(--pkp-ink-3)]">
        <Icon name="info" size={13} /> {t('coin_note')}
      </p>

      {!res.ok ? (
        <EmptyState icon="alert" tone="coral" title={t('list_error')} />
      ) : res.tournaments.length === 0 ? (
        <EmptyState icon="trophy" tone="amber" title={t('list_empty')}>
          {isOperator && (
            <Link href="/games/poker/tournaments/create" className="pk-btn pk-btn-primary">
              <Icon name="plus" size={16} /> {t('operator.create_cta')}
            </Link>
          )}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {res.tournaments.map((tr) => {
            const registered = tr.myEntryState && tr.myEntryState !== 'WITHDRAWN'
            const full = tr.registered >= tr.max_entries
            return (
              <li key={tr.id}>
                <Link href={`/games/poker/tournaments/${tr.id}`} className="pk-card flex h-full flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="pk-ichip pk-ichip-amber h-9 w-9 shrink-0">
                        <Icon name="trophy" size={18} />
                      </span>
                      <span className="truncate font-serif text-base font-semibold text-[color:var(--pkp-ink)]">{tr.title}</span>
                    </div>
                    <span className={`pk-badge pk-badge-${STATE_TONE[tr.state] ?? 'neutral'} shrink-0`}>{t(`state.${tr.state}`)}</span>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                    <Field icon="coins" label={t('field.entry_fee')} value={`${coins(tr.entry_fee, locale)} ${t('coin_unit')}`} />
                    <Field icon="layers" label={t('operator.starting_stack')} value={coins(tr.starting_stack, locale)} />
                    <div className="min-w-0">
                      <dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-[color:var(--pkp-ink-3)]">
                        <Icon name="users" size={12} /> {t('field.players')}
                      </dt>
                      <dd className="mt-0.5 flex items-center gap-2">
                        <span className="tabular-nums text-[color:var(--pkp-ink)]">{t('field.registered', { count: tr.registered, max: tr.max_entries })}</span>
                        <span className="inline-flex items-center gap-0.5" aria-hidden>
                          {Array.from({ length: Math.min(tr.max_entries, 10) }).map((_, i) => (
                            <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: i < tr.registered ? 'var(--pkp-emerald)' : 'var(--pkp-surface-3)' }} />
                          ))}
                        </span>
                      </dd>
                    </div>
                    <Field icon="trophy" label={t('field.prize_pool')} value={`${coins(prizeOf(tr), locale)} ${t('coin_unit')}`} />
                  </dl>

                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[color:var(--pkp-line)] pt-3">
                    <span className="pk-badge pk-badge-neutral"><Icon name="lock" size={11} /> {t('private_badge')}</span>
                    {full && !registered && <span className="pk-badge pk-badge-amber">{tp('lobby.full')}</span>}
                    {registered && <span className="pk-badge pk-badge-emerald"><Icon name="check" size={11} /> {t('registered_badge')}</span>}
                    {tr.myTableNo != null && (
                      <span className="pk-badge pk-badge-royal">{t('field.table_seat', { table: tr.myTableNo, seat: '•' })}</span>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </PokerShell>
  )
}

function Field({ icon, label, value }: { icon: 'coins' | 'layers' | 'trophy'; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-[color:var(--pkp-ink-3)]">
        <Icon name={icon} size={12} /> {label}
      </dt>
      <dd className="mt-0.5 truncate tabular-nums text-[color:var(--pkp-ink)]">{value}</dd>
    </div>
  )
}
