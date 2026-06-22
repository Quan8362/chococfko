'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { saveJp60Settings } from './actions'
import type { Jp60Settings } from '@/app/games/japanese-60/actions'

export function SettingsForm({ initial }: { initial: Jp60Settings }) {
  const t = useTranslations('admin_jp60')
  const [s, setS] = useState<Jp60Settings>(initial)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    await saveJp60Settings(s)
    setBusy(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const Toggle = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[14px] text-ink">{label}</span>
      <button type="button" role="switch" aria-checked={on} onClick={onClick}
        className={`w-11 h-6 rounded-full relative transition-colors ${on ? 'bg-rose' : 'bg-line'}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </label>
  )

  return (
    <div className="bg-paper border border-line rounded-2xl p-5 space-y-4">
      <Toggle on={s.enabled} label={t('game_enabled')} onClick={() => setS({ ...s, enabled: !s.enabled })} />

      <div>
        <p className="text-[12px] font-bold uppercase tracking-wide text-muted mb-1">{t('modes')}</p>
        {(['daily', 'rush', 'practice'] as const).map((m) => (
          <Toggle key={m} on={s.modes[m]} label={t(`mode_${m}`)} onClick={() => setS({ ...s, modes: { ...s.modes, [m]: !s.modes[m] } })} />
        ))}
      </div>

      <div>
        <p className="text-[12px] font-bold uppercase tracking-wide text-muted mb-1">{t('levels')}</p>
        <div className="grid grid-cols-2 gap-x-4">
          {(['N5', 'N4', 'N3', 'N2', 'N1', 'MIXED'] as const).map((l) => (
            <Toggle key={l} on={s.levels[l]} label={l} onClick={() => setS({ ...s, levels: { ...s.levels, [l]: !s.levels[l] } })} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[12px] text-muted">{t('duration')}</span>
          <input type="number" min={15} max={180} value={s.duration_sec} onChange={(e) => setS({ ...s, duration_sec: Number(e.target.value) })}
            className="w-full border border-line rounded-lg px-3 py-2 text-[14px] bg-cream mt-1" />
        </label>
        <label className="block">
          <span className="text-[12px] text-muted">{t('daily_questions')}</span>
          <input type="number" min={5} max={20} value={s.daily_questions} onChange={(e) => setS({ ...s, daily_questions: Number(e.target.value) })}
            className="w-full border border-line rounded-lg px-3 py-2 text-[14px] bg-cream mt-1" />
        </label>
      </div>

      <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl bg-rose text-white font-semibold disabled:opacity-50">
        {saved ? t('saved') : t('save')}
      </button>
    </div>
  )
}
