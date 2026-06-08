import Link from 'next/link'
import JlptBadge from './JlptBadge'

export const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const
export type JlptLevel = (typeof JLPT_LEVELS)[number]

export function urlLevel(level: string) {
  return level.toLowerCase()
}

export function dbLevel(urlLevel: string): JlptLevel | null {
  const upper = urlLevel.toUpperCase() as JlptLevel
  return JLPT_LEVELS.includes(upper) ? upper : null
}

interface LevelCard {
  level: JlptLevel
  desc: string
  count: number
  href: string
  label: string
  countLabel?: string    // suffix after count, e.g. "kanji", "mẫu"
  countDisplay?: string  // pre-formatted full string, overrides count+countLabel
}

interface LevelPickerProps {
  levels: LevelCard[]
}

export default function LevelPicker({ levels }: LevelPickerProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {levels.map(({ level, desc, count, href, label, countLabel, countDisplay }) => (
        <Link
          key={level}
          href={href}
          className="group bg-paper border border-line rounded-2xl p-5 hover:border-rose/30 hover:shadow-[0_4px_20px_-6px_rgba(194,24,91,0.15)] transition-all hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between mb-3">
            <JlptBadge level={level} />
            {(countDisplay ?? count > 0) && (
              <span className="text-[12px] text-muted">
                {countDisplay ?? `${count} ${countLabel ?? 'từ'}`}
              </span>
            )}
          </div>
          <h3 className="font-serif font-bold text-[17px] text-ink group-hover:text-rose transition-colors mb-1">
            {level}
          </h3>
          <p className="text-[13px] text-muted leading-snug mb-4">{desc}</p>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-rose">
            {label}
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </Link>
      ))}
    </div>
  )
}
