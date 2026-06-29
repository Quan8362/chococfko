'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getCoinTier, coinTierName, type CoinTierTranslate, type CoinTierDef } from '@/lib/games/coinTier'
import { CoinTierBadge } from './CoinTierBadge'

// Non-blocking promotion / demotion notice driven by the CURRENT balance. The FIRST observed
// balance is baselined silently, so re-opening / refreshing the page never replays a past
// celebration. Afterwards, crossing a tier boundary (in either direction, including multi-tier
// jumps) shows a small auto-dismissing toast: a premium congrats on promotion, a neutral
// "badge updated" note on demotion (never punitive). Honours prefers-reduced-motion by using
// a plain fade — no looping or aggressive animation.
export default function CoinTierCelebration({ balance }: { balance: number | null }) {
  const ct = useTranslations('coin_tier') as unknown as CoinTierTranslate
  const baselined = useRef(false)
  const prevOrder = useRef(0)
  const [toast, setToast] = useState<{ kind: 'up' | 'down'; def: CoinTierDef | null } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (balance == null) return
    const def = getCoinTier(balance)
    const order = def?.order ?? 0
    if (!baselined.current) {
      baselined.current = true
      prevOrder.current = order
      return // silent baseline (no replay on refresh)
    }
    if (order === prevOrder.current) return
    const kind: 'up' | 'down' = order > prevOrder.current ? 'up' : 'down'
    prevOrder.current = order
    setToast({ kind, def })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 5000)
  }, [balance])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  if (!toast) return null
  const isUp = toast.kind === 'up'
  const tierName = toast.def ? coinTierName(ct, toast.def) : ''

  return (
    <div className="fixed inset-x-0 top-4 z-[120] flex justify-center px-4 pointer-events-none" aria-live="polite">
      <div
        className={`animate-fadein pointer-events-auto rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-3 max-w-[440px] ring-1 ${
          isUp
            ? 'bg-gradient-to-r from-[#e3b23c] to-[#ad1f37] text-white ring-[#f6d989]/40'
            : 'bg-paper text-ink ring-line'
        }`}
        role="status"
      >
        {isUp && toast.def && <CoinTierBadge tier={toast.def.key} size="lg" label={tierName} />}
        <div className="min-w-0">
          {isUp ? (
            <>
              <p className="text-[13.5px] font-bold leading-snug">{ct('promotion_title')}</p>
              <p className="text-[12px] leading-snug opacity-95">{ct('promotion_body', { tier: tierName })}</p>
            </>
          ) : (
            <p className="text-[13px] font-medium leading-snug">{ct('demotion_body')}</p>
          )}
        </div>
        <button
          onClick={() => setToast(null)}
          className={`flex-none text-[18px] leading-none ${isUp ? 'text-white/80 hover:text-white' : 'text-muted hover:text-ink'}`}
          aria-label="×"
        >
          ×
        </button>
      </div>
    </div>
  )
}
