'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { submitFeedback, type FeedbackResult } from './actions'

type Labels = {
  name: string
  namePh: string
  email: string
  emailPh: string
  message: string
  messagePh: string
  submit: string
  submitting: string
  error: string
  successTitle: string
  successDesc: string
}

function SubmitButton({ label, submittingLabel }: { label: string; submittingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full font-semibold text-[14.5px] py-3 rounded-full bg-rose text-white shadow-[0_6px_20px_-6px_rgba(194,24,91,0.5)] hover:bg-rose-deep hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
    >
      {pending ? `⏳ ${submittingLabel}` : label}
    </button>
  )
}

const initialState: FeedbackResult | null = null

export default function FeedbackForm({ labels }: { labels: Labels }) {
  const [state, formAction] = useFormState(submitFeedback, initialState)

  if (state?.ok) {
    return (
      <div className="bg-paper border border-line rounded-2xl p-10 text-center shadow-card">
        <div className="text-[40px] mb-4">🎉</div>
        <h2 className="font-serif font-bold text-[22px] text-ink mb-2">
          {labels.successTitle}
        </h2>
        <p className="text-[14.5px] text-muted">{labels.successDesc}</p>
      </div>
    )
  }

  return (
    <form
      action={formAction}
      className="bg-paper border border-line rounded-2xl p-7 shadow-card space-y-5"
    >
      {/* Error banner */}
      {state && !state.ok && (
        <div className="rounded-xl bg-rose/8 border border-rose/25 px-4 py-3 text-[13.5px] text-rose">
          {labels.error}
        </div>
      )}

      <div>
        <label className="block text-[13px] font-semibold text-ink mb-1.5">
          {labels.name}
        </label>
        <input
          name="name"
          type="text"
          placeholder={labels.namePh}
          required
          maxLength={120}
          className="w-full rounded-xl border border-line bg-cream px-4 py-2.5 text-[14px] text-ink placeholder:text-muted/60 focus:outline-none focus:border-rose/60 transition-colors"
        />
      </div>

      <div>
        <label className="block text-[13px] font-semibold text-ink mb-1.5">
          {labels.email}
        </label>
        <input
          name="email"
          type="email"
          placeholder={labels.emailPh}
          required
          maxLength={254}
          className="w-full rounded-xl border border-line bg-cream px-4 py-2.5 text-[14px] text-ink placeholder:text-muted/60 focus:outline-none focus:border-rose/60 transition-colors"
        />
      </div>

      <div>
        <label className="block text-[13px] font-semibold text-ink mb-1.5">
          {labels.message}
        </label>
        <textarea
          name="message"
          rows={5}
          placeholder={labels.messagePh}
          required
          maxLength={5000}
          className="w-full rounded-xl border border-line bg-cream px-4 py-2.5 text-[14px] text-ink placeholder:text-muted/60 focus:outline-none focus:border-rose/60 transition-colors resize-none"
        />
      </div>

      <SubmitButton label={labels.submit} submittingLabel={labels.submitting} />
    </form>
  )
}
