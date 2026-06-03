'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

interface Props {
  name: string
  defaultValue?: string
  label?: string
}

export default function ImageUpload({
  name,
  defaultValue = '',
  label = '',
}: Props) {
  const t = useTranslations('image_upload')
  const [url, setUrl] = useState(defaultValue)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError(t('err_type'))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t('err_size'))
      return
    }
    setError('')
    setUploading(true)

    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { data, error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(path, file, { cacheControl: '3600', upsert: false })

    setUploading(false)

    if (uploadError) {
      setError(t('err_upload_prefix') + uploadError.message)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('post-images')
      .getPublicUrl(data.path)

    setUrl(publicUrl)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) upload(file)
  }

  return (
    <div>
      <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
        {label}
      </label>

      <input type="hidden" name={name} value={url} />

      {url ? (
        /* Preview */
        <div className="relative rounded-xl overflow-hidden border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Preview" className="w-full h-56 object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11.5px] bg-white/90 text-emerald-700 font-semibold px-2.5 py-1 rounded-full">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {t('uploaded')}
            </span>
            <button
              type="button"
              onClick={() => setUrl('')}
              className="inline-flex items-center gap-1 text-[11.5px] bg-white/90 text-red-600 font-semibold px-2.5 py-1 rounded-full hover:bg-white transition-colors"
              title={t('change')}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {t('change')}
            </button>
          </div>
        </div>
      ) : (
        /* Upload zone */
        <div
          className={`border-2 border-dashed rounded-xl text-center cursor-pointer transition-all ${
            uploading
              ? 'border-rose/50 bg-rose/5 cursor-default'
              : dragOver
              ? 'border-rose/60 bg-rose-soft scale-[1.01]'
              : 'border-line/70 bg-cream/40 hover:border-rose/50 hover:bg-rose-soft/50'
          }`}
          onClick={() => !uploading && inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) upload(file)
            }}
          />

          {uploading ? (
            <div className="py-8 space-y-2.5">
              <svg className="w-9 h-9 mx-auto text-rose animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-[13.5px] font-semibold text-rose">{t('uploading')}</p>
            </div>
          ) : (
            <div className="py-8 space-y-2">
              <div className="w-12 h-12 rounded-xl bg-line/60 grid place-items-center mx-auto">
                <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-[14px] font-semibold text-[#5c4d44]">{t('drag_drop')}</p>
                <p className="text-[12.5px] text-muted mt-0.5">{t('or_click')}</p>
              </div>
              <p className="text-[11.5px] text-muted/70 mt-1">
                {t('hint')}
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-[12.5px] text-red-600 mt-1.5 flex items-center gap-1">
          <svg className="w-3.5 h-3.5 flex-none" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  )
}
