'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { resetPrefs, setPref, usePokerPrefs, type PokerPrefKey } from '../_eco/prefs'
import { listMyBlocks, unblockPlayer } from '../ecosystem'

// Grouped so the audio master reads clearly above the sub-categories it gates.
const TOGGLES: PokerPrefKey[] = ['sound', 'effects', 'timerWarning', 'music', 'vibration', 'wakeLock', 'animation', 'reducedMotion']
const LABEL: Record<PokerPrefKey, { t: string; hint: string }> = {
  sound: { t: 'settings.sound', hint: 'settings.sound_hint' },
  effects: { t: 'settings.effects', hint: 'settings.effects_hint' },
  timerWarning: { t: 'settings.timer_warning', hint: 'settings.timer_warning_hint' },
  music: { t: 'settings.music', hint: 'settings.music_hint' },
  vibration: { t: 'settings.vibration', hint: 'settings.vibration_hint' },
  wakeLock: { t: 'settings.wake_lock', hint: 'settings.wake_lock_hint' },
  animation: { t: 'settings.animation', hint: 'settings.animation_hint' },
  reducedMotion: { t: 'settings.reduced_motion', hint: 'settings.reduced_motion_hint' },
}

export default function SettingsClient() {
  const t = useTranslations('games.poker')
  const prefs = usePokerPrefs()
  const [saved, setSaved] = useState(false)
  const [blocked, setBlocked] = useState<{ userId: string; displayName: string | null }[]>([])
  const [, start] = useTransition()

  useEffect(() => {
    void listMyBlocks().then((res) => {
      if (res.ok) setBlocked(res.blocked)
    })
  }, [])

  function toggle(key: PokerPrefKey) {
    setPref(key, !prefs[key])
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  function reset() {
    resetPrefs()
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  function unblock(userId: string) {
    start(async () => {
      const res = await unblockPlayer(userId)
      if (res.ok) setBlocked((b) => b.filter((x) => x.userId !== userId))
    })
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">{t('settings.title')}</h1>
          <p className="text-sm text-muted">{t('settings.subtitle')}</p>
        </div>
        {saved && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">{t('settings.saved')}</span>}
      </div>

      <div className="divide-y divide-line rounded-xl border border-line bg-paper">
        {TOGGLES.map((key) => {
          // Sub-categories of audio are inert while the master `sound` is off — dim + disable them
          // so the dependency is visible (they still remember their own on/off state).
          const gatedByMaster = (key === 'effects' || key === 'timerWarning' || key === 'music') && !prefs.sound
          return (
            <label
              key={key}
              className={`flex items-center justify-between gap-4 p-4 ${gatedByMaster ? 'opacity-50' : 'cursor-pointer'} ${key !== 'sound' && (key === 'effects' || key === 'timerWarning' || key === 'music') ? 'pl-8' : ''}`}
            >
              <span>
                <span className="font-medium">{t(LABEL[key].t)}</span>
                <span className="block text-xs text-muted">{t(LABEL[key].hint)}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[key]}
                disabled={gatedByMaster}
                onClick={() => toggle(key)}
                className={`relative h-6 w-11 shrink-0 appearance-none rounded-full transition-colors disabled:cursor-not-allowed ${prefs[key] ? 'bg-rose' : 'bg-line'}`}
              >
                <span
                  className={`pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-[left] ${prefs[key] ? 'left-[22px]' : 'left-0.5'}`}
                />
              </button>
            </label>
          )
        })}
      </div>

      <button onClick={reset} className="mt-4 rounded-lg border border-line px-4 py-2 text-sm hover:border-rose">
        {t('settings.reset')}
      </button>

      <h2 className="mb-3 mt-8 font-serif text-lg font-semibold">{t('block.blocked_list')}</h2>
      {blocked.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-paper/60 px-6 py-8 text-center text-muted">{t('block.no_blocks')}</p>
      ) : (
        <ul className="space-y-2">
          {blocked.map((b) => (
            <li key={b.userId} className="flex items-center justify-between rounded-xl border border-line bg-paper p-3">
              <span>{b.displayName ?? t('profile.anonymous')}</span>
              <button onClick={() => unblock(b.userId)} className="rounded-lg border border-line px-3 py-1 text-sm hover:border-rose">
                {t('block.unblock')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
