'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  slugifyTournament,
  validateTournamentInput,
  type TournamentFieldErrors,
  type TournamentFieldErrorCode,
  type TournamentFieldKey,
} from '@/lib/tournaments/validation'
import { createTournament, updateTournament } from '@/app/admin/giai-dau/actions'
import type { TournamentMutationError } from '@/lib/tournaments/admin/types'

export interface TournamentFormInitial {
  id: string
  slug: string
  name: string
  startsAt: string | null
  endsAt: string | null
  location: string | null
  rulesUrl: string | null
  updatedAt: string
}

// <input type="datetime-local"> has no timezone → interpret its value in the browser's local
// wall-clock, both ways, so an edited value round-trips to the same instant it was shown as.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const shifted = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return shifted.toISOString().slice(0, 16)
}
function localInputToIso(local: string): string {
  if (!local) return ''
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

const Field = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className="w-full text-[14px] px-3 py-2 rounded-lg bg-cream border border-line text-ink focus:outline-none focus:border-rose/50"
  />
)

export default function TournamentForm({ initial }: { initial?: TournamentFormInitial }) {
  const t = useTranslations('admin_tournaments')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [name, setName] = useState(initial?.name ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(!!initial)
  const [startsAt, setStartsAt] = useState(isoToLocalInput(initial?.startsAt ?? null))
  const [endsAt, setEndsAt] = useState(isoToLocalInput(initial?.endsAt ?? null))
  const [location, setLocation] = useState(initial?.location ?? '')
  const [rulesUrl, setRulesUrl] = useState(initial?.rulesUrl ?? '')

  const [fieldErrors, setFieldErrors] = useState<TournamentFieldErrors>({})
  const [formError, setFormError] = useState<TournamentMutationError | null>(null)

  // Live-preview the auto slug while the admin hasn't hand-edited it.
  const effectiveSlug = useMemo(
    () => (slugTouched ? slug : slugifyTournament(name)),
    [slug, slugTouched, name],
  )

  const fieldLabel = (code: TournamentFieldErrorCode) => t(`field_${code}`)

  function onNameChange(v: string) {
    setName(v)
    if (!slugTouched) setSlug(slugifyTournament(v))
  }

  function submit() {
    setFormError(null)
    const values = {
      name,
      slug: effectiveSlug,
      startsAt: localInputToIso(startsAt),
      endsAt: localInputToIso(endsAt),
      location,
      rulesUrl,
    }
    const parsed = validateTournamentInput(values)
    if (!parsed.ok) {
      setFieldErrors(parsed.errors)
      return
    }
    setFieldErrors({})

    startTransition(async () => {
      const res = initial
        ? await updateTournament(initial.id, initial.updatedAt, values)
        : await createTournament(values)
      if (res.ok) {
        router.push(`/admin/giai-dau/${res.id}`)
        router.refresh()
        return
      }
      if (res.fieldErrors) setFieldErrors(res.fieldErrors)
      setFormError(res.error)
    })
  }

  const errFor = (key: TournamentFieldKey) => {
    const code = fieldErrors[key]
    return code ? <p className="text-[12px] text-rose mt-1">{fieldLabel(code)}</p> : null
  }

  return (
    <div className="bg-paper border border-line rounded-2xl p-5 sm:p-6 space-y-4">
      <div>
        <h2 className="font-serif font-bold text-[19px] text-ink">
          {initial ? t('form_edit_title') : t('form_new_title')}
        </h2>
        {!initial && <p className="text-[13px] text-muted mt-1">{t('create_hint')}</p>}
      </div>

      <label className="block text-[12.5px] font-semibold text-[#5c4d44]">
        {t('f_name')}
        <Field value={name} onChange={(e) => onNameChange(e.target.value)} placeholder={t('f_name_ph')} />
        {errFor('name')}
      </label>

      <label className="block text-[12.5px] font-semibold text-[#5c4d44]">
        {t('f_slug')}
        <Field
          value={effectiveSlug}
          onChange={(e) => {
            setSlugTouched(true)
            setSlug(e.target.value)
          }}
          placeholder={t('f_slug_ph')}
        />
        <span className="block text-[11.5px] font-normal text-muted mt-1">{t('f_slug_hint')}</span>
        {errFor('slug')}
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block text-[12.5px] font-semibold text-[#5c4d44]">
          {t('f_starts')}
          <Field type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </label>
        <label className="block text-[12.5px] font-semibold text-[#5c4d44]">
          {t('f_ends')}
          <Field type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </label>
      </div>
      {errFor('dates')}

      <label className="block text-[12.5px] font-semibold text-[#5c4d44]">
        {t('f_location')}
        <Field value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t('f_location_ph')} />
      </label>

      <label className="block text-[12.5px] font-semibold text-[#5c4d44]">
        {t('f_rules_url')}
        <Field value={rulesUrl} onChange={(e) => setRulesUrl(e.target.value)} placeholder={t('f_rules_url_ph')} />
        {errFor('rulesUrl')}
      </label>

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
