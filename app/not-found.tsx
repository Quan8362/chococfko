import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function NotFound() {
  const t = await getTranslations('not_found')

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-6 py-20">
      <div className="max-w-[480px] w-full text-center">
        {/* Big 404 number */}
        <p className="font-serif font-black text-[120px] leading-none text-rose/15 select-none mb-2">
          404
        </p>

        {/* Icon */}
        <div className="text-[48px] mb-6">🗺️</div>

        {/* Heading */}
        <h1 className="font-serif font-black text-[28px] text-ink mb-3 leading-snug">
          {t('heading')}
        </h1>
        <p className="text-[15px] text-muted leading-[1.7] mb-8">
          {t('body')}
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 font-semibold text-[14px] px-7 py-3 rounded-full bg-rose text-white shadow-[0_4px_14px_-4px_rgba(194,24,91,0.45)] hover:bg-rose-deep hover:-translate-y-0.5 transition-all"
          >
            {t('back')}
          </Link>
          <Link
            href="/map"
            className="inline-flex items-center justify-center gap-2 font-semibold text-[14px] px-7 py-3 rounded-full bg-paper border border-line text-ink hover:border-rose/40 hover:text-rose transition-all"
          >
            🗺️ {t('map')}
          </Link>
        </div>
      </div>
    </div>
  )
}
