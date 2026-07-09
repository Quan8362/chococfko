'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { createTournament } from '../tournament-actions'
import { coins } from '../_eco/format'
import { Icon, type IconName } from '../_eco/icons'

// Operator-only create form. Only the supported/audited fields are configurable; the server
// re-validates every value (validateTournamentConfig) and rejects negatives/excess/inconsistency.
// Presentation follows the Premium Poker Salon portal system; the submission contract is unchanged.
type Template = 'stt_6max' | 'mtt' | 'public_hu'

export default function CreateTournamentForm() {
  const t = useTranslations('games.poker.tournaments')
  const tp = useTranslations('games.poker')
  const locale = useLocale()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '', template: 'stt_6max' as Template,
    entryFee: 1000, startingStack: 5000, maxEntries: 6, seatsPerTable: 6, guaranteedPrizePool: 0,
  })

  // The public heads-up preset is one table, two players — the ONLY shape the public capability
  // accepts (validatePublicLaunchShape). Lock the field values to match.
  const headsUp = form.template === 'public_hu'
  const effectiveMaxEntries = headsUp ? 2 : form.maxEntries
  const effectiveSeats = headsUp ? 2 : form.seatsPerTable

  const clientError = useMemo(() => {
    if (!form.title.trim()) return 'err_name'
    if (form.entryFee < 1) return 'err_entry'
    if (form.startingStack < 1) return 'err_stack'
    if (!headsUp && effectiveMaxEntries < 2) return 'err_max'
    if (!headsUp && (effectiveSeats < 2 || effectiveSeats > 10)) return 'err_seats'
    return null
  }, [form.title, form.entryFee, form.startingStack, effectiveMaxEntries, effectiveSeats, headsUp])

  const TEMPLATES: { key: Template; icon: IconName; label: string; desc: string }[] = [
    { key: 'stt_6max', icon: 'users', label: t('operator.template_stt'), desc: t('operator.template_stt_desc') },
    { key: 'mtt', icon: 'trophy', label: t('operator.template_mtt'), desc: t('operator.template_mtt_desc') },
    { key: 'public_hu', icon: 'globe', label: t('operator.template_public_hu'), desc: t('operator.template_public_hu_desc') },
  ]

  async function submit() {
    if (busy) return
    setError(null)
    if (clientError) { setError(clientError); return }
    setBusy(true)
    const res = await createTournament({
      title: form.title, template: form.template,
      entryFee: form.entryFee, startingStack: form.startingStack, maxEntries: effectiveMaxEntries,
      seatsPerTable: effectiveSeats, guaranteedPrizePool: form.guaranteedPrizePool,
    })
    if (res.ok) { router.push(`/games/poker/tournaments/${res.id}`); return }
    setBusy(false)
    setError(res.error.startsWith('public_launch_shape') ? 'public_launch_shape'
      : res.error.startsWith('invalid_config') ? 'invalid_config'
      : res.error === 'not_operator' ? 'not_operator' : 'generic')
  }

  const errorMsg = error
    ? (['err_name', 'err_entry', 'err_stack', 'err_max', 'err_seats'] as string[]).includes(error)
      ? t(`operator.${error}`)
      : t(`error.${error}`)
    : null

  const coinUnit = t('coin_unit')

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <Section step={1} icon="trophy" title={t('operator.sec_identity')}>
          <label htmlFor="tn" className="sr-only">{t('operator.name')}</label>
          <input
            id="tn"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={t('operator.name')}
            maxLength={120}
            className="pk-input"
          />
        </Section>

        <Section step={2} icon="layers" title={t('operator.sec_format')}>
          <div className="grid gap-3 sm:grid-cols-3">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.key}
                type="button"
                data-active={form.template === tpl.key}
                aria-pressed={form.template === tpl.key}
                onClick={() => setForm({ ...form, template: tpl.key })}
                className="pk-option flex flex-col gap-1.5"
              >
                <span className={`pk-ichip ${form.template === tpl.key ? 'pk-ichip-ruby' : 'pk-ichip-neutral'} h-8 w-8`}>
                  <Icon name={tpl.icon} size={16} />
                </span>
                <span className="font-medium text-[color:var(--pkp-ink)]">{tpl.label}</span>
                <span className="text-xs text-[color:var(--pkp-ink-2)]">{tpl.desc}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section step={3} icon="coins" title={t('operator.sec_stakes')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField id="ef" label={t('operator.entry_fee')} value={form.entryFee} min={1} onChange={(v) => setForm({ ...form, entryFee: v })} />
            <NumberField id="ss" label={t('operator.starting_stack')} value={form.startingStack} min={1} onChange={(v) => setForm({ ...form, startingStack: v })} />
          </div>
        </Section>

        <Section step={4} icon="users" title={t('operator.sec_players')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField id="me" label={t('operator.max_entries')} value={effectiveMaxEntries} min={2} disabled={headsUp} onChange={(v) => setForm({ ...form, maxEntries: v })} />
            <NumberField id="sp" label={t('operator.seats_per_table')} value={effectiveSeats} min={2} max={10} disabled={headsUp} onChange={(v) => setForm({ ...form, seatsPerTable: v })} />
          </div>
          {headsUp && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--pkp-royal-tint)] px-3 py-2 text-xs text-[color:var(--pkp-royal-ink)]">
              <Icon name="info" size={13} className="shrink-0" /> {t('operator.hu_locked')}
            </p>
          )}
        </Section>

        <Section step={5} icon="trophy" title={t('operator.sec_prize')}>
          <NumberField id="gp" label={t('operator.guarantee')} value={form.guaranteedPrizePool} min={0} onChange={(v) => setForm({ ...form, guaranteedPrizePool: v })} />
          <p className="mt-2 text-xs text-[color:var(--pkp-ink-2)]">{t('operator.guarantee_hint')}</p>
        </Section>
      </div>

      {/* ── Live summary + create ────────────────────────────────────────── */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="pk-panel pk-hairline-gold overflow-hidden">
          <div className="pk-plum px-5 py-4">
            <p className="pk-eyebrow" style={{ color: 'var(--pkp-gold-soft)' }}>
              <Icon name="check" size={13} /> {t('operator.review')}
            </p>
            <p className="mt-1 truncate font-serif text-lg font-semibold text-[color:var(--pkp-on-plum)]">
              {form.title.trim() || t('operator.name')}
            </p>
          </div>
          <dl className="divide-y divide-[color:var(--pkp-line)]">
            <SummaryRow icon="layers" label={t('operator.template')} value={TEMPLATES.find((x) => x.key === form.template)!.label} />
            <SummaryRow icon="coins" label={t('field.entry_fee')} value={`${coins(form.entryFee, locale)} ${coinUnit}`} />
            <SummaryRow icon="layers" label={t('operator.starting_stack')} value={`${coins(form.startingStack, locale)} ${t('operator.unit_chip')}`} />
            <SummaryRow icon="users" label={t('operator.max_entries')} value={`${coins(effectiveMaxEntries, locale)} ${t('operator.unit_players')}`} />
            <SummaryRow icon="users" label={t('operator.seats_per_table')} value={`${coins(effectiveSeats, locale)} ${t('operator.unit_seats')}`} />
            <SummaryRow icon="trophy" label={t('field.guarantee')} value={`${coins(form.guaranteedPrizePool, locale)} ${coinUnit}`} />
          </dl>
          <div className="p-4">
            {errorMsg && (
              <p role="alert" className="mb-3 flex items-center gap-1.5 rounded-lg bg-[color:var(--pkp-coral-tint)] px-3 py-2 text-sm text-[color:var(--pkp-coral-ink)]">
                <Icon name="alert" size={15} className="shrink-0" /> {errorMsg}
              </p>
            )}
            <button onClick={submit} disabled={busy} className="pk-btn pk-btn-lg pk-btn-primary pk-btn-gold pk-btn-block">
              {busy ? <Icon name="refresh" size={18} className="animate-spin" /> : <Icon name="plus" size={18} />}
              {busy ? t('operator.creating') : t('operator.create')}
            </button>
            <p className="mt-3 inline-flex items-center gap-1 text-[11px] text-[color:var(--pkp-ink-3)]">
              <Icon name="info" size={12} /> {tp('landing.responsible_note')}
            </p>
          </div>
        </div>
      </aside>
    </div>
  )
}

function Section({ step, icon, title, children }: { step: number; icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <section className="pk-panel p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="pk-ichip pk-ichip-amber grid h-8 w-8 shrink-0 place-items-center font-serif text-sm font-bold" aria-hidden>{step}</span>
        <h2 className="flex items-center gap-1.5 font-serif text-base font-semibold text-[color:var(--pkp-ink)]">
          <Icon name={icon} size={16} className="text-[color:var(--pkp-ink-3)]" /> {title}
        </h2>
      </div>
      {children}
    </section>
  )
}

function NumberField({
  id, label, value, min, max, disabled, onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max?: number
  disabled?: boolean
  onChange: (v: number) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[color:var(--pkp-ink)]">{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className="pk-input tabular-nums disabled:opacity-55"
      />
    </div>
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
