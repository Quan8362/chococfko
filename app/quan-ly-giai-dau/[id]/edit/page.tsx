import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getTournamentForAdmin } from '@/lib/tournaments/admin/queries'
import { resolveTournamentCapabilities } from '@/lib/tournaments/permissions/server'
import TournamentForm from '@/components/tournaments/admin/TournamentForm'
import TournamentShell from '@/components/tournaments/TournamentShell'
import { MANAGEMENT_BASE, isSignedIn } from '../../_access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sửa giải đấu' }

export default async function EditManagedTournamentPage({ params }: { params: { id: string } }) {
  const caps = await resolveTournamentCapabilities(params.id)
  if (!caps.can('tournament.update')) {
    if (!(await isSignedIn())) redirect(`/login?next=${encodeURIComponent(`${MANAGEMENT_BASE}/${params.id}/edit`)}`)
    notFound()
  }
  const t = await getTranslations('admin_tournaments')

  const tournament = await getTournamentForAdmin(params.id)
  if (!tournament) notFound()

  return (
    <TournamentShell size="form">
      <Link
        href={`${MANAGEMENT_BASE}/${tournament.id}`}
        className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('back_detail')}
      </Link>
      <h1 className="font-serif font-bold text-[26px] tracking-[-0.3px] text-ink mb-5">{t('form_edit_title')}</h1>
      <TournamentForm
        basePath={MANAGEMENT_BASE}
        initial={{
          id: tournament.id,
          slug: tournament.slug,
          name: tournament.name,
          startsAt: tournament.startsAt,
          endsAt: tournament.endsAt,
          location: tournament.location,
          rulesUrl: tournament.rulesUrl,
          updatedAt: tournament.updatedAt,
        }}
      />
    </TournamentShell>
  )
}
