'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const CATEGORY_LABEL: Record<string, string> = {
  food: 'Ăn uống',
  sea: 'Biển',
  camp: 'Camping',
  mountain: 'Leo núi',
  park: 'Công viên',
  viet: 'Quán Việt',
  landmark: 'Du lịch',
  grocery: 'Tạp hóa',
  izakaya: 'Izakaya',
  japanese: 'Quán Nhật',
  thai: 'Quán Thái',
  chinese: 'Quán Trung',
  korean: 'Quán Hàn',
  cafe_milk_tea: 'Cà phê & trà sữa',
}

export async function signUp(formData: FormData) {
  const supabase = createClient()
  const { error } = await supabase.auth.signUp({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    options: {
      data: { display_name: formData.get('display_name') as string },
    },
  })
  if (error) redirect(`/dang-ky?error=${encodeURIComponent(error.message)}`)
  redirect('/dang-ky?success=1')
}

export async function signIn(formData: FormData) {
  const supabase = createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })
  if (error) redirect(`/dang-nhap?error=${encodeURIComponent(error.message)}`)
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signOut() {
  const supabase = createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function submitPost(formData: FormData) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/dang-nhap?error=' + encodeURIComponent('Bạn cần đăng nhập để viết bài'))

  const category = (formData.get('category') as string) || 'food'
  const post_type = (formData.get('post_type') as string) || 'community'
  const body = (formData.get('body') as string).trim()
  const isHtml = body.trimStart().startsWith('<')
  const excerpt = isHtml
    ? body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140)
    : body.slice(0, 140)

  const { error } = await supabase.from('posts').insert({
    user_id: user.id,
    title: (formData.get('title') as string).trim(),
    category,
    category_label: CATEGORY_LABEL[category] ?? category,
    area: (formData.get('area') as string).trim(),
    rating: Number(formData.get('rating') || 5),
    excerpt,
    body: [body],
    img: (formData.get('img') as string) || null,
    post_type,
    status: 'pending',
  })

  const base = post_type === 'place' ? '/cong-dong/viet-bai?type=place' : '/cong-dong/viet-bai'
  if (error) redirect(`${base}&error=${encodeURIComponent(error.message)}`)
  redirect(`${base}&success=1`)
}
