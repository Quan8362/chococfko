// Privacy banner shown inside FKO-internal areas. Communicates that the content
// is members-only without looking disabled to authorized members.
export default function InternalNotice({ text }: { text: string }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose/25 bg-gradient-to-br from-rose/8 to-[#fdeef5] px-5 py-3.5">
      <span className="text-[16px] leading-none mt-0.5 flex-none">🔒</span>
      <p className="text-[13px] text-ink/80 leading-relaxed">{text}</p>
    </div>
  )
}
