'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { resetPrefs, setPref, usePokerPrefs, type PokerPrefKey } from '../_eco/prefs'
import { listMyBlocks, unblockPlayer } from '../ecosystem'
import { Icon, type IconName } from '../_eco/icons'
import PokerAvatar from '../_eco/PokerAvatar'
import { PageHeader, Eyebrow, EmptyState, type Tone } from '../_eco/ui'

// ── Section model ─────────────────────────────────────────────────────────────────────────────
type SectionKey = 'audio' | 'feedback' | 'display' | 'device' | 'accessibility' | 'privacy'
interface SectionDef {
  key: SectionKey
  icon: IconName
  tone: Tone
  prefs?: PokerPrefKey[]
}
const SECTIONS: SectionDef[] = [
  { key: 'audio', icon: 'volume', tone: 'ruby', prefs: ['sound', 'effects', 'music'] },
  { key: 'feedback', icon: 'vibrate', tone: 'emerald', prefs: ['timerWarning', 'vibration'] },
  { key: 'display', icon: 'sun', tone: 'amber', prefs: ['animation'] },
  { key: 'device', icon: 'monitor', tone: 'royal', prefs: ['wakeLock'] },
  { key: 'accessibility', icon: 'accessibility', tone: 'violet', prefs: ['reducedMotion'] },
  { key: 'privacy', icon: 'ban', tone: 'neutral' },
]

const PREF_META: Record<PokerPrefKey, { t: string; hint: string }> = {
  sound: { t: 'settings.sound', hint: 'settings.sound_hint' },
  effects: { t: 'settings.effects', hint: 'settings.effects_hint' },
  timerWarning: { t: 'settings.timer_warning', hint: 'settings.timer_warning_hint' },
  music: { t: 'settings.music', hint: 'settings.music_hint' },
  vibration: { t: 'settings.vibration', hint: 'settings.vibration_hint' },
  wakeLock: { t: 'settings.wake_lock', hint: 'settings.wake_lock_hint' },
  animation: { t: 'settings.animation', hint: 'settings.animation_hint' },
  reducedMotion: { t: 'settings.reduced_motion', hint: 'settings.reduced_motion_hint' },
}
// Prefs whose behaviour depends on the device supporting an API.
const DEVICE_DEPENDENT = new Set<PokerPrefKey>(['vibration', 'wakeLock'])
// Prefs gated by the audio master.
const MASTER_GATED = new Set<PokerPrefKey>(['effects', 'music', 'timerWarning'])

