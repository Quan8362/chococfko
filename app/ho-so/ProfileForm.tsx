'use client'

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { updateProfile } from './actions'

interface Props {
  userId: string
  displayName: string
  email: string
  avatarUrl?: string | null
  bio?: string | null
  area?: string | null
  facebookUrl?: string | null
  instagramUrl?: string | null
  successParam?: boolean
  errorParam?: string
}

export default function ProfileForm({
  userId,
  displayName: initialName,
  email,
  avatarUrl: initialAvatarUrl,
  bio: initialBio,
  area: initialArea,
  facebookUrl: initialFacebook,
  instagramUrl: initialInstagram,
  successParam,
  errorParam,
}: Props) {
  const t = useTranslations('profile')
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl || '')
  const [uploading, setUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const initial = (initialName || email)[0]?.toUpperCase() ?? '?'

  // Center-crop to square then resize to targetPx × targetPx, output WebP 0.92
  const resizeAvatar = (file: File, targetPx = 512): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(objectUrl)
        const srcSize = Math.min(img.naturalWidth, img.naturalHeight)
        const srcX = (img.naturalWidth  - srcSize) / 2
        const srcY = (img.naturalHeight - srcSize) / 2
        const canvas = document.createElement('canvas')
        canvas.width  = targetPx
        canvas.height = targetPx
        const ctx = canvas.getContext('2d')!
        ctx.imageSmoothingEnabled  = true
        ctx.imageSmoothingQuality  = 'high'
        ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, targetPx, targetPx)
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
          'image/webp',
          0.92,
        )
      }
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('load failed')) }
      img.src = objectUrl
    })

  const handleAvatarUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setAvatarError(t('avatarErrType'))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError(t('avatarErrSize'))
      return
    }
    setAvatarError('')
    setUploading(true)

    let blob: Blob
    try {
      blob = await resizeAvatar(file, 512)
    } catch {
      // Fallback: upload original if canvas fails (e.g. SVG)
      blob = file
    }

    const ts  = Date.now()
    const path = `${userId}/avatar-${ts}.webp`

    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: true })

    setUploading(false)

    if (error) {
      setAvatarError(t('avatarErrUpload') + error.message)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(data.path)

    // Append cache-buster so the <img> always fetches the freshest version
    setAvatarUrl(`${publicUrl}?v=${ts}`)
  }

  return (
    <form action={updateProfile} className="space-y-6">
      {/* Hidden field: avatar_url */}
      <input type="hidden" name="avatar_url" value={avatarUrl} />

      {/* Success / Error alerts */}
      {successParam && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-[13.5px] text-emerald-700 flex items-start gap-2">
          <svg className="w-4 h-4 flex-none mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {t('saveSuccess')}
        </div>
      )}
      {errorParam && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-[13.5px] text-red-700 flex items-start gap-2">
          <svg className="w-4 h-4 flex-none mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {t('saveError')}
        </div>
      )}

      {/* 2-col layout: avatar left, fields right */}
      <div className="grid lg:grid-cols-[176px_1fr] gap-8 items-start">

        {/* ── Avatar section ─────────────────────────────── */}
        <div className="flex flex-col items-center gap-3">
          <p className="text-[12px] font-semibold text-muted uppercase tracking-wide self-start lg:self-center">
            {t('avatar')}
          </p>

          {/* Circle avatar with hover overlay */}
          <div
            className="relative w-28 h-28 rounded-full overflow-hidden cursor-pointer group ring-4 ring-line/60"
            onClick={() => !uploading && inputRef.current?.click()}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={initialName}
                width={112}
                height={112}
                className="w-full h-full object-cover"
                style={{ objectFit: 'cover' }}
                loading="eager"
                decoding="async"
              />
            ) : (
              <span className="w-full h-full bg-rose text-white text-[42px] font-bold grid place-items-center select-none">
                {initial}
              </span>
            )}
            {/* Camera hover overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            {/* Upload spinner */}
            {uploading && (
              <div className="absolute inset-0 bg-black/50 grid place-items-center">
                <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleAvatarUpload(f)
            }}
          />

          {/* Change / Remove buttons */}
          <div className="flex items-center gap-2 text-[12px] font-semibold">
            <button
              type="button"
              onClick={() => !uploading && inputRef.current?.click()}
              className="text-rose hover:underline"
            >
              {t('changeAvatar')}
            </button>
            {avatarUrl && (
              <>
                <span className="text-muted/40">·</span>
                <button
                  type="button"
                  onClick={() => { setAvatarUrl(''); setAvatarError('') }}
                  className="text-muted hover:text-red-500 hover:underline"
                >
                  {t('removeAvatar')}
                </button>
              </>
            )}
          </div>

          {avatarError && (
            <p className="text-[11.5px] text-red-600 text-center max-w-[160px] leading-snug">
              {avatarError}
            </p>
          )}
          <p className="text-[11px] text-muted/60 text-center leading-relaxed max-w-[160px]">
            {t('avatarHint')}
          </p>
        </div>

        {/* ── Form fields ────────────────────────────────── */}
        <div className="space-y-4">

          {/* Display name */}
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              {t('displayName')}
            </label>
            <input
              type="text"
              name="display_name"
              defaultValue={initialName}
              className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose focus:ring-2 focus:ring-rose/15 transition-all text-ink"
            />
          </div>

          {/* Email — read only */}
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              {t('email')}
            </label>
            <input
              type="email"
              value={email}
              readOnly
              className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-cream text-muted cursor-not-allowed"
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              {t('bio')}
            </label>
            <textarea
              name="bio"
              defaultValue={initialBio || ''}
              rows={3}
              placeholder={t('bioHint')}
              className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose focus:ring-2 focus:ring-rose/15 transition-all text-ink resize-none"
            />
          </div>

          {/* Area */}
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              {t('area')}
            </label>
            <input
              type="text"
              name="area"
              defaultValue={initialArea || ''}
              placeholder={t('areaHint')}
              className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose focus:ring-2 focus:ring-rose/15 transition-all text-ink"
            />
          </div>

          {/* Social links */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
                Facebook
              </label>
              <input
                type="url"
                name="facebook_url"
                defaultValue={initialFacebook || ''}
                placeholder="https://facebook.com/..."
                className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose focus:ring-2 focus:ring-rose/15 transition-all text-ink"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
                Instagram
              </label>
              <input
                type="url"
                name="instagram_url"
                defaultValue={initialInstagram || ''}
                placeholder="https://instagram.com/..."
                className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose focus:ring-2 focus:ring-rose/15 transition-all text-ink"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2 flex-wrap">
            <button
              type="submit"
              className="inline-flex items-center gap-2 font-semibold text-[14px] px-6 py-2.5 rounded-full bg-rose text-white shadow-[0_4px_14px_-4px_rgba(194,24,91,0.45)] hover:bg-rose-deep hover:-translate-y-px transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {t('save')}
            </button>
            <a
              href="/"
              className="inline-flex items-center font-semibold text-[14px] px-6 py-2.5 rounded-full border border-line text-[#5c4d44] hover:bg-line transition-all"
            >
              {t('cancel')}
            </a>
          </div>
        </div>
      </div>
    </form>
  )
}
