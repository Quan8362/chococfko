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
import { TAB_SLUGS } from '@/lib/tournaments/public/tabs'
import BracketView from '@/components/tournaments/admin/BracketView'
import { useTournamentRealtime, type RealtimeSubscription } from '@/components/tournaments/useTournamentRealtime'
import ConnectionIndicator from '@/components/tournaments/ConnectionIndicator'
import StatusPill from './StatusPill'
import ShareButton from './ShareButton'
import PublicOverview from './PublicOverview'
import PublicCompetitors from './PublicCompetitors'
import PublicSchedule from './PublicSchedule'
import PublicStandings from './PublicStandings'
import PublicPodium from './PublicPodium'
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
    if (format === 'round_robin' || format === 'group_knockout') tabs.push('standings')
    if (format === 'knockout' || format === 'group_knockout') tabs.push('bracket', 'podium')
    return tabs
  }, [format])

  const [activeTab, setActiveTab] = useState(() => (availableTabs.includes(initialTab) ? initialTab : 'overview'))
  const [branch, setBranch] = useState<'championship' | 'consolation'>('championship')

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
  const hasConsolation = brackets.some((b) => b.bracket === 'consolation' && b.hasBracket)

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
      subs.push(
        { table: 'tournament_matches', filter: `event_id=eq.${selectedEventId}` },
        { table: 'tournament_qualification_overrides', filter: `event_id=eq.${selectedEventId}` },
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
  const activeBranch = brackets.find((b) => b.bracket === branch) ?? brackets.find((b) => b.bracket === 'championship') ?? null

  return (
    <div className="max-w-[960px] mx-auto px-5 sm:px-6 py-8 pb-20">
      {/* Back link */}
      <Link href="/giai-dau" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-rose transition-colors mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {t('public.all_tournaments')}
      </Link>

      {/* Header */}
      <header className="rounded-3xl border border-line bg-gradient-to-br from-gold-light/40 via-paper to-rose-soft/60 p-6 sm:p-8 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <h1 className="font-serif font-bold text-[clamp(24px,3.4vw,36px)] leading-tight text-ink">{summary.name}</h1>
          <StatusPill phase={phase} label={t(`status.${phase}`)} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-muted mb-4">
          <span>{dateRange || t('public.dates_tbd')}</span>
          <span>{summary.location || t('public.location_tbd')}</span>
          <span>{t('public.events_count', { count: summary.events.length })}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
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
          <ConnectionIndicator status={rtStatus} onRefresh={refreshNow} className="ml-1" />
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
      </header>

      {/* Event selector */}
      {summary.events.length > 1 && (
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">{t('public.event_selector')}</p>
          <div className="flex flex-wrap gap-2">
            {summary.events.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => selectEvent(ev.id)}
                aria-pressed={ev.id === selectedEventId}
                className={`text-[13px] font-medium px-3 py-1.5 rounded-xl border transition-colors ${
                  ev.id === selectedEventId
                    ? 'border-rose bg-rose text-white'
                    : 'border-line bg-paper text-ink hover:border-rose/40'
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
          <div role="tablist" aria-label={t('public.tabs_label')} className="flex flex-wrap gap-1 border-b border-line mb-5">
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
                className={`text-[13px] font-semibold px-3.5 py-2 -mb-px border-b-2 rounded-t transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 ${
                  activeTab === tab
                    ? 'border-rose text-rose'
                    : 'border-transparent text-muted hover:text-ink'
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
              <div>
                {hasConsolation && (
                  <div className="flex gap-2 mb-4">
                    {(['championship', 'consolation'] as const).map((br) => (
                      <button
                        key={br}
                        type="button"
                        onClick={() => setBranch(br)}
                        aria-pressed={branch === br}
                        className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-xl border transition-colors ${
                          branch === br ? 'border-teal bg-teal-soft text-teal' : 'border-line bg-paper text-muted hover:text-ink'
                        }`}
                      >
                        {t(`bracket.${br}`)}
                      </button>
                    ))}
                  </div>
                )}
                {activeBranch && activeBranch.hasBracket ? (
                  <BracketView
                    rounds={activeBranch.rounds}
                    thirdPlaceMatch={activeBranch.thirdPlaceMatch}
                    competitors={toBracketCompetitors(workspace.competitors)}
                  />
                ) : (
                  <EmptyState title={t('empty.no_knockout')} hint={t('empty.no_knockout_hint')} />
                )}
              </div>
            )}
            {activeTab === 'podium' && <PublicPodium brackets={brackets} nameOf={nameOf} />}
          </div>
        </>
      )}
    </div>
  )
}
