'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminNotification } from '@/lib/admin/notifications'
import { sanitizeUserName } from '@/lib/sanitize'

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
  kids_playground: 'Khu vui chơi dành cho bé',
  onsen: 'Onsen',
}

function mapAuthError(msg: string, lang: 'login' | 'register', t: (key: string) => string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials') || m.includes('invalid credentials'))
    return t('err_invalid_credentials')
  if (m.includes('email not confirmed'))
    return t('err_email_not_confirmed')
  if (m.includes('user already registered') || m.includes('already been registered') || m.includes('already exists'))
    return t('err_email_in_use')
  if (m.includes('password should be at least'))
    return t('err_password_short')
  if (m.includes('unable to validate email') || m.includes('invalid email'))
    return t('err_invalid_email')
  if (m.includes('email rate limit') || m.includes('rate limit'))
    return t('err_rate_limit')
  if (m.includes('signup is disabled'))
    return t('err_signup_disabled')
  if (lang === 'login')
    return t('err_login_failed')
  return t('err_register_failed')
}

export async function signUp(formData: FormData) {
  const supabase = createClient()
  const t = await getTranslations('auth')
  const displayName = sanitizeUserName((formData.get('display_name') as string) ?? '', 50)
  const email = (formData.get('email') as string ?? '').trim()
  const password = formData.get('password') as string ?? ''

  if (!displayName || displayName.length < 2)
    redirect(`/dang-ky?error=${encodeURIComponent(t('err_display_name_short'))}`)
  if (displayName.length > 50)
    redirect(`/dang-ky?error=${encodeURIComponent(t('err_display_name_long'))}`)
  if (!email)
    redirect(`/dang-ky?error=${encodeURIComponent(t('err_email_empty'))}`)
  if (password.length < 6)
    redirect(`/dang-ky?error=${encodeURIComponent(t('err_password_min'))}`)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://chococfko.com'
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent('/dang-nhap?confirmed=1')}`,
    },
  })
  if (error) redirect(`/dang-ky?error=${encodeURIComponent(mapAuthError(error.message, 'register', t))}`)
  redirect(`/dang-ky?success=1&email=${encodeURIComponent(email)}`)
}

export async function signIn(formData: FormData) {
  const supabase = createClient()
  const t = await getTranslations('auth')
  const email = (formData.get('email') as string ?? '').trim()
  const password = formData.get('password') as string ?? ''

  if (!email)
    redirect(`/dang-nhap?error=${encodeURIComponent(t('err_email_empty'))}`)
  if (!password)
    redirect(`/dang-nhap?error=${encodeURIComponent(t('err_password_empty'))}`)

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
      redirect(`/dang-nhap?unconfirmed=1&email=${encodeURIComponent(email)}`)
    }
    redirect(`/dang-nhap?error=${encodeURIComponent(mapAuthError(error.message, 'login', t))}`)
  }
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function resendConfirmation(formData: FormData): Promise<void> {
  const supabase = createClient()
  const email = (formData.get('email') as string ?? '').trim()
  if (!email) redirect('/dang-ky')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://chococfko.com'
  await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent('/dang-nhap?confirmed=1')}`,
    },
  })
  // Always show success (security: don't reveal if email exists)
  redirect(`/dang-nhap?resent=1&email=${encodeURIComponent(email)}`)
}

export async function signOut() {
  const supabase = createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}

