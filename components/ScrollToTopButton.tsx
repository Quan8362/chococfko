'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

export default function ScrollToTopButton() {
  const t = useTranslations('common')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label={t('backToTop')}
      title={t('backToTop')}
      className={[
        'fixed z-[150]',
        'bottom-4 right-4 sm:bottom-6 sm:right-6',
        'w-9 h-9 sm:w-10 sm:h-10',
        'flex items-center justify-center',
        'rounded-full bg-rose text-white',
        'shadow-[0_4px_16px_-4px_rgba(194,24,91,0.55)]',
        'hover:bg-rose-deep hover:-translate-y-0.5',
        'transition-all duration-300',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2',
        visible
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-2 pointer-events-none',
      ].join(' ')}
    >
      <svg
        className="w-[17px] h-[17px] sm:w-[18px] sm:h-[18px]"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
      </svg>
    </button>
  )
}