export default function SettingsClient() {
  const t = useTranslations('games.poker')
  const prefs = usePokerPrefs()
  const [active, setActive] = useState<SectionKey>('audio')
  const [saved, setSaved] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [blocked, setBlocked] = useState<{ userId: string; displayName: string | null }[]>([])
  const [, start] = useTransition()
  const savedTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    void listMyBlocks().then((res) => {
      if (res.ok) setBlocked(res.blocked)
    })
    return () => clearTimeout(savedTimer.current)
  }, [])

  function flashSaved() {
    setSaved(true)
    clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaved(false), 1600)
  }
  function toggle(key: PokerPrefKey) {
    setPref(key, !prefs[key])
    flashSaved()
  }
  function doReset() {
    resetPrefs()
    setConfirmReset(false)
    flashSaved()
  }
  function unblock(userId: string) {
    start(async () => {
      const res = await unblockPlayer(userId)
      if (res.ok) setBlocked((b) => b.filter((x) => x.userId !== userId))
    })
  }

  const renderSection = (s: SectionDef, compact = false) => (
    <div className="flex flex-col gap-1">
      <div className="mb-1">
        {!compact && (
          <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-[color:var(--pkp-ink)]">
            <span className={`pk-ichip pk-ichip-${s.tone} h-8 w-8`}><Icon name={s.icon} size={17} /></span>
            {t(`settings.sec_${s.key}`)}
          </h2>
        )}
        <p className={`text-sm text-[color:var(--pkp-ink-2)] ${compact ? '' : 'mt-1'}`}>{t(`settings.sec_${s.key}_desc`)}</p>
      </div>

      {s.key === 'privacy' ? (
        <PrivacySection blocked={blocked} onUnblock={unblock} />
      ) : (
        <div className="pk-panel divide-y divide-[color:var(--pkp-line)] overflow-hidden">
          {s.prefs!.map((key) => (
            <SettingRow
              key={key}
              label={t(PREF_META[key].t)}
              hint={t(PREF_META[key].hint)}
              gatedReason={MASTER_GATED.has(key) && !prefs.sound ? t('settings.master_required') : undefined}
              deviceNote={DEVICE_DEPENDENT.has(key) ? t('settings.device_note') : undefined}
              checked={prefs[key]}
              onToggle={() => toggle(key)}
            />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div>
      <PageHeader
        eyebrow={<Eyebrow icon="settings">{t('nav.settings')}</Eyebrow>}
        icon="settings"
        tone="neutral"
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
        actions={
          <span
            aria-live="polite"
            className={`inline-flex items-center gap-1.5 rounded-full bg-[color:var(--pkp-emerald-tint)] px-3 py-1.5 text-sm font-medium text-[color:var(--pkp-emerald-ink)] transition-opacity duration-300 ${saved ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          >
            <Icon name="check" size={15} /> {t('settings.saved')}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* Desktop category nav */}
        <nav aria-label={t('settings.title')} className="hidden lg:block lg:sticky lg:top-28 lg:self-start">
          <ul className="flex flex-col gap-0.5">
            {SECTIONS.map((s) => {
              const on = active === s.key
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => setActive(s.key)}
                    aria-current={on ? 'true' : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                      on ? 'bg-[color:var(--pkp-ruby-tint)] text-[color:var(--pkp-ruby-ink)]' : 'text-[color:var(--pkp-ink-2)] hover:bg-[color:var(--pkp-surface-2)] hover:text-[color:var(--pkp-ink)]'
                    }`}
                  >
                    <Icon name={s.icon} size={16} /> {t(`settings.sec_${s.key}`)}
                  </button>
                </li>
              )
            })}
          </ul>
          <button type="button" onClick={() => setConfirmReset(true)} className="pk-btn pk-btn-ghost mt-4 w-full justify-start">
            <Icon name="refresh" size={15} /> {t('settings.reset')}
          </button>
        </nav>

        {/* Desktop active panel */}
        <div className="hidden min-w-0 lg:block">
          {renderSection(SECTIONS.find((s) => s.key === active)!)}
        </div>

        {/* Mobile accordion */}
        <div className="flex flex-col gap-3 lg:hidden">
          {SECTIONS.map((s) => (
            <details key={s.key} className="pk-panel overflow-hidden" open={s.key === 'audio'}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                <span className="flex items-center gap-2.5 font-serif text-base font-semibold text-[color:var(--pkp-ink)]">
                  <span className={`pk-ichip pk-ichip-${s.tone} h-8 w-8`}><Icon name={s.icon} size={16} /></span>
                  {t(`settings.sec_${s.key}`)}
                </span>
                <Icon name="chevronDown" size={18} className="text-[color:var(--pkp-ink-3)]" />
              </summary>
              <div className="border-t border-[color:var(--pkp-line)] p-4">{renderSection(s, true)}</div>
            </details>
          ))}
          <button type="button" onClick={() => setConfirmReset(true)} className="pk-btn pk-btn-secondary mt-1 w-full">
            <Icon name="refresh" size={16} /> {t('settings.reset')}
          </button>
        </div>
      </div>

      {confirmReset && (
        <ConfirmReset onCancel={() => setConfirmReset(false)} onConfirm={doReset} />
      )}
    </div>
  )
}

// One reusable, grid-based setting row. `1fr auto` columns keep every switch on a single vertical
// line and vertically centred against the whole row regardless of how many description/support
// lines the text column has. No manual margins — consistent min-height, padding and divider come
// from here + the parent's `divide-y`.
function SettingRow({
  label,
  hint,
  gatedReason,
  deviceNote,
  checked,
  onToggle,
}: {
  label: string
  hint: string
  gatedReason?: string
  deviceNote?: string
  checked: boolean
  onToggle: () => void
}) {
  const disabled = !!gatedReason
  return (
    <div className={`grid min-h-[64px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-4 ${disabled ? 'opacity-55' : ''}`}>
      <div className="min-w-0">
        <p className="font-medium text-[color:var(--pkp-ink)]">{label}</p>
        <p className="mt-0.5 text-xs text-[color:var(--pkp-ink-2)]">{hint}</p>
        {gatedReason && (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--pkp-amber-ink)]">
            <Icon name="info" size={12} className="shrink-0" /> {gatedReason}
          </p>
        )}
        {deviceNote && (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[color:var(--pkp-ink-3)]">
            <Icon name="monitor" size={12} className="shrink-0" /> {deviceNote}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onToggle}
        className="pk-switch self-center"
      />
    </div>
  )
}

function PrivacySection({
  blocked,
  onUnblock,
}: {
  blocked: { userId: string; displayName: string | null }[]
  onUnblock: (id: string) => void
}) {
  const t = useTranslations('games.poker')
  if (blocked.length === 0) {
    return <EmptyState icon="users" title={t('block.no_blocks')} description={t('settings.privacy_empty_hint')} />
  }
  return (
    <ul className="flex flex-col gap-2">
      {blocked.map((b) => (
        <li key={b.userId} className="pk-panel flex items-center justify-between gap-3 p-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <PokerAvatar name={b.displayName} size={36} decorative />
            <span className="truncate font-medium text-[color:var(--pkp-ink)]">{b.displayName ?? t('profile.anonymous')}</span>
          </span>
          <button onClick={() => onUnblock(b.userId)} className="pk-btn pk-btn-secondary pk-btn-sm">
            {t('block.unblock')}
          </button>
        </li>
      ))}
    </ul>
  )
}

function ConfirmReset({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const t = useTranslations('games.poker')
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    ref.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <div className="pk-dialog-backdrop place-items-center" role="presentation" onClick={onCancel}>
      <div
        className="pk-dialog pk-fade-up max-w-sm p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pk-reset-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="pk-ichip pk-ichip-amber h-10 w-10"><Icon name="alert" size={20} /></span>
          <h3 id="pk-reset-title" className="font-serif text-lg font-semibold text-[color:var(--pkp-ink)]">
            {t('settings.reset_confirm_title')}
          </h3>
        </div>
        <p className="mt-3 text-sm text-[color:var(--pkp-ink-2)]">{t('settings.reset_confirm_body')}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="pk-btn pk-btn-ghost">{t('join.cancel')}</button>
          <button ref={ref} onClick={onConfirm} className="pk-btn pk-btn-primary">
            <Icon name="refresh" size={16} /> {t('settings.reset_confirm_yes')}
          </button>
        </div>
      </div>
    </div>
  )
}
