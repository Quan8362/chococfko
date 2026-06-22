import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { getAllPlacesFromDb, places as staticPlaces, categoryEmoji } from '@/lib/places'
import { analyzePlan, type PlanStopInput } from '@/lib/planning'
import { formatDistanceKm } from '@/lib/geo'
import { getSharedPlan } from '../../actions'
import DuplicatePlanButton from './DuplicatePlanButton'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false } }

export default async function SharedPlanPage({ params }: { params: { token: string } }) {
  const [t, locale] = await Promise.all([getTranslations('trips'), getLocale()])
  const shared = await getSharedPlan(params.token)
  if (!shared) notFound()

  const all = (await getAllPlacesFromDb(locale)) ?? staticPlaces
  const map = new Map(all.map((p) => [p.slug, p]))

  const inputs: PlanStopInput[] = shared.stops.map((s) => {
    const p = map.get(s.place_slug)
    return {
      slug: s.place_slug, lat: p?.lat ?? null, lng: p?.lng ?? null,
      openingHours: (p?.openingHours as Record<string, unknown> | null) ?? null, closedDays: p?.closedDays ?? null,
      temporaryStatus: p?.temporaryStatus ?? null, reservationRequired: p?.reservationRequired ?? null,
      verificationStatus: p?.verificationStatus ?? null, lastVerifiedAt: p?.lastVerifiedAt ?? null,
      arrivalTime: s.arrival_time, departureTime: s.departure_time,
    }
  })
  const analysis = analyzePlan(inputs, { planDate: shared.plan_date })

  return (
    <div className="max-w-[760px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <p className="text-[12px] font-semibold uppercase tracking-[1px] text-teal mb-2">{t('shared_readonly')}</p>
      <h1 className="font-serif font-bold text-[clamp(24px,4vw,36px)] tracking-[-0.4px] text-ink mb-1.5">{shared.title}</h1>
      <p className="text-[14px] text-muted mb-2">
        {shared.plan_date ? `${shared.plan_date}` : ''}{shared.start_location ? ` · ${shared.start_location}` : ''}
      </p>
      {shared.notes && <p className="text-[14px] text-[#3a2d22] mb-4 whitespace-pre-line">{shared.notes}</p>}

      <div className="my-6"><DuplicatePlanButton token={params.token} /></div>

      <ol className="space-y-3">
        {shared.stops.map((s, i) => {
          const p = map.get(s.place_slug); const a = analysis.stops[i]
          return (
            <li key={`${s.place_slug}-${i}`} className="bg-paper border border-line rounded-2xl p-3.5">
              {a?.distanceFromPrevKm != null && <p className="text-[11.5px] text-muted mb-1.5">↓ {t('distance_approx', { dist: formatDistanceKm(a.distanceFromPrevKm) })}</p>}
              <div className="flex items-center gap-3">
                <span className="flex-none w-6 h-6 grid place-items-center rounded-full bg-rose text-white text-[12px] font-bold">{i + 1}</span>
                <span className="text-[16px]">{p ? categoryEmoji[p.category] ?? '📍' : '📍'}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/places/${s.place_slug}`} className="font-serif font-bold text-[15px] text-ink hover:text-rose">{p?.name ?? s.place_slug}</Link>
                  <p className="text-[12px] text-muted">
                    {p?.area}
                    {s.arrival_time ? ` · ${s.arrival_time.slice(0, 5)}${s.departure_time ? `–${s.departure_time.slice(0, 5)}` : ''}` : ''}
                    {s.est_cost != null ? ` · ~¥${s.est_cost}` : ''}
                  </p>
                  {s.note && <p className="text-[13px] text-[#3a2d22] mt-1">{s.note}</p>}
                </div>
              </div>
              {a?.warnings.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {a.warnings.map((w) => <span key={w} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{t(`w_${w}` as 'w_hours_unknown')}</span>)}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
