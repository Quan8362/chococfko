import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncProfileFromAuth } from '@/lib/syncProfile'
import {
  mapOAuthProviderError,
  mapCodeExchangeError,
  safeNextPath,
  type AuthErrorCode,
} from '@/lib/auth/oauthErrors'

// Redirect to the login page carrying a STABLE error code. The login page maps
// the code to a localized message — we never put raw provider text in the URL.
function loginError(origin: string, code: AuthErrorCode): NextResponse {
  return NextResponse.redirect(`${origin}/login?authError=${code}`)
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const callbackError = searchParams.get('error')
  const callbackErrorDesc = searchParams.get('error_description')
  const next = safeNextPath(searchParams.get('next'))

  // Provider-side failure (e.g. the user cancelled the Google/Facebook consent).
  if (callbackError) {
    return loginError(origin, mapOAuthProviderError(callbackError, callbackErrorDesc))
  }

  if (code) {
    const supabase = createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      // Raw Supabase message stays server-side; only a stable code reaches the user.
      return loginError(origin, mapCodeExchangeError(error.message))
    }
    if (!data?.session) {
      return loginError(origin, 'oauth_session_not_created')
    }
    // Sync provider name/avatar into profiles so it shows correctly everywhere.
    await syncProfileFromAuth(supabase)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
