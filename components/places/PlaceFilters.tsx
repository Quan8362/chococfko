'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { currentPriceSelection, priceSelectionPatch, type ExploreFilters } from '@/lib/exploreParams'
import { PRICE_RANGE_KEYS, PRICE_INPUT_MAX, priceRangeI18nKey, formatYen, type PriceSelection } from '@/lib/placeBudget'
import { PAYMENT_METHODS, PLACE_LANGUAGES, SMOKING_OPTIONS, TATTOO_OPTIONS } from '@/lib/placeFields'
import Select from '@/components/explore/Select'

interface Props {
  filters: ExploreFilters
  set: (patch: Partial<ExploreFilters>) => void
  /** Relevant filter keys for the active category (from relevantFilterKeys). */
  relevant: Set<string>
  categories: { code: string; label: string }[]
  prefectures: { code: string; name: string }[]
  /** Active locale — for yen formatting of the applied custom range. */
  locale: string
}

// Hoisted to module scope so its component identity stays stable across renders.
// (Defined inline, it would be a new type every render and remount its children —
// dropping focus from the text inputs it wraps on each keystroke.)
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-line last:border-0">
      <p className="text-[11.5px] font-semibold uppercase tracking-[1px] text-muted mb-2.5">{title}</p>
      {children}
    </div>
  )
}

