'use client'

// ── Poker quick-reaction UI — trigger + panel + seat-anchored bubbles ─────────────────────────
//
// Premium charcoal / champagne-gold identity (NOT the Tiến Lên red-brown). The trigger lives in
// the hero band's right column (beside the action controls, never over Fold/Check/Call/Bet/Raise,
// the timer, cards, stack, or the community board). The panel is a compact popover that opens
// UPWARD and stays inside the viewport; picking a reaction sends it and closes. Bubbles anchor to
// each sender's seat via the SAME geometry the seat pods use, so a reaction always lands on the
// right seat on every client (the seat index is server-authoritative).

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { setPref, usePokerPrefs } from '../_eco/prefs'
import { visualPosition, type TableGeometry } from '@/lib/games/poker/seatLayout'
import { CATEGORY_ORDER, REACTIONS, type ReactionCategory } from '@/lib/games/poker/reactions'
import type { ReactionBubble, SendReactionOutcome } from '../[tableId]/usePokerReactions'

type RT = ReturnType<typeof useTranslations>

// ── Trigger + popover panel ───────────────────────────────────────────────────────────────────
export function PokerReactionTrigger({
  send,
  compact = false,
}: {
  send: (key: string) => Promise<SendReactionOutcome>
  compact?: boolean
}) {
  const t = useTranslations('games.poker.reactions')
  const prefs = usePokerPrefs()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<ReactionCategory>('friendly')
  const [cooling, setCooling] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const coolTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close on outside click / Escape; move focus into the panel on open and back to the trigger
  // on close (dialog focus semantics).
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    const focusId = window.setTimeout(() => panelRef.current?.focus(), 0)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.clearTimeout(focusId)
    }
  }, [open])

  // Return focus to the trigger when the panel closes (but not on first mount).
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (wasOpenRef.current && !open) triggerRef.current?.focus()
    wasOpenRef.current = open
  }, [open])

  useEffect(() => () => { if (coolTimer.current) clearTimeout(coolTimer.current) }, [])

  const flashCooldown = useCallback(() => {
    setCooling(true)
    if (coolTimer.current) clearTimeout(coolTimer.current)
    coolTimer.current = setTimeout(() => setCooling(false), 1600)
  }, [])

  const pick = useCallback(
    async (key: string) => {
      // Close immediately (reaction chosen); the send resolves in the background.
      setOpen(false)
      const res = await send(key)
      if (res === 'cooldown') flashCooldown()
    },
    [send, flashCooldown],
  )

  const tabReactions = useMemo(() => REACTIONS.filter((r) => r.category === tab), [tab])

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-testid="poker-reaction-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('trigger_label')}
        title={t('trigger_label')}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="pk-rx-trigger"
        style={compact ? { width: 36, height: 36 } : undefined}
      >
        <svg width={compact ? 18 : 20} height={compact ? 18 : 20} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
          <path strokeLinecap="round" strokeWidth={1.8} d="M9 11h.01M15 11h.01M9.2 14a3.6 3.6 0 005.6 0" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t('panel_title')}
          tabIndex={-1}
          data-testid="poker-reaction-panel"
          className="pk-rx-panel absolute right-0 bottom-full mb-2 z-[130] w-[330px] max-w-[calc(100vw-24px)] p-2.5 outline-none"
        >
          {/* Tabs — four full-label categories (never truncated). */}
          <div className="pk-rx-tabs flex items-center gap-1 p-1 mb-2.5" role="tablist" aria-label={t('panel_title')}>
            {CATEGORY_ORDER.map((cat) => (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={tab === cat}
                onClick={() => setTab(cat)}
                className="pk-rx-tab flex-1 px-1.5 py-1.5 text-[10.5px] font-bold leading-tight whitespace-nowrap"
              >
                {t(`tab_${cat}` as Parameters<RT>[0])}
              </button>
            ))}
          </div>

          {/* Reaction grid — emoji + full localized phrase (wraps rather than truncating). */}
          <div className="grid grid-cols-2 gap-1.5 max-h-[228px] overflow-y-auto overscroll-contain pr-0.5">
            {tabReactions.map((r) => {
              const label = t(`phrase.${r.key}` as Parameters<RT>[0])
              return (
                <button
                  key={r.key}
                  type="button"
                  data-testid="poker-reaction-opt"
                  data-key={r.key}
                  onClick={() => void pick(r.key)}
                  aria-label={label}
                  className="pk-rx-opt px-2 py-1.5 text-[12px] font-semibold min-h-[42px]"
                >
                  <span aria-hidden className="pk-rx-ico text-[15px]">{r.emoji}</span>
                  <span className="flex-1">{label}</span>
                </button>
              )
            })}
          </div>

          {/* Footer: cooldown hint + receive toggle ("Tắt tương tác"). */}
          <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-[rgba(201,161,74,0.16)]">
            <span
              className={`text-[11px] font-bold transition-opacity ${cooling ? 'opacity-100' : 'opacity-0'}`}
              style={{ color: 'var(--pk-gold-soft)' }}
              aria-live="polite"
            >
              {cooling ? t('cooldown') : ''}
            </span>
            <button
              type="button"
              data-testid="poker-reaction-mute"
              onClick={() => setPref('interactions', !prefs.interactions)}
              aria-pressed={!prefs.interactions}
              className="pk-rx-foot text-[11px] font-bold px-2.5 py-1 whitespace-nowrap"
            >
              {prefs.interactions ? t('mute') : t('unmute')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Seat-anchored bubble layer ────────────────────────────────────────────────────────────────
// Rendered INSIDE the table's inner play area so it shares the seat pods' % coordinate space.
// Each bubble maps its (server-authoritative) sender seat → this viewer's visual position → the
// pod anchor, so bubbles never land on the wrong seat. pointer-events:none so gameplay taps pass
// through. A polite live region announces incoming reactions for screen readers (latest only).
export function PokerReactionBubbleLayer({
  bubbles,
  geom,
  viewerSeatIndex,
  capacity,
  lastAnnounceKey,
}: {
  bubbles: readonly ReactionBubble[]
  geom: TableGeometry
  viewerSeatIndex: number | null
  capacity: number
  lastAnnounceKey: string | null
}) {
  const t = useTranslations('games.poker.reactions')
  return (
    <>
      {bubbles.map((b) => {
        const pos = visualPosition(b.seat, viewerSeatIndex, capacity)
        const anchor = geom.seats[pos] ?? geom.seats[0]
        if (!anchor) return null
        const label = t(`phrase.${b.key}` as Parameters<RT>[0])
        // Very-top seats (heads-up villain, top rail) place the bubble just below the pod so it is
        // never clipped by the top edge; every other seat places it above the pod.
        const below = anchor.yPct < 24
        const style: CSSProperties = {
          position: 'absolute',
          left: `${anchor.xPct}%`,
          top: `${anchor.yPct}%`,
          transform: 'translate(-50%, -50%)',
        }
        return (
          <div key={b.seat} className="pointer-events-none z-[36]" style={style} data-testid="poker-reaction-bubble" data-seat={b.seat}>
            <div
              key={b.nonce}
              className="pk-rx-bubble"
              style={{
                position: 'absolute',
                left: '50%',
                transform: below ? 'translate(-50%, 30px)' : 'translate(-50%, calc(-100% - 26px))',
              }}
            >
              <span aria-hidden className="pk-rx-bubble__emoji">{b.emoji}</span>
              <span>{label}</span>
            </div>
          </div>
        )
      })}
      {/* Polite a11y announcement of the most recent reaction (bounded to latest, so repeated
          reactions never flood a screen reader). */}
      <span className="sr-only" aria-live="polite" data-testid="poker-reaction-live">
        {lastAnnounceKey ? t(`phrase.${lastAnnounceKey}` as Parameters<RT>[0]) : ''}
      </span>
    </>
  )
}
