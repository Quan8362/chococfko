interface JlptBadgeProps {
  level: string
}

const COLORS: Record<string, string> = {
  N5: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  N4: 'bg-blue-100 text-blue-800 border-blue-300',
  N3: 'bg-amber-100 text-amber-800 border-amber-300',
  N2: 'bg-orange-100 text-orange-800 border-orange-300',
  N1: 'bg-red-100 text-red-800 border-red-300',
}

export default function JlptBadge({ level }: JlptBadgeProps) {
  const color = COLORS[level] ?? 'bg-line text-muted border-line'
  return (
    <span className={`inline-flex items-center text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full border ${color}`}>
      {level}
    </span>
  )
}
