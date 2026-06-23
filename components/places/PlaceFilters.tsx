'use client'

import { useTranslations } from 'next-intl'
import type { ExploreFilters } from '@/lib/exploreParams'
import { PAYMENT_METHODS, PLACE_LANGUAGES, SMOKING_OPTIONS, TATTOO_OPTIONS } from '@/lib/placeFields'
import Select from '@/components/explore/Select'

interface Props {
  filters: ExploreFilters
  set: (patch: Partial<ExploreFilters>) => void
  /** Relevant filter keys for the active category (from relevantFilterKeys). */
  relevant: Set<string>
  categories: { code: string; label: string }[]
  prefectures: { code: string; name: string }[]
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

export default function PlaceFilters({ filters, set, relevant, categories, prefectures }: Props) {
  const t = useTranslations('explore_search')
  const tp = useTranslations('place_fields')
  const show = (k: string) => relevant.has(k)

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

      {/* Price */}
      <Group title={t('group_price')}>
        <div className="flex flex-wrap gap-2 mb-2.5">
          <Chip on={filters.fee === 'free'} label={t('f_free')} onClick={() => set({ fee: filters.fee === 'free' ? undefined : 'free' })} />
          <Chip on={filters.fee === 'paid'} label={t('f_paid')} onClick={() => set({ fee: filters.fee === 'paid' ? undefined : 'paid' })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" min={0} value={filters.priceMin ?? ''} onChange={(e) => set({ priceMin: e.target.value ? Number(e.target.value) : undefined })}
            placeholder={t('budget_min')} aria-label={t('budget_min')} className="min-w-0 w-full text-[13.5px] min-h-[44px] px-3 border border-line rounded-xl bg-white text-ink placeholder:text-muted focus:outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15" />
          <input type="number" min={0} value={filters.priceMax ?? ''} onChange={(e) => set({ priceMax: e.target.value ? Number(e.target.value) : undefined })}
            placeholder={t('budget_max')} aria-label={t('budget_max')} className="min-w-0 w-full text-[13.5px] min-h-[44px] px-3 border border-line rounded-xl bg-white text-ink placeholder:text-muted focus:outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15" />
        </div>
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
