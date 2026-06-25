'use client'

import { useRef, useState } from 'react'
import { submitFeedback } from './actions'

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
  errName: string
  errEmailRequired: string
  errEmailInvalid: string
  errMessage: string
  errRateLimit: string
}

type FieldErrors = {
  name?: string
  email?: string
  message?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const inputCls =
  'w-full rounded-xl border bg-cream px-4 py-2.5 text-[14px] text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-rose/30 transition-colors'

export default function FeedbackForm({
  labels,
  initialName = '',
  initialEmail = '',
}: {
  labels: Labels
  initialName?: string
  initialEmail?: string
}) {
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState(initialEmail)
  const [message, setMessage] = useState('')

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)

  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)

  function validate(): FieldErrors {
    const errs: FieldErrors = {}
    if (!name.trim()) errs.name = labels.errName
    if (!email.trim()) errs.email = labels.errEmailRequired
    else if (!EMAIL_RE.test(email.trim())) errs.email = labels.errEmailInvalid
    if (!message.trim()) errs.message = labels.errMessage
    return errs
  }

  function focusFirstInvalid(errs: FieldErrors) {
    if (errs.name) nameRef.current?.focus()
    else if (errs.email) emailRef.current?.focus()
    else if (errs.message) messageRef.current?.focus()
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setServerError(null)

    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      focusFirstInvalid(errs)
      return
    }
    setFieldErrors({})

    setPending(true)
    try {
      const fd = new FormData(e.currentTarget)
      const res = await submitFeedback(null, fd)
      if (res.ok) {
        setSuccess(true)
        setName('')
        setEmail('')
        setMessage('')
      } else if (res.error === 'invalid_email') {
        setFieldErrors({ email: labels.errEmailInvalid })
        emailRef.current?.focus()
      } else if (res.error === 'rate_limited') {
        setServerError(labels.errRateLimit)
      } else {
        setServerError(labels.error)
      }
    } catch {
      setServerError(labels.error)
    } finally {
      setPending(false)
    }
  }

  if (success) {
    return (
      <div className="bg-paper border border-line rounded-2xl p-10 text-center shadow-card" role="status">
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
      onSubmit={handleSubmit}
      noValidate
      className="bg-paper border border-line rounded-2xl p-7 shadow-card space-y-5"
    >
      {/* Honeypot — ẩn khỏi người dùng thật, chống bot */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {/* Error banner (server / rate limit) */}
      {serverError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl bg-rose/8 border border-rose/25 px-4 py-3 text-[13.5px] text-rose"
        >
          {serverError}
        </div>
      )}

      <div>
        <label htmlFor="fb-name" className="block text-[13px] font-semibold text-ink mb-1.5">
          {labels.name} <span className="text-rose">*</span>
        </label>
        <input
          id="fb-name"
          ref={nameRef}
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={labels.namePh}
          maxLength={120}
          aria-invalid={!!fieldErrors.name}
          aria-describedby={fieldErrors.name ? 'fb-name-err' : undefined}
          className={`${inputCls} ${fieldErrors.name ? 'border-rose/70' : 'border-line focus:border-rose/60'}`}
        />
        {fieldErrors.name && (
          <p id="fb-name-err" aria-live="polite" className="mt-1 text-[12.5px] text-rose">
            {fieldErrors.name}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="fb-email" className="block text-[13px] font-semibold text-ink mb-1.5">
          {labels.email} <span className="text-rose">*</span>
        </label>
        <input
          id="fb-email"
          ref={emailRef}
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={labels.emailPh}
          maxLength={254}
          aria-invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? 'fb-email-err' : undefined}
          className={`${inputCls} ${fieldErrors.email ? 'border-rose/70' : 'border-line focus:border-rose/60'}`}
        />
        {fieldErrors.email && (
          <p id="fb-email-err" aria-live="polite" className="mt-1 text-[12.5px] text-rose">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="fb-message" className="block text-[13px] font-semibold text-ink mb-1.5">
          {labels.message} <span className="text-rose">*</span>
        </label>
        <textarea
          id="fb-message"
          ref={messageRef}
          name="message"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={labels.messagePh}
          maxLength={2000}
          aria-invalid={!!fieldErrors.message}
          aria-describedby={fieldErrors.message ? 'fb-message-err' : undefined}
          className={`${inputCls} resize-none ${fieldErrors.message ? 'border-rose/70' : 'border-line focus:border-rose/60'}`}
        />
        {fieldErrors.message && (
          <p id="fb-message-err" aria-live="polite" className="mt-1 text-[12.5px] text-rose">
            {fieldErrors.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full font-semibold text-[14.5px] py-3 rounded-full bg-rose text-white shadow-[0_6px_20px_-6px_rgba(194,24,91,0.5)] hover:bg-rose-deep hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
      >
        {pending ? `⏳ ${labels.submitting}` : labels.submit}
      </button>
    </form>
  )
}
