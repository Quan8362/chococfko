import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getTournamentForAdmin } from '@/lib/tournaments/admin/queries'
import { resolveTournamentCapabilities } from '@/lib/tournaments/permissions/server'
import EventForm from '@/components/tournaments/admin/EventForm'
import TournamentShell from '@/components/tournaments/TournamentShell'
import { MANAGEMENT_BASE, isSignedIn } from '../../../_access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Thêm nội dung thi đấu' }

export default async function NewManagedEventPage({ params }: { params: { id: string } }) {
  const caps = await resolveTournamentCapabilities(params.id)
  if (!caps.can('event.manage')) {
    if (!(await isSignedIn())) redirect(`/login?next=${encodeURIComponent(`${MANAGEMENT_BASE}/${params.id}/noi-dung/new`)}`)
    notFound()
  }
  const t = await getTranslations('admin_tournament_events')

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
        {t('back_tournament')}
      </Link>
      <h1 className="font-serif font-bold text-[26px] tracking-[-0.3px] text-ink mb-1">{t('add_cta')}</h1>
      <p className="text-[13.5px] text-muted mb-5">{tournament.name}</p>
      <EventForm tournamentId={tournament.id} basePath={MANAGEMENT_BASE} />
    </TournamentShell>
  )
}
