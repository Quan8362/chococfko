'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { PlaceLite } from '@/lib/placeLite'
import { moveItem, analyzePlan, type PlanStopInput, type StopWarning } from '@/lib/planning'
import { openStatus } from '@/lib/placeOpenNow'
import { formatDistanceKm } from '@/lib/geo'
import { directionsUrl } from '@/lib/placeActions'
import { buildICS, gcalUrl, planSummaryText, type CalStop } from '@/lib/calendar'
import {
  updatePlan, setPlanShareable, addStop, removeStop, updateStop, reorderStops,
  type PlanRow, type StopRow,
} from './actions'

interface Props {
  plan: PlanRow
  stops: StopRow[]
  placeMap: Record<string, PlaceLite>
  allPlaces: { slug: string; name: string; area: string }[]
}

type Editable = { arrivalTime: string; departureTime: string; durationMinutes: string; note: string; estCost: string; transportNote: string }

function toEditable(s: StopRow): Editable {
  return {
    arrivalTime: s.arrival_time?.slice(0, 5) ?? '', departureTime: s.departure_time?.slice(0, 5) ?? '',
    durationMinutes: s.duration_minutes != null ? String(s.duration_minutes) : '', note: s.note ?? '',
    estCost: s.est_cost != null ? String(s.est_cost) : '', transportNote: s.transport_note ?? '',
  }
}

