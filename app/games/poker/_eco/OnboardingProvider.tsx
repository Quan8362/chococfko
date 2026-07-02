'use client'

// First-time ONBOARDING tour overlay. Pure model lives in lib/games/poker/learn/onboarding.ts;
// this component owns persistence (localStorage), rendering, accessibility and analytics only.
// It never blocks experienced players: it auto-shows only for someone who hasn't finished or opted
// out, and is always re-openable from the Learn hub (window event 'poker:onboarding').

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePokerPrefs } from './prefs'
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_COUNT,
  initialProgress,
  advance,
  back,
  pauseAt,
  skip as skipModel,
  dontShowAgain,
  restart as restartModel,
  complete as completeModel,
  shouldAutoShow,
  isLastStep,
  mergeProgress,
  type OnboardingProgress,
} from '@/lib/games/poker/learn/onboarding'
import {
  trackOnboardingStarted,
  trackOnboardingStep,
  trackOnboardingCompleted,
  trackOnboardingSkipped,
} from '@/lib/games/poker/learn/analytics'

const STORAGE_KEY = 'poker:onboarding'

function load(): OnboardingProgress {
  if (typeof window === 'undefined') return initialProgress()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return mergeProgress(raw ? JSON.parse(raw) : null, Date.now())
  } catch {
    return initialProgress(Date.now())
  }
}

function save(p: OnboardingProgress) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    /* private mode — tour simply won't persist */
  }
}

export default function OnboardingProvider() {
  const t = useTranslations('games.poker.learn.onboarding')
  const prefs = usePokerPrefs()
  const [progress, setProgress] = useState<OnboardingProgress>(() => initialProgress())
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)

  const update = useCallback((p: OnboardingProgress) => {
    setProgress(p)
    save(p)
  }, [])

  const openTour = useCallback((fresh: boolean) => {
    setProgress((prev) => {
      const next = fresh ? restartModel(Date.now()) : prev
      if (fresh) save(next)
      return next
    })
    setOpen(true)
    if (!startedRef.current) {
      startedRef.current = true
      trackOnboardingStarted()
    }
  }, [])

  // Hydrate from storage on mount and auto-show for eligible players.
  useEffect(() => {
    const stored = load()
    setProgress(stored)
    if (shouldAutoShow(stored)) {
      setOpen(true)
      startedRef.current = true
      trackOnboardingStarted()
      trackOnboardingStep(stored.stepIndex)
    }
  }, [])

  // Re-open from the Learn hub ("open later from Help").
  useEffect(() => {
    function onEvent(e: Event) {
      const mode = (e as CustomEvent<string>).detail
      openTour(mode === 'restart')
    }
    window.addEventListener('poker:onboarding', onEvent as EventListener)
    return () => window.removeEventListener('poker:onboarding', onEvent as EventListener)
  }, [openTour])

  const closePaused = useCallback(() => {
    update(pauseAt(skipModel(progress, Date.now()), progress.stepIndex, Date.now()))
    trackOnboardingSkipped(progress.stepIndex)
    setOpen(false)
  }, [progress, update])

  const onNext = useCallback(() => {
    if (isLastStep(progress)) {
      update(completeModel(progress, Date.now()))
      trackOnboardingCompleted()
      setOpen(false)
      return
    }
    const next = advance(progress, Date.now())
    update(next)
    trackOnboardingStep(next.stepIndex)
  }, [progress, update])

  const onBack = useCallback(() => {
    const prev = back(progress, Date.now())
    update(prev)
    trackOnboardingStep(prev.stepIndex)
  }, [progress, update])

  const onDontShow = useCallback(() => {
    update(dontShowAgain(progress, Date.now()))
    setOpen(false)
  }, [progress, update])

  // Esc pauses the tour (never permanently dismisses).
  useEffect(() => {
    if (!open) return
    dialogRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closePaused()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closePaused])

  if (!open) return null

  const stepKey = ONBOARDING_STEPS[progress.stepIndex]
  const last = isLastStep(progress)
  const animate = prefs.animation && !prefs.reducedMotion

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onClick={closePaused}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pk-onb-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        data-testid="pk-onboarding"
        data-step={progress.stepIndex}
        className={`w-full max-w-md rounded-2xl border border-line bg-paper p-6 shadow-xl outline-none ${animate ? 'transition-transform' : ''}`}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-full bg-rose/10 px-2.5 py-1 text-xs font-medium text-rose">
            {t('badge')}
          </span>
          <span className="text-xs text-muted tabular-nums">
            {t('step_label', { current: progress.stepIndex + 1, total: ONBOARDING_STEP_COUNT })}
          </span>
        </div>

        <h2 id="pk-onb-title" className="font-serif text-lg font-bold text-ink">
          {t(`step.${stepKey}_t`)}
        </h2>
        <p className="mt-2 text-sm text-muted">{t(`step.${stepKey}_b`)}</p>

        {/* progress dots */}
        <div className="mt-4 flex items-center gap-1.5" aria-hidden>
          {Array.from({ length: ONBOARDING_STEP_COUNT }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i <= progress.stepIndex ? 'bg-rose' : 'bg-line'}`}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <button data-testid="pk-onb-skip" onClick={closePaused} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-ink">
              {t('skip')}
            </button>
            <button data-testid="pk-onb-dontshow" onClick={onDontShow} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-ink">
              {t('dont_show')}
            </button>
          </div>
          <div className="flex gap-2">
            {progress.stepIndex > 0 && (
              <button data-testid="pk-onb-back" onClick={onBack} className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-rose">
                {t('back')}
              </button>
            )}
            <button data-testid="pk-onb-next" onClick={onNext} className="rounded-lg bg-rose px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              {last ? t('done') : t('next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
