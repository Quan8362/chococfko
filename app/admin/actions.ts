'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { setContentTags } from '@/lib/tags'

async function guardAdmin() {
  if (!(await checkIsAdmin())) redirect('/')
}

export async function approvePost(formData: FormData) {
  await guardAdmin()
  const id = formData.get('id') as string
  const admin = createAdminClient()
  await admin.from('posts').update({ status: 'approved' }).eq('id', id)
  revalidatePath('/admin')
  revalidatePath('/community')
}

export async function rejectPost(formData: FormData) {
  await guardAdmin()
  const id = formData.get('id') as string
  const admin = createAdminClient()
  await admin.from('posts').update({ status: 'rejected' }).eq('id', id)
  revalidatePath('/admin')
  revalidatePath('/community')
}

export async function deletePost(formData: FormData) {
  await guardAdmin()
  const id = formData.get('id') as string
  const admin = createAdminClient()
  await admin.from('posts').delete().eq('id', id)
  revalidatePath('/admin')
  revalidatePath('/community')
}

const CATEGORY_LABEL: Record<string, string> = {
  food: 'Ăn uống', sea: 'Biển', camp: 'Camping',
  mountain: 'Leo núi', park: 'Công viên', viet: 'Quán Việt', landmark: 'Du lịch',
  grocery: 'Tạp hóa', izakaya: 'Izakaya',
  japanese: 'Quán Nhật', thai: 'Quán Thái', chinese: 'Quán Trung', korean: 'Quán Hàn',
  kids_playground: 'Khu vui chơi dành cho bé',
}

export async function updatePost(formData: FormData) {
  await guardAdmin()
  const id = formData.get('id') as string
  const category = formData.get('category') as string
  const admin = createAdminClient()

  await admin.from('posts').update({
    title: (formData.get('title') as string).trim(),
    category,
    category_label: CATEGORY_LABEL[category] ?? category,
    area: (formData.get('area') as string).trim(),
    rating: Number(formData.get('rating') || 5),
    body: (formData.get('body') as string).trim().split('\n\n').filter(Boolean),
    img: (formData.get('img') as string) || null,
    status: formData.get('status') as string,
  }).eq('id', id)

  if (formData.has('tags')) {
    await setContentTags(admin, 'post', id, formData.get('tags'))
  }

  revalidatePath('/admin')
  revalidatePath('/community')
  redirect('/admin')
}
