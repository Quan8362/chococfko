import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import PokerShell from './_eco/PokerShell'
import QuickPlayButton from './_eco/QuickPlayButton'
import { listRecentTables, fetchPokerStats } from './ecosystem'
import { coins, signedCoins, dateShort } from './_eco/format'
import { getPokerAccess, pokerAccessCan, getBetaTermsAck, pokerAccessTournamentVisible, viewerOf } from './access'
import { pokerPracticeBotsOn } from '@/lib/games/poker/flags'
import PokerTermsGate from './_components/PokerTermsGate'
import { Icon, type IconName } from './_eco/icons'
import { SectionTitle } from './_eco/ui'

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

  const pokerAccess = await getPokerAccess()

  // Closed-Beta terms gate — the only reachable path to unlock create/join for an enrolled member.
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
  const canTournament = pokerAccessTournamentVisible(pokerAccess)
  const canPractice = !!user && pokerPracticeBotsOn(pokerAccess.flags, viewerOf(pokerAccess))

  // Real activity summary — only rendered when the viewer actually has a record.
  let stats: { handsPlayed: number; handsWon: number; netChange: number } | null = null
  if (user) {
    const s = await fetchPokerStats()
    if (s.ok && s.stats.handsPlayed > 0) stats = s.stats
  }

  const winRate = stats && stats.handsPlayed > 0
    ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(stats.handsWon / stats.handsPlayed)
    : '—'

  // Ranked ways to play — order and visual weight encode priority (Lobby is the featured tile).
  interface PlayTile { href: string; icon: IconName; tone: string; title: string; desc: string; badge?: string; featured?: boolean }
  const playTiles: PlayTile[] = []
  if (canPublicLobby) playTiles.push({ href: '/games/poker/lobby', icon: 'globe', tone: 'ruby', title: t('landing.feature_lobby'), desc: t('landing.feature_lobby_desc'), featured: true })
  if (canCreate) playTiles.push({ href: '/games/poker/create', icon: 'plus', tone: 'emerald', title: t('create.title'), desc: t('landing.feature_private_desc') })
  if (canPractice) playTiles.push({ href: '/games/poker/practice', icon: 'bot', tone: 'royal', title: t('landing.practice_cta'), desc: t('landing.practice_hint') })
  if (canTournament) playTiles.push({ href: '/games/poker/tournaments', icon: 'trophy', tone: 'amber', title: t('tournaments.nav'), desc: t('tournaments.subtitle'), badge: t('tournaments.alpha_badge') })

  const features: { icon: IconName; tone: string; t: string; d: string }[] = [
    { icon: 'globe', tone: 'ruby', t: t('landing.feature_lobby'), d: t('landing.feature_lobby_desc') },
    { icon: 'lock', tone: 'violet', t: t('landing.feature_private'), d: t('landing.feature_private_desc') },
    { icon: 'shield', tone: 'emerald', t: t('landing.feature_fair'), d: t('landing.feature_fair_desc') },
  ]

  const learnLinks: { href: string; icon: IconName; tone: string; title: string; desc: string }[] = [
    { href: '/games/poker/rules', icon: 'book', tone: 'royal', title: t('nav.rules'), desc: t('landing.how_to_play') },
    { href: '/games/poker/glossary', icon: 'list', tone: 'violet', title: t('nav.glossary'), desc: t('glossary.subtitle') },
    { href: '/games/poker/profile', icon: 'user', tone: 'amber', title: t('nav.profile'), desc: t('profile.subtitle') },
  ]

  return (
    <PokerShell>
      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <section className="pk-plum pk-fade-up pk-portal-on-plum relative overflow-hidden rounded-[20px] p-6 sm:p-9">
        {/* Premium abstract poker sculpture — decorative hero flourish, transparent silhouette
            grounded on the plum ground with a soft plum drop-shadow (aria-hidden, non-interactive).
            Hidden on phones to protect hero readability; scales up across tablet → desktop. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/poker-banner.webp"
          alt=""
          aria-hidden
          width={1024}
          height={1024}
          draggable={false}
          className="pointer-events-none absolute right-4 top-5 hidden h-auto w-[150px] select-none object-contain md:block lg:right-6 lg:top-6 lg:w-[208px] xl:right-8 xl:w-[280px]"
          style={{ opacity: 0.95, filter: 'brightness(0.95) saturate(0.97) drop-shadow(0 12px 26px rgba(27,18,48,0.55))' }}
        />
        <div className="relative max-w-2xl md:pr-[152px] lg:pr-0 xl:pr-[72px]">
          <span className="pk-badge pk-badge-onplum">
            <Icon name="coins" size={13} /> {t('landing.responsible')}
          </span>
          <h1 className="mt-4 font-serif text-[2rem] font-bold leading-[1.1] sm:text-[2.6rem]">{t('landing.hero_title')}</h1>
          <p className="mt-3 max-w-xl text-[15px] text-[color:var(--pkp-on-plum-2)]">{t('landing.hero_subtitle')}</p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {!user ? (
              <Link href="/login?next=/games/poker" className="pk-btn pk-btn-lg pk-btn-primary pk-btn-gold">
                <Icon name="play" size={18} /> {t('landing.play_now')}
              </Link>
            ) : canPublicLobby ? (
              <QuickPlayButton className="pk-btn pk-btn-lg pk-btn-primary pk-btn-gold" label={t('landing.quick_play')} />
            ) : null}
            {canPublicLobby && (
              <Link href="/games/poker/lobby" className="pk-btn pk-btn-lg pk-btn-onplum">
                <Icon name="globe" size={17} /> {t('landing.browse_tables')}
              </Link>
            )}
          </div>
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-[color:var(--pkp-on-plum-2)]">
            <Icon name="info" size={13} /> {t('landing.responsible_note')}
          </p>
        </div>

        {/* Real activity summary — only when the viewer has a record. */}
        {stats && (
          <div className="relative mt-7 grid grid-cols-3 gap-3 border-t border-[color:var(--pkp-plum-line)] pt-5">
            <HeroStat label={t('stats.hands_played')} value={coins(stats.handsPlayed, locale)} />
            <HeroStat label={t('stats.win_rate')} value={winRate} />
            <HeroStat label={t('stats.net_change')} value={signedCoins(stats.netChange, locale)} />
          </div>
        )}
      </section>

      {/* ── Ways to play ──────────────────────────────────────────────────────── */}
      {playTiles.length > 0 && (
        <section className="mt-9">
          <SectionTitle icon="play" tone="ruby">{t('landing.play_heading')}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {playTiles.map((tile) => (
              <Link
                key={tile.href}
                href={tile.href}
                className={`pk-card group flex items-center gap-4 p-4 ${tile.featured ? 'ring-1 ring-inset ring-[rgba(230,207,149,0.45)]' : ''}`}
              >
                <span className={`pk-ichip pk-ichip-${tile.tone} h-12 w-12 shrink-0`}>
                  <Icon name={tile.icon} size={24} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-serif text-base font-semibold text-[color:var(--pkp-ink)]">{tile.title}</span>
                    {tile.badge && <span className="pk-badge pk-badge-amber">{tile.badge}</span>}
                  </span>
                  <span className="mt-0.5 block text-sm text-[color:var(--pkp-ink-2)]">{tile.desc}</span>
                </span>
                <Icon name="chevronRight" size={18} className="shrink-0 text-[color:var(--pkp-ink-3)] transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Recent tables ─────────────────────────────────────────────────────── */}
      {recentTables.length > 0 && (
        <section className="mt-9">
          <SectionTitle icon="clock" tone="gold">{t('landing.recent_tables')}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {recentTables.map((tb) => (
              <Link key={tb.tableId} href={`/games/poker/${tb.tableId}`} className="pk-card flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-medium text-[color:var(--pkp-ink)]">
                    {tb.isPrivate && <Icon name="lock" size={14} className="shrink-0 text-[color:var(--pkp-ink-3)]" />}
                    {tb.name}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-[color:var(--pkp-ink-2)]">
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Icon name="coins" size={13} /> {coins(tb.smallBlind, locale)}/{coins(tb.bigBlind, locale)}
                    </span>
                    <span className="text-[color:var(--pkp-ink-3)]">·</span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Icon name="users" size={13} /> {t('lobby.seats', { occupied: tb.occupiedSeats, capacity: tb.capacity })}
                    </span>
                  </p>
                </div>
                <span className="shrink-0 text-xs text-[color:var(--pkp-ink-3)]">{dateShort(tb.lastActivityAt, locale)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Why play here ─────────────────────────────────────────────────────── */}
      <section className="mt-9">
        <SectionTitle icon="sparkles" tone="gold">{t('landing.why_heading')}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.t} className="pk-panel p-5">
              <span className={`pk-ichip pk-ichip-${f.tone} mb-3 flex h-10 w-10`}>
                <Icon name={f.icon} size={22} />
              </span>
              <h3 className="font-serif text-base font-semibold text-[color:var(--pkp-ink)]">{f.t}</h3>
              <p className="mt-1 text-sm text-[color:var(--pkp-ink-2)]">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Learn / links ─────────────────────────────────────────────────────── */}
      <section className="mt-9">
        <SectionTitle icon="graduationCap" tone="royal">{t('landing.learn_heading')}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {learnLinks.map((l) => (
            <Link key={l.href} href={l.href} className="pk-card group flex items-center gap-3 p-4">
              <span className={`pk-ichip pk-ichip-${l.tone} h-9 w-9 shrink-0`}>
                <Icon name={l.icon} size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[color:var(--pkp-ink)]">{l.title}</span>
                <span className="mt-0.5 block truncate text-xs text-[color:var(--pkp-ink-2)]">{l.desc}</span>
              </span>
              <Icon name="chevronRight" size={16} className="shrink-0 text-[color:var(--pkp-ink-3)] transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </section>
    </PokerShell>
  )
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--pkp-on-plum-2)]">{label}</p>
      <p className="mt-1 font-serif text-xl font-bold tabular-nums text-[color:var(--pkp-gold-soft)]">{value}</p>
    </div>
  )
}
