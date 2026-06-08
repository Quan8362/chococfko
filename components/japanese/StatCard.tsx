type Props = {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
}

export default function StatCard({ label, value, sub, accent }: Props) {
  return (
    <div className={`rounded-2xl border p-4 sm:p-5 ${accent ? 'bg-rose/5 border-rose/20' : 'bg-paper border-line'}`}>
      <p className={`text-[11px] font-semibold tracking-wide uppercase mb-1 ${accent ? 'text-rose' : 'text-muted'}`}>
        {label}
      </p>
      <p className={`font-serif font-bold text-[28px] leading-none ${accent ? 'text-rose' : 'text-ink'}`}>
        {value}
      </p>
      {sub && <p className="text-[12px] text-muted mt-1">{sub}</p>}
    </div>
  )
}
