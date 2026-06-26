'use client'

import { useEffect } from 'react'

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  pending = false,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  pending?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, pending, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={() => { if (!pending) onCancel() }}
    >
      <div
        className="w-full max-w-[400px] bg-paper border border-line rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex-none w-10 h-10 rounded-xl bg-red-50 border border-red-200 grid place-items-center text-[18px]">
            🗑️
          </div>
          <div className="min-w-0">
            <h3 className="font-serif font-bold text-[17px] text-ink leading-snug">{title}</h3>
            <p className="text-[13px] text-muted mt-1 leading-relaxed">{description}</p>
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
            className="font-semibold text-[13px] px-4 py-2 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pending ? '⏳' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
