'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAdminNotification } from '@/lib/admin/notifications'
import { setContentTags } from '@/lib/tags'
import { PREFECTURE_NAME, PREFECTURES } from '@/lib/japan'
import { sanitizeUserName } from '@/lib/sanitize'
import { parseStructuredArea } from '@/lib/places'
import type { SupabaseLike as EnrichDb } from '@/lib/places/enrichPlace'
import { parseEnumList, parseTriState, PAYMENT_METHODS, PLACE_LANGUAGES } from '@/lib/placeFields'

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
  // Community article categories
  life: 'Cuộc sống ở Nhật',
  paperwork: 'Giấy tờ & thủ tục',
  transport: 'Đi lại & mua sắm',
  study: 'Học tập & tiếng Nhật',
  work: 'Công việc & tìm việc',
  story: 'Chia sẻ cá nhân',
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
    redirect(`/register?error=${encodeURIComponent(t('err_display_name_short'))}`)
  if (displayName.length > 50)
    redirect(`/register?error=${encodeURIComponent(t('err_display_name_long'))}`)
  if (!email)
    redirect(`/register?error=${encodeURIComponent(t('err_email_empty'))}`)
  if (password.length < 6)
    redirect(`/register?error=${encodeURIComponent(t('err_password_min'))}`)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://chococfko.com'
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent('/login?confirmed=1')}`,
    },
  })
  if (error) redirect(`/register?error=${encodeURIComponent(mapAuthError(error.message, 'register', t))}`)
  redirect(`/register?success=1&email=${encodeURIComponent(email)}`)
}

export async function signIn(formData: FormData) {
  const supabase = createClient()
  const t = await getTranslations('auth')
  const email = (formData.get('email') as string ?? '').trim()
  const password = formData.get('password') as string ?? ''

  if (!email)
    redirect(`/login?error=${encodeURIComponent(t('err_email_empty'))}`)
  if (!password)
    redirect(`/login?error=${encodeURIComponent(t('err_password_empty'))}`)

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
      redirect(`/login?unconfirmed=1&email=${encodeURIComponent(email)}`)
    }
    redirect(`/login?error=${encodeURIComponent(mapAuthError(error.message, 'login', t))}`)
  }
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function resendConfirmation(formData: FormData): Promise<void> {
  const supabase = createClient()
  const email = (formData.get('email') as string ?? '').trim()
  if (!email) redirect('/register')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://chococfko.com'
  await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent('/login?confirmed=1')}`,
    },
  })
  // Always show success (security: don't reveal if email exists)
  redirect(`/login?resent=1&email=${encodeURIComponent(email)}`)
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
  if (!email) redirect('/forgot-password')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://chococfko.com'
  // The recovery email lands the user on /reset-password with a session
  // (via /auth/callback code-exchange, or /auth/confirm if the template uses
  // token_hash&type=recovery — see /auth/confirm).
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
  })
  // Always report success — never reveal whether the email exists.
  redirect('/forgot-password?sent=1')
}

