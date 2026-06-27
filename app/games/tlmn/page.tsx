import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import TlmnLobby from './TlmnLobby'
import TlmnWaitingRooms from './TlmnWaitingRooms'
import { fetchWaitingRooms } from './actions'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.tlmn')
  return { title: t('title') }
}

export default async function TlmnPage() {
  const [t, supabase, waitingRooms] = await Promise.all([
    getTranslations('games.tlmn'),
    Promise.resolve(createClient()),
    fetchWaitingRooms(),
  ])
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="max-w-[860px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <Link
        href="/games"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors group mb-7"
      >
        <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('breadcrumb')}
      </Link>

      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          {t('badge')}
        </span>
        <h1 className="font-serif font-bold text-[clamp(26px,4vw,40px)] leading-tight tracking-[-0.4px] text-ink mb-2">
          {t('title')}
        </h1>
        <p className="text-[14.5px] text-muted leading-relaxed max-w-[480px]">
          {t('long_desc')}
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-8 flex items-start gap-3">
        <span className="text-[18px] flex-none mt-0.5">🃏</span>
        <div className="text-[13px] text-amber-800 leading-relaxed space-y-0.5">
          <p><strong>{t('rules_title')}:</strong> {t('rules_players')}</p>
          <p>{t('rules_invite')}</p>
          <p>{t('rules_ready')}</p>
        </div>
      </div>

      {/* ── Luật chơi — full active-profile rule guide (§27, CHOCOCFKO_TLMN_CLASSIC) ── */}
      <details className="group bg-paper border border-line rounded-2xl px-5 py-4 mb-8">
        <summary className="cursor-pointer select-none font-serif font-semibold text-[15px] text-ink flex items-center justify-between gap-2">
          {t('guide_title')}
          <span aria-hidden className="text-muted text-[12px] transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-4 space-y-3 text-[13px] text-muted leading-relaxed">
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
              <p className="font-semibold text-ink">{t(titleKey)}</p>
              <p>{t(bodyKey)}</p>
            </div>
          ))}
          <p>{t('guide_two_ok')}</p>
          <p className="text-[12px] text-amber-700">{t('guide_fairplay')}</p>
          <p className="text-[12px] text-muted/70 italic">{t('guide_variants')}</p>
        </div>
      </details>

      {user ? (
        <TlmnLobby />
      ) : (
        <div className="bg-gradient-to-br from-[#fdeef5] to-cream border border-rose/15 rounded-2xl px-6 py-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[14.5px] font-semibold text-ink mb-0.5">{t('login_heading')}</p>
            <p className="text-[13px] text-muted">{t('login_desc')}</p>
          </div>
          <Link
            href="/login"
            className="flex-none font-semibold text-[13.5px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_10px_-2px_rgba(194,24,91,0.35)] whitespace-nowrap"
          >
            {t('login_btn')}
          </Link>
        </div>
      )}

      {/* ── Public "Phòng chờ" — find real opponents (mirror Cờ Caro) ── */}
      <TlmnWaitingRooms initialRooms={waitingRooms} userId={user?.id ?? null} />
    </div>
  )
}
