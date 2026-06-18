'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { places } from '@/lib/places'
import { setContentTags } from '@/lib/tags'
import { PREFECTURE_NAME, PREFECTURES } from '@/lib/japan'

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

  const updatePayload: Record<string, unknown> = {
    name: (formData.get('name') as string).trim(),
    area: (formData.get('area') as string).trim(),
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

  const { error } = await admin.from('places').update(updatePayload).eq('slug', slug)

  if (error) throw new Error(error.message)

  if (formData.has('tags')) {
    const { data: row } = await admin.from('places').select('id').eq('slug', slug).maybeSingle()
    const placeId = (row as { id: string } | null)?.id
    if (placeId) await setContentTags(admin, 'place', placeId, formData.get('tags'))
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
