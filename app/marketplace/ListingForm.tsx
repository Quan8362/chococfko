'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/compressImage'
import { CATEGORIES, CONDITION_PRESETS, type Listing } from '@/lib/marketplace'
import TagInput from '@/components/tags/TagInput'
import { submitListing, updateListing, type ListingResult } from './actions'

const MAX_IMAGES = 6
const INIT: ListingResult = null

function SubmitBtn({ label, sending, disabled = false }: { label: string; sending: string; disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center justify-center gap-2 font-semibold text-[14.5px] px-7 py-3 rounded-full bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_16px_-4px_rgba(194,24,91,0.5)]"
    >
      {pending && (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {pending ? sending : label}
    </button>
  )
}

export default function ListingForm({
  userId,
  listing,
  popularTags = [],
  defaultTags = [],
}: {
  userId: string
  listing?: Listing
  popularTags?: string[]
  defaultTags?: string[]
}) {
  const t = useTranslations('marketplace')
  const router = useRouter()
  const isEdit = !!listing
  const action = isEdit ? updateListing : submitListing
  const [state, formAction] = useFormState(action, INIT)

  const [images, setImages] = useState<string[]>(listing?.images ?? [])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const [listingType, setListingType] = useState<'sell' | 'free' | 'auction'>(listing?.listing_type ?? 'sell')
  const [condition, setCondition] = useState<'new' | 'used'>(listing?.condition ?? 'used')
  const [percent, setPercent] = useState<number>(
    listing?.condition === 'used' && listing?.condition_percent ? listing.condition_percent : 80,
  )
  const [negotiable, setNegotiable] = useState<boolean>(listing?.is_negotiable ?? false)

  // Auction fields
  const [startPrice, setStartPrice] = useState(listing?.start_price != null ? String(listing.start_price) : '')
  const [minIncrement, setMinIncrement] = useState(listing?.min_increment != null ? String(listing.min_increment) : '1000')
  const [buyNow, setBuyNow] = useState(listing?.buy_now_price != null ? String(listing.buy_now_price) : '')
  const [endsAt, setEndsAt] = useState(() => {
    if (!listing?.auction_ends_at) return ''
    const d = new Date(listing.auction_ends_at)
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })

  // ── Live validation (mirrors the server rules) ─────────────────────────────
  const [title, setTitle] = useState(listing?.title ?? '')
  const [price, setPrice] = useState(listing?.price != null ? String(listing.price) : '')
  const [touched, setTouched] = useState<{ title?: boolean; price?: boolean; images?: boolean }>({})
  const markTouched = (f: 'title' | 'price' | 'images') => setTouched(prev => ({ ...prev, [f]: true }))

  const titleTrim = title.trim()
  const titleErr: string | null =
    titleTrim.length === 0 ? t('err_title_required')
    : titleTrim.length < 4  ? t('err_title_short')
    : titleTrim.length > 120 ? t('err_title_long')
    : null

  const priceNum = parseInt(price.replace(/[^\d]/g, '') || '0', 10)
  const priceErr: string | null =
    listingType !== 'sell' ? null
    : priceNum <= 0           ? t('err_price_required')
    : priceNum > 100_000_000  ? t('err_price_high')
    : null

  const imagesErr: string | null = images.length === 0 ? t('err_image_required') : null

  const startNum = parseInt(startPrice.replace(/[^\d]/g, '') || '0', 10)
  const auctionErr: string | null =
    listingType !== 'auction' ? null
    : startNum <= 0 ? t('err_start_price_required')
    : (!endsAt || new Date(endsAt).getTime() <= Date.now() + 60_000) ? t('err_auction_end')
    : null

  const formValid = !titleErr && !priceErr && !imagesErr && !auctionErr

  useEffect(() => {
    if (state?.ok) router.push('/marketplace/mine?success=1')
  }, [state, router])

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    markTouched('images')
    setUploadError(null)
    const remaining = MAX_IMAGES - images.length
    const list = Array.from(files).slice(0, remaining)
    setUploading(true)
    const uploaded: string[] = []
    for (const original of list) {
      if (!original.type.startsWith('image/')) { setUploadError(t('image_invalid')); continue }
      // Guard against absurdly large originals before we even decode them.
      if (original.size > 40 * 1024 * 1024) { setUploadError(t('image_too_large')); continue }

      // Auto-compress big phone photos so the user doesn't have to.
      let file = original
      try {
        file = await compressImage(original, { maxEdge: 1920, maxBytes: 2.4 * 1024 * 1024 })
      } catch { /* keep original on failure */ }
      if (file.size > 3 * 1024 * 1024) { setUploadError(t('image_too_large')); continue }

      const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { data, error } = await supabase.storage
        .from('marketplace')
        .upload(path, file, { contentType: file.type, cacheControl: '31536000' })
      if (error || !data) { setUploadError(t('image_upload_failed')); continue }
      const { data: { publicUrl } } = supabase.storage.from('marketplace').getPublicUrl(data.path)
      uploaded.push(publicUrl)
    }
    setImages(prev => [...prev, ...uploaded].slice(0, MAX_IMAGES))
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function removeImage(url: string) {
    markTouched('images')
    setImages(prev => prev.filter(u => u !== url))
  }
  function makeCover(url: string) {
    setImages(prev => [url, ...prev.filter(u => u !== url)])
  }

  const errorMsg =
    state?.error === 'title_too_short'   ? t('err_title_short')
    : state?.error === 'title_too_long'  ? t('err_title_long')
    : state?.error === 'desc_too_long'   ? t('err_desc_long')
    : state?.error === 'image_required'  ? t('err_image_required')
    : state?.error === 'price_required'  ? t('err_price_required')
    : state?.error === 'price_too_high'  ? t('err_price_high')
    : state?.error === 'start_price_required' ? t('err_start_price_required')
    : state?.error === 'auction_end_invalid'  ? t('err_auction_end')
    : state?.error === 'buynow_invalid'  ? t('err_buynow')
    : state?.error === 'increment_required' ? t('err_increment')
    : state?.error === 'condition_invalid' ? t('err_condition')
    : state?.error === 'login_required'  ? t('err_login')
    : state?.error                       ? t('err_generic')
    : null

  return (
    <form action={formAction} className="space-y-7">
      {isEdit && <input type="hidden" name="id" value={listing!.id} />}
      <input type="hidden" name="images" value={JSON.stringify(images)} />
      <input type="hidden" name="listing_type" value={listingType} />
      <input type="hidden" name="condition" value={condition} />
      <input type="hidden" name="condition_percent" value={condition === 'new' ? 100 : percent} />
      <input type="hidden" name="is_negotiable" value={negotiable ? 'true' : 'false'} />

      {/* Images */}
      <div>
        <label className="block text-[14px] font-semibold text-ink mb-2">{t('field_images')} <span className="text-rose">*</span> <span className="text-muted font-normal">({images.length}/{MAX_IMAGES})</span></label>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {images.map((url, i) => (
            <div key={url} className="relative aspect-square rounded-xl overflow-hidden border border-line group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" />
              {i === 0 && (
                <span className="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose text-white">{t('cover_badge')}</span>
              )}
              <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/40 transition-colors flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                {i !== 0 && (
                  <button type="button" onClick={() => makeCover(url)} title={t('set_cover')} className="text-[10px] font-semibold px-2 py-1 rounded-full bg-white/90 text-ink hover:bg-white">{t('set_cover')}</button>
                )}
                <button type="button" onClick={() => removeImage(url)} title={t('remove')} className="w-7 h-7 grid place-items-center rounded-full bg-white/90 text-red-500 hover:bg-white">✕</button>
              </div>
            </div>
          ))}
          {images.length < MAX_IMAGES && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="aspect-square rounded-xl border-2 border-dashed border-line hover:border-rose/40 grid place-items-center text-muted hover:text-rose transition-colors disabled:opacity-60"
            >
              {uploading ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <div className="text-center">
                  <div className="text-2xl leading-none">＋</div>
                  <div className="text-[11px] mt-1">{t('add_photo')}</div>
                </div>
              )}
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
        {uploadError && <p className="text-[12.5px] text-red-600 mt-2">{uploadError}</p>}
        {touched.images && imagesErr && <p className="text-[12.5px] text-red-600 mt-2">{imagesErr}</p>}
        <p className="text-[11.5px] text-muted mt-2">{t('image_hint')}</p>
      </div>

      {/* Title */}
      <div>
        <label className="block text-[14px] font-semibold text-ink mb-2">{t('field_title')} <span className="text-rose">*</span></label>
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => markTouched('title')}
          maxLength={120}
          placeholder={t('title_placeholder')}
          className={`w-full px-4 py-3 rounded-xl border bg-paper text-[15px] focus:outline-none focus:ring-2 ${
            touched.title && titleErr ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-line focus:border-rose/50 focus:ring-rose/10'
          }`}
        />
        {touched.title && titleErr && <p className="text-[12.5px] text-red-600 mt-1.5">{titleErr}</p>}
      </div>

      {/* Listing type */}
      <div>
        <label className="block text-[14px] font-semibold text-ink mb-2">{t('field_type')}</label>
        <div className="flex gap-2.5">
          {([['sell', `💰 ${t('type_sell')}`], ['free', `🎁 ${t('type_free')}`], ['auction', `🔨 ${t('type_auction')}`]] as const).map(([tp, label]) => (
            <button
              key={tp}
              type="button"
              onClick={() => setListingType(tp)}
              className={`flex-1 px-3 py-3 rounded-xl border text-[13.5px] font-semibold transition-all ${
                listingType === tp ? 'border-rose bg-rose/5 text-rose' : 'border-line bg-paper text-muted hover:border-rose/30'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Auction settings */}
      {listingType === 'auction' && (
        <div className="space-y-4 p-4 rounded-xl border border-rose/20 bg-rose/[0.03]">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[14px] font-semibold text-ink mb-2">{t('field_start_price')} <span className="text-rose">*</span></label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-semibold">¥</span>
                <input name="start_price" inputMode="numeric" value={startPrice} onChange={(e) => setStartPrice(e.target.value)} placeholder="0"
                  className="w-full pl-9 pr-4 py-3 rounded-xl border border-line bg-paper text-[15px] focus:outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/10" />
              </div>
            </div>
            <div>
              <label className="block text-[14px] font-semibold text-ink mb-2">{t('field_min_increment')}</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-semibold">¥</span>
                <input name="min_increment" inputMode="numeric" value={minIncrement} onChange={(e) => setMinIncrement(e.target.value)} placeholder="1000"
                  className="w-full pl-9 pr-4 py-3 rounded-xl border border-line bg-paper text-[15px] focus:outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/10" />
              </div>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[14px] font-semibold text-ink mb-2">{t('field_buy_now')} <span className="text-muted font-normal">({t('optional')})</span></label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-semibold">¥</span>
                <input name="buy_now_price" inputMode="numeric" value={buyNow} onChange={(e) => setBuyNow(e.target.value)} placeholder="—"
                  className="w-full pl-9 pr-4 py-3 rounded-xl border border-line bg-paper text-[15px] focus:outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/10" />
              </div>
            </div>
            <div>
              <label className="block text-[14px] font-semibold text-ink mb-2">{t('field_auction_end')} <span className="text-rose">*</span></label>
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
                className="w-full px-3 py-3 rounded-xl border border-line bg-paper text-[14px] focus:outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/10" />
              <input type="hidden" name="auction_ends_at" value={endsAt ? new Date(endsAt).toISOString() : ''} />
            </div>
          </div>
          {auctionErr && <p className="text-[12.5px] text-red-600">{auctionErr}</p>}
        </div>
      )}

      {/* Price (sell only) */}
      {listingType === 'sell' && (
        <div>
          <label className="block text-[14px] font-semibold text-ink mb-2">{t('field_price')} <span className="text-rose">*</span></label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-semibold">¥</span>
            <input
              name="price"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={() => markTouched('price')}
              placeholder="0"
              className={`w-full pl-9 pr-4 py-3 rounded-xl border bg-paper text-[15px] focus:outline-none focus:ring-2 ${
                touched.price && priceErr ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-line focus:border-rose/50 focus:ring-rose/10'
              }`}
            />
          </div>
          {touched.price && priceErr && <p className="text-[12.5px] text-red-600 mt-1.5">{priceErr}</p>}
          <label className="inline-flex items-center gap-2 mt-3 text-[13.5px] text-muted cursor-pointer">
            <input type="checkbox" checked={negotiable} onChange={e => setNegotiable(e.target.checked)} className="accent-rose w-4 h-4" />
            {t('negotiable')}
          </label>
        </div>
      )}

      {/* Condition */}
      <div>
        <label className="block text-[14px] font-semibold text-ink mb-2">{t('field_condition')}</label>
        <div className="flex gap-2.5 mb-3">
          {(['new', 'used'] as const).map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCondition(c)}
              className={`flex-1 px-4 py-2.5 rounded-xl border text-[14px] font-semibold transition-all ${
                condition === c ? 'border-rose bg-rose/5 text-rose' : 'border-line bg-paper text-muted hover:border-rose/30'
              }`}
            >
              {c === 'new' ? t('cond_new') : t('cond_used')}
            </button>
          ))}
        </div>
        {condition === 'used' && (
          <div>
            <div className="flex flex-wrap gap-2">
              {CONDITION_PRESETS.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPercent(p.percent)}
                  className={`px-3.5 py-2 rounded-full border text-[13px] font-medium transition-all ${
                    percent === p.percent ? 'border-rose bg-rose/10 text-rose' : 'border-line bg-paper text-muted hover:border-rose/30'
                  }`}
                >
                  {t(`cond_${p.key}` as Parameters<typeof t>[0])} · {p.percent}%
                </button>
              ))}
            </div>
            <div className="mt-3 h-2 rounded-full bg-line overflow-hidden">
              <div className="h-full bg-gradient-to-r from-rose/60 to-rose transition-all" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Category + Area */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[14px] font-semibold text-ink mb-2">{t('field_category')}</label>
          <div className="relative">
            <select
              name="category"
              defaultValue={listing?.category ?? 'other'}
              className="w-full appearance-none pl-4 pr-10 py-3 rounded-xl border border-line bg-paper text-[15px] focus:outline-none focus:border-rose/50 cursor-pointer"
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{t(`cat_${c}` as Parameters<typeof t>[0])}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        <div>
          <label className="block text-[14px] font-semibold text-ink mb-2">{t('field_area')}</label>
          <input
            name="area"
            defaultValue={listing?.area ?? ''}
            maxLength={60}
            placeholder={t('area_placeholder')}
            className="w-full px-4 py-3 rounded-xl border border-line bg-paper text-[15px] focus:outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/10"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-[14px] font-semibold text-ink mb-2">{t('field_description')}</label>
        <textarea
          name="description"
          defaultValue={listing?.description ?? ''}
          rows={5}
          maxLength={4000}
          placeholder={t('desc_placeholder')}
          className="w-full px-4 py-3 rounded-xl border border-line bg-paper text-[15px] leading-relaxed resize-y focus:outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/10"
        />
      </div>

      {/* Tags */}
      <TagInput
        contentType="listing"
        popularTags={popularTags}
        defaultTags={defaultTags}
        liveContext={{ listingType }}
      />

      {errorMsg && (
        <p className="text-[13px] text-red-600 flex items-center gap-1.5">
          <svg className="w-4 h-4 flex-none" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          {errorMsg}
        </p>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <div className="flex items-center gap-3">
          <SubmitBtn label={isEdit ? t('save_changes') : t('publish')} sending={t('publishing')} disabled={!formValid} />
          <span className="text-[12.5px] text-muted">{t('pending_note')}</span>
        </div>
        {!formValid && <p className="text-[12px] text-amber-600">{t('form_incomplete')}</p>}
      </div>
    </form>
  )
}
