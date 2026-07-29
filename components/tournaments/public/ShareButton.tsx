'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

// Copy-the-current-URL button. Uses the live location so any ?event / ?tab deep-link state is shared.
export default function ShareButton() {
  const t = useTranslations('tournaments')
  const [copied, setCopied] = useState(false)

  const share = async () => {
    if (typeof window === 'undefined') return
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ url })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // user dismissed the share sheet / clipboard blocked — no-op
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink bg-paper border border-line hover:border-rose/40 hover:text-rose px-3 py-1.5 rounded-xl transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
      </svg>
      {copied ? t('public.share_copied') : t('public.share')}
    </button>
  )
}
