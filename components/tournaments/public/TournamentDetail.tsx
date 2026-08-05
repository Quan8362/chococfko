'use client'

import { useMemo, useState, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type {
  PublicEventWorkspace,
  PublicTournamentSummary,
  TournamentPhase,
} from '@/lib/tournaments/public/types'
import { toBracketCompetitors } from '@/lib/tournaments/public/types'
import { formatCapabilities } from '@/lib/tournaments/domain/format-capabilities'
import { TAB_SLUGS } from '@/lib/tournaments/public/tabs'
import PublicBracket from './PublicBracket'
import TournamentShell from '@/components/tournaments/TournamentShell'
import { useTournamentRealtime, type RealtimeSubscription } from '@/components/tournaments/useTournamentRealtime'
import ConnectionIndicator from '@/components/tournaments/ConnectionIndicator'
import StatusPill from './StatusPill'
import ShareButton from './ShareButton'
import PublicOverview from './PublicOverview'
import PublicCompetitors from './PublicCompetitors'
import PublicSchedule from './PublicSchedule'
import PublicStandings from './PublicStandings'
import PublicPodium from './PublicPodium'
import PublicRuleSummary from './PublicRuleSummary'
import EmptyState from './EmptyState'

// TAB_SLUGS + tabFromSlug live in '@/lib/tournaments/public/tabs' (a plain module) so the server route
// can call tabFromSlug; deep links like ?tab=bang-xep-hang&event=<id> restore the exact view on reload.

export default function TournamentDetail({
  summary,
  phase,
  dateRange,
  workspace,
  selectedEventId,
  initialTab,
}: {
  summary: PublicTournamentSummary
  phase: TournamentPhase
  dateRange: string
  workspace: PublicEventWorkspace | null
  selectedEventId: string
  initialTab: string
}) {
  const t = useTranslations('tournaments')
  const tBracket = useTranslations('admin_knockout_bracket')
  const router = useRouter()
  const pathname = usePathname()

  const format = workspace?.event.format
  const availableTabs = useMemo(() => {
    const tabs = ['overview', 'competitors', 'schedule']
    // Tab visibility is driven by the format's capabilities, never by ad-hoc string checks, so a
    // pure round-robin can never surface an empty "Nhánh đấu" and a pure knockout never shows a
    // group-standings tab (see lib/tournaments/domain/format-capabilities).
    const caps = format ? formatCapabilities(format) : null
    if (caps?.needsStandings) tabs.push('standings')
    if (caps?.needsBracket) tabs.push('bracket')
    if (caps?.hasPodium) tabs.push('podium')
    // The rules tab is always available once an event workspace is loaded — it shows the event's
    // public scoring summary, or a "system default rules" notice when there is no snapshot.
    if (workspace) tabs.push('rules')
    return tabs
  }, [format, workspace])

  const [activeTab, setActiveTab] = useState(() => (availableTabs.includes(initialTab) ? initialTab : 'overview'))

  // Build a stable URL that carries event + tab so refresh/share/deep-link keep the view.
  const pushUrl = useCallback(
    (eventId: string, tab: string) => {
      const params = new URLSearchParams()
      if (eventId) params.set('event', eventId)
      params.set('tab', TAB_SLUGS[tab] ?? TAB_SLUGS.overview)
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname],
  )

  const selectTab = (tab: string) => {
    setActiveTab(tab)
    pushUrl(selectedEventId, tab)
  }

  // Switching event needs fresh data → navigate (server reload) and reset to overview.
  const selectEvent = (eventId: string) => {
    pushUrl(eventId, 'overview')
  }

  const nameOf = useMemo(() => {
    const map = new Map((workspace?.competitors ?? []).map((c) => [c.id, c.shortName || c.name]))
    return (id: string | null) => (id ? map.get(id) ?? id : t('schedule.tbd'))
  }, [workspace, t])

  const roundLabelText = useCallback(
    (label: string | null, roundNumber: number) => {
      if (!label) return t('schedule.round_label', { n: roundNumber })
      const known = ['final', 'semifinal', 'quarterfinal', 'round_of_16', 'third_place']
      if (known.includes(label)) return tBracket(`label_${label}`)
      const m = /^round_(\d+)$/.exec(label)
      return m ? tBracket('label_generic', { n: m[1] }) : label
    },
    [t, tBracket],
  )

  // ── Keyboard tablist navigation ──────────────────────────────────────────────────────────────
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const onTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let next = -1
    if (e.key === 'ArrowRight') next = (idx + 1) % availableTabs.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + availableTabs.length) % availableTabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = availableTabs.length - 1
    else return
    e.preventDefault()
    const tab = availableTabs[next]
    tabRefs.current[tab]?.focus()
    selectTab(tab)
  }

  const brackets = workspace?.brackets ?? []
  // A branch is only shown once its template exists (hasBracket). Before the group stage finishes the
  // template already carries placeholder slots ("Nhất A", "Thắng trận N") and is rendered — an empty
  // state appears only when there is genuinely no template (design §4/§13).
  const visibleBranches = brackets.filter((b) => b.hasBracket)
  // Two titled sections only when there really are two branches — a pure knockout shows its single
  // bracket with no redundant "Nhánh vô địch" heading.
  const showBranchHeaders = visibleBranches.length > 1

  // ── Realtime: a change made by an admin is delivered as a SIGNAL → refetch the safe read model via
  // router.refresh() (the page is force-dynamic). Payloads are never trusted; bursts are coalesced by
  // the controller. Scoped to THIS tournament + the open event. Disconnect is not a page error — the
  // last data stays, a light poll covers the gap, and it stops when realtime returns.
  const subscriptions = useMemo<RealtimeSubscription[]>(() => {
    const subs: RealtimeSubscription[] = [
      { table: 'tournaments', filter: `id=eq.${summary.id}` },
      { table: 'tournament_events', filter: `tournament_id=eq.${summary.id}` },
      { table: 'tournament_match_games' },
    ]
    if (selectedEventId) {
      // Note: we intentionally do NOT subscribe to tournament_qualification_overrides — Guests have no
      // SELECT on that table (privacy fix), so Realtime would deliver nothing and only add noise. Tie
      // overrides are set alongside the final group result, so the tournament_matches signal already
      // triggers the refetch that surfaces the "BTC phân định" marker.
      subs.push(
        { table: 'tournament_matches', filter: `event_id=eq.${selectedEventId}` },
        { table: 'tournament_podium', filter: `event_id=eq.${selectedEventId}` },
      )
    }
    return subs
  }, [summary.id, selectedEventId])

  const onSignal = useCallback(() => router.refresh(), [router])
  const { status: rtStatus, refreshNow } = useTournamentRealtime({
    channelName: `giai-dau:${summary.id}:${selectedEventId || 'none'}`,
    subscriptions,
    onSignal,
  })

  return (
    <TournamentShell size="wide">
      {/* Back link */}
      <Link href="/giai-dau" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-rose transition-colors mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {t('public.all_tournaments')}
      </Link>

      {/* Header — title/meta and status/actions split into two zones on desktop, stacked on mobile */}
      <header className="rounded-3xl border border-line shadow-card bg-gradient-to-br from-gold-light/40 via-paper to-rose-soft/60 p-5 sm:p-6 mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif font-bold text-[clamp(23px,3.1vw,34px)] leading-tight text-ink break-words">
              {summary.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-muted mt-2.5">
              <span>{dateRange || t('public.dates_tbd')}</span>
              <span aria-hidden className="text-line">•</span>
              <span>{summary.location || t('public.location_tbd')}</span>
              <span aria-hidden className="text-line">•</span>
              <span>{t('public.events_count', { count: summary.events.length })}</span>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2.5 lg:items-end lg:flex-none">
            <StatusPill phase={phase} label={t(`status.${phase}`)} />
            <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
              {summary.rulesUrl && (
                <a
                  href={summary.rulesUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-teal bg-teal-soft hover:bg-teal-soft/70 px-3 py-1.5 rounded-xl transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  {t('public.rules')}
                </a>
              )}
              <ShareButton />
              <ConnectionIndicator status={rtStatus} onRefresh={refreshNow} />
              <button
                type="button"
                onClick={() => router.refresh()}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink bg-paper border border-line hover:border-rose/40 hover:text-rose px-3 py-1.5 rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                {t('public.refresh')}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Event selector */}
      {summary.events.length > 1 && (
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">{t('public.event_selector')}</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
            {summary.events.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => selectEvent(ev.id)}
                aria-pressed={ev.id === selectedEventId}
                title={ev.name}
                className={`flex-none inline-flex items-center min-h-[40px] max-w-[240px] truncate whitespace-nowrap text-[13px] font-medium px-3.5 rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 ${
                  ev.id === selectedEventId
                    ? 'border-rose bg-rose text-white shadow-card'
                    : 'border-line bg-paper text-ink hover:border-rose/40 hover:bg-rose-soft/30'
                }`}
              >
                {ev.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!workspace ? (
        <EmptyState title={t('empty.no_events')} hint={t('empty.no_events_hint')} />
      ) : (
        <>
          {/* Tabs */}
          <div role="tablist" aria-label={t('public.tabs_label')} className="flex gap-0.5 sm:gap-1 border-b border-line mb-6 overflow-x-auto no-scrollbar">
            {availableTabs.map((tab, idx) => (
              <button
                key={tab}
                ref={(el) => {
                  tabRefs.current[tab] = el
                }}
                role="tab"
                id={`tab-${tab}`}
                aria-selected={activeTab === tab}
                aria-controls={`panel-${tab}`}
                tabIndex={activeTab === tab ? 0 : -1}
                onKeyDown={(e) => onTabKeyDown(e, idx)}
                onClick={() => selectTab(tab)}
                className={`flex-none inline-flex items-center min-h-[44px] whitespace-nowrap text-[13.5px] px-3.5 -mb-px border-b-2 rounded-t transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 ${
                  activeTab === tab
                    ? 'border-rose text-rose font-bold'
                    : 'border-transparent text-muted font-semibold hover:text-ink hover:border-line'
                }`}
              >
                {t(`tabs.${tab}`)}
              </button>
            ))}
          </div>

          {/* Panels */}
          <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} tabIndex={0} className="focus:outline-none">
            {activeTab === 'overview' && (
              <PublicOverview events={summary.events} selectedEventId={selectedEventId} onSelectEvent={selectEvent} />
            )}
            {activeTab === 'competitors' && (
              <PublicCompetitors competitors={workspace.competitors} groups={workspace.groups} />
            )}
            {activeTab === 'schedule' && (
              <PublicSchedule schedule={workspace.schedule} groups={workspace.groups} nameOf={nameOf} roundLabelText={roundLabelText} />
            )}
            {activeTab === 'standings' && <PublicStandings standings={workspace.standings} nameOf={nameOf} />}
            {activeTab === 'bracket' && (
              // Break the bracket out of the ≤1320px reading shell so the board can use most of the
              // viewport on desktop. Centred via left-1/2/-translate-x-1/2 (works regardless of the
              // shell's own centring); capped at 1560px and 94vw so the page body never scrolls
              // sideways and ultra-wide monitors stay balanced. Below lg it stays in the shell column.
              <div className="lg:relative lg:left-1/2 lg:-translate-x-1/2 lg:w-[min(94vw,1560px)] space-y-8">
                {visibleBranches.length === 0 ? (
                  <EmptyState title={t('empty.no_knockout')} hint={t('empty.no_knockout_hint')} />
                ) : (
                  visibleBranches.map((b) => (
                    <section key={b.bracket} aria-labelledby={showBranchHeaders ? `branch-${b.bracket}` : undefined}>
                      {showBranchHeaders && (
                        <div className="mb-4">
                          <h3 id={`branch-${b.bracket}`} className="flex items-center gap-2 font-serif font-bold text-[18px] text-ink">
                            <span aria-hidden className="h-5 w-1.5 rounded-full bg-rose/60" />
                            {t(`bracket.${b.bracket}`)}
                          </h3>
                          <p className="text-[12.5px] text-muted mt-1 ml-3.5">{t(`bracket.${b.bracket}_desc`)}</p>
                        </div>
                      )}
                      <PublicBracket
                        rounds={b.rounds}
                        thirdPlaceMatch={b.thirdPlaceMatch}
                        competitors={toBracketCompetitors(workspace.competitors)}
                      />
                    </section>
                  ))
                )}
              </div>
            )}
            {activeTab === 'podium' && <PublicPodium brackets={brackets} nameOf={nameOf} />}
            {activeTab === 'rules' && <PublicRuleSummary summary={workspace.ruleSummary} />}
          </div>
        </>
      )}
    </TournamentShell>
  )
}
