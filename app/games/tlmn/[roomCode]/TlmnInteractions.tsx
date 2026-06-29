'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import {
  PHRASES, CATEGORY_ORDER, THROWABLES, THROW_TIMING, getThrowable, resolveConfig, REPORT_REASONS,
  type InteractionCategory, type ThrowImpact, type CatalogConfig, type ReportReason,
} from '@/lib/games/tlmn/interactions'
import type { Bubble, Throw } from './useTlmnInteractions'

type T = ReturnType<typeof useTranslations>
type TabKey = InteractionCategory | 'items'

// Per-category accent — controlled, all within the burgundy/gold game palette. Each tab
// gets its own character (warm rose / amber / festive gold / coral / premium plum) while
// the panel surface keeps everything cohesive. Saturated enough that white tab text reads.
const TAB_ACCENT: Record<TabKey, string> = {
  friendly: '#d85f8f',
  teasing: '#cf8330',
  celebration: '#c79a2e',
  frustrated: '#c85539',
  items: '#9a63bf',
}

// ── Reaction control: chrome button + compact floating panel (Phase 1) ────────────────
// Lives in the table's top chrome row (a small toolbar, beside the sound toggle) so it
// never overlaps the cards, centre pile, sort/play/pass controls or any seat. The panel
// is a compact floating popover (works identically on mobile + desktop) with the four
// category tabs from the spec; picking a phrase sends it and closes the panel. A muted
// player can re-enable reactions from the panel footer.
export function ReactionControl({
  t, sendPhrase, onPickThrowable, catalog, muted, onToggleMuted,
}: {
  t: T
  sendPhrase: (key: string) => 'ok' | 'cooldown' | 'noseat'
  // Picking a throwable doesn't send immediately — it hands the key back so the table can
  // enter target-selection mode (the throwable needs a chosen opponent).
  onPickThrowable: (key: string) => void
  // Phase 3 admin-config: hides disabled items + drives the per-item cost badge.
  catalog: Map<string, CatalogConfig>
  muted: boolean
  onToggleMuted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<TabKey>('friendly')
  const [cooling, setCooling] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const coolTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => () => { if (coolTimer.current) clearTimeout(coolTimer.current) }, [])

  const pick = (key: string) => {
    const res = sendPhrase(key)
    if (res === 'ok') { setOpen(false); return }
    if (res === 'cooldown') {
      setCooling(true)
      if (coolTimer.current) clearTimeout(coolTimer.current)
      coolTimer.current = setTimeout(() => setCooling(false), 1600)
    }
  }

  const tabPhrases = PHRASES.filter(p => p.category === tab)

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        data-testid="reaction-btn"
        onClick={() => setOpen(o => !o)}
        aria-label={t('react_btn')}
        title={t('react_btn')}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="tlmn-chrome"
      >
        {/* Smiley reaction glyph */}
        <svg width={18} height={18} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" strokeWidth={2} />
          <path strokeLinecap="round" strokeWidth={2} d="M9 10h.01M15 10h.01M8.5 14.5a4.5 4.5 0 007 0" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('react_panel_title')}
          className="tlmn-banner-pop tlmn-rx-panel absolute right-0 top-full mt-2 z-[95] w-[312px] max-w-[calc(100vw-24px)] p-2.5"
          style={{ ['--acc' as string]: TAB_ACCENT[tab] }}
        >
          {/* Tabs (4 phrase categories + the throwable items tab) */}
          <div className="tlmn-rx-tabs flex items-center gap-0.5 p-1 mb-2.5" role="tablist" aria-label={t('react_panel_title')}>
            {([...CATEGORY_ORDER, 'items'] as TabKey[]).map(cat => (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={tab === cat}
                onClick={() => setTab(cat)}
                style={{ ['--acc' as string]: TAB_ACCENT[cat] }}
                className="tlmn-rx-tab flex-1 px-1 py-1.5 text-[10.5px] font-bold leading-tight truncate"
              >
                {t(`react_tab_${cat}` as Parameters<T>[0])}
              </button>
            ))}
          </div>

          {tab === 'items' ? (
            /* Throwable grid — picking an item arms target-selection (no immediate send).
               Disabled items (admin) are hidden; the cost badge shows Free or the xu price. */
            <div className="grid grid-cols-2 gap-1.5 max-h-[244px] overflow-y-auto overscroll-contain pr-0.5">
              {THROWABLES.filter(it => resolveConfig(it.key, catalog).enabled).map(it => {
                const label = t(`react_item_${it.key}` as Parameters<T>[0])
                const cfg = resolveConfig(it.key, catalog)
                const free = cfg.cost === 0
                return (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => { onPickThrowable(it.key); setOpen(false) }}
                    aria-label={free ? label : `${label} · ${cfg.cost} xu`}
                    className="tlmn-rx-opt px-2 py-1.5 text-[12.5px] font-semibold min-h-[42px]"
                  >
                    <span aria-hidden className="tlmn-rx-ico text-[16px]">{it.emoji}</span>
                    <span className="truncate flex-1">{label}</span>
                    <span className={`flex-none text-[10px] font-black rounded-full px-1.5 py-0.5 ${free ? 'tlmn-rx-cost-free' : 'tlmn-rx-cost-paid'}`}>
                      {free ? t('react_free') : `🪙${cfg.cost >= 1000 ? `${(cfg.cost / 1000).toFixed(cfg.cost % 1000 ? 1 : 0)}K` : cfg.cost}`}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            /* Phrase grid */
            <div className="grid grid-cols-2 gap-1.5 max-h-[244px] overflow-y-auto overscroll-contain pr-0.5">
              {tabPhrases.map(p => {
                const label = t(`react_phrase_${p.key}` as Parameters<T>[0])
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => pick(p.key)}
                    aria-label={label}
                    className="tlmn-rx-opt px-2 py-1.5 text-[12.5px] font-semibold min-h-[42px]"
                  >
                    <span aria-hidden className="tlmn-rx-ico text-[15px]">{p.emoji}</span>
                    <span className="truncate flex-1">{label}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Footer: cooldown hint + mute toggle */}
          <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-[rgba(246,217,137,0.16)]">
            <span className={`text-[11px] font-bold text-[#f1d68c] transition-opacity ${cooling ? 'opacity-100' : 'opacity-0'}`}>
              {t('react_cooldown')}
            </span>
            <button
              type="button"
              onClick={onToggleMuted}
              className="tlmn-rx-foot text-[11px] font-bold px-2.5 py-1 whitespace-nowrap"
            >
              {muted ? t('react_unmute_all') : t('react_mute_all')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Phrase-bubble overlay ─────────────────────────────────────────────────────────────
// One speech bubble per active seat, anchored to the seat's avatar centre via the table's
// own seat geometry (`anchorStyle`). pointer-events:none + absolute so it never shifts the
// layout or blocks card/button taps. For the TOP seat the bubble hangs BELOW the avatar
// (above would spill off the felt); every other seat shows it above.
export function PhraseBubbleLayer({
  bubbles, anchorStyle, placeOf, t,
}: {
  bubbles: Bubble[]
  anchorStyle: (seat: number) => CSSProperties
  placeOf: (seat: number) => string
  t: T
}) {
  return (
    <>
      {bubbles.map(b => {
        const place = placeOf(b.seat)
        const below = place === 'top'
        const label = t(`react_phrase_${b.phraseKey}` as Parameters<T>[0])
        return (
          <div key={b.seat} className="absolute z-30 pointer-events-none" style={anchorStyle(b.seat)}>
            <div
              key={b.nonce}
              className="tlmn-react-bubble"
              style={{
                position: 'absolute',
                left: '50%',
                transform: below
                  ? 'translate(-50%, 34px)'
                  : 'translate(-50%, calc(-100% - 30px))',
              }}
            >
              <span aria-hidden className="text-[14px] leading-none flex-none">{PHRASE_EMOJI[b.phraseKey] ?? '💬'}</span>
              <span className="whitespace-nowrap">{label}</span>
            </div>
          </div>
        )
      })}
    </>
  )
}

const PHRASE_EMOJI: Record<string, string> = Object.fromEntries(PHRASES.map(p => [p.key, p.emoji]))

// ── Opponent context menu (Phase 4) ───────────────────────────────────────────────────
// A small popover anchored at an opponent's seat with Mute/Unmute + Report. A full-screen
// transparent backdrop closes it on an outside tap; Escape also closes (handled by caller).
export function OpponentMenu({
  style, name, muted, onMute, onReport, onClose, t,
}: {
  style: CSSProperties
  name: string
  muted: boolean
  onMute: () => void
  onReport: () => void
  onClose: () => void
  t: T
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <button type="button" aria-label={t('react_cancel')} onClick={onClose} className="absolute inset-0 z-[61] cursor-default" />
      <div className="absolute z-[62]" style={style}>
        <div className="tlmn-banner-pop absolute left-1/2 -translate-x-1/2 -translate-y-[calc(100%+12px)] w-[180px] rounded-xl bg-paper shadow-2xl border border-line overflow-hidden">
          <p className="px-3 py-2 text-[11px] font-bold text-muted truncate border-b border-line">{name}</p>
          <button type="button" onClick={onMute} className="w-full text-left px-3 py-2.5 text-[13px] font-semibold text-ink hover:bg-rose/10 flex items-center gap-2">
            <span aria-hidden>{muted ? '🔈' : '🔇'}</span>{muted ? t('react_unmute_player') : t('react_mute_player')}
          </button>
          <button type="button" onClick={onReport} className="w-full text-left px-3 py-2.5 text-[13px] font-semibold text-rose hover:bg-rose/10 flex items-center gap-2 border-t border-line">
            <span aria-hidden>🚩</span>{t('react_report')}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Report dialog (Phase 4) — reason picker, centered modal ────────────────────────────
export function ReportDialog({
  name, onSubmit, onClose, t,
}: {
  name: string
  onSubmit: (reason: ReportReason) => void
  onClose: () => void
  t: T
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div role="dialog" aria-modal="true" aria-label={t('react_report')} className="absolute inset-0 z-[80] flex items-center justify-center px-4" style={{ background: 'rgba(6,14,10,0.6)' }}>
      <button type="button" aria-label={t('react_cancel')} onClick={onClose} className="absolute inset-0" />
      <div className="tlmn-banner-pop relative w-full max-w-[320px] rounded-2xl bg-paper shadow-2xl border border-line p-4">
        <p className="text-[14px] font-bold text-ink mb-1">{t('react_report_title')}</p>
        <p className="text-[12px] text-muted mb-3 truncate">{name}</p>
        <div className="flex flex-col gap-1.5">
          {REPORT_REASONS.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => onSubmit(r)}
              className="w-full text-left rounded-xl border border-line bg-cream/60 px-3 py-2.5 text-[13px] font-semibold text-ink hover:bg-rose/10 hover:border-rose/30 transition-colors"
            >
              {t(`react_report_${r}` as Parameters<T>[0])}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="mt-3 w-full rounded-xl bg-ink/5 text-muted text-[13px] font-bold py-2 hover:bg-ink/10">
          {t('react_cancel')}
        </button>
      </div>
    </div>
  )
}

// ── Throwable overlay (Phase 2) ───────────────────────────────────────────────────────
// A table-level overlay that animates each active throw from the sender's seat to the
// target's seat, then plays an impact burst there. pointer-events:none + absolute so it
// never blocks gameplay. `coordOf` maps a seat index to pixel coords inside the board box
// (resolved by the table from the SAME seat geometry the pods use). Concurrency is already
// capped in the hook; this just renders whatever is active.
export function ThrowableLayer({
  throws, coordOf, reduced, onImpact,
}: {
  throws: Throw[]
  coordOf: (seat: number) => { x: number; y: number }
  reduced: boolean
  // Fired the instant a throw reaches its target (flight done), so the table can recoil the
  // real target-avatar DOM in sync with the burst. Cosmetic only.
  onImpact?: (toSeat: number, key: string) => void
}) {
  return (
    <div data-throwable-layer className="absolute inset-0 z-[35] pointer-events-none overflow-hidden">
      {throws.map(thr => (
        <ThrowableItem key={thr.id} thr={thr} from={coordOf(thr.fromSeat)} to={coordOf(thr.toSeat)} reduced={reduced} onImpact={onImpact} />
      ))}
    </div>
  )
}

function ThrowableItem({
  thr, from, to, reduced, onImpact,
}: {
  thr: Throw
  from: { x: number; y: number }
  to: { x: number; y: number }
  reduced: boolean
  onImpact?: (toSeat: number, key: string) => void
}) {
  const def = getThrowable(thr.key)
  // Reduced-motion (or before flight finishes) gate: skip the flight, show only the impact.
  const [phase, setPhase] = useState<'fly' | 'impact'>(reduced ? 'impact' : 'fly')
  const firedRef = useRef(false)
  const fireImpact = () => {
    if (firedRef.current) return // one recoil per throw, never twice
    firedRef.current = true
    if (def) onImpact?.(thr.toSeat, thr.key)
  }
  // Reduced motion starts directly in the impact phase → fire the recoil on mount.
  useEffect(() => { if (reduced) fireImpact() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!def) return null

  const flySec = THROW_TIMING.flyMs / 1000
  // Parabolic arc: lift the midpoint well above the higher of the two endpoints.
  const peakY = Math.min(from.y, to.y) - 70

  return (
    <>
      {phase === 'fly' && (
        <motion.div
          className="absolute left-0 top-0 will-change-transform"
          initial={{ x: from.x, y: from.y, scale: 0.6, opacity: 0 }}
          animate={{
            x: [from.x, (from.x + to.x) / 2, to.x],
            y: [from.y, peakY, to.y],
            scale: [0.7, 1.08, 1],
            opacity: [0.4, 1, 1],
            rotate: def.spin ? [0, 220, 430] : 0,
          }}
          transition={{ duration: flySec, ease: 'easeInOut', times: [0, 0.5, 1] }}
          onAnimationComplete={() => { fireImpact(); setPhase('impact') }}
        >
          <span className="block text-[30px] leading-none" style={{ transform: 'translate(-50%, -50%)' }} aria-hidden>
            {def.emoji}
          </span>
        </motion.div>
      )}
      {phase === 'impact' && (
        <div className="absolute" style={{ left: to.x, top: to.y }}>
          <span className="block" style={{ transform: 'translate(-50%, -50%)' }}>
            <ImpactBurst impact={def.impact} emoji={def.emoji} reduced={reduced} />
          </span>
        </div>
      )}
    </>
  )
}

// CSS-driven impact burst. Archetypes reuse a small set of polished effects (core glyph +
// expanding ring + a few floating particles) so the lighter items feel distinct without 10
// bespoke animations. The two "prank" hits — tomato (splat) and bomb (boom) — get bespoke,
// particle-based effects anchored to the target avatar (real geometry, no pasted emoji).
// Reduced-motion shows a brief static glyph only.
const IMPACT_PARTICLES: Partial<Record<ThrowImpact, string[]>> = {
  hearts: ['💗', '💕', '💗'],
  bloom: ['🌸', '✨', '🌼'],
  confetti: ['🎉', '✨', '🎊'],
}

// Pre-computed radial spreads so each droplet/spark/smoke puff flies a different way without
// a bespoke keyframe per particle (direction is fed in as CSS custom props --tx/--ty/--rot).
function radial(n: number, dist: number, jitter = 0): { tx: number; ty: number; ang: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const ang = (i / n) * Math.PI * 2 + (i % 2 ? 0.5 : 0)
    const d = dist * (1 - jitter + jitter * ((i * 37) % 100) / 100)
    return { tx: Math.cos(ang) * d, ty: Math.sin(ang) * d - 6, ang: (ang * 180) / Math.PI }
  })
}
const TOMATO_DROPS = radial(7, 46, 0.45)
const TOMATO_SEEDS = radial(5, 30, 0.5)
const BOMB_SPARKS = radial(10, 60, 0.55)
const BOMB_SMOKE = radial(5, 26, 0.4)
const BOMB_DEBRIS = radial(6, 50, 0.6)

// Tomato: a wet squash-and-burst — irregular red splatter decal across the avatar, flying
// pulp droplets + a few seeds. Playful, not violent; clears in ~1.2s.
function SplatImpact() {
  return (
    <span className="tlmn-splat" aria-hidden>
      <span className="tlmn-splat-decal" />
      <span className="tlmn-splat-core" />
      <span className="tlmn-impact-ring tlmn-impact--splat-ring" />
      {TOMATO_DROPS.map((p, i) => (
        <span
          key={`d${i}`}
          className="tlmn-splat-drop"
          style={{ ['--tx' as string]: `${p.tx}px`, ['--ty' as string]: `${p.ty}px`, ['--d' as string]: `${0.06 * (i % 4)}s` }}
        />
      ))}
      {TOMATO_SEEDS.map((p, i) => (
        <span
          key={`s${i}`}
          className="tlmn-splat-seed"
          style={{ ['--tx' as string]: `${p.tx}px`, ['--ty' as string]: `${p.ty}px`, ['--rot' as string]: `${p.ang}deg` }}
        />
      ))}
    </span>
  )
}

// Bomb: flash → fireball → shockwave + drifting smoke + sparks/debris. Noticeably stronger
// than the tomato; smoke dissipates over ~1.2s while the bright burst is ~0.5s.
function BoomImpact() {
  return (
    <span className="tlmn-boom" aria-hidden>
      <span className="tlmn-boom-flash" />
      <span className="tlmn-boom-shock" />
      <span className="tlmn-boom-shock tlmn-boom-shock--2" />
      <span className="tlmn-boom-fire" />
      {BOMB_SMOKE.map((p, i) => (
        <span
          key={`sm${i}`}
          className="tlmn-boom-smoke"
          style={{ ['--tx' as string]: `${p.tx}px`, ['--ty' as string]: `${p.ty - 14}px`, ['--d' as string]: `${0.04 * i}s` }}
        />
      ))}
      {BOMB_SPARKS.map((p, i) => (
        <span
          key={`sp${i}`}
          className="tlmn-boom-spark"
          style={{ ['--tx' as string]: `${p.tx}px`, ['--ty' as string]: `${p.ty}px`, ['--rot' as string]: `${p.ang}deg` }}
        />
      ))}
      {BOMB_DEBRIS.map((p, i) => (
        <span
          key={`db${i}`}
          className="tlmn-boom-debris"
          style={{ ['--tx' as string]: `${p.tx}px`, ['--ty' as string]: `${p.ty}px`, ['--rot' as string]: `${p.ang}deg` }}
        />
      ))}
    </span>
  )
}

function ImpactBurst({ impact, emoji, reduced }: { impact: ThrowImpact; emoji: string; reduced: boolean }) {
  const core = impact === 'boom' ? '💥' : impact === 'flash' ? '⚡' : emoji
  if (reduced) {
    // Reduced motion: a brief, calm static cue (no flying particles / repeated flashing).
    const glyph = impact === 'splat' ? '🍅' : impact === 'boom' ? '💥' : core
    return <span className="text-[30px] leading-none tlmn-impact-static" aria-hidden>{glyph}</span>
  }
  if (impact === 'splat') return <SplatImpact />
  if (impact === 'boom') return <BoomImpact />
  const particles = IMPACT_PARTICLES[impact]
  return (
    <span className={`tlmn-impact tlmn-impact--${impact}`} aria-hidden>
      <span className="tlmn-impact-ring" />
      <span className="tlmn-impact-core">{core}</span>
      {particles?.map((p, i) => (
        <span key={i} className={`tlmn-impact-particle tlmn-impact-particle--${i}`}>{p}</span>
      ))}
    </span>
  )
}
