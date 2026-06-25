import { getTranslations } from 'next-intl/server'
import type { Place } from '@/lib/places'
import { placePaymentMethods } from '@/lib/places'
import { WEEKDAYS } from '@/lib/placeFields'
import { prefectureName } from '@/lib/japan'
import { openStatus, jstParts } from '@/lib/placeOpenNow'
import HoursDisclosure, { type HoursRow } from './HoursDisclosure'

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

const toMin = (hhmm?: string) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm ?? '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function fmtSlot(s: { open?: string; close?: string }, allDayLabel: string): string {
  if (s.open === '00:00' && s.close === '00:00') return allDayLabel
  return `${s.open}–${s.close}`
}

// State → text color (open = brand green, closed = muted, etc.). Mirrors the hero badge palette.
const STATE_COLOR: Record<string, string> = {
  open: 'text-[#3f8f1f]',
  closing_soon: 'text-[#a8671d]',
  closed: 'text-muted',
  opens_later: 'text-muted',
  temporarily_closed: 'text-[#a8261d]',
  hours_unknown: 'text-muted',
}

interface HoursModel {
  stateKey: string
  detail: string
  rows: HoursRow[]
  notes?: string | null
}

/** Build the week rows + status detail line, or null when hours are entirely unknown. */
function buildHours(place: Place, tp: T, dayLabel: (d: string) => string, allDayLabel: string, todayLabel: string, reopens: (day: string, time: string) => string): HoursModel | null {
  const oh = place.openingHours as Record<string, { open?: string; close?: string }[]> | null
  if (!oh || typeof oh !== 'object') return null
  const closedSet = new Set(place.closedDays ?? [])

  const rows: HoursRow[] = []
  let anyKnown = false
  const { weekday: today, minutes: nowMin } = jstParts()

  for (const d of WEEKDAYS) {
    const isClosed = closedSet.has(d)
    const slots = oh[d]
    let text: string
    if (isClosed) text = '—'
    else if (!Array.isArray(slots)) { rows.push({ label: dayLabel(d), slots: '', isToday: d === today }); continue }
    else if (slots.length === 0) text = '—'
    else { text = slots.map((s) => fmtSlot(s, allDayLabel)).join(', '); anyKnown = true }
    if (text === '—') anyKnown = true
    rows.push({ label: dayLabel(d), slots: text, isToday: d === today })
  }
  if (!anyKnown) return null

  const stateKey = openStatus(place.openingHours, place.closedDays, { temporaryStatus: place.temporaryStatus })

  let detail = ''
  if (stateKey === 'open' || stateKey === 'closing_soon') {
    const todaySlots = Array.isArray(oh[today]) ? oh[today] : null
    if (todaySlots && todaySlots.length) detail = `${todayLabel} ${todaySlots.map((s) => fmtSlot(s, allDayLabel)).join(', ')}`
  } else if (stateKey === 'closed' || stateKey === 'opens_later') {
    const next = nextOpening(oh, closedSet, today, nowMin)
    if (next) detail = reopens(next.offset === 0 ? todayLabel : dayLabel(next.day), next.time)
  }

  return { stateKey, detail, rows, notes: (place.openingHours as { notes?: string } | null)?.notes }
}

/** First opening slot from `today` forward (skips already-passed slots today, closed days). */
function nextOpening(oh: Record<string, { open?: string; close?: string }[]>, closedSet: Set<string>, today: string, nowMin: number): { day: string; offset: number; time: string } | null {
  const start = WEEKDAYS.indexOf(today as (typeof WEEKDAYS)[number])
  if (start < 0) return null
  for (let i = 0; i < 7; i++) {
    const d = WEEKDAYS[(start + i) % 7]
    if (closedSet.has(d)) continue
    const slots = oh[d]
    if (!Array.isArray(slots) || slots.length === 0) continue
    const opens = slots.map((s) => ({ time: s.open ?? '', min: toMin(s.open) })).filter((x) => x.min !== null).sort((a, b) => (a.min as number) - (b.min as number))
    for (const o of opens) {
      if (i === 0 && (o.min as number) <= nowMin) continue
      return { day: d, offset: i, time: o.time }
    }
  }
  return null
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center text-[12px] font-medium px-2.5 py-1 rounded-full bg-rose-soft text-rose-deep border border-rose/15">{children}</span>
}

