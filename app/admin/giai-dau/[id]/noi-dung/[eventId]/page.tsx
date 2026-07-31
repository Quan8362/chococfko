import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import {
  getEventForAdmin,
  getGroupSetupForAdmin,
  getScoringWorkspaceForAdmin,
  getKnockoutSeedSetupForAdmin,
  getKnockoutWorkspaceForAdmin,
  getGroupKnockoutSeedSetupForAdmin,
  getGroupKnockoutWorkspaceForAdmin,
} from '@/lib/tournaments/admin/queries'
import EventStatusBadge from '@/components/tournaments/admin/EventStatusBadge'
import EventWorkspace from '@/components/tournaments/admin/EventWorkspace'
import KnockoutWorkspace from '@/components/tournaments/admin/KnockoutWorkspace'
import AdminRealtimeBanner from '@/components/tournaments/admin/AdminRealtimeBanner'
import EventDetailTabs from '@/components/tournaments/admin/EventDetailTabs'
import EventRulesPanel from '@/components/tournaments/admin/EventRulesPanel'
import { getEventScoringRuleView } from '@/lib/tournaments/admin/scoringRuntime'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Nội dung thi đấu' }

export default async function EventDetailPage({
  params,
}: {
  params: { id: string; eventId: string }
}) {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('admin_tournament_events')

  const event = await getEventForAdmin(params.id, params.eventId)
  if (!event) notFound()

  const isKnockout = event.format === 'knockout'
  const isGroupKnockout = event.format === 'group_knockout'

  // Group setup (round_robin / group_knockout only; null for knockout).
  const groupSetup = !isKnockout ? await getGroupSetupForAdmin(params.id, params.eventId) : null
  // Scoring workspace (results/standings/ties) — non-null once groups exist for a group format.
  const scoring = !isKnockout ? await getScoringWorkspaceForAdmin(params.id, params.eventId) : null
  // Knockout seeding + bracket workspace (knockout only).
  const knockoutSeed = isKnockout ? await getKnockoutSeedSetupForAdmin(params.id, params.eventId) : null
  const knockoutWorkspace = isKnockout ? await getKnockoutWorkspaceForAdmin(params.id, params.eventId) : null
  // Group + knockout: dual-branch seeding + brackets (group_knockout only).
  const groupKnockoutSeed = isGroupKnockout ? await getGroupKnockoutSeedSetupForAdmin(params.id, params.eventId) : null
  const groupKnockoutWorkspace = isGroupKnockout
    ? await getGroupKnockoutWorkspaceForAdmin(params.id, params.eventId)
    : null

  // Show the competitor composition (men/women) control only when the event's rule snapshot uses the
  // gender-difference handicap (FJP v2) — a plain roster stays uncluttered.
  const scoringRuleView = await getEventScoringRuleView(params.eventId)
  const showComposition =
    scoringRuleView.handicap.enabled && scoringRuleView.handicap.mode === 'female_count_difference'

  const assignedCount = groupSetup
    ? groupSetup.competitors.length - groupSetup.unassignedIds.length
    : 0

  const Setting = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-line/60 last:border-b-0">
      <span className="text-[12.5px] text-muted">{label}</span>
      <span className="text-[13.5px] font-medium text-ink text-right">{value}</span>
    </div>
  )

  const yesNo = (v: boolean) => (v ? t('yes') : t('no'))

  return (
    <div className="max-w-[860px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <Link
        href={`/admin/giai-dau/${params.id}`}
        className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('back_tournament')}
      </Link>

      {/* Realtime awareness: connection status + a non-blocking "data changed" banner (never auto-overwrites). */}
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
        <Link
          href={`/admin/giai-dau/${params.id}/noi-dung/${event.id}/edit`}
          className="flex-none font-semibold text-[13px] px-5 py-2.5 rounded-full bg-teal-soft text-teal border border-teal/25 hover:bg-teal hover:text-white hover:border-teal transition-all"
        >
          {t('edit_settings')}
        </Link>
      </div>

      <EventDetailTabs
        showRules
        competition={
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
            {/* Settings + counts */}
            <div className="space-y-6">
              <div className="bg-paper border border-line rounded-2xl p-5">
                <h2 className="font-serif font-bold text-[15px] text-ink mb-2">{t('settings_heading')}</h2>
                {event.format !== 'knockout' && (
                  <Setting label={t('f_group_count')} value={event.groupCount} />
                )}
                {event.format === 'group_knockout' && (
                  <>
                    <Setting label={t('f_winner_qualifiers')} value={event.winnerQualifiersPerGroup} />
                    <Setting label={t('f_consolation_qualifiers')} value={event.consolationQualifiersPerGroup} />
                  </>
                )}
                {event.format !== 'round_robin' && (
                  <Setting label={t('f_third_place')} value={yesNo(event.thirdPlaceEnabled)} />
                )}
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

            {/* Workspace: knockout → seed/bracket/results/podium; group formats → chia bảng + lịch. */}
            <div className="bg-paper border border-line rounded-2xl p-5 sm:p-6">
              {isKnockout && knockoutSeed ? (
                <KnockoutWorkspace
                  tournamentId={params.id}
                  eventId={event.id}
                  seedSetup={knockoutSeed}
                  workspace={knockoutWorkspace}
                />
              ) : (
                <EventWorkspace
                  tournamentId={params.id}
                  eventId={event.id}
                  competitors={event.competitors}
                  showSeed={event.format !== 'round_robin'}
                  showComposition={showComposition}
                  locked={event.matchCount > 0}
                  groupSetup={groupSetup}
                  scoring={scoring}
                  groupKnockoutSeed={groupKnockoutSeed}
                  groupKnockoutWorkspace={groupKnockoutWorkspace}
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
              canManage
              matchCount={event.matchCount}
              completedMatchCount={event.completedMatchCount}
            />
          </div>
        }
      />
    </div>
  )
}
