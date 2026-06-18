'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

export default function HeroSearch() {
  const t = useTranslations('japanese')
  const router = useRouter()
  const [q, setQ] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const v = q.trim()
    router.push(v ? `/japanese/dictionary?q=${encodeURIComponent(v)}` : '/japanese/dictionary')
  }

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className="relative flex items-stretch gap-2 w-full max-w-[560px]"
    >
      <label htmlFor="jp-hero-search" className="sr-only">
        {t('hero_search_label')}
      </label>
      <div className="relative flex-1">
        <svg
          aria-hidden
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          id="jp-hero-search"
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={t('hero_search_placeholder')}
          autoComplete="off"
          className="w-full bg-white border border-line rounded-xl pl-11 pr-4 py-3.5 text-[15px] text-ink placeholder:text-muted/70 shadow-sm focus:outline-none focus:border-rose focus:ring-2 focus:ring-rose/15 transition-all"
        />
      </div>
      <button
        type="submit"
        className="shrink-0 inline-flex items-center justify-center bg-rose text-white font-semibold text-[14px] px-5 sm:px-6 rounded-xl hover:bg-rose-deep transition-colors shadow-sm"
      >
        {t('hero_search_button')}
      </button>
    </form>
  )
}
