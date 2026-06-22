import loadDynamic from 'next/dynamic'
import { getTranslations } from 'next-intl/server'
import {
  categoryFieldRelevance, placeCompletenessWarnings,
  PARKING_OPTIONS, INDOOR_OUTDOOR_OPTIONS, SMOKING_OPTIONS, TATTOO_OPTIONS,
  PET_OPTIONS, CROWD_LEVELS, TEMPORARY_STATUSES, VERIFICATION_STATUSES,
  PAYMENT_METHODS, PLACE_LANGUAGES, WEEKDAYS,
} from '@/lib/placeFields'
import { parseCoordinate } from '@/lib/coordinates'
import { getMapConfig, adminGoogleAvailable } from '@/lib/maps/config'
import PlacePicker from '@/components/admin/PlacePicker'

const RichTextEditor = loadDynamic(() => import('@/components/RichTextEditor'), { ssr: false })

// Raw places row (snake_case) — only the fields this editor reads.
export interface PlaceFieldsRow {
  category?: string | null
  map_url?: string | null
  address?: string | null
  lat?: number | null; lng?: number | null
  // Phase 5 location provenance (optional; null on old/pre-migration rows)
  location_provider?: string | null; provider_place_id?: string | null
  provider_formatted_address?: string | null; country_code?: string | null
  location_source?: string | null; location_manually_adjusted?: boolean | null
  postal_code?: string | null; nearest_station?: string | null; station_walk_minutes?: number | null
  subcategories?: string[] | null
  fee?: string | null
  price_type?: string | null; price_min?: number | null; price_max?: number | null; currency?: string | null
  opening_hours?: unknown; closed_days?: string[] | null; temporary_status?: string | null
  reservation_recommended?: boolean | null; reservation_required?: boolean | null; walk_ins_accepted?: boolean | null
  good_for_children?: boolean | null; good_for_solo?: boolean | null; good_for_groups?: boolean | null
  parking?: string | null; indoor_outdoor?: string | null; rainy_day_ok?: boolean | null
  wheelchair_accessible?: boolean | null; smoking_policy?: string | null
  payment_methods?: string[] | null; supported_languages?: string[] | null
  tattoo_policy?: string | null; bbq_available?: boolean | null; camping_available?: boolean | null; pet_policy?: string | null
  official_website?: string | null; reservation_url?: string | null; reservation_provider?: string | null
  phone?: string | null; social_url?: string | null; source_url?: string | null; last_verified_at?: string | null
  know_before_you_go?: string | null; vi_tips?: string | null; items_to_bring?: string[] | null
  recommended_duration_minutes?: number | null; best_visit_time?: string | null; expected_crowd_level?: string | null
  japanese_phrases?: unknown; verification_status?: string | null
  search_eligible?: boolean | null; recommend_eligible?: boolean | null
}

const I = 'w-full text-[14px] px-3.5 py-2.5 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose'
const LBL = 'block text-[13px] font-semibold mb-1.5 text-[#5c4d44]'
const HELP = 'text-[11.5px] text-muted mt-1'

function jsonStr(v: unknown): string {
  if (v == null) return ''
  try { return JSON.stringify(v, null, 2) } catch { return '' }
}