export default function PlanEditor({ plan, stops, placeMap, allPlaces }: Props) {
  const t = useTranslations('trips')
  const tm = useTranslations('map_explore')
  const router = useRouter()
  const [, start] = useTransition()

  const [title, setTitle] = useState(plan.title)
  const [date, setDate] = useState(plan.plan_date ?? '')
  const [startLoc, setStartLoc] = useState(plan.start_location ?? '')
  const [notes, setNotes] = useState(plan.notes ?? '')
  const [shareable, setShareable] = useState(plan.is_shareable)
  const [shareNotes, setShareNotes] = useState(plan.share_notes)
  const [token, setToken] = useState(plan.share_token)
  const [order, setOrder] = useState(stops.map((s) => s.id))
  const [state, setState] = useState<Record<string, Editable>>(Object.fromEntries(stops.map((s) => [s.id, toEditable(s)])))
  const stopBySlug = useMemo(() => new Map(stops.map((s) => [s.id, s])), [stops])
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)

  const shareUrl = token && typeof window !== 'undefined' ? `${window.location.origin}/plans/shared/${token}` : ''

  const saveMeta = () => start(async () => { await updatePlan(plan.id, { title, planDate: date, startLocation: startLoc, notes }) })
  const toggleShare = (on: boolean) => start(async () => { const r = await setPlanShareable(plan.id, on, shareNotes); setShareable(on); setToken(r.token) })
  const toggleNotes = (on: boolean) => start(async () => { setShareNotes(on); if (shareable) { const r = await setPlanShareable(plan.id, true, on); setToken(r.token) } })
  const saveStop = (id: string) => start(async () => { await updateStop(plan.id, id, state[id]) })
  const setField = (id: string, k: keyof Editable, v: string) => setState((p) => ({ ...p, [id]: { ...p[id], [k]: v } }))

  const move = (from: number, to: number) => { const next = moveItem(order, from, to); setOrder(next); start(async () => { await reorderStops(plan.id, next) }) }
  const remove = (id: string) => { setOrder((o) => o.filter((x) => x !== id)); start(async () => { await removeStop(plan.id, id); router.refresh() }) }
  const add = (slug: string) => { setQuery(''); start(async () => { await addStop(plan.id, slug); router.refresh() }) }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase(); if (!q) return []
    const have = new Set(order.map((id) => stopBySlug.get(id)?.place_slug))
    return allPlaces.filter((p) => p.name.toLowerCase().includes(q) && !have.has(p.slug)).slice(0, 8)
  }, [query, allPlaces, order, stopBySlug])

  // Build planning inputs + analysis (pure).
  const orderedStops = order.map((id) => stopBySlug.get(id)).filter(Boolean) as StopRow[]
  const inputs: PlanStopInput[] = orderedStops.map((s) => {
    const p = placeMap[s.place_slug]
    const e = state[s.id]
    return {
      slug: s.place_slug, lat: p?.lat ?? null, lng: p?.lng ?? null,
      openingHours: p?.openingHours ?? null, closedDays: p?.closedDays ?? null, temporaryStatus: p?.temporaryStatus ?? null,
      reservationRequired: p?.reservationRequired ?? null, verificationStatus: p?.verificationStatus ?? null, lastVerifiedAt: p?.lastVerifiedAt ?? null,
      arrivalTime: e?.arrivalTime || null, departureTime: e?.departureTime || null,
    }
  })
  const analysis = useMemo(() => analyzePlan(inputs, { planDate: date || null }), [inputs, date])

  const calStops: CalStop[] = orderedStops.map((s) => {
    const p = placeMap[s.place_slug]; const e = state[s.id]
    return { title: p?.name ?? s.place_slug, date: date || null, arrivalTime: e?.arrivalTime || null, departureTime: e?.departureTime || null, durationMinutes: e?.durationMinutes ? Number(e.durationMinutes) : null, location: p?.area ?? null, note: e?.note || null, estCost: e?.estCost ? Number(e.estCost) : null }
  })

  const downloadIcs = () => {
    const ics = buildICS(title, calStops); if (!ics) return
    const blob = new Blob([ics], { type: 'text/calendar' }); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${title || 'plan'}.ics`; a.click(); URL.revokeObjectURL(url)
  }
  const copySummary = () => { navigator.clipboard.writeText(planSummaryText(title, date || null, calStops)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
      <div>
        {analysis.planWarnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
            {analysis.planWarnings.map((w) => <p key={w} className="text-[12.5px] text-amber-800">⚠️ {t(`w_${w}` as 'w_time_overlap')}</p>)}
          </div>
        )}

        {/* Add stop */}
        <div className="relative mb-5">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('add_place_ph')} className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-paper" />
          {matches.length > 0 && (
            <ul className="absolute z-30 left-0 right-0 top-[calc(100%+4px)] bg-paper border border-line rounded-xl shadow-card-hover p-1.5">
              {matches.map((p) => <li key={p.slug}><button type="button" onClick={() => add(p.slug)} className="w-full text-left px-3 py-2 rounded-lg text-[13.5px] hover:bg-cream">{p.name} <span className="text-muted">· {p.area}</span></button></li>)}
            </ul>
          )}
        </div>

        {order.length === 0 ? (
          <p className="text-[14px] text-muted bg-paper border border-line rounded-2xl p-6">{t('no_stops')}</p>
        ) : (
          <ol className="space-y-3">
            {orderedStops.map((s, i) => {
              const p = placeMap[s.place_slug]; const e = state[s.id]; const a = analysis.stops[i]
              const st = p ? openStatus(p.openingHours, p.closedDays, { temporaryStatus: p.temporaryStatus }) : 'hours_unknown'
              const dir = p ? directionsUrl({ mapUrl: p.mapUrl, lat: p.lat, lng: p.lng, name: p.name }) : '#'
              const g = gcalUrl(calStops[i])
              return (
                <li key={s.id} className="bg-paper border border-line rounded-2xl p-3.5">
                  {a?.distanceFromPrevKm != null && <p className="text-[11.5px] text-muted mb-1.5">↓ {t('distance_approx', { dist: formatDistanceKm(a.distanceFromPrevKm) })}</p>}
                  <div className="flex items-center gap-3">
                    <span className="flex-none w-6 h-6 grid place-items-center rounded-full bg-rose text-white text-[12px] font-bold">{i + 1}</span>
                    <span className="text-[16px]">{p?.emoji ?? '📍'}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/places/${s.place_slug}`} className="font-serif font-bold text-[15px] text-ink hover:text-rose">{p?.name ?? s.place_slug}</Link>
                      <p className="text-[12px] text-muted">{p?.area}{st !== 'hours_unknown' ? ` · ${tm(`state_${st}` as 'state_open')}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="w-7 h-7 grid place-items-center rounded-lg border border-line text-muted disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => move(i, i + 1)} disabled={i === order.length - 1} className="w-7 h-7 grid place-items-center rounded-lg border border-line text-muted disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => remove(s.id)} className="w-7 h-7 grid place-items-center rounded-lg border border-line text-muted hover:text-rose">✕</button>
                    </div>
                  </div>

                  {a?.warnings.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {a.warnings.map((w: StopWarning) => <span key={w} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{t(`w_${w}` as 'w_hours_unknown')}</span>)}
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    <Field label={t('arrival')} type="time" value={e.arrivalTime} onChange={(v) => setField(s.id, 'arrivalTime', v)} onBlur={() => saveStop(s.id)} />
                    <Field label={t('departure')} type="time" value={e.departureTime} onChange={(v) => setField(s.id, 'departureTime', v)} onBlur={() => saveStop(s.id)} />
                    <Field label={t('duration_min')} type="number" value={e.durationMinutes} onChange={(v) => setField(s.id, 'durationMinutes', v)} onBlur={() => saveStop(s.id)} />
                    <Field label={t('cost_yen')} type="number" value={e.estCost} onChange={(v) => setField(s.id, 'estCost', v)} onBlur={() => saveStop(s.id)} />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2 mt-2">
                    <Field label={t('stop_note')} value={e.note} onChange={(v) => setField(s.id, 'note', v)} onBlur={() => saveStop(s.id)} />
                    <Field label={t('transport')} value={e.transportNote} onChange={(v) => setField(s.id, 'transportNote', v)} onBlur={() => saveStop(s.id)} />
                  </div>
                  <div className="flex gap-3 mt-2.5">
                    <a href={dir} target="_blank" rel="noopener" className="text-[12.5px] font-semibold text-rose hover:underline">{t('next_directions')}</a>
                    {g && <a href={g} target="_blank" rel="noopener nofollow" className="text-[12.5px] text-teal hover:underline">{t('add_gcal')}</a>}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      {/* Sidebar */}
      <aside className="space-y-4">
        <div className="bg-paper border border-line rounded-2xl p-4 space-y-2.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveMeta} className="w-full text-[15px] font-semibold px-3 py-2 border border-line rounded-lg bg-white" />
          <label className="block text-[12px] text-muted">{t('date')}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} onBlur={saveMeta} className="mt-1 w-full text-[13.5px] px-3 py-2 border border-line rounded-lg bg-white" /></label>
          <input value={startLoc} onChange={(e) => setStartLoc(e.target.value)} onBlur={saveMeta} placeholder={t('start_location_ph')} className="w-full text-[13.5px] px-3 py-2 border border-line rounded-lg bg-white" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveMeta} placeholder={t('notes_ph')} rows={2} className="w-full text-[13.5px] px-3 py-2 border border-line rounded-lg bg-white resize-y" />
        </div>

        <div className="bg-paper border border-line rounded-2xl p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[1px] text-muted mb-2">{t('export')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => window.print()} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-line hover:border-rose/40">{t('print')}</button>
            <button type="button" onClick={copySummary} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-line hover:border-rose/40">{copied ? t('summary_copied') : t('copy_summary')}</button>
            <button type="button" onClick={downloadIcs} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-line hover:border-rose/40">{t('add_ics')}</button>
          </div>
          <p className="text-[11px] text-muted mt-2">{t('calendar_note')}</p>
          <p className="text-[11px] text-muted mt-1">{t('estimates_note')}</p>
        </div>

        <div className="bg-paper border border-line rounded-2xl p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[1px] text-muted mb-2">{t('privacy')}</p>
          <label className="flex items-center gap-2 text-[13.5px] cursor-pointer">
            <input type="checkbox" className="accent-rose" checked={shareable} onChange={(e) => toggleShare(e.target.checked)} />{t('make_shareable')}
          </label>
          {shareable && (
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2 text-[13px] cursor-pointer text-muted"><input type="checkbox" className="accent-rose" checked={shareNotes} onChange={(e) => toggleNotes(e.target.checked)} />{t('include_notes')}</label>
              <p className="text-[11.5px] text-muted">{t('share_note')}</p>
              {shareUrl && (
                <div className="flex gap-2">
                  <input readOnly value={shareUrl} className="flex-1 text-[12px] px-2.5 py-2 border border-line rounded-lg bg-cream" />
                  <button type="button" onClick={() => navigator.clipboard.writeText(shareUrl)} className="text-[12.5px] font-semibold px-3 py-2 rounded-lg bg-rose text-white whitespace-nowrap">{t('copy_link')}</button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function Field({ label, value, onChange, onBlur, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; onBlur: () => void; type?: string }) {
  return (
    <label className="block text-[11px] text-muted">
      {label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} className="mt-0.5 w-full text-[13px] px-2.5 py-1.5 border border-line rounded-lg bg-white" />
    </label>
  )
}
