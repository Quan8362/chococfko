'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { places } from '@/lib/places'

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
  }))

  const { error } = await admin
    .from('places')
    .upsert(rows, { onConflict: 'slug' })

  if (error) throw new Error(error.message)

  revalidatePath('/admin/dia-diem')
  revalidatePath('/')
  redirect('/admin/dia-diem?seeded=1')
}

export async function updatePlace(formData: FormData) {
  await guardAdmin()
  const admin = createAdminClient()
  const slug = formData.get('slug') as string

  const { error } = await admin.from('places').update({
    name: (formData.get('name') as string).trim(),
    area: (formData.get('area') as string).trim(),
    description: (formData.get('desc') as string).trim(),
    body: (formData.get('body') as string) || null,
    fee: (formData.get('fee') as string) || null,
    map_url: (formData.get('map_url') as string).trim(),
    photo_url: (formData.get('photo_url') as string).trim(),
    img: (formData.get('img') as string) || null,
  }).eq('slug', slug)

  if (error) throw new Error(error.message)

  revalidatePath('/admin/dia-diem')
  revalidatePath(`/dia-diem/${slug}`)
  revalidatePath('/')
  redirect('/admin/dia-diem')
}

export async function deletePlace(slug: string) {
  await guardAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('places').delete().eq('slug', slug)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/dia-diem')
  revalidatePath('/')
}
