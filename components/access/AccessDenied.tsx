import Link from 'next/link'

// Authorization wall for FKO-internal content opened by a non-member.
// Renders NO internal metadata (title, body, author, images) — only the notice.
export default function AccessDenied({
  message,
  backHref,
  backLabel,
}: {
  message: string
  backHref: string
  backLabel: string
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-20">
      <div className="max-w-[460px] w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose/10 border border-rose/20 grid place-items-center mx-auto mb-6 text-[30px]">
          🔒
        </div>
        <p className="text-[15px] text-ink leading-relaxed mb-8">{message}</p>
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 font-semibold text-[14px] px-6 py-3 rounded-full bg-rose text-white hover:bg-rose-deep transition-all"
        >
          ← {backLabel}
        </Link>
      </div>
    </div>
  )
}
