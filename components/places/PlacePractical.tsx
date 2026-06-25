import { getTranslations } from 'next-intl/server'
import type { Place } from '@/lib/places'
import { placePaymentMethods } from '@/lib/places'
import { WEEKDAYS } from '@/lib/placeFields'

const CURRENCY_SYMBOL: Record<string, string> = { JPY: '¥', USD: '$', EUR: '€', KRW: '₩', CNY: '¥', VND: '₫' }

type T = (key: string, values?: Record<string, string | number>) => string

function money(amount: number, currency: string | null | undefined): string {
  const sym = CURRENCY_SYMBOL[(currency || 'JPY').toUpperCase()] ?? ''
  return `${sym}${amount.toLocaleString('en-US')}`
}

function formatPrice(place: Place, t: T): string | null {
  if (place.priceType === 'free' || place.fee === 'free') return t('price_free')
  const { priceMin, priceMax, currency } = place
  if (priceMin != null && priceMax != null) return t('pub_price_range', { min: money(priceMin, currency), max: money(priceMax, currency) })
  if (priceMin != null) return t('pub_price_from', { min: money(priceMin, currency) })
  if (priceMax != null) return t('pub_price_upto', { max: money(priceMax, currency) })
  if (place.priceType === 'paid' || place.fee === 'paid') return t('price_paid')
  return null
}

function hoursRows(place: Place): { day: string; slots: string | null }[] | null {
  const oh = place.openingHours as Record<string, { open?: string; close?: string }[]> | null
  if (!oh) return null
  const closed = new Set(place.closedDays ?? [])
  const rows = WEEKDAYS.map((d) => {
    if (closed.has(d)) return { day: d, slots: '—' }
    const slots = oh[d]
    if (!Array.isArray(slots)) return { day: d, slots: null } // unknown
    if (slots.length === 0) return { day: d, slots: '—' }
    return { day: d, slots: slots.map((s) => `${s.open}–${s.close}`).join(', ') }
  })
  return rows.some((r) => r.slots !== null) ? rows : null
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full bg-cream border border-line text-ink">{children}</span>
}

export default async function PlacePractical({ place }: { place: Place }) {
  const t = await getTranslations('place_fields')
  const price = formatPrice(place, t)
  const hours = hoursRows(place)
  const notes = (place.openingHours as { notes?: string } | null)?.notes

  // Suitability chips
  const suit: string[] = []
  if (place.goodForChildren) suit.push(t('good_for_children'))
  if (place.goodForSolo) suit.push(t('good_for_solo'))
  if (place.goodForGroups) suit.push(t('good_for_groups'))

  // Facility chips
  const fac: string[] = []
  if (place.parking) fac.push(`${t('parking')}: ${t(`parking_${place.parking}` as 'parking_free')}`)
  if (place.indoorOutdoor) fac.push(t(`io_${place.indoorOutdoor}` as 'io_indoor'))
  if (place.smokingPolicy) fac.push(t(`smk_${place.smokingPolicy}` as 'smk_no_smoking'))
  if (place.wheelchairAccessible) fac.push(t('wheelchair_accessible'))
  if (place.rainyDayOk) fac.push(t('rainy_day_ok'))
  if (place.bbqAvailable) fac.push(t('bbq_available'))
  if (place.campingAvailable) fac.push(t('camping_available'))
  if (place.servesVegetarian) fac.push(t('serves_vegetarian'))
  if (place.tattooPolicy) fac.push(`${t('tattoo_policy')}: ${t(`tat_${place.tattooPolicy}` as 'tat_allowed')}`)
  if (place.petPolicy) fac.push(`${t('pet_policy')}: ${t(`pet_${place.petPolicy}` as 'pet_allowed')}`)
  for (const pm of placePaymentMethods(place)) fac.push(t(`pm_${pm}` as 'pm_cash'))
  for (const lg of place.supportedLanguages ?? []) fac.push(t(`lang_${lg}` as 'lang_ja'))

  // Reservation chips
  const res: string[] = []
  if (place.reservationRequired) res.push(t('reservation_required'))
  else if (place.reservationRecommended) res.push(t('reservation_recommended'))
  if (place.walkInsAccepted) res.push(t('walk_ins_accepted'))

  const crowd = place.expectedCrowdLevel ? t(`crowd_${place.expectedCrowdLevel}` as 'crowd_low') : null
  const station = place.nearestStation

  const hasAnything = price || hours || station || res.length || suit.length || fac.length || crowd
  if (!hasAnything) return null

  return (
    <section className="bg-paper border border-line rounded-2xl p-5 mb-8">
      <h3 className="font-serif font-bold text-[18px] mb-4 text-ink">{t('pub_practical')}</h3>
      <div className="space-y-4 text-[13.5px] text-[#3a2d22]">
        {price && (
          <div className="flex gap-2"><span className="font-semibold text-[#5c4d44] min-w-[110px]">💰 {t('pub_price_label')}</span><span>{price}</span></div>
        )}
        {station && (
          <div className="flex gap-2">
            <span className="font-semibold text-[#5c4d44] min-w-[110px]">🚉 {t('pub_station')}</span>
            <span>{station}{place.stationWalkMinutes != null ? ` · ${t('pub_walk', { min: place.stationWalkMinutes })}` : ''}</span>
          </div>
        )}
        {res.length > 0 && (
          <div className="flex gap-2">
            <span className="font-semibold text-[#5c4d44] min-w-[110px]">📅 {t('pub_reservation')}</span>
            <span className="flex flex-wrap gap-1.5">{res.map((r) => <Chip key={r}>{r}</Chip>)}</span>
          </div>
        )}
        {hours && (
          <div>
            <p className="font-semibold text-[#5c4d44] mb-1.5">🕒 {t('pub_hours')}</p>
            <table className="text-[13px]">
              <tbody>
                {hours.map((r) => (
                  <tr key={r.day}>
                    <td className="pr-4 py-0.5 text-muted">{t(`day_${r.day}` as 'day_mon')}</td>
                    <td className="py-0.5">{r.slots ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {notes && <p className="text-[12.5px] text-muted mt-1.5">{notes}</p>}
          </div>
        )}
        {suit.length > 0 && (
          <div className="flex gap-2">
            <span className="font-semibold text-[#5c4d44] min-w-[110px]">👥 {t('pub_suitability')}</span>
            <span className="flex flex-wrap gap-1.5">{suit.map((s) => <Chip key={s}>{s}</Chip>)}{crowd && <Chip>{crowd}</Chip>}</span>
          </div>
        )}
        {fac.length > 0 && (
          <div className="flex gap-2">
            <span className="font-semibold text-[#5c4d44] min-w-[110px]">🏷️ {t('pub_facilities')}</span>
            <span className="flex flex-wrap gap-1.5">{fac.map((f) => <Chip key={f}>{f}</Chip>)}</span>
          </div>
        )}
      </div>
    </section>
  )
}
