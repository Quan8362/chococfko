'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { createTable } from '../actions'
import { coins } from '../_eco/format'
import { POKER_ECONOMY_V1 } from '@/lib/games/poker/economyConfig'
import { Icon, type IconName } from '../_eco/icons'
import { PageHeader, Eyebrow } from '../_eco/ui'

// Sanctioned blind tiers (buy-in bounds are DERIVED from the tier — the server enforces the same
// ladder, so the lobby can never fragment onto off-ladder stakes).
const STAKES = POKER_ECONOMY_V1.blindTiers.map((tr) => ({
  sb: tr.smallBlind, bb: tr.bigBlind, minBb: tr.minBuyInBb, maxBb: tr.maxBuyInBb,
}))
const FIRST_TIER = STAKES[0]

const UNSUPPORTED = ['feat_rake', 'feat_ante', 'feat_straddle', 'feat_bots', 'feat_tournaments', 'feat_realmoney'] as const

export default function CreateClient() {
  const t = useTranslations('games.poker')
  const locale = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()

  const [name, setName] = useState('')
  const [sb, setSb] = useState(FIRST_TIER.sb)
  const [bb, setBb] = useState(FIRST_TIER.bb)
  const [capacity, setCapacity] = useState(6)
  const [minBuyInBb, setMinBuyInBb] = useState(FIRST_TIER.minBb)
  const [maxBuyInBb, setMaxBuyInBb] = useState(FIRST_TIER.maxBb)
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

  const errorMsg = error
    ? (['err_name', 'err_blinds', 'err_buyin', 'err_password'] as string[]).includes(error)
      ? t(`create.${error}`)
      : (['unsupported_blind_tier', 'poker_beta_terms_required', 'poker_joins_frozen', 'poker_feature_off'] as string[]).includes(error)
        ? t(`error.${error}`)
        : t('error.generic')
    : null

  return (
    <div>
      <PageHeader
        eyebrow={<Eyebrow icon="plus">{t('nav.create')}</Eyebrow>}
        icon="plus"
        tone="emerald"
        title={t('create.title')}
        subtitle={t('create.subtitle')}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── Form ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <Section step={1} icon="cards" title={t('create.name')}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('create.name_ph')}
              maxLength={40}
              aria-label={t('create.name')}
              className="pk-input"
            />
          </Section>

          <Section step={2} icon="coins" title={t('create.stakes')} hint={t('create.stakes_hint')}>
            <div className="flex flex-wrap gap-2">
              {STAKES.map((s) => {
                const active = sb === s.sb && bb === s.bb
                return (
                  <button
                    key={s.bb}
                    type="button"
                    data-active={active}
                    onClick={() => {
                      setSb(s.sb); setBb(s.bb); setMinBuyInBb(s.minBb); setMaxBuyInBb(s.maxBb)
                    }}
                    className="pk-seg pk-btn-sm tabular-nums"
                  >
                    {coins(s.sb, locale)}/{coins(s.bb, locale)}
                  </button>
                )
              })}
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-[color:var(--pkp-surface-2)] px-3 py-2 text-sm text-[color:var(--pkp-ink-2)]">
              <Icon name="info" size={15} className="mt-0.5 shrink-0 text-[color:var(--pkp-royal-ink)]" />
              <span>
                {t('create.buyin')}: <strong className="tabular-nums text-[color:var(--pkp-ink)]">{minBuyInBb}–{maxBuyInBb} {t('create.bb_unit')}</strong>
                <span className="ml-1 tabular-nums text-[color:var(--pkp-ink-3)]">({coins(minBuyInBb * bb, locale)} – {coins(maxBuyInBb * bb, locale)})</span>
                <span className="mt-0.5 block text-xs">{t('create.buyin_derived_hint')}</span>
              </span>
            </div>
          </Section>

          <Section step={3} icon="users" title={t('create.capacity')} hint={t('create.capacity_hint')}>
            <div className="flex flex-wrap gap-2">
              {[2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  data-active={capacity === n}
                  onClick={() => setCapacity(n)}
                  aria-label={`${n}`}
                  className="pk-seg h-11 w-11 !px-0 tabular-nums"
                >
                  {n}
                </button>
              ))}
            </div>
          </Section>

          <Section step={4} icon="lock" title={t('create.visibility')}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <OptionCard
                active={!isPrivate}
                onClick={() => setIsPrivate(false)}
                icon="globe"
                title={t('create.public')}
                desc={t('create.public_hint')}
              />
              <OptionCard
                active={isPrivate}
                onClick={() => setIsPrivate(true)}
                icon="lock"
                title={t('create.private')}
                desc={t('create.private_hint')}
              />
            </div>
            {isPrivate && (
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('create.password_ph')}
                aria-label={t('create.password')}
                className="pk-input mt-3"
              />
            )}
            <button
              type="button"
              onClick={() => setAllowSpectators((v) => !v)}
              className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-[color:var(--pkp-line)] bg-[color:var(--pkp-surface-2)] p-3 text-left"
            >
              <span>
                <span className="flex items-center gap-1.5 font-medium text-[color:var(--pkp-ink)]">
                  <Icon name="eye" size={16} /> {t('create.spectators')}
                </span>
                <span className="mt-0.5 block text-xs text-[color:var(--pkp-ink-2)]">{t('create.spectators_hint')}</span>
              </span>
              <span role="switch" aria-checked={allowSpectators} aria-label={t('create.spectators')} className="pk-switch" />
            </button>
          </Section>
        </div>

        {/* ── Live summary + create ────────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="pk-panel pk-hairline-gold overflow-hidden">
            <div className="pk-plum px-5 py-4">
              <p className="pk-eyebrow" style={{ color: 'var(--pkp-gold-soft)' }}>
                <Icon name="check" size={13} /> {t('create.review_title')}
              </p>
              <p className="mt-1 truncate font-serif text-lg font-semibold text-[color:var(--pkp-on-plum)]">
                {name.trim() || t('create.name_ph')}
              </p>
            </div>
            <dl className="divide-y divide-[color:var(--pkp-line)]">
              <SummaryRow icon="coins" label={t('create.stakes')} value={`${coins(sb, locale)}/${coins(bb, locale)}`} />
              <SummaryRow icon="layers" label={t('create.buyin')} value={`${coins(minBuyInBb * bb, locale)}–${coins(maxBuyInBb * bb, locale)}`} />
              <SummaryRow icon="users" label={t('create.capacity')} value={String(capacity)} />
              <SummaryRow icon={isPrivate ? 'lock' : 'globe'} label={t('create.visibility')} value={isPrivate ? t('create.private') : t('create.public')} />
              <SummaryRow icon="eye" label={t('create.spectators')} value={allowSpectators ? t('settings.on') : t('settings.off')} />
            </dl>
            <div className="p-4">
              {errorMsg && (
                <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-[color:var(--pkp-coral-tint)] px-3 py-2 text-sm text-[color:var(--pkp-coral-ink)]">
                  <Icon name="alert" size={15} className="shrink-0" /> {errorMsg}
                </p>
              )}
              <button onClick={submit} disabled={pending} className="pk-btn pk-btn-lg pk-btn-primary pk-btn-gold pk-btn-block">
                {pending ? <Icon name="refresh" size={18} className="animate-spin" /> : <Icon name="plus" size={18} />}
                {pending ? t('create.creating') : t('create.submit')}
              </button>
            </div>
          </div>

          {/* Coming later — subtle, out of the primary flow. */}
          <details className="pk-panel pk-panel-tint pk-panel-flat mt-4 p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-[color:var(--pkp-ink-2)]">
              <span className="flex items-center gap-1.5">
                <Icon name="clock" size={15} /> {t('create.unsupported_title')}
              </span>
              <Icon name="chevronDown" size={16} />
            </summary>
            <p className="mt-2 text-xs text-[color:var(--pkp-ink-2)]">{t('create.unsupported_hint')}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {UNSUPPORTED.map((k) => (
                <li key={k} className="pk-badge pk-badge-neutral">{t(`create.${k}`)}</li>
              ))}
            </ul>
          </details>
        </aside>
      </div>
    </div>
  )
}

