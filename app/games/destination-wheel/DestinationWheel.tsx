'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

// Defined inline to avoid importing from lib/places (which pulls next/headers into the client bundle)
interface Place {
  slug: string
  name: string
  area: string
  desc: string
  category: string
  categoryLabel: string
  fee: 'free' | 'paid' | null
  mapUrl: string
  img: string
  imgFallback: string
}

interface Category {
  code: string
  full: string
}

interface Props {
  places: Place[]
  categories: Category[]
}

const CATEGORY_EMOJI: Record<string, string> = {
  landmark: '🏯',
  food: '🍜',
  sea: '🏖️',
  camp: '⛺',
  mountain: '⛰️',
  park: '🌿',
  viet: '🥢',
  grocery: '🛒',
  izakaya: '🍻',
  japanese: '🍣',
  thai: '🌶️',
  chinese: '🥟',
  korean: '🍖',
  cafe_milk_tea: '☕',
  kids_playground: '🎠',
}

type SpinState = 'idle' | 'spinning' | 'done'

export default function DestinationWheel({ places, categories }: Props) {
  const t = useTranslations('games.destination_wheel')
  const tCommon = useTranslations('common')

  const [selectedCategory, setSelectedCategory] = useState('all')
  const [spinState, setSpinState] = useState<SpinState>('idle')
  const [displayedPlace, setDisplayedPlace] = useState<Place | null>(null)
  const [result, setResult] = useState<Place | null>(null)
  const [lastSlug, setLastSlug] = useState<string | null>(null)
  const [imgError, setImgError] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filteredPlaces =
    selectedCategory === 'all'
      ? places
      : places.filter(p => p.category === selectedCategory)

  const handleCategoryChange = (code: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setSelectedCategory(code)
    setSpinState('idle')
    setResult(null)
    setDisplayedPlace(null)
    setLastSlug(null)
  }

  const spin = useCallback(() => {
    if (filteredPlaces.length === 0) return
    if (timerRef.current) clearTimeout(timerRef.current)

    setSpinState('spinning')
    setResult(null)
    setImgError(false)

    // Avoid repeating the last result when pool size allows
    const pool =
      filteredPlaces.length > 1
        ? filteredPlaces.filter(p => p.slug !== lastSlug)
        : filteredPlaces
    const target = pool[Math.floor(Math.random() * pool.length)]

    let tick = 0
    const totalTicks = 18

    const cycle = () => {
      tick++
      const rand = filteredPlaces[Math.floor(Math.random() * filteredPlaces.length)]
      setDisplayedPlace(rand)

      if (tick < totalTicks) {
        // Exponential slow-down: fast at start, slows near end
        const progress = tick / totalTicks
        const delay = 60 + Math.pow(progress, 2.8) * 900
        timerRef.current = setTimeout(cycle, delay)
      } else {
        setDisplayedPlace(target)
        setResult(target)
        setLastSlug(target.slug)
        setSpinState('done')
      }
    }

    timerRef.current = setTimeout(cycle, 60)
  }, [filteredPlaces, lastSlug])

  const reset = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setSpinState('idle')
    setResult(null)
    setDisplayedPlace(null)
  }

  const noPlaces = filteredPlaces.length === 0

  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start">

      {/* ── Left column: category + spin ─────────────────── */}
      <div className="w-full lg:w-[380px] shrink-0">

        {/* Category chips */}
        <div className="mb-6">
          <p className="text-[11px] font-bold tracking-[2px] uppercase text-muted/70 mb-3">
            {t('select_category')}
          </p>
          <div className="flex flex-wrap gap-2">
            {/* All */}
            <button
              onClick={() => handleCategoryChange('all')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium border transition-all ${
                selectedCategory === 'all'
                  ? 'bg-rose text-white border-rose shadow-sm'
                  : 'bg-paper text-ink/70 border-line hover:border-rose/40 hover:text-rose'
              }`}
            >
              🎯 {t('all')}
            </button>

            {categories.map(cat => (
              <button
                key={cat.code}
                onClick={() => handleCategoryChange(cat.code)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium border transition-all ${
                  selectedCategory === cat.code
                    ? 'bg-rose text-white border-rose shadow-sm'
                    : 'bg-paper text-ink/70 border-line hover:border-rose/40 hover:text-rose'
                }`}
              >
                {CATEGORY_EMOJI[cat.code] ?? '📍'} {cat.full}
              </button>
            ))}
          </div>
        </div>

        {/* Spin widget */}
        <div className="bg-paper border border-line rounded-2xl p-6 shadow-card text-center">

          {/* Animated display area */}
          <div
            className={`
              relative w-36 h-36 mx-auto mb-6 rounded-full flex items-center justify-center
              bg-gradient-to-br from-rose/10 via-cream to-teal/10
              border-2 transition-all duration-300
              ${spinState === 'spinning' ? 'border-rose/50 shadow-[0_0_32px_-4px_rgba(194,24,91,0.3)] animate-pulse' : 'border-line'}
            `}
          >
            {spinState === 'idle' && (
              <span className="text-[56px] select-none">🎡</span>
            )}

            {spinState === 'spinning' && displayedPlace && (
              <div className="w-full h-full flex flex-col items-center justify-center px-3 overflow-hidden">
                <span className="text-[22px] mb-1">
                  {CATEGORY_EMOJI[displayedPlace.category] ?? '📍'}
                </span>
                <p
                  className="text-[11px] font-bold text-rose text-center leading-tight line-clamp-2 blur-[0.6px]"
                  style={{ filter: 'blur(0.4px)' }}
                >
                  {displayedPlace.name}
                </p>
              </div>
            )}

            {spinState === 'done' && result && (
              <div className="w-full h-full flex flex-col items-center justify-center px-3 overflow-hidden">
                <span className="text-[22px] mb-1">
                  {CATEGORY_EMOJI[result.category] ?? '📍'}
                </span>
                <p className="text-[11px] font-bold text-rose text-center leading-tight line-clamp-2">
                  {result.name}
                </p>
              </div>
            )}
          </div>

          {/* Spin button */}
          {noPlaces ? (
            <div className="text-center space-y-2">
              <p className="text-[14px] text-muted">{t('empty_category')}</p>
              <p className="text-[12px] text-muted/60">{t('empty_hint')}</p>
            </div>
          ) : spinState === 'done' ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={spin}
                className="w-full py-2.5 rounded-xl bg-rose text-white font-semibold text-[14px] hover:bg-rose-deep transition-colors"
              >
                🎡 {t('spin_again')}
              </button>
              <button
                onClick={reset}
                className="w-full py-2 rounded-xl bg-cream text-muted font-medium text-[13px] hover:bg-line/50 transition-colors"
              >
                {t('back_btn')}
              </button>
            </div>
          ) : (
            <button
              onClick={spin}
              disabled={spinState === 'spinning'}
              className={`w-full py-3 rounded-xl font-bold text-[15px] transition-all ${
                spinState === 'spinning'
                  ? 'bg-rose/40 text-white cursor-not-allowed'
                  : 'bg-rose text-white hover:bg-rose-deep shadow-sm hover:shadow-md hover:-translate-y-0.5'
              }`}
            >
              {spinState === 'spinning' ? `🎡 ${t('spinning')}` : `🎡 ${t('spin_btn')}`}
            </button>
          )}

          {/* Place count hint */}
          {!noPlaces && (
            <p className="text-[11px] text-muted/50 mt-3">
              {t('place_count', { count: filteredPlaces.length })}
            </p>
          )}
        </div>
      </div>

      {/* ── Right column: result ──────────────────────────── */}
      <div className="w-full">
        {spinState === 'idle' && (
          <div className="flex flex-col items-center justify-center min-h-[280px] text-center gap-4 bg-cream/40 border border-dashed border-line rounded-2xl p-8">
            <span className="text-[48px]">🗺️</span>
            <p className="text-[15px] text-muted/70 max-w-[280px] leading-relaxed">
              {t('page_desc')}
            </p>
          </div>
        )}

        {spinState === 'spinning' && (
          <div className="flex flex-col items-center justify-center min-h-[280px] text-center gap-3 bg-rose/5 border border-rose/20 rounded-2xl p-8">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="w-2.5 h-2.5 rounded-full bg-rose animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <p className="text-[15px] font-semibold text-rose">{t('spinning')}</p>
          </div>
        )}

        {spinState === 'done' && result && (
          <ResultCard
            place={result}
            imgError={imgError}
            onImgError={() => setImgError(true)}
            tDetail={t('detail_btn')}
            tMap={t('map_btn')}
            tResultHeading={t('result_heading')}
            tFree={tCommon('fee_free')}
            tPaid={tCommon('fee_paid')}
            tTopic={tCommon('topic')}
            tLocation={tCommon('location')}
            tCost={tCommon('cost')}
          />
        )}
      </div>
    </div>
  )
}

