'use client'

// ── Overlays — WinnerHighlight · InlineGameMessage · RotateDeviceOverlay ─────────────────────
//
// Presentation-only surfaces. None of these gate or infer authoritative state.

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { formatCoinsShort } from '@/lib/game/economy'

// ── WinnerHighlight — celebratory banner shown over the table at settlement ──────────────────
// Announces the winner(s), amount won, and (when revealed) the winning hand name. The per-seat
// gold glow lives on PlayerSeat; this is the centre-stage callout.
export function WinnerHighlight({
  winnerName,
  amount,
  handName,
}: {
  winnerName: string
  amount?: number
  handName?: string
}) {
  const t = useTranslations('games.poker')
  return (
    <div
      role="status"
      className="pk-anim-fadeup inline-flex flex-col items-center gap-1 rounded-2xl px-6 py-3"
      style={{
        background: 'linear-gradient(180deg, rgba(40,33,24,0.96), rgba(13,11,17,0.96))',
        border: '1px solid var(--pk-gold)',
        boxShadow: '0 0 28px -4px rgba(230,207,149,0.5), var(--pk-shadow-raised)',
      }}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--pk-gold-soft)' }}>
        {t('overlay.winner')}
      </span>
      <span className="flex items-center gap-2">
        <span aria-hidden style={{ fontSize: 18 }}>
          ♛
        </span>
        <span className="font-extrabold" style={{ color: 'var(--pk-text-hi)', fontSize: 18 }}>
          {winnerName}
        </span>
      </span>
      {amount != null && (
        <span className="font-bold tabular-nums" style={{ color: 'var(--pk-gold-soft)', fontSize: 16 }}>
          +{formatCoinsShort(amount)}
        </span>
      )}
      {handName && (
        <span className="text-[12px]" style={{ color: 'var(--pk-text-mid)' }}>
          {handName}
        </span>
      )}
    </div>
  )
}

// ── InlineGameMessage — small status line (your-turn / waiting / reconnecting / error) ───────
export type InlineTone = 'info' | 'success' | 'warning' | 'danger' | 'turn'