function InfoRow({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-[15px] leading-none mt-px w-[18px] text-center shrink-0" aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/**
 * Merged "plan a visit" rail card: open/closed status + price + station +
 * topic/area/prefecture/address + reservation/suitability/facility pills.
 * Consolidates the former full-width PlacePractical block and the Quick-info
 * card (price + area/address appear exactly once).
 */
export default async function PlaceVisitInfo({
  place,
  displayCategory,
  displayArea,
}: {
  place: Place
  displayCategory: string
  displayArea: string
}) {
  const t = await getTranslations('common')
  const tp = await getTranslations('place_fields')
  const tm = await getTranslations('map_explore')

  const price = formatPrice(place, (k, v) => tp(k as never, v as never))
  const station = place.nearestStation
  const hours = buildHours(
    place,
    (k, v) => tp(k as never, v as never),
    (d) => tp(`day_${d}` as 'day_mon'),
    tp('pub_all_day'),
    tp('pub_today'),
    (day, time) => tp('pub_reopens', { day, time }),
  )

  // Reservation chips
  const res: string[] = []
  if (place.reservationRequired) res.push(tp('reservation_required'))
  else if (place.reservationRecommended) res.push(tp('reservation_recommended'))
  if (place.walkInsAccepted) res.push(tp('walk_ins_accepted'))

  // Suitability chips
  const suit: string[] = []
  if (place.goodForChildren) suit.push(tp('good_for_children'))
  if (place.goodForSolo) suit.push(tp('good_for_solo'))
  if (place.goodForGroups) suit.push(tp('good_for_groups'))
  if (place.expectedCrowdLevel) suit.push(tp(`crowd_${place.expectedCrowdLevel}` as 'crowd_low'))

  // Facility chips
  const fac: string[] = []
  if (place.parking) fac.push(`${tp('parking')}: ${tp(`parking_${place.parking}` as 'parking_free')}`)
  if (place.indoorOutdoor) fac.push(tp(`io_${place.indoorOutdoor}` as 'io_indoor'))
  if (place.smokingPolicy) fac.push(tp(`smk_${place.smokingPolicy}` as 'smk_no_smoking'))
  if (place.wheelchairAccessible) fac.push(tp('wheelchair_accessible'))
  if (place.rainyDayOk) fac.push(tp('rainy_day_ok'))
  if (place.bbqAvailable) fac.push(tp('bbq_available'))
  if (place.campingAvailable) fac.push(tp('camping_available'))
  if (place.servesVegetarian) fac.push(tp('serves_vegetarian'))
  if (place.tattooPolicy) fac.push(`${tp('tattoo_policy')}: ${tp(`tat_${place.tattooPolicy}` as 'tat_allowed')}`)
  if (place.petPolicy) fac.push(`${tp('pet_policy')}: ${tp(`pet_${place.petPolicy}` as 'pet_allowed')}`)
  for (const pm of placePaymentMethods(place)) fac.push(tp(`pm_${pm}` as 'pm_cash'))
  for (const lg of place.supportedLanguages ?? []) fac.push(tp(`lang_${lg}` as 'lang_ja'))

  return (
    <div className="bg-paper border border-line rounded-2xl p-5">
      <h4 className="font-serif font-bold text-[15px] mb-3.5 text-ink">{t('quick_info')}</h4>
      <div className="space-y-3 text-[13.5px] text-[#5c4d44]">
        {hours && hours.stateKey !== 'hours_unknown' && (
          <HoursDisclosure
            stateLabel={tm(`state_${hours.stateKey}` as 'state_open')}
            stateColor={STATE_COLOR[hours.stateKey] ?? 'text-muted'}
            detail={hours.detail}
            rows={hours.rows}
            weekLabel={tp('pub_week')}
            hideLabel={tp('pub_week_hide')}
            notes={hours.notes}
          />
        )}

        {price && (
          <InfoRow icon="💰">
            <span>{tp('pub_price_label')} <b className="text-ink font-semibold">{price}</b></span>
          </InfoRow>
        )}

        {station && (
          <InfoRow icon="🚉">
            <span>{tp('pub_station')} <b className="text-ink font-semibold">{station}</b>{place.stationWalkMinutes != null ? ` · ${tp('pub_walk', { min: place.stationWalkMinutes })}` : ''}</span>
          </InfoRow>
        )}

        <InfoRow icon="📂">
          <span>{t('topic')} <b className="text-ink">{displayCategory}</b></span>
        </InfoRow>

        <InfoRow icon="📍">
          <span>{t('location')} <b className="text-ink">{displayArea}</b></span>
        </InfoRow>

        {place.prefecture && (
          <InfoRow icon="🏙️">
            <span>{t('prefecture')} <b className="text-ink">{prefectureName(place.prefecture)}{place.city ? ` · ${place.city}` : ''}</b></span>
          </InfoRow>
        )}

        {place.address && (
          <InfoRow icon="🧭">
            <span>{t('address')} <b className="text-ink">{place.address}</b></span>
          </InfoRow>
        )}

        {res.length > 0 && (
          <InfoRow icon="📅">
            <div className="flex flex-wrap gap-1.5">{res.map((r) => <Badge key={r}>{r}</Badge>)}</div>
          </InfoRow>
        )}

        {suit.length > 0 && (
          <InfoRow icon="👥">
            <div className="flex flex-wrap gap-1.5">{suit.map((s) => <Badge key={s}>{s}</Badge>)}</div>
          </InfoRow>
        )}

        {fac.length > 0 && (
          <InfoRow icon="🏷️">
            <div className="flex flex-wrap gap-1.5">{fac.map((f) => <Badge key={f}>{f}</Badge>)}</div>
          </InfoRow>
        )}
      </div>
    </div>
  )
}
