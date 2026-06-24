import { anonHex, anonAvatarColor } from '@/lib/anon'

interface Props {
  size?: number
  className?: string
  /** When provided, renders a deterministic colored initials avatar (still
   *  anonymous, but visually distinct per id). Without it, the neutral SVG. */
  id?: string
}

export default function AnonAvatar({ size = 32, className = '', id }: Props) {
  if (id) {
    const { bg, fg } = anonAvatarColor(id)
    // Full 4-char shortcode so ids sharing a 2-char prefix (e.g. 901E vs 9024)
    // stay visually distinct. Font sized down to fit four glyphs in the circle.
    const code = anonHex(id)
    return (
      <span
        aria-label="Anonymous"
        role="img"
        className={`inline-flex items-center justify-center rounded-full font-bold leading-none select-none flex-none ${className}`}
        style={{
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
          background: bg,
          color: fg,
          fontSize: Math.max(7, Math.round(size * 0.3)),
          letterSpacing: '-0.02em',
        }}
      >
        {code}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/anon-avatar.svg"
      alt="Anonymous"
      width={size}
      height={size}
      className={`rounded-full flex-none ${className}`}
      draggable={false}
    />
  )
}