export function InlineGameMessage({
  tone = 'info',
  children,
  pulse = false,
}: {
  tone?: InlineTone
  children: React.ReactNode
  pulse?: boolean
}) {
  const toneStyle: Record<InlineTone, { border: string; fg: string }> = {
    info: { border: 'var(--pk-gold-line)', fg: 'var(--pk-text-mid)' },
    success: { border: 'rgba(47,158,111,0.6)', fg: 'var(--pk-emerald)' },
    warning: { border: 'rgba(217,152,54,0.6)', fg: 'var(--pk-amber)' },
    danger: { border: 'rgba(157,43,63,0.7)', fg: 'var(--pk-pink-soft)' },
    turn: { border: 'var(--pk-gold)', fg: 'var(--pk-gold-soft)' },
  }
  const s = toneStyle[tone]
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${pulse ? 'pk-anim-actor' : ''}`}
      style={{ background: 'rgba(0,0,0,0.55)', border: `1px solid ${s.border}`, color: s.fg }}
    >
      {children}
    </span>
  )
}

// ── UpdateAvailableBanner — non-blocking "a newer version is live" affordance ────────────────
// Surfaced ONLY between hands (the caller gates on shouldPromptUpdate) so it never interrupts play.
// Presentation only: it neither reloads on its own nor mutates authoritative state — the reload is
// a deliberate tap on the Update button. `urgent` (a protocol mismatch) tints it and is shown even
// while the action bar is blocked, so a hard-incompatible client always has a way forward.
export function UpdateAvailableBanner({
  onUpdate,
  urgent = false,
}: {
  onUpdate: () => void
  urgent?: boolean
}) {
  const t = useTranslations('games.poker')
  const color = urgent ? 'var(--pk-amber)' : 'var(--pk-gold-line)'
  return (
    <span
      role="status"
      data-testid="poker-update-banner"
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
      style={{ background: 'rgba(0,0,0,0.6)', border: `1px solid ${color}`, color: 'var(--pk-text-hi)' }}
    >
      <span aria-hidden>⟳</span>
      <span>{urgent ? t('update.required') : t('update.available')}</span>
      <button
        type="button"
        onClick={onUpdate}
        data-testid="poker-update-apply"
        className="rounded-full px-2.5 py-0.5 text-[12px] font-bold active:scale-[0.98]"
        style={{ background: 'var(--pk-gold)', color: '#1a1206' }}
      >
        {t('update.reload')}
      </button>
    </span>
  )
}

// ── RotateDeviceOverlay — the polished portrait fallback (NOT an error) ──────────────────────
// Full-screen, premium "rotate your device" screen shown whenever orientation is portrait. No
// gameplay is rendered in portrait; this transitions back to the table on rotation.
//
// It NEVER mutates authoritative state: the existing hand keeps running underneath and is restored
// verbatim on the next landscape frame. It only *surfaces* the two things a portrait player still
// needs — how long they have to act (a read-only countdown off the server deadline) and a safe
// Leave control (a deliberate, explicit user action, not an overlay side-effect).
export function RotateDeviceOverlay({
  deadlineMs = null,
  onLeave,
  leaveLabel,
}: {
  /** authoritative turn deadline (epoch ms) when it is the viewer's turn, else null */
  deadlineMs?: number | null
  onLeave?: () => void
  leaveLabel?: string
} = {}) {
  const t = useTranslations('games.poker')

  // Read-only ticking countdown off the server deadline (presentation only — never enforces it).
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    if (deadlineMs == null) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [deadlineMs])
  const secondsLeft = deadlineMs != null ? Math.max(0, Math.ceil((deadlineMs - now) / 1000)) : null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-8 text-center"
      style={{
        background: 'radial-gradient(120% 80% at 50% 30%, #16131b 0%, #07060a 100%)',
        paddingTop: 'var(--pk-safe-top)',
        paddingBottom: 'var(--pk-safe-bottom)',
      }}
      role="dialog"
      aria-label={t('rotate.title')}
    >
      {/* rotating phone glyph */}
      <svg width={84} height={84} viewBox="0 0 96 96" aria-hidden className="pk-anim-rotate-hint" style={{ color: 'var(--pk-gold-soft)' }}>
        <rect x="34" y="14" width="28" height="50" rx="5" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="48" cy="58" r="2.4" fill="currentColor" />
        <path
          d="M22 78 A 40 40 0 0 1 74 78"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray="3 5"
          opacity="0.6"
        />
        <path d="M74 78 l6 -3 l-1 7 z" fill="currentColor" opacity="0.8" />
      </svg>

      <div className="flex flex-col gap-2 max-w-xs">
        <h2 className="font-serif" style={{ color: 'var(--pk-gold-soft)', fontSize: 24 }}>
          {t('rotate.title')}
        </h2>
        <p style={{ color: 'var(--pk-text-mid)', fontSize: 15, lineHeight: 1.5 }}>{t('rotate.message')}</p>
      </div>

      <span
        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-semibold"
        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--pk-gold-line)', color: 'var(--pk-text-low)' }}
      >
        {t('rotate.hint')}
      </span>

      {/* Remaining action time — so a player rotating mid-turn still knows the clock is running. */}
      {secondsLeft != null && (
        <span
          role="timer"
          aria-live="polite"
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold tabular-nums"
          style={{
            background: 'rgba(0,0,0,0.5)',
            border: `1px solid ${secondsLeft <= 5 ? 'var(--pk-amber)' : 'var(--pk-gold-line)'}`,
            color: secondsLeft <= 5 ? 'var(--pk-amber)' : 'var(--pk-gold-soft)',
          }}
        >
          {t('rotate.time_left', { s: secondsLeft })}
        </span>
      )}

      {/* Safe access to leave the table without rotating (does not touch the hand otherwise). */}
      {onLeave && (
        <button
          type="button"
          onClick={onLeave}
          data-testid="poker-rotate-leave"
          className="inline-flex items-center justify-center rounded-full px-5 py-2 text-[13px] font-semibold active:scale-[0.98]"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--pk-burgundy)', color: 'var(--pk-pink-soft)' }}
        >
          {leaveLabel ?? t('hud.leave')}
        </button>
      )}
    </div>
  )
}