function Section({
  step,
  icon,
  title,
  hint,
  children,
}: {
  step: number
  icon: IconName
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="pk-panel p-5">
      <div className="mb-3 flex items-start gap-3">
        <span className="pk-ichip pk-ichip-emerald grid h-8 w-8 shrink-0 place-items-center font-serif text-sm font-bold" aria-hidden>
          {step}
        </span>
        <div>
          <h2 className="flex items-center gap-1.5 font-serif text-base font-semibold text-[color:var(--pkp-ink)]">
            <Icon name={icon} size={16} className="text-[color:var(--pkp-ink-3)]" /> {title}
          </h2>
          {hint && <p className="mt-0.5 text-xs text-[color:var(--pkp-ink-2)]">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function OptionCard({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean
  onClick: () => void
  icon: IconName
  title: string
  desc: string
}) {
  return (
    <button type="button" onClick={onClick} data-active={active} aria-pressed={active} className="pk-option flex items-start gap-2.5">
      <span className={`pk-ichip ${active ? 'pk-ichip-ruby' : 'pk-ichip-neutral'} h-8 w-8 shrink-0`}>
        <Icon name={icon} size={16} />
      </span>
      <span>
        <span className="block font-medium text-[color:var(--pkp-ink)]">{title}</span>
        <span className="mt-0.5 block text-xs text-[color:var(--pkp-ink-2)]">{desc}</span>
      </span>
    </button>
  )
}

function SummaryRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-2.5">
      <dt className="flex min-w-0 items-start gap-1.5 text-sm text-[color:var(--pkp-ink-2)]">
        <Icon name={icon} size={15} className="mt-0.5 shrink-0 text-[color:var(--pkp-ink-3)]" />
        <span className="min-w-0">{label}</span>
      </dt>
      <dd className="shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-[color:var(--pkp-ink)]">{value}</dd>
    </div>
  )
}
