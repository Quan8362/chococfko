'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSavedPlaces } from '@/components/SavedPlacesProvider'
import { trackEvent } from '@/lib/analytics'

/** Save + Share buttons for the desktop detail sidebar. */
export default function PlaceSaveShare({ slug, name, shareUrl }: { slug: string; name: string; shareUrl: string }) {
  const t = useTranslations('place_detail')
  const { isSaved, toggle } = useSavedPlaces()
  const saved = isSaved(slug)
  const [copied, setCopied] = useState(false)

  const onShare = async () => {
    trackEvent('place_share', { metadata: { slug } })
    try {
      if (navigator.share) { await navigator.share({ title: name, url: shareUrl }); return }
    } catch { /* fall through */ }
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }

  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => { trackEvent(saved ? 'place_unsave' : 'place_save', { metadata: { slug } }); toggle(slug) }}
        aria-pressed={saved}
        className={`flex-1 flex items-center justify-center gap-2 font-semibold text-[14px] px-4 py-3 rounded-2xl border transition-all ${saved ? 'bg-rose text-white border-rose' : 'bg-paper text-ink border-line hover:border-rose/40 hover:text-rose'}`}>
        <span className="text-[16px]">{saved ? '♥' : '♡'}</span> {saved ? t('saved') : t('save')}
      </button>
      <button type="button" onClick={onShare}
        className="flex-1 flex items-center justify-center gap-2 font-semibold text-[14px] px-4 py-3 rounded-2xl bg-paper text-ink border border-line hover:border-rose/40 hover:text-rose transition-all">
        <svg className="w-[16px] h-[16px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.7 10.7l6.6-3.4M8.7 13.3l6.6 3.4M18 8a3 3 0 10-6 0 3 3 0 006 0zM9 12a3 3 0 11-6 0 3 3 0 016 0zm9 4a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        {copied ? t('share_copied') : t('share')}
      </button>
    </div>
  )
}
