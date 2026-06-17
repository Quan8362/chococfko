'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import StarsDisplay, { STAR_PATH as STAR } from '@/components/marketplace/StarsDisplay'
import { submitPostRating } from '../actions'

export default function PostRating({
  postId, average, count, myStars, myReview, isLoggedIn,
}: {
  postId: string
  average: number
  count: number
  myStars: number | null
  myReview: string | null
  isLoggedIn: boolean
}) {
  const t = useTranslations('post_rating')
  const router = useRouter()
  const [stars, setStars] = useState(myStars ?? 0)
  const [hover, setHover] = useState(0)
  const [review, setReview] = useState(myReview ?? '')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (stars < 1) { setErr(t('pick')); return }
    setSaving(true); setErr(null); setDone(false)
    const res = await submitPostRating(postId, stars, review)
    setSaving(false)
    if (res.error) { setErr(t('error')); return }
    setDone(true)
    router.refresh()
  }

  return (
    <div className="mt-8 bg-paper border border-line rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="font-serif font-bold text-[15px] text-ink">{t('title')}</h4>
        <div className="flex items-center gap-1.5">
          <StarsDisplay value={average} />
          <span className="text-[12px] text-muted">
            {count > 0 ? `${average.toFixed(1)} · ${t('count', { count })}` : t('none')}
          </span>
        </div>
      </div>

      {isLoggedIn ? (
        <div className="mt-3 pt-3 border-t border-line/60">
          <p className="text-[12.5px] text-muted mb-1.5">{myStars ? t('your') : t('prompt')}</p>
          <div className="flex gap-0.5 mb-2">
            {[1, 2, 3, 4, 5].map((i) => (
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
            placeholder={t('review_placeholder')}
            className="w-full px-3 py-2 rounded-lg border border-line bg-cream text-[13.5px] leading-relaxed resize-y focus:outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/10"
          />
          {err && <p className="text-[12px] text-red-600 mt-1">{err}</p>}
          {done && <p className="text-[12px] text-emerald-600 mt-1">{t('saved')}</p>}
          <div className="flex justify-end mt-2">
            <button
              onClick={save}
              disabled={saving}
              className="text-[13px] font-semibold px-5 py-2 rounded-full bg-rose text-white hover:bg-rose-deep disabled:opacity-60 transition-all"
            >
              {saving ? t('saving') : (myStars ? t('update') : t('submit'))}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 pt-3 border-t border-line/60">
          <Link href="/login" className="text-[13px] font-semibold text-rose hover:underline">{t('login_to_rate')}</Link>
        </div>
      )}
    </div>
  )
}
