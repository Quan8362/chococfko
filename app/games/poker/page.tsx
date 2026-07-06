import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import PokerShell from './_eco/PokerShell'
import QuickPlayButton from './_eco/QuickPlayButton'
import { listRecentTables } from './ecosystem'
import { coins, dateShort } from './_eco/format'
import { getPokerAccess, pokerAccessCan, getBetaTermsAck, pokerAccessTournamentVisible } from './access'
import { pokerPracticeBotsOn } from '@/lib/games/poker/flags'
import PokerTermsGate from './_components/PokerTermsGate'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker')
  return { title: t('title') }
}

export default async function PokerLandingPage() {
  const [t, locale, supabase, recent] = await Promise.all([
    getTranslations('games.poker'),
    getLocale(),
    Promise.resolve(createClient()),
    listRecentTables(4),
  ])
  const { data: { user } } = await supabase.auth.getUser()
  const recentTables = recent.ok ? recent.tables : []

  // Capability-aware CTAs so no button links to a flag-gated 404 during rollout.
  const pokerAccess = await getPokerAccess()

  // Closed-Beta terms gate: an enrolled cohort member (admin or not) who has not accepted the
  // current terms sees the acknowledgement UI here — the reachable path to unlock create/join.
  // Server actions stay blocked until acceptance (checkPokerCapability), so this is the ONLY
  // way in, never a bypass. Non-members / non-beta resolve required=false and never see it.
  if (user) {
    const ack = await getBetaTermsAck(pokerAccess)
    if (ack.required && !ack.acknowledged) {
      return (
        <PokerShell>
          <PokerTermsGate version={ack.version} />
        </PokerShell>
      )
    }
  }

  const canPublicLobby = pokerAccessCan(pokerAccess, 'public_lobby')
  const canCreate = pokerAccessCan(pokerAccess, 'create')
  // Isolated practice-bot mode. Server-gated (its own env flag + poker visibility): renders only
  // for an authenticated, allowlisted viewer while POKER_PRACTICE_BOTS_ENABLED is on — dark in
  // production. Practice chips never touch the wallet, so this entry is independent of Quick Play
  // and needs no funded balance.
  // Internal-alpha tournaments: only shown when the internal flag is ON and the viewer may see it
  // (admins or Closed-Beta members). Fully dark otherwise — no entry, no 404-bait link.
  const canTournament = pokerAccessTournamentVisible(pokerAccess)
  const canPractice = !!user && pokerPracticeBotsOn(pokerAccess.flags, {
    isAdmin: pokerAccess.access.isAdmin,
    isAlphaTester: pokerAccess.isAlphaTester,
    isBetaMember: pokerAccess.isBetaMember,
    suspended: pokerAccess.betaSuspended,
  })

  const features = [
    { icon: '♣', t: t('landing.feature_lobby'), d: t('landing.feature_lobby_desc') },
    { icon: '♦', t: t('landing.feature_private'), d: t('landing.feature_private_desc') },
    { icon: '♥', t: t('landing.feature_fair'), d: t('landing.feature_fair_desc') },
  ]

  return (
    <PokerShell>
      <section className="overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-[#1b1230] to-[#2a1a3e] p-7 text-white sm:p-10">
        <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
          {t('landing.responsible')}
        </p>
        <h1 className="font-serif text-3xl font-bold sm:text-4xl">{t('landing.hero_title')}</h1>
        <p className="mt-3 max-w-xl text-white/80">{t('landing.hero_subtitle')}</p>
        <div className="mt-6 flex flex-wrap items-start gap-3">
          {!user ? (
            <Link
              href="/login?next=/games/poker"
              className="inline-flex items-center justify-center rounded-lg bg-rose px-6 py-3 font-medium text-white hover:opacity-90"
            >
              {t('landing.play_now')}
            </Link>
          ) : canPublicLobby ? (
            <QuickPlayButton
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose px-6 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              label={t('landing.quick_play')}
            />
          ) : null}
          {canPublicLobby && (
            <Link
              href="/games/poker/lobby"
              className="inline-flex items-center justify-center rounded-lg bg-white/10 px-6 py-3 font-medium text-white hover:bg-white/20"
            >
              {t('landing.browse_tables')}
            </Link>
          )}
          {canCreate && (
            <Link
              href="/games/poker/create"
              className="inline-flex items-center justify-center rounded-lg border border-white/30 px-6 py-3 font-medium text-white hover:bg-white/10"
            >
              {t('landing.create_table')}
            </Link>
          )}
          {canPractice && (
            <Link
              href="/games/poker/practice"
              className="inline-flex flex-col items-start rounded-lg bg-white/10 px-6 py-3 font-medium text-white hover:bg-white/20"
            >
              <span className="inline-flex items-center gap-2">
                🤖 {t('landing.practice_cta')}
              </span>
              <span className="text-xs font-normal text-white/60">{t('landing.practice_hint')}</span>
            </Link>
          )}
          {canTournament && (
            <Link
              href="/games/poker/tournaments"
              className="inline-flex flex-col items-start rounded-lg bg-white/10 px-6 py-3 font-medium text-white hover:bg-white/20"
            >
              <span className="inline-flex items-center gap-2">
                🏆 {t('tournaments.nav')}
                <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-medium text-amber-200">{t('tournaments.alpha_badge')}</span>
              </span>
              <span className="text-xs font-normal text-white/60">{t('tournaments.subtitle')}</span>
            </Link>
          )}
        </div>
        <p className="mt-4 text-xs text-white/50">{t('landing.responsible_note')}</p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {features.map((f) => (
          <div key={f.t} className="rounded-xl border border-line bg-paper p-5">
            <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-rose/10 text-lg text-rose" aria-hidden>
              {f.icon}
            </div>
            <h3 className="font-serif text-base font-semibold">{f.t}</h3>
            <p className="mt-1 text-sm text-muted">{f.d}</p>
          </div>
        ))}
      </section>

      {recentTables.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-serif text-lg font-semibold">{t('nav.history')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {recentTables.map((tb) => (
              <Link
                key={tb.tableId}
                href={`/games/poker/${tb.tableId}`}
                className="flex items-center justify-between rounded-xl border border-line bg-paper p-4 hover:border-rose"
              >
                <div>
                  <p className="font-medium">{tb.name}</p>
                  <p className="text-sm text-muted">
                    {coins(tb.smallBlind, locale)}/{coins(tb.bigBlind, locale)} ·{' '}
                    {t('lobby.seats', { occupied: tb.occupiedSeats, capacity: tb.capacity })}
                  </p>
                </div>
                <span className="text-xs text-muted">{dateShort(tb.lastActivityAt, locale)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <Link href="/games/poker/rules" className="rounded-xl border border-line bg-paper p-4 text-center hover:border-rose">
          <p className="font-medium">{t('nav.rules')}</p>
          <p className="text-sm text-muted">{t('landing.how_to_play')}</p>
        </Link>
        <Link href="/games/poker/glossary" className="rounded-xl border border-line bg-paper p-4 text-center hover:border-rose">
          <p className="font-medium">{t('nav.glossary')}</p>
          <p className="text-sm text-muted">{t('glossary.subtitle')}</p>
        </Link>
        <Link href="/games/poker/profile" className="rounded-xl border border-line bg-paper p-4 text-center hover:border-rose">
          <p className="font-medium">{t('nav.profile')}</p>
          <p className="text-sm text-muted">{t('profile.subtitle')}</p>
        </Link>
      </section>
    </PokerShell>
  )
}
