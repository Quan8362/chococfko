'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { places, neutralAreaString, RELATION_TYPES, type RelationType } from '@/lib/places'
import { setContentTags } from '@/lib/tags'
import { PREFECTURE_NAME, PREFECTURES } from '@/lib/japan'
import { getLocale } from 'next-intl/server'
import {
  normalizeUrl, normalizePhone, validatePriceRange, validateOpeningHours,
  validateJapanesePhrases, isValidCoordinate,
  parseIntOrNull, parseTriState, parseList, parseEnum, parseEnumList,
  PRICE_TYPES, TEMPORARY_STATUSES, PARKING_OPTIONS, INDOOR_OUTDOOR_OPTIONS,
  SMOKING_OPTIONS, TATTOO_OPTIONS, PET_OPTIONS, CROWD_LEVELS,
  VERIFICATION_STATUSES, PAYMENT_METHODS, PLACE_LANGUAGES,
} from '@/lib/placeFields'

/** PostgREST signals an unknown column (migration not yet applied) via PGRST204. */
function isMissingColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  return err.code === 'PGRST204' ||
    /column|schema cache|could not find/i.test(err.message ?? '')
}

/** Build + validate the Phase-1 extended payload from the edit form. Throws on hard errors. */
function buildExtendedPlacePayload(formData: FormData): Record<string, unknown> {
  const errors: string[] = []
  const url = (name: string): string | null => {
    const raw = (formData.get(name) as string | null)?.trim() || ''
    if (!raw) return null
    const n = normalizeUrl(raw)
    if (!n) { errors.push(`invalid_url:${name}`); return null }
    return n
  }

  // Coordinates
  const latRaw = (formData.get('lat') as string | null)?.trim() || ''
  const lngRaw = (formData.get('lng') as string | null)?.trim() || ''
  let lat: number | null = null
  let lng: number | null = null
  if (latRaw || lngRaw) {
    lat = latRaw ? Number.parseFloat(latRaw) : null
    lng = lngRaw ? Number.parseFloat(lngRaw) : null
    if (lat !== null && lng !== null) {
      if (!isValidCoordinate(lat, lng)) errors.push('invalid_coordinates')
    } else if (lat !== null || lng !== null) {
      errors.push('incomplete_coordinates') // one without the other
    }
  }

  // Price
  const priceType = parseEnum(formData.get('price_type'), PRICE_TYPES)
  const priceMin = parseIntOrNull(formData.get('price_min'))
  const priceMax = parseIntOrNull(formData.get('price_max'))
  const priceCheck = validatePriceRange({ priceType, priceMin, priceMax })
  if (!priceCheck.ok) errors.push(...priceCheck.errors)

  // Hours & phrases (structured JSON)
  const hours = validateOpeningHours((formData.get('opening_hours') as string | null) ?? '')
  if (!hours.ok) errors.push(...hours.errors)
  const phrases = validateJapanesePhrases((formData.get('japanese_phrases') as string | null) ?? '')
  if (!phrases.ok) errors.push(...phrases.errors)

  // Phone — keep display, derive E.164
  const { display: phone, e164: phoneE164 } = normalizePhone(formData.get('phone') as string | null)

  if (errors.length) throw new Error(`place_validation:${Array.from(new Set(errors)).join(',')}`)

  return {
    subcategories: parseList(formData.get('subcategories')),
    postal_code: (formData.get('postal_code') as string | null)?.trim() || null,
    nearest_station: (formData.get('nearest_station') as string | null)?.trim() || null,
    station_walk_minutes: parseIntOrNull(formData.get('station_walk_minutes')),
    lat, lng,
    price_type: priceType,
    price_min: priceMin,
    price_max: priceMax,
    currency: ((formData.get('currency') as string | null)?.trim().toUpperCase() || null),
    opening_hours: hours.value,
    closed_days: parseEnumList(formData.getAll('closed_days'), ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
    temporary_status: parseEnum(formData.get('temporary_status'), TEMPORARY_STATUSES),
    reservation_recommended: parseTriState(formData.get('reservation_recommended')),
    reservation_required: parseTriState(formData.get('reservation_required')),
    walk_ins_accepted: parseTriState(formData.get('walk_ins_accepted')),
    good_for_children: parseTriState(formData.get('good_for_children')),
    good_for_solo: parseTriState(formData.get('good_for_solo')),
    good_for_groups: parseTriState(formData.get('good_for_groups')),
    parking: parseEnum(formData.get('parking'), PARKING_OPTIONS),
    indoor_outdoor: parseEnum(formData.get('indoor_outdoor'), INDOOR_OUTDOOR_OPTIONS),
    rainy_day_ok: parseTriState(formData.get('rainy_day_ok')),
    wheelchair_accessible: parseTriState(formData.get('wheelchair_accessible')),
    smoking_policy: parseEnum(formData.get('smoking_policy'), SMOKING_OPTIONS),
    payment_methods: parseEnumList(formData.getAll('payment_methods'), PAYMENT_METHODS),
    supported_languages: parseEnumList(formData.getAll('supported_languages'), PLACE_LANGUAGES),
    tattoo_policy: parseEnum(formData.get('tattoo_policy'), TATTOO_OPTIONS),
    bbq_available: parseTriState(formData.get('bbq_available')),
    camping_available: parseTriState(formData.get('camping_available')),
    pet_policy: parseEnum(formData.get('pet_policy'), PET_OPTIONS),
    official_website: url('official_website'),
    reservation_url: url('reservation_url'),
    reservation_provider: (formData.get('reservation_provider') as string | null)?.trim() || null,
    phone, phone_e164: phoneE164,
    social_url: url('social_url'),
    source_url: url('source_url'),
    last_verified_at: (formData.get('last_verified_at') as string | null)?.trim() || null,
    know_before_you_go: (formData.get('know_before_you_go') as string | null) || null,
    vi_tips: (formData.get('vi_tips') as string | null) || null,
    items_to_bring: parseList(formData.get('items_to_bring')),
    recommended_duration_minutes: parseIntOrNull(formData.get('recommended_duration_minutes')),
    best_visit_time: (formData.get('best_visit_time') as string | null)?.trim() || null,
    expected_crowd_level: parseEnum(formData.get('expected_crowd_level'), CROWD_LEVELS),
    japanese_phrases: phrases.value,
    verification_status: parseEnum(formData.get('verification_status'), VERIFICATION_STATUSES) ?? 'unverified',
    search_eligible: parseTriState(formData.get('search_eligible')) ?? true,
    recommend_eligible: parseTriState(formData.get('recommend_eligible')) ?? true,
  }
}

async function guardAdmin() {
  if (!(await checkIsAdmin())) redirect('/')
}

export async function seedPlaces() {
  await guardAdmin()
  const admin = createAdminClient()

  const rows = places.map((p, i) => ({
    slug: p.slug,
    name: p.name,
    area: p.area,
    description: p.desc,
    body: null,
    category: p.category,
    category_label: p.categoryLabel,
    fee: p.fee,
    map_url: p.mapUrl,
    photo_url: p.photoUrl,
    img: p.img,
    img_fallback: p.imgFallback,
    sort_order: i,
    status: 'approved',
  }))

  // ignoreDuplicates: true → chỉ INSERT địa điểm chưa có trong DB (theo slug).
  // Địa điểm đã tồn tại sẽ KHÔNG bị ghi đè — giữ nguyên mọi chỉnh sửa của admin.
  const { error } = await admin
    .from('places')
    .upsert(rows, { onConflict: 'slug', ignoreDuplicates: true })

  if (error) throw new Error(error.message)

  revalidatePath('/admin/places')
  revalidatePath('/')
  redirect('/admin/places?seeded=1')
}

export async function updatePlace(formData: FormData) {
  await guardAdmin()
  const admin = createAdminClient()
  const slug = formData.get('slug') as string
  const statusValue = (formData.get('status') as string) || undefined

  // Khu vực có cấu trúc — chỉ relation_type được dịch, tên địa danh giữ nguyên.
  const areaMain = (formData.get('area_main') as string)?.trim() || ''
  const nearbyPlace = (formData.get('nearby_place') as string)?.trim() || null
  const cityOrPrefecture = (formData.get('city_or_prefecture') as string)?.trim() || null
  const relRaw = (formData.get('relation_type') as string) || 'near'
  const relationType: RelationType = RELATION_TYPES.includes(relRaw as RelationType)
    ? (relRaw as RelationType) : 'near'

  const updatePayload: Record<string, unknown> = {
    name: (formData.get('name') as string).trim(),
    // `area` cũ = chuỗi trung tính (chỉ tên địa danh) cho tìm kiếm & fallback.
    area: neutralAreaString({ areaMain, nearbyPlace, cityOrPrefecture }),
    area_main: areaMain,
    nearby_place: nearbyPlace,
    city_or_prefecture: cityOrPrefecture,
    relation_type: relationType,
    description: (formData.get('desc') as string).trim(),
    body: (formData.get('body') as string) || null,
    fee: (formData.get('fee') as string) || null,
    map_url: (formData.get('map_url') as string).trim(),
    photo_url: (formData.get('photo_url') as string).trim(),
    img: (formData.get('img') as string) || null,
  }
  if (statusValue) updatePayload.status = statusValue

  // Prefecture/city are optional on the form; only update when provided so older
  // forms (or partial edits) never wipe existing location data.
  const prefRaw = formData.get('prefecture') as string | null
  if (prefRaw) {
    const prefecture = PREFECTURE_NAME[prefRaw] ? prefRaw : 'fukuoka'
    updatePayload.prefecture = prefecture
    updatePayload.region = PREFECTURES.find((p) => p.code === prefecture)?.region ?? 'kyushu'
  }
  if (formData.has('city')) {
    updatePayload.city = (formData.get('city') as string)?.trim() || null
  }
  if (formData.has('address')) {
    updatePayload.address = (formData.get('address') as string)?.trim() || null
  }

  // Snapshot fields that drive return-user notifications BEFORE the update so we
  // can fire only on a real transition (not on every edit). Best-effort.
  type PrevSnap = { temporary_status: string | null; last_verified_at: string | null }
  let prev: PrevSnap | null = null
  try {
    const { data } = await admin.from('places').select('temporary_status, last_verified_at').eq('slug', slug).maybeSingle()
    if (data) prev = data as unknown as PrevSnap
  } catch { /* table/columns may be pre-migration */ }

  // ── Explore Phase 1 extended fields (validated). Attempt the full update; if
  // the migration is not yet applied (unknown column), fall back to the legacy
  // payload so core editing keeps working. Validation errors still throw. ──
  const extended = buildExtendedPlacePayload(formData)
  let { error } = await admin.from('places').update({ ...updatePayload, ...extended }).eq('slug', slug)
  if (error && isMissingColumnError(error)) {
    ({ error } = await admin.from('places').update(updatePayload).eq('slug', slug))
  }

  if (error) throw new Error(error.message)

  // Notify users who saved this place when its info materially changed.
  try {
    const newStatus = (extended as Record<string, unknown>).temporary_status as string | null | undefined
    const newVerified = (extended as Record<string, unknown>).last_verified_at as string | null | undefined
    const name = updatePayload.name as string | undefined
    const closedNow = newStatus === 'temporarily_closed' || newStatus === 'permanently_closed'
    if (closedNow && prev?.temporary_status !== newStatus) {
      const { notifySavedPlaceChange } = await import('@/lib/notifications/places')
      await notifySavedPlaceChange(slug, 'place_closed', { placeName: name, pushTitle: name ?? 'Cập nhật địa điểm' })
    } else if (newVerified && prev?.last_verified_at !== newVerified) {
      const { notifySavedPlaceChange } = await import('@/lib/notifications/places')
      await notifySavedPlaceChange(slug, 'place_updated', { placeName: name, pushTitle: name ?? 'Cập nhật địa điểm' })
    }
  } catch { /* best-effort */ }

  if (formData.has('tags')) {
    const { data: row } = await admin.from('places').select('id').eq('slug', slug).maybeSingle()
    const placeId = (row as { id: string } | null)?.id
    if (placeId) await setContentTags(admin, 'place', placeId, formData.get('tags'), await getLocale())
  }

  revalidatePath('/admin/places')
  revalidatePath(`/places/${slug}`)
  revalidatePath('/')
  redirect('/admin/places')
}

export async function approvePlace(formData: FormData) {
  await guardAdmin()
  const slug = formData.get('slug') as string
  const admin = createAdminClient()
  await admin.from('places').update({ status: 'approved' }).eq('slug', slug)
  revalidatePath('/admin/places')
  revalidatePath('/admin')
  revalidatePath('/')
  redirect(formData.get('from') === 'dashboard' ? '/admin' : '/admin/places')
}

export async function rejectPlace(formData: FormData) {
  await guardAdmin()
  const slug = formData.get('slug') as string
  const admin = createAdminClient()
  await admin.from('places').update({ status: 'rejected' }).eq('slug', slug)
  revalidatePath('/admin/places')
  revalidatePath('/admin')
  revalidatePath('/')
  redirect(formData.get('from') === 'dashboard' ? '/admin' : '/admin/places')
}

export async function deletePlace(slug: string) {
  await guardAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('places').delete().eq('slug', slug)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/places')
  revalidatePath('/')
}

// ── Place info reports (review queue) ─────────────────────────────────────────
export interface PlaceReportRow {
  id: string; place_slug: string; user_id: string; kind: string; detail: string | null
  status: string; admin_note: string | null; created_at: string
}

export async function getPlaceReports(status: 'pending' | 'resolved' | 'rejected' = 'pending'): Promise<PlaceReportRow[]> {
  if (!(await checkIsAdmin())) return []
  const { data } = await createAdminClient()
    .from('place_reports').select('*').eq('status', status).order('created_at', { ascending: false }).limit(200)
  return (data ?? []) as PlaceReportRow[]
}

async function reviewReport(id: string, status: 'resolved' | 'rejected', note: string): Promise<{ ok: boolean }> {
  if (!(await checkIsAdmin())) return { ok: false }
  const { createClient } = await import('@/lib/supabase/server')
  const { data: { user } } = await createClient().auth.getUser()
  const admin = createAdminClient()
  const { data: row } = await admin.from('place_reports').select('user_id, place_slug').eq('id', id).maybeSingle()
  const { error } = await admin.from('place_reports')
    .update({ status, admin_note: (note ?? '').trim() || null, resolved_by: user?.id ?? null, resolved_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false }
  const r = row as { user_id: string; place_slug: string } | null
  if (r?.user_id) {
    const { notifyUsers } = await import('@/lib/notifications/user')
    await notifyUsers({ recipientIds: [r.user_id], type: 'place_report_reviewed', targetUrl: `/places/${r.place_slug}` })
  }
  revalidatePath('/admin/places/reports')
  return { ok: true }
}

export async function resolveReport(id: string, note: string): Promise<{ ok: boolean }> { return reviewReport(id, 'resolved', note) }
export async function rejectReport(id: string, note: string): Promise<{ ok: boolean }> { return reviewReport(id, 'rejected', note) }

// ── Place translation upsert ──────────────────────────────────────────────────
export async function upsertPlaceTranslation(formData: FormData): Promise<void> {
  await guardAdmin()
  const admin = createAdminClient()
  const slug   = (formData.get('slug')   as string).trim()
  const locale = (formData.get('locale') as string).trim()
  const area   = (formData.get('area')   as string | null)?.trim() || null
  const desc   = (formData.get('short_description') as string | null)?.trim() || null
  const content = (formData.get('content') as string | null)?.trim() || null

  if (!slug || !locale) return

  const { error } = await admin
    .from('place_translations')
    .upsert(
      { place_slug: slug, locale, area, short_description: desc, content, translation_status: 'published' },
      { onConflict: 'place_slug,locale' }
    )
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/places/${slug}`)
  revalidatePath(`/places/${slug}`)
  revalidatePath('/')
}