/* ── Result card ────────────────────────────────────────── */
interface ResultCardProps {
  place: Place
  imgError: boolean
  onImgError: () => void
  tDetail: string
  tMap: string
  tResultHeading: string
  tFree: string
  tPaid: string
  tTopic: string
  tLocation: string
  tCost: string
}

function ResultCard({
  place, imgError, onImgError,
  tDetail, tMap, tResultHeading,
  tFree, tPaid, tTopic, tLocation, tCost,
}: ResultCardProps) {
  const imgSrc = imgError ? place.imgFallback : place.img

  return (
    <div className="bg-paper border border-rose/20 rounded-2xl overflow-hidden shadow-[0_4px_32px_-8px_rgba(194,24,91,0.18)] animate-in fade-in slide-in-from-bottom-3 duration-500">

      {/* Heading ribbon */}
      <div className="bg-gradient-to-r from-rose/10 to-teal/5 border-b border-rose/10 px-5 py-3 flex items-center gap-2">
        <span className="text-[18px]">✨</span>
        <p className="text-[12px] font-bold tracking-[1.5px] uppercase text-rose">
          {tResultHeading}
        </p>
      </div>

      {/* Image */}
      <div className="relative w-full aspect-[16/7] overflow-hidden bg-cream">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt={place.name}
          onError={onImgError}
          className="w-full h-full object-cover"
        />
        {/* Category badge */}
        <span className="absolute top-3 left-3 bg-ink/70 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm">
          {CATEGORY_EMOJI[place.category] ?? '📍'} {place.categoryLabel}
        </span>
        {/* Fee badge */}
        {place.fee && (
          <span
            className={`absolute bottom-3 right-3 text-[11px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm ${
              place.fee === 'free'
                ? 'bg-teal/80 text-white'
                : 'bg-gold/80 text-white'
            }`}
          >
            {place.fee === 'free' ? tFree : tPaid}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-5 sm:p-6">
        <h2 className="font-serif font-bold text-[22px] sm:text-[26px] leading-tight text-ink mb-2">
          {place.name}
        </h2>
        <p className="text-[14px] text-muted leading-relaxed mb-4">{place.desc}</p>

        {/* Meta */}
        <div className="flex flex-wrap gap-3 mb-6">
          <MetaChip label={tTopic} value={place.categoryLabel} />
          <MetaChip label={tLocation} value={place.area} />
          {place.fee && (
            <MetaChip
              label={tCost}
              value={place.fee === 'free' ? tFree : tPaid}
            />
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/dia-diem/${place.slug}`}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose text-white font-semibold text-[14px] hover:bg-rose-deep transition-all hover:-translate-y-0.5 shadow-sm hover:shadow-md"
          >
            {tDetail}
          </Link>
          <a
            href={place.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal/10 text-teal border border-teal/30 font-semibold text-[14px] hover:bg-teal/20 transition-all hover:-translate-y-0.5"
          >
            🗺️ {tMap}
          </a>
        </div>
      </div>
    </div>
  )
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-cream/80 border border-line rounded-lg px-3 py-1.5">
      <span className="text-[11px] text-muted/70 font-medium">{label}</span>
      <span className="text-[12px] font-semibold text-ink">{value}</span>
    </div>
  )
}
