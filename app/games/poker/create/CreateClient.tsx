'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { createTable } from '../actions'
import { coins } from '../_eco/format'

const STAKES = [
  { sb: 50, bb: 100 },
  { sb: 100, bb: 200 },
  { sb: 250, bb: 500 },
  { sb: 500, bb: 1000 },
  { sb: 1000, bb: 2000 },
]

const UNSUPPORTED = ['feat_rake', 'feat_ante', 'feat_straddle', 'feat_bots', 'feat_tournaments', 'feat_realmoney'] as const

export default function CreateClient() {
  const t = useTranslations('games.poker')
  const locale = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()

  const [name, setName] = useState('')
  const [sb, setSb] = useState(100)
  const [bb, setBb] = useState(200)
  const [capacity, setCapacity] = useState(6)
  const [minBuyInBb, setMinBuyInBb] = useState(40)
  const [maxBuyInBb, setMaxBuyInBb] = useState(100)
  const [isPrivate, setIsPrivate] = useState(false)
  const [password, setPassword] = useState('')
  const [allowSpectators, setAllowSpectators] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const clientError = useMemo(() => {
    if (!name.trim()) return 'err_name'
    if (bb !== sb * 2) return 'err_blinds'
    if (maxBuyInBb < minBuyInBb) return 'err_buyin'
    if (isPrivate && !password.trim()) return 'err_password'
    return null
  }, [name, sb, bb, minBuyInBb, maxBuyInBb, isPrivate, password])

  function submit() {
    setError(null)
    if (clientError) {
      setError(clientError)
      return
    }
    start(async () => {
      const res = await createTable({
        name: name.trim(),
        smallBlind: sb,
        bigBlind: bb,
        capacity,
        minBuyInBb,
        maxBuyInBb,
        isPrivate,
        password: isPrivate ? password : undefined,
        allowSpectators,
      })
      if (res.ok) router.push(`/games/poker/${res.tableId}`)
      else setError(res.error)
    })
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-2xl font-bold">{t('create.title')}</h1>
      <p className="mb-6 text-sm text-muted">{t('create.subtitle')}</p>

      <div className="space-y-5 rounded-xl border border-line bg-paper p-5">
        <Field label={t('create.name')}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('create.name_ph')}
            maxLength={40}
            className="w-full rounded-lg border border-line bg-cream px-3 py-2 outline-none focus:border-rose"
          />
        </Field>

        <Field label={t('create.stakes')} hint={t('create.stakes_hint')}>
          <div className="mb-2 flex flex-wrap gap-2">
            {STAKES.map((s) => (
              <button
                key={s.bb}
                type="button"
                onClick={() => {
                  setSb(s.sb)
                  setBb(s.bb)
                }}
                className={`rounded-full border px-3 py-1 text-sm ${
                  sb === s.sb && bb === s.bb ? 'border-rose bg-rose/10 text-rose' : 'border-line hover:border-rose'
                }`}
              >
                {coins(s.sb, locale)}/{coins(s.bb, locale)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label={t('create.sb')} value={sb} min={1} onChange={setSb} />
            <NumberInput label={t('create.bb')} value={bb} min={2} onChange={setBb} />
          </div>
        </Field>

        <Field label={t('create.capacity')} hint={t('create.capacity_hint')}>
          <div className="flex gap-2">
            {[2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCapacity(n)}
                className={`h-10 w-10 rounded-lg border text-sm ${
                  capacity === n ? 'border-rose bg-rose/10 text-rose' : 'border-line hover:border-rose'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t('create.buyin')}>
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label={`${t('create.min_buyin')} (${t('create.bb_unit')})`} value={minBuyInBb} min={1} onChange={setMinBuyInBb} />
            <NumberInput label={`${t('create.max_buyin')} (${t('create.bb_unit')})`} value={maxBuyInBb} min={1} onChange={setMaxBuyInBb} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {coins(minBuyInBb * bb, locale)} – {coins(maxBuyInBb * bb, locale)}
          </p>
        </Field>

        <Field label={t('create.visibility')}>
          <div className="grid grid-cols-2 gap-3">
            <Choice active={!isPrivate} onClick={() => setIsPrivate(false)} title={t('create.public')} desc={t('create.public_hint')} />
            <Choice active={isPrivate} onClick={() => setIsPrivate(true)} title={t('create.private')} desc={t('create.private_hint')} />
          </div>
          {isPrivate && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('create.password_ph')}
              className="mt-3 w-full rounded-lg border border-line bg-cream px-3 py-2 outline-none focus:border-rose"
            />
          )}
        </Field>

        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="font-medium">{t('create.spectators')}</span>
            <span className="block text-xs text-muted">{t('create.spectators_hint')}</span>
          </span>
          <input type="checkbox" checked={allowSpectators} onChange={(e) => setAllowSpectators(e.target.checked)} className="h-5 w-5 accent-rose" />
        </label>

        {error && (
          <p className="text-sm text-rose">
            {(['err_name', 'err_blinds', 'err_buyin', 'err_password'] as string[]).includes(error)
              ? t(`create.${error}`)
              : t('error.generic')}
          </p>
        )}

        <button
          onClick={submit}
          disabled={pending}
          className="w-full rounded-lg bg-rose px-4 py-3 font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? t('create.creating') : t('create.submit')}
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-line bg-paper/60 p-5">
        <h2 className="font-serif text-base font-semibold">{t('create.unsupported_title')}</h2>
        <p className="mb-3 text-sm text-muted">{t('create.unsupported_hint')}</p>
        <ul className="flex flex-wrap gap-2">
          {UNSUPPORTED.map((k) => (
            <li key={k} className="flex items-center gap-2 rounded-full border border-line bg-cream px-3 py-1 text-sm text-muted">
              {t(`create.${k}`)}
              <span className="rounded-full bg-line px-2 py-0.5 text-[10px] uppercase tracking-wide">{t('create.soon')}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5">
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function NumberInput({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.floor(Number(e.target.value) || 0)))}
        className="w-full rounded-lg border border-line bg-cream px-3 py-2 outline-none focus:border-rose"
      />
    </label>
  )
}

function Choice({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-3 text-left ${active ? 'border-rose bg-rose/5' : 'border-line hover:border-rose'}`}
    >
      <span className="font-medium">{title}</span>
      <span className="mt-0.5 block text-xs text-muted">{desc}</span>
    </button>
  )
}
