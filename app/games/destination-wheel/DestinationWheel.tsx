'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { imgProxy } from '@/lib/avatar'

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
  onsen: '♨️',
}

// Soft, warm on-brand tints for the wheel segments (cycled).
const SEGMENT_COLORS = ['#F7C8DA', '#FBE0B0', '#BFE3EA', '#E6D3F0', '#FAD2C0', '#CDE9CE']

const SPIN_MS = 3600

type SpinState = 'idle' | 'spinning' | 'done'

export default function DestinationWheel({ places, categories }: Props) {
  const t = useTranslations('games.destination_wheel')
  const tCommon = useTranslations('common')

  const [selectedCategory, setSelectedCategory] = useState('all')
  const [spinState, setSpinState] = useState<SpinState>('idle')
  const [result, setResult] = useState<Place | null>(null)
  const [lastSlug, setLastSlug] = useState<string | null>(null)
  const [imgError, setImgError] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [spinMs, setSpinMs] = useState(SPIN_MS)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reducedRef = useRef(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedRef.current = mq.matches
    const onChange = () => { reducedRef.current = mq.matches }
    mq.addEventListener?.('change', onChange)
    return () => {
      mq.removeEventListener?.('change', onChange)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const filteredPlaces =
    selectedCategory === 'all'
      ? places
      : places.filter(p => p.category === selectedCategory)

  // Wheel segments are the available categories — stable regardless of the filter.
  const segments = categories
  const segCount = Math.max(segments.length, 1)
  const segAngle = 360 / segCount

  const conic = segments.length
    ? `conic-gradient(from 0deg, ${segments
        .map((_, i) => `${SEGMENT_COLORS[i % SEGMENT_COLORS.length]} ${i * segAngle}deg ${(i + 1) * segAngle}deg`)
        .join(', ')})`
    : SEGMENT_COLORS[0]

  const handleCategoryChange = (code: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setSelectedCategory(code)
    setSpinState('idle')
    setResult(null)
    setLastSlug(null)
  }

  const spin = useCallback(() => {
    if (filteredPlaces.length === 0 || spinState === 'spinning') return
    if (timerRef.current) clearTimeout(timerRef.current)

    setSpinState('spinning')
    setResult(null)
    setImgError(false)

    // Pick the winning place (existing logic: avoid repeating the last result).
    const pool =
      filteredPlaces.length > 1
        ? filteredPlaces.filter(p => p.slug !== lastSlug)
        : filteredPlaces
    const target = pool[Math.floor(Math.random() * pool.length)]

    // Land the pointer (fixed at the top) on the segment whose category matches
    // the winning place's category. Segment k's centre sits at angle
    // (k*segAngle + segAngle/2) measured clockwise from the top. After rotating
    // the wheel clockwise by R, that centre sits at (centre + R); we want it at 0
    // (the pointer), so R ≡ -centre (mod 360). A small jitter keeps the pointer
    // off the segment border; whole extra turns make it feel like a real spin.
    const k = Math.max(0, segments.findIndex(c => c.code === target.category))
    const segCentre = k * segAngle + segAngle / 2
    const jitter = (Math.random() - 0.5) * segAngle * 0.6
    const targetMod = (((360 - (segCentre + jitter)) % 360) + 360) % 360
    const currentMod = ((rotation % 360) + 360) % 360
    const delta = ((targetMod - currentMod) % 360 + 360) % 360
    const extraTurns = 4 + Math.floor(Math.random() * 3) // 4–6 full turns

    const duration = reducedRef.current ? 0 : SPIN_MS
    setSpinMs(duration)
    setRotation(rotation + extraTurns * 360 + delta)

    timerRef.current = setTimeout(() => {
      setResult(target)
      setLastSlug(target.slug)
      setSpinState('done')
    }, duration + 60)
  }, [filteredPlaces, lastSlug, rotation, segAngle, segments, spinState])

  const reset = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setSpinState('idle')
    setResult(null)
  }

  const noPlaces = filteredPlaces.length === 0

  const chipClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium border transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45 focus-visible:ring-offset-2 focus-visible:ring-offset-cream ${
      active
        ? 'bg-rose text-white border-rose shadow-[0_2px_10px_-2px_rgba(194,24,91,0.45)] ring-1 ring-rose/30'
        : 'bg-paper text-ink/70 border-line hover:border-rose/40 hover:text-rose hover:-translate-y-px'
    }`

  return (
    <div>
      {/* ── Topic chips — full width, left-aligned ───────────── */}
      <div className="mb-7">
        <p className="text-[11px] font-bold tracking-[2px] uppercase text-muted/70 mb-3">
          {t('select_category')}
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => handleCategoryChange('all')} aria-pressed={selectedCategory === 'all'} className={chipClass(selectedCategory === 'all')}>
            🎯 {t('all')}
          </button>
          {categories.map(cat => (
            <button
              key={cat.code}
              onClick={() => handleCategoryChange(cat.code)}
              aria-pressed={selectedCategory === cat.code}
              className={chipClass(selectedCategory === cat.code)}
            >
              {CATEGORY_EMOJI[cat.code] ?? '📍'} {cat.full}
            </button>
          ))}
        </div>
      </div>

      {/* ── Two balanced columns: wheel + result ─────────────── */}
      <div className="grid lg:grid-cols-2 gap-6 items-stretch">

        {/* Wheel card */}
        <div className="bg-paper border border-line rounded-2xl p-6 sm:p-7 shadow-card flex flex-col items-center">

          {/* Wheel */}
          <div className="relative mx-auto w-[min(78vw,300px)] aspect-square">
            {/* Pointer (fixed at the top, points down into the wheel) */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-1 z-20 filter drop-shadow-[0_2px_2px_rgba(36,26,23,0.25)]">
              <div className="w-0 h-0 border-l-[11px] border-r-[11px] border-t-[18px] border-l-transparent border-r-transparent border-t-rose" />
            </div>

            {/* Rim + rotating wheel */}
            <div
              className={`absolute inset-0 rounded-full p-[6px] bg-paper transition-shadow duration-500 ${
                spinState === 'done'
                  ? 'shadow-[0_0_30px_-6px_rgba(194,24,91,0.5)]'
                  : 'shadow-[0_10px_30px_-10px_rgba(36,26,23,0.3)]'
              }`}
            >
              <div
                className="relative w-full h-full rounded-full overflow-hidden"
                style={{
                  background: conic,
                  transform: `rotate(${rotation}deg)`,
                  transitionProperty: 'transform',
                  transitionDuration: `${spinMs}ms`,
                  transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                  willChange: 'transform',
                }}
              >
                {/* Emoji labels, one per segment, riding the wheel */}
                {segments.map((cat, i) => {
                  const angle = i * segAngle + segAngle / 2
                  return (
                    <div key={cat.code} className="absolute inset-0" style={{ transform: `rotate(${angle}deg)` }}>
                      <span
                        className="absolute left-1/2 top-[6%] text-[clamp(13px,3.4vw,19px)] select-none leading-none"
                        style={{ transform: `translateX(-50%) rotate(${-angle}deg)` }}
                      >
                        {CATEGORY_EMOJI[cat.code] ?? '📍'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Static hub */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-14 h-14 rounded-full bg-paper border border-line shadow-md grid place-items-center text-[24px] select-none">
              🎡
            </div>
          </div>

          {/* Controls */}
          <div className="w-full mt-7">
            {noPlaces ? (
              <div className="text-center space-y-2">
                <p className="text-[14px] text-muted">{t('empty_category')}</p>
                <p className="text-[12px] text-muted/60">{t('empty_hint')}</p>
              </div>
            ) : spinState === 'done' ? (
              <div className="flex flex-col gap-2">
                <button
                  onClick={spin}
                  className="w-full py-2.5 rounded-xl bg-rose text-white font-semibold text-[14px] hover:bg-rose-deep transition-all duration-150 hover:-translate-y-0.5 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                >
                  🎡 {t('spin_again')}
                </button>
                <button
                  onClick={reset}
                  className="w-full py-2 rounded-xl bg-cream text-muted font-medium text-[13px] hover:bg-line/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
                >
                  {t('back_btn')}
                </button>
              </div>
            ) : (
              <button
                onClick={spin}
                disabled={spinState === 'spinning'}
                className={`w-full py-3 rounded-xl font-bold text-[15px] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
                  spinState === 'spinning'
                    ? 'bg-rose/40 text-white cursor-not-allowed'
                    : 'bg-rose text-white hover:bg-rose-deep shadow-sm hover:shadow-md hover:-translate-y-0.5'
                }`}
              >
                {spinState === 'spinning' ? `🎡 ${t('spinning')}` : `🎡 ${t('spin_btn')}`}
              </button>
            )}

            {!noPlaces && (
              <p className="text-[11px] text-muted/50 mt-3 text-center">
                {t('place_count', { count: filteredPlaces.length })}
              </p>
            )}
          </div>
        </div>

        {/* Result / empty state */}
        <div className="flex flex-col">
          {spinState === 'done' && result ? (
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
          ) : spinState === 'spinning' ? (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] text-center gap-3 bg-rose/5 border border-rose/20 rounded-2xl p-8">
              <div className="flex gap-1.5">
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
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] text-center gap-5 bg-cream/40 border border-dashed border-line rounded-2xl p-8">
              <span className="text-[44px] leading-none">🗺️</span>
              <div>
                <p className="font-serif font-bold text-[17px] text-ink mb-1.5">{t('result_empty_title')}</p>
                <p className="text-[13.5px] text-muted/80 max-w-[300px] leading-relaxed mx-auto">{t('result_empty_sub')}</p>
              </div>
              {/* How it works — 3-step preview */}
              <div className="w-full max-w-[320px]">
                <p className="text-[10px] font-bold tracking-[1.5px] uppercase text-rose/70 mb-2.5">{t('how_label')}</p>
                <div className="flex items-stretch justify-center gap-2">
                  <HowStep emoji="🎯" label={t('how_step_pick')} />
                  <Connector />
                  <HowStep emoji="🎡" label={t('how_step_spin')} />
                  <Connector />
                  <HowStep emoji="📍" label={t('how_step_go')} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function HowStep({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1.5">
      <span className="grid place-items-center w-10 h-10 rounded-xl bg-paper border border-line shadow-sm text-[18px] select-none">
        {emoji}
      </span>
      <span className="text-[11px] text-muted leading-tight">{label}</span>
    </div>
  )
}

function Connector() {
  return <span aria-hidden className="self-start mt-5 text-rose/40 text-[13px]">→</span>
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
          src={imgProxy(imgSrc)}
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
            href={`/places/${place.slug}`}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose text-white font-semibold text-[14px] hover:bg-rose-deep transition-all hover:-translate-y-0.5 shadow-sm hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            {tDetail}
          </Link>
          <a
            href={place.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal/10 text-teal border border-teal/30 font-semibold text-[14px] hover:bg-teal/20 transition-all hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
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
