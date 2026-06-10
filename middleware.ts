import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

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

  // Refresh session — do NOT remove this or auth state will break.
  // A stale/invalid refresh token throws "Refresh Token Not Found". It's harmless
  // (the user is simply treated as logged out), but the browser keeps resending the
  // dead sb-* cookie, so the error repeats on every request. Clear those cookies once
  // to stop the loop and the log spam.
  try {
    const { error } = await supabase.auth.getUser()
    if (error && isStaleRefreshTokenError(error)) clearAuthCookies(request, supabaseResponse)
  } catch (error) {
    if (isStaleRefreshTokenError(error)) clearAuthCookies(request, supabaseResponse)
  }

  return supabaseResponse
}

function isStaleRefreshTokenError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  if (!e) return false
  return e.code === 'refresh_token_not_found' || /refresh token/i.test(e.message ?? '')
}

function clearAuthCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-')) {
      response.cookies.set(cookie.name, '', { maxAge: 0, path: '/' })
    }
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