// Step 2: user (now in a recovery session) sets a new password.
export async function updatePassword(formData: FormData): Promise<void> {
  const supabase = createClient()
  const t = await getTranslations('auth')
  const password = (formData.get('password') as string) ?? ''
  const confirm = (formData.get('confirm_password') as string) ?? ''

  if (password.length < 6)
    redirect(`/reset-password?error=${encodeURIComponent(t('reset_password_short'))}`)
  if (password !== confirm)
    redirect(`/reset-password?error=${encodeURIComponent(t('reset_password_mismatch'))}`)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user)
    redirect(`/login?error=${encodeURIComponent(t('reset_no_session'))}`)

  const { error } = await supabase.auth.updateUser({ password })
  if (error)
    redirect(`/reset-password?error=${encodeURIComponent(t('reset_update_failed'))}`)

  // Sign out so the user logs in fresh with the new password.
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login?reset=1')
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
  if (!user) redirect('/login?error=' + encodeURIComponent(t('err_login_required_place')))

  const name = (formData.get('name') as string).trim()
  const category = (formData.get('category') as string) || 'food'
  const slug = generateSlug(name)

  // Prefecture (validated against the master list) drives the public area filter;
  // region is derived from it. Default Fukuoka/Kyushu keeps existing behavior.
  const prefRaw = (formData.get('prefecture') as string) || 'fukuoka'
  const prefecture = PREFECTURE_NAME[prefRaw] ? prefRaw : 'fukuoka'
  const region = PREFECTURES.find((p) => p.code === prefecture)?.region ?? 'kyushu'
  const city = (formData.get('city') as string)?.trim() || null
  const address = (formData.get('address') as string)?.trim() || null

  // Khu vực có cấu trúc — chỉ relation_type được dịch, tên địa danh giữ nguyên.
  const structuredArea = parseStructuredArea(formData)

  const { data: inserted, error } = await supabase.from('places').insert({
    slug,
    name,
    ...structuredArea,
    category,
    category_label: CATEGORY_LABEL[category] ?? category,
    description: (formData.get('desc') as string)?.trim() || null,
    fee: (formData.get('fee') as string) || null,
    map_url: (formData.get('map_url') as string)?.trim() || null,
    photo_url: (formData.get('photo_url') as string)?.trim() || null,
    img: (formData.get('img') as string) || null,
    body: (formData.get('body') as string)?.trim() || null,
    prefecture,
    region,
    city,
    address,
    sort_order: 999999,
    status: 'pending',
    user_id: user.id,
  }).select('id').single()

  if (error) redirect('/places/new?error=' + encodeURIComponent(error.message))

  // Human-owned, community-sourced attributes Google can't provide (QR/PayPay,
  // staff languages, good-for-solo). Written to the HUMAN columns only — enrichment
  // never touches these. Marked field_sources='manual'. Best-effort, isolated from
  // the insert so a pre-migration DB can't fail a submission. Also bumps the
  // HUMAN-edit timestamp ("recently updated"); enrichment/cron never set it.
  const paymentManual = parseEnumList(formData.getAll('payment_methods_manual'), PAYMENT_METHODS)
  const supportedLanguages = parseEnumList(formData.getAll('supported_languages'), PLACE_LANGUAGES)
  const goodForSolo = parseTriState(formData.get('good_for_solo'))
  const fieldSources: Record<string, string> = {}
  if (paymentManual) fieldSources.payment_methods_manual = 'manual'
  if (supportedLanguages) fieldSources.supported_languages = 'manual'
  if (goodForSolo != null) fieldSources.good_for_solo = 'manual'
  await createAdminClient().from('places').update({
    last_human_edit_at: new Date().toISOString(),
    payment_methods_manual: paymentManual,
    supported_languages: supportedLanguages,
    good_for_solo: goodForSolo,
    ...(Object.keys(fieldSources).length ? { field_sources: fieldSources } : {}),
  }).eq('slug', slug)

  if (inserted?.id) {
    await setContentTags(createAdminClient(), 'place', inserted.id as string, formData.get('tags'), await getLocale())
  }

  await createAdminNotification({
    type: 'new_pending_place',
    title: 'Địa điểm mới cần duyệt',
    message: name,
    target_type: 'place',
    target_id: slug,
    target_url: `/admin/places/${slug}`,
    actor_id: user.id,
  })

  // Auto-enrich from Google so a community submission arrives pre-filled (zero admin
  // work). Best-effort + time-bounded: never blocks/breaks the submission, no-ops
  // without a Google key, and positive-only (never overwrites what the user entered).
  try {
    const { enrichPlaceBySlug } = await import('@/lib/places/enrichPlace')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    await enrichPlaceBySlug(createAdminClient() as unknown as EnrichDb, slug, { signal: ctrl.signal })
    clearTimeout(timer)
  } catch { /* best-effort */ }

  redirect('/places/new?success=1')
}

export async function submitPost(formData: FormData) {
  const supabase = createClient()
  const t = await getTranslations('auth')
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?error=' + encodeURIComponent(t('err_login_required_post')))

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

  // Community post written about a specific place (from a place detail page).
  // Validate the slug against a real place so we never store a dangling link.
  const placeSlugRaw = (formData.get('place_slug') as string | null)?.trim() || ''
  let place_slug: string | null = null
  if (placeSlugRaw) {
    const { data: place } = await supabase
      .from('places')
      .select('slug')
      .eq('slug', placeSlugRaw)
      .maybeSingle()
    place_slug = place?.slug ?? null
  }

  const baseRow: Record<string, unknown> = {
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
  }
  const insertRow: Record<string, unknown> = place_slug ? { ...baseRow, place_slug } : baseRow

  let { data: insertedPost, error } = await supabase.from('posts').insert(insertRow).select('id').single()
  // Backward-compat: if the place_slug column hasn't been migrated yet, still
  // create the post (without the link) instead of failing the whole submission.
  if (error && place_slug && /place_slug/.test(error.message)) {
    ;({ data: insertedPost, error } = await supabase.from('posts').insert(baseRow).select('id').single())
  }

  const base = post_type === 'place' ? '/places/new' : '/community/write'
  if (error) redirect(`${base}?error=${encodeURIComponent(error.message)}`)

  if (insertedPost?.id) {
    await setContentTags(createAdminClient(), 'post', insertedPost.id as string, formData.get('tags'), await getLocale())
  }

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
