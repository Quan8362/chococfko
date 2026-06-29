import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import TlmnLobby from './TlmnLobby'
import TlmnWaitingRooms from './TlmnWaitingRooms'
import TlmnLeaderboard from './TlmnLeaderboard'
import { fetchWaitingRooms, fetchTlmnLeaderboard } from './actions'
import { TlmnTwoCards, TlmnSuits } from './icons'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.tlmn')
  return { title: t('title') }
}

export default async function TlmnPage() {
  const [t, supabase, waitingRooms, leaderboard] = await Promise.all([
    getTranslations('games.tlmn'),
    Promise.resolve(createClient()),
    fetchWaitingRooms(),
    fetchTlmnLeaderboard('wins', 20, 0),
  ])
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="max-w-[960px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <Link
        href="/games"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors group mb-6"
      >
        <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('breadcrumb')}
      </Link>

      {/* ── Scoped premium card-game theme (red/gold/felt) — front door of the game ── */}
      <div className="tlmn-lobby">
        {/* Hero band */}
        <div className="tl-hero mb-6">
          {/* Hero top-right decoration — tone-on-tone ♠♥♦♣ suit cluster (TlmnSuits),
              reused unmodified; the shared TlmnTwoCards motif stays on pill/info/empty. */}
          <TlmnSuits className="tl-hero__suit" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-[var(--tl-gold-bright)] bg-black/25 border border-[var(--tl-gold)]/40 px-3 py-1.5 rounded-full mb-4">
              <TlmnTwoCards variant="pill" className="w-4 h-4 -my-0.5" />
              {t('badge')}
            </span>
            <h1 className="font-serif font-bold text-[clamp(27px,4.4vw,42px)] leading-tight tracking-[-0.4px] text-[#fdeedd] mb-2 [text-shadow:0_2px_14px_rgba(0,0,0,0.35)]">
              {t('title')}
            </h1>
            <p className="text-[14.5px] text-[rgba(253,238,221,0.78)] leading-relaxed max-w-[480px]">
              {t('long_desc')}
            </p>
          </div>
        </div>

        {/* How-to-play box */}
        <div className="tl-panel tl-panel--accent px-5 py-4 mb-6 flex items-center gap-4">
          <TlmnTwoCards variant="info" className="flex-none w-5 h-5 text-[var(--tl-red)]" />
          <div className="text-[13px] text-[var(--tl-text)] leading-relaxed space-y-0.5">
            <p><strong className="text-[var(--tl-red)]">{t('rules_title')}:</strong> {t('rules_players')}</p>
            <p>{t('rules_invite')}</p>
            <p>{t('rules_ready')}</p>
          </div>
        </div>

        {/* ── Luật chơi — full active-profile rule guide (§27, CHOCOCFKO_TLMN_CLASSIC) ── */}
        <details className="group tl-panel px-5 py-4 mb-6">
          <summary className="cursor-pointer select-none font-serif font-semibold text-[15px] text-[var(--tl-text)] flex items-center justify-between gap-2">
            {t('guide_title')}
            <span aria-hidden className="text-[var(--tl-gold-deep)] text-[12px] transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-4 space-y-3 text-[13px] text-[var(--tl-text-soft)] leading-relaxed">
            <p>{t('guide_objective')}</p>
            {([
              ['guide_order_title', 'guide_order'],
              ['guide_combos_title', 'guide_combos'],
              ['guide_open_title', 'guide_open'],
              ['guide_pass_title', 'guide_pass'],
              ['guide_chop_title', 'guide_chop'],
              ['guide_toitrang_title', 'guide_toitrang'],
              ['guide_cong_title', 'guide_cong'],
              ['guide_thoi_title', 'guide_thoi'],
              ['guide_count_title', 'guide_count'],
            ] as const).map(([titleKey, bodyKey]) => (
              <div key={titleKey}>
                <p className="font-semibold text-[var(--tl-text)]">{t(titleKey)}</p>
                <p>{t(bodyKey)}</p>
              </div>
            ))}
            <p>{t('guide_two_ok')}</p>
            <p className="text-[12px] text-[var(--tl-gold-deep)] font-medium">{t('guide_fairplay')}</p>
            <p className="text-[12px] text-[var(--tl-text-soft)]/80 italic">{t('guide_variants')}</p>
          </div>
        </details>

        {user ? (
          <TlmnLobby />
        ) : (
          <div className="tl-panel tl-panel--accent px-6 py-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[14.5px] font-semibold text-[var(--tl-text)] mb-0.5">{t('login_heading')}</p>
              <p className="text-[13px] text-[var(--tl-text-soft)]">{t('login_desc')}</p>
            </div>
            <Link
              href="/login"
              className="tl-btn-primary flex-none text-[13.5px] px-6 py-2.5 whitespace-nowrap"
            >
              {t('login_btn')}
            </Link>
          </div>
        )}

        {/* ── Public "Phòng chờ" — find real opponents (mirror Cờ Caro) ── */}
        <TlmnWaitingRooms initialRooms={waitingRooms} userId={user?.id ?? null} />

        {/* ── Thành tích & Xếp hạng — achievements + leaderboard ── */}
        <TlmnLeaderboard currentUserId={user?.id ?? null} initialWins={leaderboard.rows} />
      </div>
    </div>
  )
}
