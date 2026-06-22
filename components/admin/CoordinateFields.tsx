'use client'

// Live, controlled latitude/longitude inputs for the Admin place editor.
//
// Fixes the Phase-1 bug where the form showed example placeholder numbers
// (33.5902 / 130.4017) that looked like real values while the DB was NULL. The
// inputs are now CONTROLLED + the completeness warning is derived LIVE from the
// same canonical helper the server uses, so the warning updates immediately as
// the admin types, clears, or loads a different place — and an empty field is
// unmistakably empty (status line + warning right under the inputs).
//
// Still submits plain `name="lat"`/`name="lng"` fields, so the existing
// `updatePlace` server action (which re-normalizes via validateCoordinateInput)
// is the source of truth on save. No coordinate auto-detection yet — that
// arrives in a later phase (see helper text).

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  parseCoordinate, coordinateWarnings, latFieldError, lngFieldError, isValidCoordinate,
} from '@/lib/coordinates'

const I = 'w-full text-[14px] px-3.5 py-2.5 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose'
const LBL = 'block text-[13px] font-semibold mb-1.5 text-[#5c4d44]'
const HELP = 'text-[11.5px] text-muted mt-1'

interface Props {
  /** Persisted values from the DB (already normalized to number|null). */
  initialLat: number | null
  initialLng: number | null
  /** Other location signals (loaded values) for the missing_location warning. */
  hasMapUrl: boolean
  hasAddress: boolean
}

function toField(n: number | null): string {
  return n === null || n === undefined ? '' : String(n)
}

export default function CoordinateFields({ initialLat, initialLng, hasMapUrl, hasAddress }: Props) {
  const t = useTranslations('place_fields')
  const [lat, setLat] = useState(() => toField(initialLat))
  const [lng, setLng] = useState(() => toField(initialLng))

  // Reset when a DIFFERENT place is loaded (server passes new initial values).
  useEffect(() => { setLat(toField(initialLat)); setLng(toField(initialLng)) }, [initialLat, initialLng])

  const pLat = parseCoordinate(lat)
  const pLng = parseCoordinate(lng)
  const latErr = latFieldError(lat)
  const lngErr = lngFieldError(lng)
  const valid = isValidCoordinate(pLat, pLng)
  // Coordinate completeness warnings — same helper the server uses.
  const warnings = coordinateWarnings({ lat: pLat, lng: pLng, hasMapUrl, hasAddress })

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={LBL} htmlFor="place-lat">{t('lat')}</label>
          <input
            id="place-lat" name="lat" type="number" step="any" inputMode="decimal"
            value={lat} onChange={(e) => setLat(e.target.value)}
            placeholder={t('coords_example_lat')}
            aria-invalid={latErr ? true : undefined}
            className={`${I} ${latErr ? 'border-rose' : ''}`}
          />
          {latErr && <p className="text-[11.5px] text-rose mt-1">{t('warn_invalid_lat')}</p>}
        </div>
        <div>
          <label className={LBL} htmlFor="place-lng">{t('lng')}</label>
          <input
            id="place-lng" name="lng" type="number" step="any" inputMode="decimal"
            value={lng} onChange={(e) => setLng(e.target.value)}
            placeholder={t('coords_example_lng')}
            aria-invalid={lngErr ? true : undefined}
            className={`${I} ${lngErr ? 'border-rose' : ''}`}
          />
          {lngErr && <p className="text-[11.5px] text-rose mt-1">{t('warn_invalid_lng')}</p>}
        </div>
      </div>

      {/* Live status — makes an empty (NULL) field unmistakable vs a real value. */}
      <div className="mt-2" aria-live="polite">
        {valid ? (
          <p className="text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 inline-block">
            ✓ {t('coords_set')}
          </p>
        ) : (
          <ul className="list-disc pl-5 space-y-0.5">
            {warnings.map((w) => (
              <li key={w} className="text-[12px] text-amber-700">{t(`warn_${w}` as 'warn_missing_coordinates')}</li>
            ))}
          </ul>
        )}
      </div>

      <p className={HELP}>{t('coords_help')}</p>
    </div>
  )
}
