'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  validateEventInput,
  eventFieldVisibility,
  EVENT_FORMATS,
  type EventFieldErrors,
  type EventFieldErrorCode,
  type EventFieldKey,
  type EventFormat,
} from '@/lib/tournaments/eventValidation'
import { createTournamentEvent, updateTournamentEvent } from '@/app/admin/giai-dau/[id]/noi-dung/actions'
import type { EventMutationError } from '@/lib/tournaments/admin/types'

export interface EventFormInitial {
  eventId: string
  version: number
  name: string
  format: EventFormat
  groupCount: number
  winnerQualifiersPerGroup: number
  consolationQualifiersPerGroup: number
  thirdPlaceEnabled: boolean
}

// Present the three formats in a learning-friendly order (simplest → most complex).
const FORMAT_ORDER: readonly EventFormat[] = ['round_robin', 'group_knockout', 'knockout']
const FORMATS = FORMAT_ORDER.filter((f) => (EVENT_FORMATS as readonly string[]).includes(f))

const inputCls =
  'w-full text-[14px] px-3 py-2 rounded-lg bg-cream border border-line text-ink focus:outline-none focus:border-rose/50'

export default function EventForm({
  tournamentId,
  initial,
}: {
  tournamentId: string
  initial?: EventFormInitial
}) {
  const t = useTranslations('admin_tournament_events')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [name, setName] = useState(initial?.name ?? '')
  const [format, setFormat] = useState<EventFormat>(initial?.format ?? 'group_knockout')
  const [groupCount, setGroupCount] = useState(String(initial?.groupCount ?? 2))
  const [winnerQ, setWinnerQ] = useState(String(initial?.winnerQualifiersPerGroup ?? 1))
  const [consolationQ, setConsolationQ] = useState(String(initial?.consolationQualifiersPerGroup ?? 0))
  const [thirdPlace, setThirdPlace] = useState(initial?.thirdPlaceEnabled ?? false)

  const [fieldErrors, setFieldErrors] = useState<EventFieldErrors>({})
  const [formError, setFormError] = useState<EventMutationError | null>(null)

  const vis = useMemo(() => eventFieldVisibility(format), [format])
  const fieldLabel = (code: EventFieldErrorCode) => t(`field_${code}`)

  function submit() {
    setFormError(null)
    const values = {
      name,
      format,
      groupCount,
      winnerQualifiersPerGroup: winnerQ,
      consolationQualifiersPerGroup: consolationQ,
      thirdPlaceEnabled: thirdPlace,
    }
    const parsed = validateEventInput(values)
    if (!parsed.ok) {
      setFieldErrors(parsed.errors)
      return
    }
    setFieldErrors({})

    startTransition(async () => {
      const res = initial
        ? await updateTournamentEvent(tournamentId, initial.eventId, initial.version, values)
        : await createTournamentEvent(tournamentId, values)
      if (res.ok) {
        router.push(`/admin/giai-dau/${tournamentId}/noi-dung/${res.id}`)
        router.refresh()
        return
      }
      if (res.fieldErrors) setFieldErrors(res.fieldErrors)
      setFormError(res.error)
    })
  }

  const errFor = (key: EventFieldKey) => {
    const code = fieldErrors[key]
    return code ? <p className="text-[12px] text-rose mt-1">{fieldLabel(code)}</p> : null
  }

  const numberField = (
    label: string,
    hint: string | null,
    value: string,
    onChange: (v: string) => void,
    key: EventFieldKey,
  ) => (
    <label className="block text-[12.5px] font-semibold text-[#5c4d44]">
      {label}
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
      {hint && <span className="block text-[11.5px] font-normal text-muted mt-1">{hint}</span>}
      {errFor(key)}
    </label>
  )

  return (
    <div className="bg-paper border border-line rounded-2xl p-5 sm:p-6 space-y-4">
      <div>
        <h2 className="font-serif font-bold text-[19px] text-ink">
          {initial ? t('form_edit_title') : t('form_new_title')}
        </h2>
        <p className="text-[13px] text-muted mt-1">{initial ? t('edit_hint') : t('create_hint')}</p>
      </div>

      <label className="block text-[12.5px] font-semibold text-[#5c4d44]">
        {t('f_name')}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('f_name_ph')}
          className={inputCls}
        />
        {errFor('name')}
      </label>

      <fieldset className="block">
        <legend className="text-[12.5px] font-semibold text-[#5c4d44] mb-1.5">{t('f_format')}</legend>
        <div className="grid grid-cols-1 gap-2">
          {FORMATS.map((f) => (
            <label
              key={f}
              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-all ${
                format === f ? 'border-rose/50 bg-rose-soft' : 'border-line bg-cream hover:border-rose/25'
              }`}
            >
              <input
                type="radio"
                name="format"
                value={f}
                checked={format === f}
                onChange={() => setFormat(f)}
                className="mt-0.5 accent-rose"
              />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-ink">{t(`format_${f}`)}</span>
                <span className="block text-[12px] text-muted leading-snug mt-0.5">{t(`format_${f}_desc`)}</span>
              </span>
            </label>
          ))}
        </div>
        {errFor('format')}
      </fieldset>

      {vis.groupCount &&
        numberField(t('f_group_count'), t('f_group_count_hint'), groupCount, setGroupCount, 'groupCount')}

      {vis.winnerQualifiers &&
        numberField(
          t('f_winner_qualifiers'),
          t('f_winner_qualifiers_hint'),
          winnerQ,
          setWinnerQ,
          'winnerQualifiersPerGroup',
        )}

      {vis.consolationQualifiers &&
        numberField(
          t('f_consolation_qualifiers'),
          t('f_consolation_qualifiers_hint'),
          consolationQ,
          setConsolationQ,
          'consolationQualifiersPerGroup',
        )}

      {vis.thirdPlace && (
        <label className="flex items-center gap-2.5 text-[13px] font-semibold text-[#5c4d44]">
          <input
            type="checkbox"
            checked={thirdPlace}
            onChange={(e) => setThirdPlace(e.target.checked)}
            className="accent-rose w-4 h-4"
          />
          {t('f_third_place')}
        </label>
      )}

      {format === 'group_knockout' && (
        <div className="rounded-lg bg-cream border border-line px-3.5 py-3 text-[12px] text-muted leading-relaxed space-y-1">
          <p className="font-semibold text-[#5c4d44]">{t('gk_explain_title')}</p>
          <p>{t('gk_explain_winner')}</p>
          <p>{t('gk_explain_consolation')}</p>
          <p>{t('gk_explain_independent')}</p>
          <p>{t('gk_explain_no_drop')}</p>
        </div>
      )}

      {formError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
          <p className="text-[13px] text-red-600">{t(`err_${formError}`)}</p>
          {formError === 'version_conflict' && (
            <button
              type="button"
              onClick={() => router.refresh()}
              className="mt-2 text-[12px] font-semibold text-rose underline"
            >
              {t('reload')}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="font-semibold text-[14px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-50"
        >
          {pending ? t('saving') : initial ? t('save_update') : t('save_create')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => router.back()}
          className="font-semibold text-[13px] px-4 py-2 rounded-full border border-line bg-cream text-[#5c4d44] hover:bg-line/60 transition-colors disabled:opacity-60"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}
