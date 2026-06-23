'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSavedPlaces } from '@/components/SavedPlacesProvider'
import { trackEvent } from '@/lib/analytics'
import { HeartIcon, ShareIcon } from '@/components/places/PlaceActionIcons'

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

  const base =
    'group flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-2xl border text-[14px] font-semibold shadow-card transition-all duration-150 ' +
    'hover:-translate-y-px hover:shadow-card-hover active:translate-y-0 active:shadow-card ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/45 focus-visible:ring-offset-2 focus-visible:ring-offset-paper'

  return (
    <div className="flex gap-2.5">
      <button
        type="button"
        onClick={() => { trackEvent(saved ? 'place_unsave' : 'place_save', { metadata: { slug } }); toggle(slug) }}
        aria-pressed={saved}
        className={`${base} ${saved ? 'bg-rose text-white border-rose hover:bg-rose-deep' : 'bg-paper text-ink border-line hover:border-rose/45 hover:text-rose'}`}
      >
        <HeartIcon filled={saved} className={`w-5 h-5 transition-transform duration-150 group-hover:scale-110 ${saved ? '' : 'text-rose'}`} />
        <span>{saved ? t('saved') : t('save')}</span>
      </button>
      <button
        type="button"
        onClick={onShare}
        aria-label={t('share')}
        className={`${base} bg-paper text-ink border-line hover:border-rose/45 hover:text-rose`}
      >
        <ShareIcon className="w-5 h-5 text-rose transition-transform duration-150 group-hover:scale-110" />
        <span>{copied ? t('share_copied') : t('share')}</span>
      </button>
    </div>
  )
}
