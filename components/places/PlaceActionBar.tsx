'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useSavedPlaces } from '@/components/SavedPlacesProvider'
import { trackEvent } from '@/lib/analytics'
import AddToCollection from '@/components/places/AddToCollection'
import PlaceReport from '@/components/places/PlaceReport'

export interface ActionBarProps {
  slug: string
  name: string
  directionsUrl: string
  tel: string | null
  reservationUrl: string | null
  reservationProvider: string | null
  website: string | null
  shareUrl: string
  askUrl: string
}

async function doShare(name: string, url: string, onCopied: () => void) {
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title: name, url })
      return
    }
  } catch { /* user cancelled or unsupported → fall through to copy */ }
  try { await navigator.clipboard.writeText(url); onCopied() } catch { /* ignore */ }
}

/** Mobile-only sticky action bar. Desktop uses the sidebar (PlaceActions + PlaceSaveShare). */
export default function PlaceActionBar(p: ActionBarProps) {
  const t = useTranslations('place_detail')
  const { isSaved, toggle } = useSavedPlaces()
  const saved = isSaved(p.slug)
  const [menu, setMenu] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const onSave = () => { trackEvent(saved ? 'place_unsave' : 'place_save', { metadata: { slug: p.slug } }); toggle(p.slug) }
  const onShare = () => { trackEvent('place_share', { metadata: { slug: p.slug } }); void doShare(p.name, p.shareUrl, () => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }

  return (
    <>
      {copied && (
        <div className="fixed bottom-[76px] left-1/2 -translate-x-1/2 z-[130] lg:hidden bg-ink text-white text-[12.5px] px-3 py-1.5 rounded-full shadow-lg">{t('share_copied')}</div>
      )}
      <div
        className="fixed bottom-0 inset-x-0 z-[120] lg:hidden bg-paper/95 backdrop-blur border-t border-line"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 max-w-[680px] mx-auto">
          <a href={p.directionsUrl} target="_blank" rel="noopener" onClick={() => trackEvent('place_directions', { metadata: { slug: p.slug } })}
            className="flex-1 text-center font-semibold text-[13.5px] py-2.5 rounded-full bg-rose text-white">
            {t('directions')}
          </a>
          <button type="button" onClick={onSave} aria-pressed={saved} aria-label={t('save')}
            className={`flex-none w-11 h-11 grid place-items-center rounded-full border ${saved ? 'bg-rose text-white border-rose' : 'border-line text-muted bg-paper'}`}>
            <span className="text-[18px]">{saved ? '♥' : '♡'}</span>
          </button>
          <button type="button" onClick={onShare} aria-label={t('share')} className="flex-none w-11 h-11 grid place-items-center rounded-full border border-line text-muted bg-paper">
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.7 10.7l6.6-3.4M8.7 13.3l6.6 3.4M18 8a3 3 0 10-6 0 3 3 0 006 0zM9 12a3 3 0 11-6 0 3 3 0 016 0zm9 4a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
          <button type="button" onClick={() => setMenu((m) => !m)} aria-label={t('more')} aria-expanded={menu} className="flex-none w-11 h-11 grid place-items-center rounded-full border border-line text-muted bg-paper">
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
          </button>
        </div>

        {menu && (
          <>
            <div className="fixed inset-0 z-[-1]" onClick={() => setMenu(false)} />
            <div className="absolute bottom-[calc(100%+6px)] right-3 w-[220px] bg-paper border border-line rounded-2xl shadow-card-hover p-1.5">
              {p.tel && (
                <a href={p.tel} onClick={() => { trackEvent('place_call', { metadata: { slug: p.slug } }); setMenu(false) }} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[14px] text-ink hover:bg-cream">📞 {t('call')}</a>
              )}
              {p.reservationUrl && (
                <button type="button" onClick={() => { setMenu(false); setLeaving(true) }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[14px] text-ink hover:bg-cream text-left">📅 {t('reserve')}{p.reservationProvider ? ` · ${p.reservationProvider}` : ''}</button>
              )}
              {p.website && (
                <a href={p.website} target="_blank" rel="noopener nofollow" onClick={() => { trackEvent('place_website', { metadata: { slug: p.slug } }); setMenu(false) }} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[14px] text-ink hover:bg-cream">🌐 {t('website')}</a>
              )}
              <AddToCollection slug={p.slug} variant="menu" />
              <Link href={p.askUrl} onClick={() => trackEvent('place_ask', { metadata: { slug: p.slug } })} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[14px] text-ink hover:bg-cream">💬 {t('ask')}</Link>
              <PlaceReport slug={p.slug} variant="menu" />
            </div>
          </>
        )}
      </div>

      {/* Leaving-site confirm for external reservations */}
      {leaving && p.reservationUrl && (
        <div className="fixed inset-0 z-[200] grid place-items-center p-5">
          <div className="absolute inset-0 bg-black/40" onClick={() => setLeaving(false)} />
          <div className="relative bg-paper border border-line rounded-2xl p-5 max-w-[360px] w-full shadow-2xl">
            <h3 className="font-serif font-bold text-[17px] text-ink mb-1.5">{t('leaving_title')}</h3>
            <p className="text-[13.5px] text-ink">{p.reservationProvider ? t('leaving_via', { provider: p.reservationProvider }) : t('reserve')}</p>
            <p className="text-[12.5px] text-muted mt-2">{t('leaving_note')}</p>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => setLeaving(false)} className="flex-1 py-2.5 rounded-full border border-line text-[14px] font-semibold text-muted">{t('leaving_cancel')}</button>
              <a href={p.reservationUrl} target="_blank" rel="noopener nofollow" onClick={() => { trackEvent('place_reserve_click', { metadata: { slug: p.slug, provider: p.reservationProvider } }); setLeaving(false) }}
                className="flex-1 text-center py-2.5 rounded-full bg-emerald-500 text-white text-[14px] font-semibold">{t('leaving_continue')}</a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
