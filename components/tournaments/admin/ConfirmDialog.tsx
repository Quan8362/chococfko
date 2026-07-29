'use client'

import { useEffect, useId, useRef } from 'react'

// Keep the latest value in a ref so the focus/escape effects can stay keyed on `open` alone
// (a fresh onCancel identity each parent render must not re-run — and re-trigger — the focus effect).

// Generic confirm modal for destructive / state-changing admin actions (archive, delete).
// Tone drives the confirm button + icon colour; all text is passed in already localized.
// Accessibility (Prompt 12): labelled by its title + described by its body, focuses the confirm
// button on open and restores focus to the opener on close, Escape-closable.
export default function ConfirmDialog({
  open,
  icon,
  tone = 'danger',
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  pending = false,
}: {
  open: boolean
  icon: string
  tone?: 'danger' | 'warning'
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  pending?: boolean
}) {
  const titleId = useId()
  const descId = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  // Focus management, keyed on `open` only: capture the opener, move focus to the confirm button,
  // and restore focus to the opener on close. Independent of onCancel/pending identity so it does not
  // re-run (and steal focus back) on unrelated parent re-renders — stable under React StrictMode too.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    confirmRef.current?.focus()
    return () => {
      opener?.focus?.()
    }
  }, [open])

  // Escape-to-cancel, reading the latest pending/onCancel through refs so this effect also stays on `open`.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pendingRef.current) onCancelRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const iconBox =
    tone === 'danger'
      ? 'bg-red-50 border-red-200'
      : 'bg-amber-50 border-amber-200'
  const confirmBtn =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700'
      : 'bg-amber-500 hover:bg-amber-600'

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClick={() => {
        if (!pending) onCancel()
      }}
    >
      <div
        className="w-full max-w-[400px] bg-paper border border-line rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className={`flex-none w-10 h-10 rounded-xl border grid place-items-center text-[18px] ${iconBox}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <h3 id={titleId} className="font-serif font-bold text-[17px] text-ink leading-snug">{title}</h3>
            <p id={descId} className="text-[13px] text-muted mt-1 leading-relaxed">{description}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="font-semibold text-[13px] px-4 py-2 rounded-full border border-line bg-cream text-[#5c4d44] hover:bg-line/60 transition-colors disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`font-semibold text-[13px] px-4 py-2 rounded-full text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${confirmBtn}`}
          >
            {pending ? '⏳' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