export default async function PlaceFieldsEditor({ p }: { p: PlaceFieldsRow }) {
  const t = await getTranslations('place_fields')
  const mapConfig = getMapConfig()
  const rel = categoryFieldRelevance(p.category ?? '')
  const warnings = placeCompletenessWarnings({
    category: p.category ?? '',
    mapUrl: p.map_url, lat: p.lat, lng: p.lng, address: p.address,
    openingHours: p.opening_hours, closedDays: p.closed_days ?? null,
    priceType: p.price_type, fee: p.fee, priceMin: p.price_min, priceMax: p.price_max,
  })
  // Coordinate warnings are rendered LIVE inside <CoordinateFields>; keep only the
  // non-coordinate advisories (hours/price) in this server-rendered top box so the
  // two never show a stale, contradictory state.
  const otherWarnings = warnings.filter((w) => w !== 'missing_coordinates' && w !== 'missing_location')

  const tri = (v: boolean | null | undefined) => (v === true ? 'true' : v === false ? 'false' : '')
  const triOptions = [
    { value: '', label: t('opt_unknown') },
    { value: 'true', label: t('opt_yes') },
    { value: 'false', label: t('opt_no') },
  ]
  const enumOpts = (vals: readonly string[], prefix: string) =>
    [{ value: '', label: t('opt_unknown') }, ...vals.map((v) => ({ value: v, label: t(`${prefix}${v}`) }))]

  const relChip = (
    <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-teal/10 text-teal border border-teal/20 align-middle">
      {t('category_relevant')}
    </span>
  )

  return (
    <div className="space-y-3">
      {/* Incomplete-info warnings (advisory; never blocks publishing). Coordinate
          warnings are shown live inside the Address & map section below. */}
      {otherWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-[13px] font-semibold text-amber-800 mb-1.5">⚠️ {t('warn_title')}</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {otherWarnings.map((w) => (
              <li key={w} className="text-[12.5px] text-amber-700">{t(`warn_${w}` as 'warn_missing_location')}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── ADDRESS & MAP ── */}
      <Section title={t('sec_address_map')} defaultOpen>
        {/* Phase 5: search-driven place picker (degrades to manual coords when
            Google is not configured). Lat/lng live in its advanced section. */}
        <PlacePicker
          initial={{
            lat: parseCoordinate(p.lat),
            lng: parseCoordinate(p.lng),
            address: p.address ?? null,
            mapUrl: p.map_url ?? null,
            provider: p.location_provider ?? null,
            providerPlaceId: p.provider_place_id ?? null,
            formattedAddress: p.provider_formatted_address ?? null,
            countryCode: p.country_code ?? null,
            source: p.location_source ?? null,
            manuallyAdjusted: p.location_manually_adjusted === true,
          }}
          googleAvailable={adminGoogleAvailable(mapConfig)}
          apiKey={mapConfig.browserKey}
          mapId={mapConfig.mapId}
        />
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Inp label={t('postal_code')} name="postal_code" defaultValue={p.postal_code ?? ''} placeholder="812-0011" />
          <Inp label={t('nearest_station')} name="nearest_station" defaultValue={p.nearest_station ?? ''} />
          <Inp label={t('station_walk_minutes')} name="station_walk_minutes" type="number" min="0" defaultValue={p.station_walk_minutes ?? ''} />
          <Inp label={t('subcategories')} name="subcategories" defaultValue={(p.subcategories ?? []).join(', ')} help={t('subcategories_help')} />
        </div>
      </Section>

      {/* ── PRICE ── */}
      <Section title={t('sec_price')}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Sel label={t('price_type')} name="price_type" defaultValue={p.price_type ?? ''}
            options={[{ value: '', label: t('opt_unknown') }, { value: 'free', label: t('price_free') }, { value: 'paid', label: t('price_paid') }, { value: 'varies', label: t('price_varies') }]} />
          <Inp label={t('price_min')} name="price_min" type="number" min="0" defaultValue={p.price_min ?? ''} />
          <Inp label={t('price_max')} name="price_max" type="number" min="0" defaultValue={p.price_max ?? ''} />
          <Inp label={t('currency')} name="currency" defaultValue={p.currency ?? ''} placeholder="JPY" help={t('currency_help')} />
        </div>
      </Section>

      {/* ── OPENING & CLOSING ── */}
      <Section title={t('sec_hours')}>
        <Txt label={t('opening_hours')} name="opening_hours" defaultValue={jsonStr(p.opening_hours)} help={t('opening_hours_help')} rows={5} mono />
        <div className="mt-4">
          <span className={LBL}>{t('closed_days')}</span>
          <ChkGroup name="closed_days" selected={p.closed_days ?? []} options={WEEKDAYS.map((d) => ({ value: d, label: t(`day_${d}`) }))} />
        </div>
        <div className="mt-4 max-w-[280px]">
          <Sel label={t('temporary_status')} name="temporary_status" defaultValue={p.temporary_status ?? ''}
            options={enumOpts(TEMPORARY_STATUSES, 'ts_')} />
        </div>
      </Section>

      {/* ── FACILITIES ── */}
      <Section title={t('sec_facilities')}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Sel label={t('parking')} name="parking" defaultValue={p.parking ?? ''} options={enumOpts(PARKING_OPTIONS, 'parking_')} />
          <Sel label={t('indoor_outdoor')} name="indoor_outdoor" defaultValue={p.indoor_outdoor ?? ''} options={enumOpts(INDOOR_OUTDOOR_OPTIONS, 'io_')} />
          <Sel label={t('smoking_policy')} name="smoking_policy" defaultValue={p.smoking_policy ?? ''} options={enumOpts(SMOKING_OPTIONS, 'smk_')} />
          <Tri label={t('wheelchair_accessible')} name="wheelchair_accessible" defaultValue={tri(p.wheelchair_accessible)} options={triOptions} />
          <Tri label={t('rainy_day_ok')} name="rainy_day_ok" defaultValue={tri(p.rainy_day_ok)} options={triOptions} />
          <Sel label={<>{t('tattoo_policy')}{rel.tattoo && relChip}</>} name="tattoo_policy" defaultValue={p.tattoo_policy ?? ''} options={enumOpts(TATTOO_OPTIONS, 'tat_')} />
          <Tri label={<>{t('bbq_available')}{rel.bbq && relChip}</>} name="bbq_available" defaultValue={tri(p.bbq_available)} options={triOptions} />
          <Tri label={<>{t('camping_available')}{rel.camping && relChip}</>} name="camping_available" defaultValue={tri(p.camping_available)} options={triOptions} />
          <Sel label={<>{t('pet_policy')}{rel.pet && relChip}</>} name="pet_policy" defaultValue={p.pet_policy ?? ''} options={enumOpts(PET_OPTIONS, 'pet_')} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div>
            <span className={LBL}>{t('payment_methods')}</span>
            <ChkGroup name="payment_methods" selected={p.payment_methods ?? []} options={PAYMENT_METHODS.map((v) => ({ value: v, label: t(`pm_${v}`) }))} />
          </div>
          <div>
            <span className={LBL}>{t('supported_languages')}</span>
            <ChkGroup name="supported_languages" selected={p.supported_languages ?? []} options={PLACE_LANGUAGES.map((v) => ({ value: v, label: t(`lang_${v}`) }))} />
          </div>
        </div>
      </Section>

      {/* ── SUITABILITY ── */}
      <Section title={t('sec_suitability')}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Tri label={<>{t('good_for_children')}{rel.kids && relChip}</>} name="good_for_children" defaultValue={tri(p.good_for_children)} options={triOptions} />
          <Tri label={t('good_for_solo')} name="good_for_solo" defaultValue={tri(p.good_for_solo)} options={triOptions} />
          <Tri label={t('good_for_groups')} name="good_for_groups" defaultValue={tri(p.good_for_groups)} options={triOptions} />
          <Sel label={t('expected_crowd_level')} name="expected_crowd_level" defaultValue={p.expected_crowd_level ?? ''} options={enumOpts(CROWD_LEVELS, 'crowd_')} />
        </div>
      </Section>

      {/* ── RESERVATION & ACTION LINKS ── */}
      <Section title={t('sec_reservation')}>
        <div className="grid sm:grid-cols-3 gap-4">
          <Tri label={<>{t('reservation_recommended')}{rel.reservation && relChip}</>} name="reservation_recommended" defaultValue={tri(p.reservation_recommended)} options={triOptions} />
          <Tri label={t('reservation_required')} name="reservation_required" defaultValue={tri(p.reservation_required)} options={triOptions} />
          <Tri label={t('walk_ins_accepted')} name="walk_ins_accepted" defaultValue={tri(p.walk_ins_accepted)} options={triOptions} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Inp label={t('official_website')} name="official_website" type="url" defaultValue={p.official_website ?? ''} placeholder="https://" />
          <Inp label={t('reservation_url')} name="reservation_url" type="url" defaultValue={p.reservation_url ?? ''} placeholder="https://" />
          <Inp label={t('reservation_provider')} name="reservation_provider" defaultValue={p.reservation_provider ?? ''} placeholder="Tabelog, Hot Pepper…" />
          <Inp label={t('phone')} name="phone" type="tel" defaultValue={p.phone ?? ''} placeholder="092-123-4567" />
          <Inp label={t('social_url')} name="social_url" type="url" defaultValue={p.social_url ?? ''} placeholder="https://" />
        </div>
        {/* Static preview of which action buttons users will see */}
        <ActionsPreview p={p} t={t} />
      </Section>

      {/* ── KNOW BEFORE YOU GO ── */}
      <Section title={t('sec_kbyg')}>
        <div className="space-y-4">
          <div>
            <span className={LBL}>{t('know_before_you_go')}</span>
            {/* draftKey=null so these editors never collide with the body editor's autosave */}
            <RichTextEditor name="know_before_you_go" defaultValue={p.know_before_you_go ?? ''} minHeight="140px" draftKey={null} />
          </div>
          <div>
            <span className={LBL}>{t('vi_tips')}</span>
            <RichTextEditor name="vi_tips" defaultValue={p.vi_tips ?? ''} minHeight="140px" draftKey={null} />
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <Inp label={t('items_to_bring')} name="items_to_bring" defaultValue={(p.items_to_bring ?? []).join(', ')} help={t('items_to_bring_help')} />
            <Inp label={t('recommended_duration_minutes')} name="recommended_duration_minutes" type="number" min="0" defaultValue={p.recommended_duration_minutes ?? ''} />
            <Inp label={t('best_visit_time')} name="best_visit_time" defaultValue={p.best_visit_time ?? ''} />
          </div>
        </div>
      </Section>

      {/* ── JAPANESE PHRASES ── */}
      <Section title={t('sec_phrases')}>
        <Txt label={t('japanese_phrases')} name="japanese_phrases" defaultValue={jsonStr(p.japanese_phrases)} help={t('japanese_phrases_help')} rows={5} mono />
      </Section>

      {/* ── SOURCE & VERIFICATION ── */}
      <Section title={t('sec_source')}>
        <div className="grid sm:grid-cols-3 gap-4">
          <Inp label={t('source_url')} name="source_url" type="url" defaultValue={p.source_url ?? ''} placeholder="https://" />
          <Inp label={t('last_verified_at')} name="last_verified_at" type="date" defaultValue={p.last_verified_at ?? ''} />
          <Sel label={t('verification_status')} name="verification_status" defaultValue={p.verification_status ?? 'unverified'} options={enumOpts(VERIFICATION_STATUSES, 'vs_').slice(1)} />
        </div>
      </Section>

      {/* ── VISIBILITY & ELIGIBILITY ── */}
      <Section title={t('sec_visibility')} defaultOpen>
        <div className="grid sm:grid-cols-2 gap-4">
          <Tri label={t('search_eligible')} name="search_eligible" defaultValue={tri(p.search_eligible ?? true)} options={triOptions.slice(1)} />
          <Tri label={t('recommend_eligible')} name="recommend_eligible" defaultValue={tri(p.recommend_eligible ?? true)} options={triOptions.slice(1)} />
        </div>
        <p className={HELP}>{t('search_eligible_help')}</p>
      </Section>
    </div>
  )
}

