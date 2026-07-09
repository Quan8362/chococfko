'use client'

// First-time ONBOARDING tour overlay. Pure model lives in lib/games/poker/learn/onboarding.ts;
// this component owns persistence (localStorage), rendering, accessibility and analytics only.
// It never blocks experienced players: it auto-shows only for someone who hasn't finished or opted
// out, and is always re-openable from the Learn hub (window event 'poker:onboarding').

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePokerPrefs } from './prefs'
import { Icon } from './icons'
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

  // Esc pauses the tour (never permanently dismisses); Tab is trapped inside the dialog.
  useEffect(() => {
    if (!open) return
    dialogRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closePaused()
        return
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closePaused])

  if (!open) return null

  const stepKey = ONBOARDING_STEPS[progress.stepIndex]
  const last = isLastStep(progress)
  const animate = prefs.animation && !prefs.reducedMotion

  const pct = Math.round(((progress.stepIndex + 1) / ONBOARDING_STEP_COUNT) * 100)

  return (
    <div
      className="pk-dialog-backdrop"
      style={{ placeItems: 'center' }}
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
        className={`pk-dialog max-h-[90dvh] max-w-md overflow-y-auto p-0 outline-none ${animate ? 'pk-fade-up' : ''}`}
      >
        {/* Header — plum band with step number + progress. */}
        <div className="pk-plum pk-plum-violet px-6 py-4">
          <div className="flex items-center justify-between gap-2">
            <span className="pk-badge pk-badge-onplum">
              <Icon name="graduationCap" size={13} /> {t('badge')}
            </span>
            <span className="text-xs font-medium tabular-nums text-[color:var(--pkp-on-plum-2)]">
              {t('step_label', { current: progress.stepIndex + 1, total: ONBOARDING_STEP_COUNT })}
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:rgba(255,255,255,0.14)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-[color:var(--pkp-gold-soft)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <h2 id="pk-onb-title" className="font-serif text-xl font-bold text-[color:var(--pkp-ink)]">
            {t(`step.${stepKey}_t`)}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--pkp-ink-2)]">{t(`step.${stepKey}_b`)}</p>

          <div className="mt-6 flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              <button data-testid="pk-onb-skip" onClick={closePaused} className="pk-btn pk-btn-ghost pk-btn-sm">
                {t('skip')}
              </button>
              <button data-testid="pk-onb-dontshow" onClick={onDontShow} className="pk-btn pk-btn-ghost pk-btn-sm">
                {t('dont_show')}
              </button>
            </div>
            <div className="flex gap-2">
              {progress.stepIndex > 0 && (
                <button data-testid="pk-onb-back" onClick={onBack} className="pk-btn pk-btn-secondary pk-btn-sm">
                  <Icon name="chevronLeft" size={15} /> {t('back')}
                </button>
              )}
              <button data-testid="pk-onb-next" onClick={onNext} className="pk-btn pk-btn-primary pk-btn-sm">
                {last ? t('done') : t('next')}
                {!last && <Icon name="chevronRight" size={15} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
