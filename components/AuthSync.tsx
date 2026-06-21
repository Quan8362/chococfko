'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Min gap between resume-triggered session checks, so a flurry of
// visibility/online/pageshow events on wake-up collapses into one refresh.
const RESUME_DEBOUNCE_MS = 4000

/**
 * Silent auth maintenance mounted once in the root layout. It never signs the
 * user out and renders nothing.
 *
 *  1. Resume recovery — when the tab returns to the foreground, the network comes
 *     back, or the page is restored from the BFCache (`pageshow.persisted`, common
 *     on iOS Safari), it asks supabase-js to re-check the session. getSession()
 *     refreshes only when the access token has actually expired and is serialized
 *     by supabase-js's internal lock, so a tab suspended past the token lifetime
 *     recovers via the refresh token instead of appearing logged out. supabase-js
 *     handles `visibilitychange` itself, but not `online`/`pageshow`.
 *
 *  2. Header sync — re-renders the server-rendered header (login link vs. account
 *     menu) on real sign-in / sign-out, including when it happens in another tab
 *     (supabase-js mirrors the change through the shared cookie). TOKEN_REFRESHED
 *     is intentionally ignored: nothing visible changes, and refreshing on it
 *     would create a render loop.
 */
export default function AuthSync() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let disposed = false
    let lastResume = 0

    const resume = () => {
      if (disposed) return
      const now = Date.now()
      if (now - lastResume < RESUME_DEBOUNCE_MS) return
      lastResume = now
      supabase.auth.getSession().catch(() => {})
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') resume()
    }
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) resume()
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', resume)
    window.addEventListener('pageshow', onPageShow)

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') router.refresh()
    })

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', resume)
      window.removeEventListener('pageshow', onPageShow)
      subscription.unsubscribe()
    }
  }, [router])

  return null
}