export default function PlaceFilters({ filters, set, relevant, prefectures, locale }: Props) {
  const t = useTranslations('explore_search')
  const tp = useTranslations('place_fields')
  const show = (k: string) => relevant.has(k)

  // ── Price: one applied selection (radio) + an independent custom EDITOR ──────
  // EXPANSION (customOpen) is a separate concern from the APPLIED selection: the
  // editor can be open without a custom filter being active, and a custom filter
  // can stay applied while the editor is collapsed. The trigger is a pure toggle.
  const priceSelection = currentPriceSelection(filters)
  const [customOpen, setCustomOpen] = useState(priceSelection === 'custom')
  const [draftMin, setDraftMin] = useState(filters.priceMin != null ? String(filters.priceMin) : '')
  const [draftMax, setDraftMax] = useState(filters.priceMax != null ? String(filters.priceMax) : '')

  // Re-sync the draft inputs when the APPLIED custom range changes from outside
  // (global clear-all, shared/Back-Forward URL). Applied values only change on
  // Apply, so this never fights the user while typing.
  useEffect(() => {
    setDraftMin(filters.priceMin != null ? String(filters.priceMin) : '')
    setDraftMax(filters.priceMax != null ? String(filters.priceMax) : '')
  }, [filters.priceMin, filters.priceMax])
  // Auto-collapse the editor when an APPLIED custom range is removed elsewhere
  // (e.g. global "clear all", or a predefined option chosen on the Map). Never
  // force-opens — opening is a deliberate user action on the trigger.
  const prevSelection = useRef(priceSelection)
  useEffect(() => {
    if (prevSelection.current === 'custom' && priceSelection !== 'custom') setCustomOpen(false)
    prevSelection.current = priceSelection
  }, [priceSelection])

  const sanitizeYen = (s: string) => s.replace(/[^\d]/g, '').slice(0, 8)

  const priceOptions: { value: Exclude<PriceSelection, 'custom'>; label: string }[] = [
    { value: 'all', label: t('price_all') },
    { value: 'free', label: t('f_free') },
    ...PRICE_RANGE_KEYS.map((k) => ({ value: k, label: t(priceRangeI18nKey(k)) })),
  ]

  // Live (derived) validation of the draft — keeps Apply's disabled state, the
  // inline error, and a11y attributes perfectly in sync with what's typed.
  const draftMinNum = draftMin === '' ? null : Number(draftMin)
  const draftMaxNum = draftMax === '' ? null : Number(draftMax)
  const bothEmpty = draftMin === '' && draftMax === ''
  const tooBig = (draftMinNum != null && draftMinNum > PRICE_INPUT_MAX) || (draftMaxNum != null && draftMaxNum > PRICE_INPUT_MAX)
  const orderBad = draftMinNum != null && draftMaxNum != null && draftMinNum > draftMaxNum
  const priceError = orderBad ? t('price_err_order') : tooBig ? t('price_err_invalid') : null
  const canApplyCustom = !bothEmpty && !priceError

  const appliedCustomLabel = priceSelection === 'custom'
    ? (filters.priceMin != null && filters.priceMax != null
        ? `${formatYen(filters.priceMin, locale)}–${formatYen(filters.priceMax, locale)}`
        : filters.priceMin != null
          ? t('price_from_chip', { value: formatYen(filters.priceMin, locale) })
          : t('price_to_chip', { value: formatYen(filters.priceMax as number, locale) }))
    : null

  const toggleCustom = () => setCustomOpen((v) => !v)

  const selectPrice = (sel: Exclude<PriceSelection, 'custom'>) => {
    setCustomOpen(false); set(priceSelectionPatch(sel))
  }

  const applyCustom = () => {
    if (!canApplyCustom) return
    set(priceSelectionPatch('custom', { min: draftMinNum ?? undefined, max: draftMaxNum ?? undefined }))
  }

  const clearCustom = () => {
    setDraftMin(''); setDraftMax(''); setCustomOpen(false); set(priceSelectionPatch('all'))
  }

  const priceInputCls = 'min-w-0 w-full text-[13.5px] min-h-[44px] px-3 border rounded-xl bg-white text-ink placeholder:text-muted/70 focus:outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15'

  const Toggle = ({ k, label }: { k: keyof ExploreFilters; label: string }) => {
    if (!show(k as string)) return null
    const on = !!filters[k]
    return (
      <label className={`inline-flex items-center gap-2 text-[13px] min-h-[40px] px-3 rounded-xl border cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-rose/30 ${on ? 'border-rose/50 bg-rose-soft text-rose font-medium' : 'border-line bg-white text-ink/80 hover:border-rose/40'}`}>
        <input type="checkbox" className="accent-rose focus:outline-none" checked={on} onChange={(e) => set({ [k]: e.target.checked || undefined } as Partial<ExploreFilters>)} />
        {label}
      </label>
    )
  }

  // Shared interactive pill for multi/single-select filters. Off state keeps a
  // readable label + visible border (not "disabled"-looking); on state fills
  // with the accent colour. Consistent height + focus ring across the sidebar.
  const Chip = ({ on, accent = 'rose', label, onClick }: { on: boolean; accent?: 'rose' | 'teal'; label: string; onClick: () => void }) => {
    const onCls = accent === 'teal' ? 'bg-teal text-white border-teal' : 'bg-rose text-white border-rose'
    const offHover = accent === 'teal' ? 'hover:border-teal/50 hover:text-teal' : 'hover:border-rose/50 hover:text-rose'
    return (
      <button type="button" onClick={onClick} aria-pressed={on}
        className={`inline-flex items-center justify-center min-h-[34px] px-3 rounded-full border text-[12.5px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 ${on ? onCls : `bg-white border-line text-ink/80 ${offHover}`}`}>
        {label}
      </button>
    )
  }

  return (
    <div>
      {/* Location */}
      <Group title={t('group_location')}>
        <div className="flex flex-col gap-2.5">
          <Toggle k="nearby" label={t('f_near_me')} />
          {/* Prefecture spans the full width so its label + counts never truncate;
              the shorter station/area inputs share a row below it. */}
          <Select
            variant="field"
            className="bg-white"
            value={filters.prefecture ?? ''}
            onChange={(e) => set({ prefecture: e.target.value || undefined })}
            aria-label={t('any_prefecture')}
          >
            <option value="">{t('any_prefecture')}</option>
            {prefectures.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={filters.station ?? ''}
              onChange={(e) => set({ station: e.target.value || undefined })}
              placeholder={t('station_placeholder')}
              aria-label={t('station_placeholder')}
              className="min-w-0 w-full text-[13.5px] min-h-[44px] px-3 border border-line rounded-xl bg-white text-ink placeholder:text-muted focus:outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
            />
            <input
              value={filters.area ?? ''}
              onChange={(e) => set({ area: e.target.value || undefined })}
              placeholder={t('area_placeholder')}
              aria-label={t('area_placeholder')}
              className="min-w-0 w-full text-[13.5px] min-h-[44px] px-3 border border-line rounded-xl bg-white text-ink placeholder:text-muted focus:outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
            />
          </div>
        </div>
      </Group>

      {/* Price — estimated/reference cost (per person or per use). One choice at a
          time (radio); custom range is an optional, hidden-until-opened panel. */}
      <Group title={t('price_estimated')}>
        <p className="text-[11.5px] text-muted -mt-1 mb-2.5 leading-snug">{t('price_estimated_hint')}</p>
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={t('price_estimated')}>
          {priceOptions.map((opt) => {
            const on = priceSelection === opt.value
            return (
              <button key={opt.value} type="button" role="radio" aria-checked={on} onClick={() => selectPrice(opt.value)}
                className={`inline-flex items-center gap-2 text-[13px] min-h-[40px] px-3 rounded-xl border text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 ${on ? 'border-rose bg-rose-soft text-rose font-medium' : 'border-line bg-white text-ink/80 hover:border-rose/40'}`}>
                <span aria-hidden="true" className={`flex-none grid place-items-center w-4 h-4 rounded-full border ${on ? 'border-rose' : 'border-line'}`}>
                  {on && <span className="w-2 h-2 rounded-full bg-rose" />}
                </span>
                {opt.label}
              </button>
            )
          })}
        </div>
        {/* Custom range — a disclosure (kept OUT of the radiogroup). Toggling it
            only opens/closes the editor; the range applies on Apply. When a custom
            range is active the trigger shows the applied range + a filled dot so
            the ACTIVE state is distinct from the merely-OPEN state. */}
        <button type="button" aria-expanded={customOpen} aria-controls="place-price-custom"
          onClick={toggleCustom}
          className={`mt-1.5 w-full inline-flex items-center gap-2 text-[13px] min-h-[40px] px-3 rounded-xl border text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 ${appliedCustomLabel ? 'border-rose bg-rose-soft text-rose font-medium' : customOpen ? 'border-rose/40 bg-white text-ink' : 'border-line bg-white text-ink/80 hover:border-rose/40'}`}>
          <span aria-hidden="true" className={`flex-none grid place-items-center w-4 h-4 rounded-full border ${appliedCustomLabel ? 'border-rose' : 'border-line'}`}>
            {appliedCustomLabel && <span className="w-2 h-2 rounded-full bg-rose" />}
          </span>
          <span className="flex-1 truncate">{appliedCustomLabel ?? t('price_custom')}</span>
          <svg className={`flex-none w-3.5 h-3.5 text-muted transition-transform ${customOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {customOpen && (
          <div id="place-price-custom" className="mt-2 rounded-xl border border-line/70 bg-cream/30 p-3">
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1 min-w-0">
                <span className="text-[11px] font-medium text-muted">{t('price_min_label')}</span>
                <input inputMode="numeric" pattern="[0-9]*" value={draftMin}
                  onChange={(e) => setDraftMin(sanitizeYen(e.target.value))}
                  aria-label={t('price_min_label')} aria-invalid={!!priceError} aria-describedby={priceError ? 'place-price-error' : undefined}
                  placeholder={t('price_from_ph')} className={`${priceInputCls} ${priceError ? 'border-rose/60' : 'border-line'}`} />
              </label>
              <label className="flex flex-col gap-1 min-w-0">
                <span className="text-[11px] font-medium text-muted">{t('price_max_label')}</span>
                <input inputMode="numeric" pattern="[0-9]*" value={draftMax}
                  onChange={(e) => setDraftMax(sanitizeYen(e.target.value))}
                  aria-label={t('price_max_label')} aria-invalid={!!priceError} aria-describedby={priceError ? 'place-price-error' : undefined}
                  placeholder={t('price_to_ph')} className={`${priceInputCls} ${priceError ? 'border-rose/60' : 'border-line'}`} />
              </label>
            </div>
            {priceError
              ? <p id="place-price-error" role="alert" className="mt-2 text-[12px] text-rose leading-snug">{priceError}</p>
              : <p className="mt-2 text-[11px] text-muted leading-snug">{t('price_no_limit_hint')}</p>}
            {/* Two-column grid: Apply (primary) gets slightly more width than
                Clear (secondary). `whitespace-nowrap` + `min-w-0` guarantee the
                labels never wrap internally at any width or in any language. */}
            <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-2 mt-3">
              <button type="button" onClick={applyCustom} disabled={!canApplyCustom}
                className="min-w-0 inline-flex items-center justify-center whitespace-nowrap min-h-[42px] px-3 rounded-xl bg-rose text-white text-[13px] font-semibold transition-colors hover:bg-rose/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-rose">{t('apply')}</button>
              <button type="button" onClick={clearCustom}
                className="min-w-0 inline-flex items-center justify-center whitespace-nowrap min-h-[42px] px-3 rounded-xl border border-line bg-white text-[13px] font-semibold text-ink/70 transition-colors hover:text-ink hover:border-rose/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 focus-visible:ring-offset-1">{t('price_clear')}</button>
            </div>
          </div>
        )}
      </Group>

      {/* Availability */}
      {(show('openNow') || show('reservationAvailable') || show('reservationRequired')) && (
        <Group title={t('group_availability')}>
          <div className="flex flex-wrap gap-2">
            <Toggle k="openNow" label={t('f_open_now')} />
            <Toggle k="reservationAvailable" label={t('f_takes_reservation')} />
            <Toggle k="reservationRequired" label={tp('reservation_required')} />
          </div>
        </Group>
      )}

      {/* Suitability */}
      {(show('children') || show('solo') || show('group')) && (
        <Group title={t('group_suitability')}>
          <div className="flex flex-wrap gap-2">
            <Toggle k="children" label={tp('good_for_children')} />
            <Toggle k="solo" label={tp('good_for_solo')} />
            <Toggle k="group" label={tp('good_for_groups')} />
          </div>
        </Group>
      )}

      {/* Facilities */}
      <Group title={t('group_facilities')}>
        <div className="flex flex-wrap gap-2 mb-2.5">
          <Toggle k="parking" label={tp('parking')} />
          <Toggle k="indoor" label={tp('io_indoor')} />
          <Toggle k="outdoor" label={tp('io_outdoor')} />
          <Toggle k="rainy" label={tp('rainy_day_ok')} />
          <Toggle k="wheelchair" label={tp('wheelchair_accessible')} />
          <Toggle k="bbq" label={tp('bbq_available')} />
          <Toggle k="camping" label={tp('camping_available')} />
        </div>
        <div className="flex flex-col gap-2">
          {show('smoking') && (
            <Select variant="field" className="bg-white" value={filters.smoking ?? ''} onChange={(e) => set({ smoking: (e.target.value || undefined) as ExploreFilters['smoking'] })}
              aria-label={tp('smoking_policy')}>
              <option value="">{tp('smoking_policy')}</option>
              {SMOKING_OPTIONS.map((o) => <option key={o} value={o}>{tp(`smk_${o}` as 'smk_no_smoking')}</option>)}
            </Select>
          )}
          {show('tattoo') && (
            <Select variant="field" className="bg-white" value={filters.tattoo ?? ''} onChange={(e) => set({ tattoo: (e.target.value || undefined) as ExploreFilters['tattoo'] })}
              aria-label={tp('tattoo_policy')}>
              <option value="">{tp('tattoo_policy')}</option>
              {TATTOO_OPTIONS.map((o) => <option key={o} value={o}>{tp(`tat_${o}` as 'tat_allowed')}</option>)}
            </Select>
          )}
        </div>
      </Group>

      {/* Payment & language */}
      <Group title={t('group_payment')}>
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {PAYMENT_METHODS.map((m) => {
            const on = !!filters.payment?.includes(m)
            return (
              <Chip key={m} on={on} accent="teal" label={tp(`pm_${m}` as 'pm_cash')}
                onClick={() => { const cur = filters.payment ?? []; set({ payment: on ? cur.filter((x) => x !== m) : [...cur, m] }) }} />
            )
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PLACE_LANGUAGES.map((l) => {
            const on = !!filters.lang?.includes(l)
            return (
              <Chip key={l} on={on} accent="teal" label={tp(`lang_${l}` as 'lang_ja')}
                onClick={() => { const cur = filters.lang ?? []; set({ lang: on ? cur.filter((x) => x !== l) : [...cur, l] }) }} />
            )
          })}
        </div>
      </Group>

      {/* Other */}
      <Group title={t('group_other')}>
        <div className="flex flex-wrap gap-2">
          <Toggle k="verified" label={t('f_verified')} />
          <Toggle k="recentlyUpdated" label={t('f_recently_updated')} />
        </div>
      </Group>
    </div>
  )
}
