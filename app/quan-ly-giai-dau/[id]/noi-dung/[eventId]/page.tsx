import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import {
  getEventForAdmin,
  getGroupSetupForAdmin,
  getScoringWorkspaceForAdmin,
  getKnockoutSeedSetupForAdmin,
  getKnockoutWorkspaceForAdmin,
  getGroupKnockoutSeedSetupForAdmin,
  getGroupKnockoutWorkspaceForAdmin,
} from '@/lib/tournaments/admin/queries'
import { resolveTournamentCapabilities } from '@/lib/tournaments/permissions/server'
import { formatCapabilities } from '@/lib/tournaments/domain/format-capabilities'
import { eventFieldVisibility } from '@/lib/tournaments/eventValidation'
import EventStatusBadge from '@/components/tournaments/admin/EventStatusBadge'
import EventWorkspace from '@/components/tournaments/admin/EventWorkspace'
import KnockoutWorkspace from '@/components/tournaments/admin/KnockoutWorkspace'
import AdminRealtimeBanner from '@/components/tournaments/admin/AdminRealtimeBanner'
import EventDetailTabs from '@/components/tournaments/admin/EventDetailTabs'
import EventRulesPanel from '@/components/tournaments/admin/EventRulesPanel'
import TournamentShell from '@/components/tournaments/TournamentShell'
import { MANAGEMENT_BASE, isSignedIn, eventWorkspaceCaps, knockoutWorkspaceCaps } from '../../../_access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Nội dung thi đấu' }

