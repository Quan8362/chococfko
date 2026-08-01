export type ManagementIconName =
  | 'trophy'
  | 'plus'
  | 'search'
  | 'filter'
  | 'sort'
  | 'calendar'
  | 'pin'
  | 'events'
  | 'clock'
  | 'empty'
  | 'reset'

export default function ManagementIcon({
  name,
  className = 'h-5 w-5',
}: {
  name: ManagementIconName
  className?: string
}) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    viewBox: '0 0 24 24',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className,
  }

  if (name === 'trophy') {
    return (
      <svg {...common}>
        <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
        <path d="M8 6H5v1a4 4 0 0 0 4 4M16 6h3v1a4 4 0 0 1-4 4M12 12v4M8.5 20h7M10 16h4v4h-4z" />
      </svg>
    )
  }
  if (name === 'plus') {
    return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
  }
  if (name === 'search') {
    return <svg {...common}><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
  }
  if (name === 'filter') {
    return <svg {...common}><path d="M4 6h16M7 12h10M10 18h4" /></svg>
  }
  if (name === 'sort') {
    return <svg {...common}><path d="M8 6h12M8 12h8M8 18h4M4 5v14m0 0-2.5-2.5M4 19l2.5-2.5" /></svg>
  }
  if (name === 'calendar') {
    return <svg {...common}><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>
  }
  if (name === 'pin') {
    return <svg {...common}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
  }
  if (name === 'events') {
    return <svg {...common}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 4v2M20 12h-2M12 20v-2M4 12h2" /></svg>
  }
  if (name === 'clock') {
    return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>
  }
  if (name === 'reset') {
    return <svg {...common}><path d="M4 7v5h5M5.5 11a7 7 0 1 1 1.8 6" /></svg>
  }
  return (
    <svg {...common}>
      <path d="M7 4h10l3 4-8 12L4 8l3-4Z" />
      <path d="m4 8 8 3 8-3M12 11v9" />
    </svg>
  )
}
