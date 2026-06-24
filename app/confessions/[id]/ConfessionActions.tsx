'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toggleConfessionReaction } from '../actions'

export default function ConfessionActions({
  confessionId,
  initialCount,
  initialReacted,
  isLoggedIn,
  shareTitle,
}: {
  confessionId: string
  initialCount: number
  initialReacted: boolean
  isLoggedIn: boolean
  shareTitle: string
}) {
  const t = useTranslations('confessions')
  const router = useRouter()
  const [count, setCount] = useState(initialCount)
  const [reacted, setReacted] = useState(initialReacted)
  const [pending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)

  function handleReact() {
    if (!isLoggedIn) {
      router.push('/login')
      return
    }
    // Optimistic update
    const nextReacted = !reacted
    setReacted(nextReacted)
    setCount((c) => c + (nextReacted ? 1 : -1))
    startTransition(async () => {
      const res = await toggleConfessionReaction(confessionId)
      if (res.ok) {
        setReacted(res.reacted)
        setCount(res.count)
      } else {
        // Revert on failure
        setReacted(!nextReacted)
        setCount((c) => c + (nextReacted ? -1 : 1))
        if (res.error === 'login_required') router.push('/login')
      }
    })
  }

  async function handleShare() {
    const url = typeof window !== 'undefined' ? window.location.href : `/confessions/${confessionId}`
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: shareTitle, url })
        return
      } catch {
        // user cancelled or share failed → fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <div className="flex items-center gap-2.5 mb-8 -mt-4">
      <button
        type="button"
        onClick={handleReact}
        disabled={pending}
        aria-pressed={reacted}
        aria-label={t('like')}
        className={`inline-flex items-center gap-2 text-[13.5px] font-semibold px-4 py-2 rounded-full border transition-all disabled:opacity-60 ${
          reacted
            ? 'bg-rose text-white border-rose shadow-[0_2px_12px_-2px_rgba(194,24,91,0.4)]'
            : 'bg-paper text-[#5c4d44] border-line hover:border-rose/40 hover:text-rose'
        }`}
      >
        <svg
          className="w-4 h-4 flex-none"
          viewBox="0 0 24 24"
          fill={reacted ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
        {count > 0 && <span className="tabular-nums">{count}</span>}
      </button>

      <button
        type="button"
        onClick={handleShare}
        aria-label={t('share')}
        className="inline-flex items-center gap-2 text-[13.5px] font-semibold px-4 py-2 rounded-full border bg-paper text-[#5c4d44] border-line hover:border-rose/40 hover:text-rose transition-all"
      >
        {copied ? (
          <>
            <svg className="w-4 h-4 flex-none text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.79 6.79-6.79a1 1 0 011.42 0z" clipRule="evenodd" />
            </svg>
            <span className="text-emerald-700">{t('copied')}</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4 flex-none" fill="none" stroke="currentColor" strokeWidth={1.9} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <span>{t('share')}</span>
          </>
        )}
      </button>
    </div>
  )
}
