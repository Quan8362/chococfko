import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const oauthError = searchParams.get('error')

  if (oauthError || !code || !state) {
    return NextResponse.redirect(`${origin}/login?authError=oauth_provider_cancelled`)
  }

  const cookieStore = cookies()
  const savedState = cookieStore.get('line_oauth_state')?.value
  if (state !== savedState) {
    return NextResponse.redirect(`${origin}/login?authError=oauth_invalid_state`)
  }

  try {
    // 1. Đổi code lấy access_token
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/line/callback`,
        client_id: process.env.LINE_CHANNEL_ID!,
        client_secret: process.env.LINE_CHANNEL_SECRET!,
      }),
    })
    const tokenData: { access_token?: string } = await tokenRes.json()
    // Server-side diagnostic only (never shown to the user).
    if (!tokenData.access_token) throw new Error('LINE token exchange returned no access_token')

    // 2. Lấy profile LINE
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const profile: { userId: string; displayName: string; pictureUrl?: string } =
      await profileRes.json()

    // 3. Tạo user trong Supabase (synthetic email, bỏ qua nếu đã tồn tại)
    const syntheticEmail = `line_${profile.userId}@line.chococfko.internal`
    const admin = createAdminClient()

    await admin.auth.admin.createUser({
      email: syntheticEmail,
      email_confirm: true,
      user_metadata: {
        display_name: profile.displayName,
        avatar_url: profile.pictureUrl ?? null,
        line_id: profile.userId,
        provider: 'line',
      },
    })
    // Lỗi "already registered" được bỏ qua — user đã tồn tại

    // 4. Tạo magic link để sign in (hoạt động cho cả user mới lẫn cũ)
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: syntheticEmail,
      options: { redirectTo: `${origin}/auth/callback` },
    })
    if (linkError || !linkData?.properties?.action_link) throw linkError

    // Xoá state cookie
    cookieStore.delete('line_oauth_state')

    return NextResponse.redirect(linkData.properties.action_link)
  } catch (err) {
    console.error('[LINE callback]', err)
    return NextResponse.redirect(`${origin}/login?authError=oauth_callback_failed`)
  }
}
