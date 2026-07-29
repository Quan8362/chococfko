'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  saveQualificationOverride,
  deleteQualificationOverride,
} from '@/app/admin/giai-dau/[id]/noi-dung/actions'
import type { CompetitorRow, GroupStandingsView, ScoreMutationError, TieGroupView } from '@/lib/tournaments/admin/types'

// "Phân định thứ hạng" tab: for every group whose standings hold a tie that straddles a qualification
// (or podium) cut, the organizer manually orders the tied competitors. Saving stores a qualification
// override (full group order) that breaks the tie; it can be removed to return to "unresolved".
export default function TieResolutionPanel({
  tournamentId,
  eventId,
  eventVersion,
  standings,
  competitors,
  hasKnockout,
}: {
  tournamentId: string
  eventId: string
  eventVersion: number
  standings: GroupStandingsView[]
  competitors: CompetitorRow[]
  hasKnockout: boolean
}) {
  const t = useTranslations('admin_tie_resolution')

  const nameOf = useMemo(() => {
    const map = new Map(competitors.map((c) => [c.id, c.name]))
    return (id: string) => map.get(id) ?? id
  }, [competitors])

  // Groups needing attention: an unresolved blocking tie, OR an already-applied resolution.
  const targets = standings.filter((g) => g.blockingTies.length > 0 || g.hasOverride)

  if (targets.length === 0) {
    return (
      <div className="bg-cream border border-line rounded-2xl py-10 px-6 text-center">
        <p className="text-[13px] text-muted">{t('none')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {hasKnockout && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
          <p className="text-[13px] text-amber-700">{t('locked_knockout')}</p>
        </div>
      )}
      <p className="text-[12.5px] text-muted leading-relaxed">{t('intro')}</p>
      {targets.map((g) => (
        <GroupTie
          key={g.groupId}
          tournamentId={tournamentId}
          eventId={eventId}
          eventVersion={eventVersion}
          group={g}
          nameOf={nameOf}
          disabled={hasKnockout}
        />
      ))}
    </div>
  )
}

function GroupTie({
  tournamentId,
  eventId,
  eventVersion,
  group,
  nameOf,
  disabled,
}: {
  tournamentId: string
  eventId: string
  eventVersion: number
  group: GroupStandingsView
  nameOf: (id: string) => string
  disabled: boolean
}) {
  const t = useTranslations('admin_tie_resolution')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<ScoreMutationError | null>(null)

  const tie: TieGroupView | null = group.blockingTies[0] ?? null
  const [order, setOrder] = useState<string[]>(tie ? [...tie.competitorIds] : [])
  const [reason, setReason] = useState('')

  const move = (i: number, dir: -1 | 1) =>
    setOrder((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  function doSave() {
    if (!tie) return
    setError(null)
    startTransition(async () => {
      const res = await saveQualificationOverride(
        tournamentId,
        eventId,
        group.groupId,
        eventVersion,
        order,
        reason.trim() || null,
      )
      if (res.ok) router.refresh()
      else setError(res.error)
    })
  }

  function doRemove() {
    setError(null)
    startTransition(async () => {
      const res = await deleteQualificationOverride(tournamentId, eventId, group.groupId, eventVersion)
      if (res.ok) router.refresh()
      else setError(res.error)
    })
  }

  return (
    <div className="border border-line rounded-xl overflow-hidden">
      <div className="bg-cream px-4 py-2 border-b border-line flex items-baseline justify-between gap-2">
        <span className="font-serif font-bold text-[14px] text-ink">{t('group', { name: group.groupName })}</span>
        {group.hasOverride ? (
          <span className="text-[11px] font-semibold text-teal">{t('status_resolved')}</span>
        ) : (
          <span className="text-[11px] font-semibold text-amber-600">{t('status_unresolved')}</span>
        )}
      </div>

      <div className="p-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 mb-3" role="alert">
            <p className="text-[13px] text-red-600">{t(`err_${error}`)}</p>
          </div>
        )}

        {group.hasOverride ? (
          <div>
            <p className="text-[12.5px] text-muted mb-3">
              {t('resolved_desc')}
              {group.overrideReason ? ` — ${group.overrideReason}` : ''}
            </p>
            <button
              type="button"
              disabled={pending || disabled}
              onClick={doRemove}
              className="font-semibold text-[13px] px-4 py-2 rounded-full border border-red-200 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white hover:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? t('working') : t('remove_resolution')}
            </button>
          </div>
        ) : tie ? (
          <div>
            <p className="text-[12.5px] text-muted mb-3">{t('reorder_hint')}</p>
            <ol className="space-y-1.5 mb-3">
              {order.map((id, i) => (
                <li
                  key={id}
                  className="flex items-center gap-2 bg-cream border border-line rounded-lg px-2.5 py-1.5"
                >
                  <span className="flex-none w-6 text-[12px] font-bold text-rose">{tie.positionStart + i}</span>
                  <span className="flex-1 min-w-0 text-[13px] text-ink font-medium truncate">{nameOf(id)}</span>
                  <div className="flex-none flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0 || pending || disabled}
                      aria-label={t('move_up')}
                      className="w-6 h-6 grid place-items-center rounded-md border border-line bg-paper text-[11px] text-muted hover:text-rose disabled:opacity-30 transition-colors"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === order.length - 1 || pending || disabled}
                      aria-label={t('move_down')}
                      className="w-6 h-6 grid place-items-center rounded-md border border-line bg-paper text-[11px] text-muted hover:text-rose disabled:opacity-30 transition-colors"
                    >
                      ↓
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('reason_placeholder')}
              maxLength={500}
              disabled={pending || disabled}
              className="w-full text-[13px] px-3 py-2 rounded-lg border border-line bg-cream focus:outline-none focus:border-rose/50 mb-3"
            />
            <button
              type="button"
              disabled={pending || disabled}
              onClick={doSave}
              className="font-semibold text-[13px] px-5 py-2 rounded-full bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? t('working') : t('save_resolution')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
