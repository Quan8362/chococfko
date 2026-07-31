import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import TournamentForm from '@/components/tournaments/admin/TournamentForm'
import { MANAGEMENT_BASE, isSignedIn } from '../_access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tạo giải đấu' }

export default async function NewManagedTournamentPage() {
  // Self-service (15F-1): creating a tournament requires ONLY that the caller is signed in. Anyone
  // authenticated becomes the OWNER of the draft they create (no Site-Admin gate). Anon → login.
  if (!(await isSignedIn())) redirect(`/login?next=${encodeURIComponent(`${MANAGEMENT_BASE}/new`)}`)
  const t = await getTranslations('admin_tournaments')

  return (
    <div className="max-w-[720px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <Link
        href={MANAGEMENT_BASE}
        className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('back_list')}
      </Link>
      <h1 className="font-serif font-bold text-[26px] tracking-[-0.3px] text-ink mb-5">{t('create_cta')}</h1>
      <TournamentForm basePath={MANAGEMENT_BASE} />
    </div>
  )
}
