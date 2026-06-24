'use client'

import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export const LANGS = [
  { code: 'vi', flag: '/flags/vn.svg', label: 'Tiếng Việt' },
  { code: 'en', flag: '/flags/us.svg', label: 'English' },
  { code: 'ja', flag: '/flags/jp.svg', label: '日本語' },
  { code: 'ko', flag: '/flags/kr.svg', label: '한국어' },
  { code: 'zh', flag: '/flags/cn.svg', label: '中文' },
]

export function Flag({ src, label }: { src: string; label: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={label}
      width={24}
      height={16}
      className="rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,0.1)] flex-none block object-cover"
      style={{ width: 24, height: 16 }}
      draggable={false}
    />
  )
}

export default function LanguageSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const current = LANGS.find((l) => l.code === locale) ?? LANGS[0]

  const change = (code: string) => {
    document.cookie = `locale=${code}; path=/; max-age=31536000; SameSite=Lax`
    setOpen(false)
    router.refresh()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-full border-[1.5px] border-line hover:border-rose/50 bg-paper transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
        aria-label="Switch language"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={current.label}
      >
        <Flag src={current.flag} label={current.label} />
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-muted">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[49]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_40px_-10px_rgba(80,30,40,0.18)] py-1.5 min-w-[168px] overflow-hidden">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => change(l.code)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13.5px] hover:bg-paper transition-colors text-left ${
                  l.code === locale ? 'font-semibold text-rose' : 'text-[#5c4d44]'
                }`}
              >
                <Flag src={l.flag} label={l.label} />
                {l.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