// ── reusable building blocks ────────────────────────────────────────
function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="border border-line rounded-2xl overflow-hidden bg-paper/40">
      <summary className="px-4 py-3 cursor-pointer select-none font-semibold text-[14px] text-ink bg-cream/40 hover:bg-cream/70">
        {title}
      </summary>
      <div className="px-4 py-4 border-t border-line bg-white">{children}</div>
    </details>
  )
}

function Inp({ label, name, defaultValue, placeholder, help, type = 'text', min, step }: {
  label: React.ReactNode; name: string; defaultValue?: string | number; placeholder?: string; help?: string
  type?: string; min?: string; step?: string
}) {
  return (
    <div>
      <label className={LBL}>{label}</label>
      <input name={name} type={type} min={min} step={step} defaultValue={defaultValue} placeholder={placeholder} className={I} />
      {help && <p className={HELP}>{help}</p>}
    </div>
  )
}

function Sel({ label, name, defaultValue, options }: {
  label: React.ReactNode; name: string; defaultValue?: string; options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className={LBL}>{label}</label>
      <select name={name} defaultValue={defaultValue} className={`${I} bg-white`}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function Tri(props: { label: React.ReactNode; name: string; defaultValue?: string; options: { value: string; label: string }[] }) {
  return <Sel {...props} />
}

function Txt({ label, name, defaultValue, help, rows = 4, mono }: {
  label: string; name: string; defaultValue?: string; help?: string; rows?: number; mono?: boolean
}) {
  return (
    <div>
      <label className={LBL}>{label}</label>
      <textarea name={name} defaultValue={defaultValue} rows={rows}
        className={`${I} resize-y ${mono ? 'font-mono text-[12.5px]' : ''}`} />
      {help && <p className={HELP}>{help}</p>}
    </div>
  )
}

function ChkGroup({ name, selected, options }: { name: string; selected: string[]; options: { value: string; label: string }[] }) {
  const set = new Set(selected)
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.value} className="inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-full border border-line bg-white cursor-pointer hover:border-rose/40">
          <input type="checkbox" name={name} value={o.value} defaultChecked={set.has(o.value)} className="accent-rose" />
          {o.label}
        </label>
      ))}
    </div>
  )
}

function ActionsPreview({ p, t }: { p: PlaceFieldsRow; t: (key: string) => string }) {
  const btns: { label: string; cls: string }[] = []
  if (p.map_url) btns.push({ label: t('pub_directions'), cls: 'bg-rose text-white' })
  if (p.official_website) btns.push({ label: t('pub_website'), cls: 'bg-teal-soft text-teal border border-teal/20' })
  if (p.reservation_url) btns.push({ label: t('pub_reserve'), cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' })
  if (p.phone) btns.push({ label: t('pub_call'), cls: 'bg-cream text-ink border border-line' })
  if (p.social_url) btns.push({ label: t('pub_social'), cls: 'bg-cream text-ink border border-line' })
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className={HELP}>{t('preview_actions')}</p>
      {btns.length === 0 ? (
        <p className="text-[12.5px] text-muted mt-1.5">{t('preview_none')}</p>
      ) : (
        <div className="flex flex-wrap gap-2 mt-1.5">
          {btns.map((b, i) => (
            <span key={i} className={`text-[12px] font-semibold px-3.5 py-2 rounded-xl ${b.cls}`}>{b.label}</span>
          ))}
        </div>
      )}
    </div>
  )
}
