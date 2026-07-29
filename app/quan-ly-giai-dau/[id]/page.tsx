import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getTournamentForAdmin, listEventsForAdmin } from '@/lib/tournaments/admin/queries'
import { resolveTournamentCapabilities } from '@/lib/tournaments/permissions/server'
import { listTournamentMembersForSiteAdmin } from '@/lib/tournaments/members/service'
import StatusBadge from '@/components/tournaments/admin/StatusBadge'
import TournamentStatusActions from '@/components/tournaments/admin/TournamentStatusActions'
import EventList from '@/components/tournaments/admin/EventList'
import TournamentMembersPanel from '@/components/tournaments/admin/TournamentMembersPanel'
import { MANAGEMENT_BASE, isSignedIn, statusActionCaps } from '../_access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Chi tiết giải đấu' }

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default async function ManagementDetailPage({ params }: { params: { id: string } }) {
  // Scoped access: Site Admin OR an ACTIVE member of THIS tournament. A membership in another
  // tournament never satisfies this (checkTournamentPermission filters by (tournament_id, user_id)).
  const caps = await resolveTournamentCapabilities(params.id)
  if (!caps.canView) {
    if (!(await isSignedIn())) redirect(`/login?next=${encodeURIComponent(`${MANAGEMENT_BASE}/${params.id}`)}`)
    notFound() // signed in but not permitted for this tournament — don't reveal it exists
  }

  const t = await getTranslations('admin_tournaments')
  const tm = await getTranslations('tournament_management')

  const tournament = await getTournamentForAdmin(params.id)
  if (!tournament) notFound()

  const events = await listEventsForAdmin(tournament.id)
  const sac = statusActionCaps(caps)
  const canEdit = caps.can('tournament.update')
  const canManageEvents = caps.can('event.manage')
  const anyStatusAction = sac.publish || sac.archive || sac.delete

  // Member management is Site-Admin only (members.manage). Fetch the roster only then.
  const membersResult = caps.siteAdmin ? await listTournamentMembersForSiteAdmin(tournament.id) : null

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-2.5 border-b border-line/60 last:border-b-0">
      <span className="text-[12.5px] font-semibold text-muted sm:w-40 flex-none">{label}</span>
      <span className="text-[14px] text-ink min-w-0 break-words">{children}</span>
    </div>
  )

  return (
    <div className="max-w-[820px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <Link
        href={MANAGEMENT_BASE}
        className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {tm('back_list')}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 flex-wrap">
            <StatusBadge status={tournament.status} label={t(`status_${tournament.status}`)} />
            <span className="text-[11px] font-semibold px-2 py-[3px] rounded-full bg-cream border border-line text-[#5c4d44]">
              {tm(caps.siteAdmin ? 'you_are_site_admin' : caps.role === 'manager' ? 'you_are_manager' : 'you_are_scorekeeper')}
            </span>
          </div>
          <h1 className="font-serif font-bold text-[27px] tracking-[-0.3px] leading-tight text-ink break-words">
            {tournament.name}
          </h1>
          <p className="text-[13px] text-muted font-mono mt-1">/{tournament.slug}</p>
        </div>
        {canEdit && (
          <Link
            href={`${MANAGEMENT_BASE}/${tournament.id}/edit`}
            className="flex-none font-semibold text-[13.5px] px-5 py-2.5 rounded-full bg-teal-soft text-teal border border-teal/25 hover:bg-teal hover:text-white hover:border-teal transition-all"
          >
            {t('action_edit')}
          </Link>
        )}
      </div>

      {/* Info card */}
      <div className="bg-paper border border-line rounded-2xl p-5 sm:p-6 mb-6">
        <Row label={t('f_starts')}>{fmtDateTime(tournament.startsAt)}</Row>
        <Row label={t('f_ends')}>{fmtDateTime(tournament.endsAt)}</Row>
        <Row label={t('f_location')}>{tournament.location || '—'}</Row>
        <Row label={t('f_rules_url')}>
          {tournament.rulesUrl ? (
            <a href={tournament.rulesUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-rose underline break-all">
              {tournament.rulesUrl}
            </a>
          ) : (
            '—'
          )}
        </Row>
        <Row label={t('created_at')}>{fmtDateTime(tournament.createdAt)}</Row>
        <Row label={t('updated_at')}>{fmtDateTime(tournament.updatedAt)}</Row>
        <Row label={t('events_label')}>{t('events_count', { count: tournament.eventCount })}</Row>
      </div>

      {/* Status actions (only what this role may do) */}
      {anyStatusAction && (
        <div className="bg-paper border border-line rounded-2xl p-5 sm:p-6 mb-6">
          <h2 className="font-serif font-bold text-[16px] text-ink mb-1">{t('actions_heading')}</h2>
          <p className="text-[12.5px] text-muted mb-3">{t('actions_hint')}</p>
          <TournamentStatusActions
            id={tournament.id}
            status={tournament.status}
            eventCount={tournament.eventCount}
            updatedAt={tournament.updatedAt}
            variant="detail"
            basePath={MANAGEMENT_BASE}
            caps={sac}
          />
        </div>
      )}

      {/* Events (nội dung thi đấu) */}
      <div className="bg-cream border border-line rounded-2xl p-5 sm:p-6 mb-6">
        <EventList tournamentId={tournament.id} events={events} basePath={MANAGEMENT_BASE} canManage={canManageEvents} />
      </div>

      {/* Member management — Site Admin only */}
      {caps.siteAdmin && membersResult && membersResult.ok && (
        <div className="bg-paper border border-line rounded-2xl p-5 sm:p-6">
          <TournamentMembersPanel tournamentId={tournament.id} members={membersResult.members} />
        </div>
      )}
    </div>
  )
}
