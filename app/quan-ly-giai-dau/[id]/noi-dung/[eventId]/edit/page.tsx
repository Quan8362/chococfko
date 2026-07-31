import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getEventForAdmin } from '@/lib/tournaments/admin/queries'
import { resolveTournamentCapabilities } from '@/lib/tournaments/permissions/server'
import EventForm from '@/components/tournaments/admin/EventForm'
import TournamentShell from '@/components/tournaments/TournamentShell'
import { MANAGEMENT_BASE, isSignedIn } from '../../../../_access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sửa nội dung thi đấu' }

export default async function EditManagedEventPage({
  params,
}: {
  params: { id: string; eventId: string }
}) {
  const caps = await resolveTournamentCapabilities(params.id)
  if (!caps.can('event.manage')) {
    if (!(await isSignedIn())) {
      redirect(`/login?next=${encodeURIComponent(`${MANAGEMENT_BASE}/${params.id}/noi-dung/${params.eventId}/edit`)}`)
    }
    notFound()
  }
  const t = await getTranslations('admin_tournament_events')

  const event = await getEventForAdmin(params.id, params.eventId)
  if (!event) notFound()

  return (
    <TournamentShell size="form">
      <Link
        href={`${MANAGEMENT_BASE}/${params.id}/noi-dung/${event.id}`}
        className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('back_event')}
      </Link>
      <h1 className="font-serif font-bold text-[26px] tracking-[-0.3px] text-ink mb-5">{t('form_edit_title')}</h1>
      <EventForm
        tournamentId={params.id}
        basePath={MANAGEMENT_BASE}
        initial={{
          eventId: event.id,
          version: event.version,
          name: event.name,
          format: event.format,
          groupCount: event.groupCount,
          winnerQualifiersPerGroup: event.winnerQualifiersPerGroup,
          consolationQualifiersPerGroup: event.consolationQualifiersPerGroup,
          thirdPlaceEnabled: event.thirdPlaceEnabled,
        }}
      />
    </TournamentShell>
  )
}