// ── Password reset ─────────────────────────────────────────
// Step 1: user requests a reset link by email.
export async function requestPasswordReset(formData: FormData): Promise<void> {
  const supabase = createClient()
  const email = (formData.get('email') as string ?? '').trim()
  if (!email) redirect('/quen-mat-khau')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://chococfko.com'
  // The recovery email lands the user on /dat-lai-mat-khau with a session
  // (via /auth/callback code-exchange, or /auth/confirm if the template uses
  // token_hash&type=recovery — see /auth/confirm).
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent('/dat-lai-mat-khau')}`,
  })
  // Always report success — never reveal whether the email exists.
  redirect('/quen-mat-khau?sent=1')
}

// Step 2: user (now in a recovery session) sets a new password.
export async function updatePassword(formData: FormData): Promise<void> {
  const supabase = createClient()
  const t = await getTranslations('auth')
  const password = (formData.get('password') as string) ?? ''
  const confirm = (formData.get('confirm_password') as string) ?? ''

  if (password.length < 6)
    redirect(`/dat-lai-mat-khau?error=${encodeURIComponent(t('reset_password_short'))}`)
  if (password !== confirm)
    redirect(`/dat-lai-mat-khau?error=${encodeURIComponent(t('reset_password_mismatch'))}`)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user)
    redirect(`/dang-nhap?error=${encodeURIComponent(t('reset_no_session'))}`)

  const { error } = await supabase.auth.updateUser({ password })
  if (error)
    redirect(`/dat-lai-mat-khau?error=${encodeURIComponent(t('reset_update_failed'))}`)

  // Sign out so the user logs in fresh with the new password.
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/dang-nhap?reset=1')
}

// ── Slug helper ────────────────────────────────────────────
function generateSlug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
  const suffix = Math.random().toString(36).slice(2, 7)
  return `${base || 'dia-diem'}-${suffix}`
}

export async function submitPlace(formData: FormData) {
  const supabase = createClient()
  const t = await getTranslations('auth')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/dang-nhap?error=' + encodeURIComponent(t('err_login_required_place')))

  const name = (formData.get('name') as string).trim()
  const category = (formData.get('category') as string) || 'food'
  const slug = generateSlug(name)

  const { error } = await supabase.from('places').insert({
    slug,
    name,
    area: (formData.get('area') as string).trim(),
    category,
    category_label: CATEGORY_LABEL[category] ?? category,
    description: (formData.get('desc') as string)?.trim() || null,
    fee: (formData.get('fee') as string) || null,
    map_url: (formData.get('map_url') as string)?.trim() || null,
    photo_url: (formData.get('photo_url') as string)?.trim() || null,
    img: (formData.get('img') as string) || null,
    body: (formData.get('body') as string)?.trim() || null,
    sort_order: 999999,
    status: 'pending',
    user_id: user.id,
  })

  if (error) redirect('/dia-diem/dang?error=' + encodeURIComponent(error.message))

  await createAdminNotification({
    type: 'new_pending_place',
    title: 'Địa điểm mới cần duyệt',
    message: name,
    target_type: 'place',
    target_id: slug,
    target_url: `/admin/dia-diem/${slug}`,
    actor_id: user.id,
  })

  redirect('/dia-diem/dang?success=1')
}

export async function submitPost(formData: FormData) {
  const supabase = createClient()
  const t = await getTranslations('auth')
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/dang-nhap?error=' + encodeURIComponent(t('err_login_required_post')))

  const category = (formData.get('category') as string) || 'food'
  const post_type = (formData.get('post_type') as string) || 'community'
  const body = (formData.get('body') as string).trim()
  const isHtml = body.trimStart().startsWith('<')
  const bodyExcerpt = isHtml
    ? body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140)
    : body.slice(0, 140)

  // For place posts, use the explicit short description as excerpt if provided
  const descField = (formData.get('desc') as string | null)?.trim() || ''
  const excerpt = post_type === 'place' && descField ? descField.slice(0, 140) : bodyExcerpt

  // Place-specific extra fields
  const map_url = post_type === 'place' ? ((formData.get('map_url') as string | null)?.trim() || null) : null
  const fee = post_type === 'place' ? ((formData.get('fee') as string | null) || null) : null

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
    map_url,
    fee,
  })

  const base = post_type === 'place' ? '/dia-diem/dang' : '/cong-dong/viet-bai'
  if (error) redirect(`${base}?error=${encodeURIComponent(error.message)}`)

  await createAdminNotification({
    type: 'new_pending_post',
    title: 'Bài viết cộng đồng mới cần duyệt',
    message: (formData.get('title') as string).trim(),
    target_type: 'post',
    target_url: '/admin?tab=pending',
    actor_id: user.id,
  })

  redirect(`${base}?success=1`)
}