export default async function ManagementEventPage({
  params,
}: {
  params: { id: string; eventId: string }
}) {
  const caps = await resolveTournamentCapabilities(params.id)
  if (!caps.canView) {
    if (!(await isSignedIn())) {
      redirect(`/login?next=${encodeURIComponent(`${MANAGEMENT_BASE}/${params.id}/noi-dung/${params.eventId}`)}`)
    }
    notFound()
  }

  const t = await getTranslations('admin_tournament_events')

  const event = await getEventForAdmin(params.id, params.eventId)
  if (!event) notFound()

  // Which format-specific workspace/queries to load. `isKnockout` (knockout-only) uses the dedicated
  // KnockoutWorkspace; round_robin and group_knockout both flow through EventWorkspace.
  const fmtCaps = formatCapabilities(event.format)
  const isKnockout = !fmtCaps.hasGroupStage
  const isGroupKnockout = event.format === 'group_knockout'
  // Which setting fields are meaningful for this format (single source of truth — no ad-hoc checks).
  const fields = eventFieldVisibility(event.format)

  const groupSetup = !isKnockout ? await getGroupSetupForAdmin(params.id, params.eventId) : null
  const scoring = !isKnockout ? await getScoringWorkspaceForAdmin(params.id, params.eventId) : null
  const knockoutSeed = isKnockout ? await getKnockoutSeedSetupForAdmin(params.id, params.eventId) : null
  const knockoutWorkspace = isKnockout ? await getKnockoutWorkspaceForAdmin(params.id, params.eventId) : null
  const groupKnockoutSeed = isGroupKnockout ? await getGroupKnockoutSeedSetupForAdmin(params.id, params.eventId) : null
  const groupKnockoutWorkspace = isGroupKnockout
    ? await getGroupKnockoutWorkspaceForAdmin(params.id, params.eventId)
    : null

  const assignedCount = groupSetup ? groupSetup.competitors.length - groupSetup.unassignedIds.length : 0
  const canEditSettings = caps.can('event.manage')

  const Setting = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b border-line/60 last:border-b-0">
      <span className="text-[12.5px] text-muted">{label}</span>
      <span className="text-[13.5px] font-semibold text-ink text-right tabular-nums">{value}</span>
    </div>
  )
  const yesNo = (v: boolean) => (v ? t('yes') : t('no'))

  return (
    <TournamentShell size="board">
      <Link
        href={`${MANAGEMENT_BASE}/${params.id}`}
        className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('back_tournament')}
      </Link>

      <AdminRealtimeBanner tournamentId={params.id} eventId={event.id} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <EventStatusBadge status={event.status} label={t(`status_${event.status}`)} />
            <span className="text-[12px] text-muted">{t(`format_${event.format}`)}</span>
          </div>
          <h1 className="font-serif font-bold text-[25px] tracking-[-0.3px] leading-tight text-ink break-words">
            {event.name}
          </h1>
          <p className="text-[12.5px] text-muted mt-1">{event.tournamentName}</p>
        </div>
        {canEditSettings && (
          <Link
            href={`${MANAGEMENT_BASE}/${params.id}/noi-dung/${event.id}/edit`}
            className="flex-none font-semibold text-[13px] px-5 py-2.5 rounded-full bg-teal-soft text-teal border border-teal/25 hover:bg-teal hover:text-white hover:border-teal transition-all"
          >
            {t('edit_settings')}
          </Link>
        )}
      </div>

      <EventDetailTabs
        showRules
        competition={
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,300px)_minmax(0,1fr)] gap-6 items-start">
            {/* Settings + counts (sticky on desktop; content is short so it never nests a scrollbar) */}
            <div className="space-y-6 lg:sticky lg:top-20 self-start">
              <div className="bg-paper border border-line rounded-2xl p-5 sm:p-6">
                <h2 className="font-serif font-bold text-[15px] text-ink mb-2">{t('settings_heading')}</h2>
                {fields.groupCount && <Setting label={t('f_group_count')} value={event.groupCount} />}
                {fields.winnerQualifiers && (
                  <>
                    <Setting label={t('f_winner_qualifiers')} value={event.winnerQualifiersPerGroup} />
                    <Setting label={t('f_consolation_qualifiers')} value={event.consolationQualifiersPerGroup} />
                  </>
                )}
                {fields.thirdPlace && <Setting label={t('f_third_place')} value={yesNo(event.thirdPlaceEnabled)} />}
                <Setting label={t('competitor_count_label')} value={event.competitorCount} />
                {groupSetup && (
                  <>
                    <Setting label={t('assigned_label')} value={assignedCount} />
                    <Setting label={t('unassigned_label')} value={groupSetup.unassignedIds.length} />
                    <Setting label={t('group_current_label')} value={groupSetup.groups.length} />
                  </>
                )}
                {event.matchCount > 0 && <Setting label={t('match_count_label')} value={event.matchCount} />}
                {event.completedMatchCount > 0 && (
                  <Setting label={t('completed_match_count_label')} value={event.completedMatchCount} />
                )}
              </div>
            </div>

            {/* Workspace (capability-gated: a scorekeeper gets a score-only view) */}
            <div className="min-w-0 bg-paper border border-line rounded-2xl p-5 sm:p-6">
              {isKnockout && knockoutSeed ? (
                <KnockoutWorkspace
                  tournamentId={params.id}
                  eventId={event.id}
                  seedSetup={knockoutSeed}
                  workspace={knockoutWorkspace}
                  caps={knockoutWorkspaceCaps(caps)}
                />
              ) : (
                <EventWorkspace
                  tournamentId={params.id}
                  eventId={event.id}
                  competitors={event.competitors}
                  showSeed={fmtCaps.hasKnockout}
                  locked={event.matchCount > 0}
                  groupSetup={groupSetup}
                  scoring={scoring}
                  groupKnockoutSeed={groupKnockoutSeed}
                  groupKnockoutWorkspace={groupKnockoutWorkspace}
                  caps={eventWorkspaceCaps(caps)}
                />
              )}
            </div>
          </div>
        }
        rules={
          <div className="bg-paper border border-line rounded-2xl p-5 sm:p-6">
            <EventRulesPanel
              tournamentId={params.id}
              eventId={event.id}
              canManage={caps.can('rules.manage')}
              matchCount={event.matchCount}
              completedMatchCount={event.completedMatchCount}
            />
          </div>
        }
      />
    </TournamentShell>
  )
}
