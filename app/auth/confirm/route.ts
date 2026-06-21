import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mapConfirmError } from '@/lib/auth/oauthErrors'

// Handles token_hash confirmation links (cross-device safe, no PKCE verifier needed).
// Email template must use:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = (searchParams.get('type') ?? 'email') as 'email' | 'signup' | 'recovery' | 'magiclink'

  if (!token_hash) {
    return NextResponse.redirect(`${origin}/login?authError=confirm_link_invalid`)
  }

  const supabase = createClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash, type })

  if (error) {
    // Raw Supabase message stays server-side; only a stable code reaches the user.
    return NextResponse.redirect(`${origin}/login?authError=${mapConfirmError(error.message)}`)
  }

  // Password-reset links land here with a recovery session → go set a new password.
  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/reset-password`)
  }

  return NextResponse.redirect(`${origin}/login?confirmed=1`)
}
