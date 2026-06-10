'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { trackEvent } from '@/lib/analytics'

export default function AnalyticsTracker({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname()
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    if (isAdmin) return // don't count admin activity in analytics
    if (!pathname || pathname === lastPath.current) return
    lastPath.current = pathname
    if (pathname.startsWith('/admin')) return
    trackEvent('page_view', { path: pathname })
  }, [pathname, isAdmin])

  return null
}
