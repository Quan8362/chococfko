import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncProfileFromAuth } from '@/lib/syncProfile'

function mapCallbackError(err: string | null, desc: string | null): string {
  const msg = (desc || err || '').toLowerCase()
  if (msg.includes('expired') || msg.includes('invalid') || msg.includes('otp'))
    return 'Link xác nhận đã hết hạn hoặc không hợp lệ. Vui lòng yêu cầu gửi lại email xác nhận.'
  if (msg.includes('already confirmed'))
    return 'Email đã được xác nhận trước đó. Bạn có thể đăng nhập.'
  return desc || err || 'Xác nhận email thất bại. Vui lòng thử lại.'
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const callbackError = searchParams.get('error')
  const callbackErrorDesc = searchParams.get('error_description')
  const next = searchParams.get('next') ?? '/'

  if (callbackError) {
    const msg = mapCallbackError(callbackError, callbackErrorDesc)
    return NextResponse.redirect(`${origin}/dang-nhap?error=${encodeURIComponent(msg)}`)
  }

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      const msg = mapCallbackError(error.message, null)
      return NextResponse.redirect(`${origin}/dang-nhap?error=${encodeURIComponent(msg)}`)
    }
    // Sync provider name/avatar into profiles so it shows correctly everywhere
    await syncProfileFromAuth(supabase)
  }

  const redirectTo = next.startsWith('/') ? `${origin}${next}` : origin
  return NextResponse.redirect(redirectTo)
}
