// Single consistent line-icon set for the Community page (and footer).
// Pure SVG, no hooks → safe to import from both server and client components.
// Uniform 24×24 viewBox, currentColor stroke, 1.75 stroke width, round joins —
// so every icon reads as one family (replaces the previous OS emoji).

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-5 w-5"
      {...props}
    >
      {children}
    </svg>
  )
}

/* ── Topic icons (the 6 community categories) ──────────────────────────── */

export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m3 11 9-7 9 7" />
      <path d="M5 9.8V20h14V9.8" />
      <path d="M10 20v-6h4v6" />
    </Svg>
  )
}

export function PaperworkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </Svg>
  )
}

export function TransportIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="6" y="3" width="12" height="14" rx="3.5" />
      <path d="M6 11h12" />
      <path d="m8.5 17-2 4" />
      <path d="m15.5 17 2 4" />
    </Svg>
  )
}

export function StudyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 6.5C10.5 5.3 8.5 5 6.5 5H4v12.5h2.5c2 0 4 .3 5.5 1.5" />
      <path d="M12 6.5C13.5 5.3 15.5 5 17.5 5H20v12.5h-2.5c-2 0-4 .3-5.5 1.5" />
      <path d="M12 6.5V19" />
    </Svg>
  )
}

export function WorkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5" />
      <path d="M3 12.5h18" />
    </Svg>
  )
}

export function StoryIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.4-4.1A7.5 7.5 0 1 1 20 11.5Z" />
      <path d="M9 11h6" />
      <path d="M9 14h3" />
    </Svg>
  )
}

/** Map a community category code → its topic icon. Unknown codes return null. */
export const TOPIC_ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  life: HomeIcon,
  paperwork: PaperworkIcon,
  transport: TransportIcon,
  study: StudyIcon,
  work: WorkIcon,
  story: StoryIcon,
}

/** Renders the icon for a topic/category code, or nothing if unknown. */
export function TopicIcon({ topic, ...props }: { topic: string } & IconProps) {
  const Icon = TOPIC_ICONS[topic]
  return Icon ? <Icon {...props} /> : null
}

/* ── Utility icons used on the page / footer ───────────────────────────── */

export function PenIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Svg>
  )
}

export function MailIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </Svg>
  )
}

export function ChatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.4-4.1A7.5 7.5 0 1 1 20 11.5Z" />
    </Svg>
  )
}

export function FeedbackIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z" />
    </Svg>
  )
}
