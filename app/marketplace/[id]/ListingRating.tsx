'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import StarsDisplay, { STAR_PATH as STAR } from '@/components/marketplace/StarsDisplay'
import { submitSellerRating } from '../actions'

export default function ListingRating({
  listingId, average, count, myStars, myReview, canRate, eligible,
}: {
  listingId: string
  average: number
  count: number
  myStars: number | null
  myReview: string | null
  /** Logged-in viewer who is not the owner — may see the rating input area. */
  canRate: boolean
  /** Allowed to actually submit (has messaged the seller, or already reviewed). */
  eligible: boolean
}) {
  const t = useTranslations('marketplace')
  const router = useRouter()
  const [stars, setStars] = useState(myStars ?? 0)
  const [hover, setHover] = useState(0)
  const [review, setReview] = useState(myReview ?? '')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (stars < 1) { setErr(t('rating_pick')); return }
    setSaving(true); setErr(null); setDone(false)
    const res = await submitSellerRating(listingId, stars, review)
    setSaving(false)
    if (res.error) {
      setErr(
        res.error === 'self' ? t('rating_self')
        : res.error === 'not_contacted' ? t('rating_need_contact')
        : res.error === 'already_reviewed' ? t('rating_already')
        : t('rating_error'),
      )
      return
    }
    setDone(true)
    router.refresh()
  }

  return (
    <div className="bg-paper border border-line rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-serif font-bold text-[15px] text-ink">{t('rating_title')}</h3>
        <div className="flex items-center gap-1.5">
          <StarsDisplay value={average} />
          <span className="text-[12px] text-muted">
            {count > 0 ? `${average.toFixed(1)} · ${t('rating_count', { count })}` : t('rating_none')}
          </span>
        </div>
      </div>

      {canRate && (
        <div className="mt-3 pt-3 border-t border-line/60">
          {!eligible ? (
            <p className="text-[12.5px] text-muted flex items-start gap-1.5">
              <svg className="w-4 h-4 flex-none mt-px text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {t('rating_need_contact')}
            </p>
          ) : (
            <>
              <p className="text-[12.5px] text-muted mb-1.5">{myStars ? t('rating_your') : t('rating_prompt')}</p>
              <div className="flex gap-0.5 mb-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <button
                    key={i}
                    type="button"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => setStars(i)}
                    className="p-0.5"
                    aria-label={`${i}`}
                  >
                    <svg className={`w-7 h-7 shrink-0 transition-colors ${(hover || stars) >= i ? 'text-amber-400' : 'text-line'}`} fill="currentColor" viewBox="0 0 20 20" preserveAspectRatio="xMidYMid meet">
                      <path d={STAR} />
                    </svg>
                  </button>
                ))}
              </div>
              <textarea
                value={review}
                onChange={(e) => setReview(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder={t('rating_review_placeholder')}
                className="w-full px-3 py-2 rounded-lg border border-line bg-cream text-[13.5px] leading-relaxed resize-y focus:outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/10"
              />
              {err && <p className="text-[12px] text-red-600 mt-1">{err}</p>}
              {done && <p className="text-[12px] text-emerald-600 mt-1">{t('rating_saved')}</p>}
              <div className="flex justify-end mt-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="text-[13px] font-semibold px-5 py-2 rounded-full bg-rose text-white hover:bg-rose-deep disabled:opacity-60 transition-all"
                >
                  {saving ? t('rating_saving') : (myStars ? t('rating_update') : t('rating_submit'))}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
