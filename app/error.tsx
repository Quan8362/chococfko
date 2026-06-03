'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('error_page')

  useEffect(() => {
    console.error('[Runtime error]', error)
  }, [error])

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-6 py-20">
      <div className="max-w-[480px] w-full text-center">
        <div className="text-[56px] mb-5">⚠️</div>

        <h1 className="font-serif font-black text-[26px] text-ink mb-3 leading-snug">
          {t('heading')}
        </h1>
        <p className="text-[15px] text-muted leading-[1.7] mb-8">
          {t('body')}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 font-semibold text-[14px] px-7 py-3 rounded-full bg-rose text-white shadow-[0_4px_14px_-4px_rgba(194,24,91,0.45)] hover:bg-rose-deep hover:-translate-y-0.5 transition-all"
          >
            🔄 {t('retry')}
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 font-semibold text-[14px] px-7 py-3 rounded-full bg-paper border border-line text-ink hover:border-rose/40 hover:text-rose transition-all"
          >
            {t('back')}
          </Link>
        </div>
      </div>
    </div>
  )
}
