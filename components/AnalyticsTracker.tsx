'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { trackEvent } from '@/lib/analytics'
import { createClient } from '@/lib/supabase/client'

export default function AnalyticsTracker({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname()
  const lastPath = useRef<string | null>(null)
  // undefined = auth not resolved yet; null = anonymous; string = logged-in user.
  // We wait for this before firing so a logged-in user's page views carry their
  // user_id (otherwise every page_view is anonymous and analytics can't tell who
  // is browsing). getSession reads local storage — no extra network round-trip.
  const [userId, setUserId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (isAdmin) return // don't count admin activity in analytics
    if (userId === undefined) return // wait until auth resolves
    if (!pathname || pathname === lastPath.current) return
    lastPath.current = pathname
    if (pathname.startsWith('/admin')) return
    trackEvent('page_view', { path: pathname, userId })
  }, [pathname, isAdmin, userId])

  return null
}
