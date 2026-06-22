'use client'

import { useTranslations } from 'next-intl'
import type { ExploreFilters } from '@/lib/exploreParams'
import { PAYMENT_METHODS, PLACE_LANGUAGES, SMOKING_OPTIONS, TATTOO_OPTIONS } from '@/lib/placeFields'

interface Props {
  filters: ExploreFilters
  set: (patch: Partial<ExploreFilters>) => void
  /** Relevant filter keys for the active category (from relevantFilterKeys). */
  relevant: Set<string>
  categories: { code: string; label: string }[]
  prefectures: { code: string; name: string }[]
}

export default function PlaceFilters({ filters, set, relevant, categories, prefectures }: Props) {
  const t = useTranslations('explore_search')
  const tp = useTranslations('place_fields')
  const show = (k: string) => relevant.has(k)

  const Toggle = ({ k, label }: { k: keyof ExploreFilters; label: string }) =>
    show(k as string) ? (
      <label className="inline-flex items-center gap-2 text-[13.5px] px-3 py-2 rounded-xl border border-line bg-white cursor-pointer hover:border-rose/40">
        <input type="checkbox" className="accent-rose" checked={!!filters[k]} onChange={(e) => set({ [k]: e.target.checked || undefined } as Partial<ExploreFilters>)} />
        {label}
      </label>
    ) : null

  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="py-3 border-b border-line last:border-0">
      <p className="text-[11.5px] font-semibold uppercase tracking-[1px] text-muted mb-2.5">{title}</p>
      {children}
    </div>
  )

  return (
    <div>
      {/* Location */}
      <Group title={t('group_location')}>
        <div className="flex flex-col gap-2.5">
          <Toggle k="nearby" label={t('f_near_me')} />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={filters.prefecture ?? ''}
              onChange={(e) => set({ prefecture: e.target.value || undefined })}
              className="text-[13.5px] px-3 py-2 border border-line rounded-xl bg-white"
            >
              <option value="">{t('any_prefecture')}</option>
              {prefectures.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
            <input
              value={filters.station ?? ''}
              onChange={(e) => set({ station: e.target.value || undefined })}
              placeholder={t('station_placeholder')}
              className="text-[13.5px] px-3 py-2 border border-line rounded-xl bg-white"
            />
          </div>
          <input
            value={filters.area ?? ''}
            onChange={(e) => set({ area: e.target.value || undefined })}
            placeholder={t('area_placeholder')}
            className="text-[13.5px] px-3 py-2 border border-line rounded-xl bg-white"
          />
        </div>
      </Group>

      {/* Price */}
      <Group title={t('group_price')}>
        <div className="flex flex-wrap gap-2 mb-2.5">
          <button type="button" onClick={() => set({ fee: filters.fee === 'free' ? undefined : 'free' })}
            className={`text-[13px] px-3 py-1.5 rounded-full border ${filters.fee === 'free' ? 'bg-rose text-white border-rose' : 'border-line text-muted hover:border-rose/40'}`}>{t('f_free')}</button>
          <button type="button" onClick={() => set({ fee: filters.fee === 'paid' ? undefined : 'paid' })}
            className={`text-[13px] px-3 py-1.5 rounded-full border ${filters.fee === 'paid' ? 'bg-rose text-white border-rose' : 'border-line text-muted hover:border-rose/40'}`}>{t('f_paid')}</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" min={0} value={filters.priceMin ?? ''} onChange={(e) => set({ priceMin: e.target.value ? Number(e.target.value) : undefined })}
            placeholder={t('budget_min')} className="text-[13.5px] px-3 py-2 border border-line rounded-xl bg-white" />
          <input type="number" min={0} value={filters.priceMax ?? ''} onChange={(e) => set({ priceMax: e.target.value ? Number(e.target.value) : undefined })}
            placeholder={t('budget_max')} className="text-[13.5px] px-3 py-2 border border-line rounded-xl bg-white" />
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
        <div className="grid grid-cols-2 gap-2">
          {show('smoking') && (
            <select value={filters.smoking ?? ''} onChange={(e) => set({ smoking: (e.target.value || undefined) as ExploreFilters['smoking'] })}
              className="text-[13.5px] px-3 py-2 border border-line rounded-xl bg-white">
              <option value="">{tp('smoking_policy')}</option>
              {SMOKING_OPTIONS.map((o) => <option key={o} value={o}>{tp(`smk_${o}` as 'smk_no_smoking')}</option>)}
            </select>
          )}
          {show('tattoo') && (
            <select value={filters.tattoo ?? ''} onChange={(e) => set({ tattoo: (e.target.value || undefined) as ExploreFilters['tattoo'] })}
              className="text-[13.5px] px-3 py-2 border border-line rounded-xl bg-white">
              <option value="">{tp('tattoo_policy')}</option>
              {TATTOO_OPTIONS.map((o) => <option key={o} value={o}>{tp(`tat_${o}` as 'tat_allowed')}</option>)}
            </select>
          )}
        </div>
      </Group>

      {/* Payment & language */}
      <Group title={t('group_payment')}>
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {PAYMENT_METHODS.map((m) => {
            const on = filters.payment?.includes(m)
            return (
              <button key={m} type="button"
                onClick={() => { const cur = filters.payment ?? []; set({ payment: on ? cur.filter((x) => x !== m) : [...cur, m] }) }}
                className={`text-[12.5px] px-2.5 py-1 rounded-full border ${on ? 'bg-teal text-white border-teal' : 'border-line text-muted hover:border-teal/40'}`}>
                {tp(`pm_${m}` as 'pm_cash')}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PLACE_LANGUAGES.map((l) => {
            const on = filters.lang?.includes(l)
            return (
              <button key={l} type="button"
                onClick={() => { const cur = filters.lang ?? []; set({ lang: on ? cur.filter((x) => x !== l) : [...cur, l] }) }}
                className={`text-[12.5px] px-2.5 py-1 rounded-full border ${on ? 'bg-teal text-white border-teal' : 'border-line text-muted hover:border-teal/40'}`}>
                {tp(`lang_${l}` as 'lang_ja')}
              </button>
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
