'use client'

import { useEffect } from 'react'
import { addRecent, parseRecent } from '@/lib/recentPlaces'

const KEY = 'chococfko_recent_views'

/**
 * Records the current place into privacy-conscious "recently viewed" history
 * (localStorage only — never synced server-side, never public). Renders nothing.
 */
export default function RecentViewRecorder({ slug }: { slug: string }) {
  useEffect(() => {
    if (!slug) return
    try {
      const list = addRecent(parseRecent(localStorage.getItem(KEY)), slug, Date.now())
      localStorage.setItem(KEY, JSON.stringify(list))
    } catch { /* ignore */ }
  }, [slug])
  return null
}
