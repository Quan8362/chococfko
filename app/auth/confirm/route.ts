import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function mapConfirmError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('expired') || m.includes('invalid') || m.includes('otp'))
    return 'Link xác nhận đã hết hạn hoặc không hợp lệ. Vui lòng gửi lại email xác nhận.'
  if (m.includes('already confirmed') || m.includes('already registered'))
    return 'Email đã được xác nhận trước đó. Bạn có thể đăng nhập.'
  return 'Xác nhận email thất bại. Vui lòng thử lại hoặc gửi lại email xác nhận.'
}

// Handles token_hash confirmation links (cross-device safe, no PKCE verifier needed).
// Email template must use:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = (searchParams.get('type') ?? 'email') as 'email' | 'signup' | 'recovery' | 'magiclink'

  if (!token_hash) {
    return NextResponse.redirect(
      `${origin}/dang-nhap?error=${encodeURIComponent('Link xác nhận không hợp lệ. Vui lòng đăng ký lại.')}`
    )
  }

  const supabase = createClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash, type })

  if (error) {
    return NextResponse.redirect(
      `${origin}/dang-nhap?error=${encodeURIComponent(mapConfirmError(error.message))}`
    )
  }

  // Password-reset links land here with a recovery session → go set a new password.
  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/dat-lai-mat-khau`)
  }

  return NextResponse.redirect(`${origin}/dang-nhap?confirmed=1`)
}
