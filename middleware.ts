import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { hasSupabaseSessionCookie, categorizeAuthError } from '@/lib/supabase/sessionCookies'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // Anonymous request (no Supabase session cookie) — nothing to refresh. Skip the
  // GoTrue round-trip entirely: lower latency and zero chance of misclassifying a
  // logged-out visitor. The PKCE code-verifier alone does not count as a session.
  if (!hasSupabaseSessionCookie(request.cookies.getAll())) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Touch the session so @supabase/ssr refreshes an expired access token from the
  // refresh token and writes the rotated cookies onto `supabaseResponse` (and onto
  // `request` so the downstream RSC render sees the fresh token in the same pass).
  //
  // We deliberately do NOT delete cookies here on error. @supabase/ssr already
  // removes them on a genuine SIGNED_OUT, and manual deletion would wipe a session
  // that a *concurrent* request just refreshed during refresh-token rotation —
  // the intermittent "logged out again" bug, worst on mobile where a resuming tab
  // fires a burst of staggered requests past Supabase's reuse window. A transient
  // network failure during refresh is recoverable on the next request, so we must
  // never treat it as a logout either.
  try {
    const { error } = await supabase.auth.getUser()
    if (error && process.env.NODE_ENV !== 'production') {
      console.warn('[auth] middleware getUser:', categorizeAuthError(error))
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[auth] middleware getUser threw:', categorizeAuthError(error))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
