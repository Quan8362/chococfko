'use client'

import { useState } from 'react'
import { replyToFeedback } from './actions'

export type ReplyView = {
  id: string
  message: string
  adminEmail: string | null
  createdAtLabel: string
}

export type FeedbackView = {
  id: string
  name: string
  email: string | null
  message: string
  type: string
  isMember: boolean
  createdAtLabel: string
  status: string
}

export type ItemLabels = {
  typeGeneral: string
  typeFeature: string
  typeBug: string
  member: string
  guest: string
  statusNew: string
  statusReplied: string
  replyPlaceholder: string
  replySend: string
  replySending: string
  replySuccess: string
  replyEmpty: string
  replyErrorSend: string
  replyErrorGeneric: string
  noReplyAddress: string
  noReplyAddressDesc: string
  historyTitle: string
  replyByLabel: string
  adminFallback: string
}

const TYPE_BADGE: Record<string, string> = {
  general: 'bg-teal-soft text-teal border border-teal/20',
  feature: 'bg-amber-50 text-amber-700 border border-amber-200',
  bug:     'bg-red-50 text-red-600 border border-red-200',
}
const TYPE_EMOJI: Record<string, string> = { general: '💬', feature: '💡', bug: '🐞' }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function FeedbackItem({
  feedback,
  replies: initialReplies,
  labels,
}: {
  feedback: FeedbackView
  replies: ReplyView[]
  labels: ItemLabels
}) {
  const [replies, setReplies] = useState<ReplyView[]>(initialReplies)
  const [status, setStatus] = useState(feedback.status)
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const canReply = !!feedback.email && EMAIL_RE.test(feedback.email)

  const typeLabel =
    feedback.type === 'feature' ? labels.typeFeature
    : feedback.type === 'bug' ? labels.typeBug
    : labels.typeGeneral

  const isReplied = status === 'replied'

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (!text.trim()) {
      setError(labels.replyEmpty)
      return
    }
    setPending(true)
    try {
      const fd = new FormData()
      fd.set('feedbackId', feedback.id)
      fd.set('reply', text)
      const res = await replyToFeedback(null, fd)
      if (res.ok) {
        setReplies((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            message: text.trim(),
            adminEmail: null,
            createdAtLabel: new Date().toLocaleDateString('vi-VN', {
              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
            }),
          },
        ])
        setStatus('replied')
        setText('')
        setSuccess(true)
      } else if (res.error === 'missing_fields') {
        setError(labels.replyEmpty)
      } else if (res.error === 'send_failed' || res.error === 'no_api_key' || res.error === 'db_error') {
        setError(labels.replyErrorSend)
      } else {
        setError(labels.replyErrorGeneric)
      }
    } catch {
      setError(labels.replyErrorGeneric)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="bg-paper border border-line rounded-2xl p-4 sm:p-5 hover:border-rose/20 transition-all">
      {/* Badges + date */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className={`text-[11px] font-semibold px-2.5 py-[5px] rounded-full ${TYPE_BADGE[feedback.type] ?? TYPE_BADGE.general}`}>
          {TYPE_EMOJI[feedback.type] ?? TYPE_EMOJI.general} {typeLabel}
        </span>
        <span className={`text-[11px] font-semibold px-2.5 py-[5px] rounded-full ${
          isReplied ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          {isReplied ? `✓ ${labels.statusReplied}` : `● ${labels.statusNew}`}
        </span>
        <span className="text-[11px] font-semibold px-2.5 py-[5px] rounded-full bg-line text-muted">
          {feedback.isMember ? labels.member : labels.guest}
        </span>
        <span className="text-[12px] text-muted ml-auto">{feedback.createdAtLabel}</span>
      </div>

      {/* Message */}
      <p className="text-[14px] text-[#3a2d22] leading-relaxed whitespace-pre-wrap mb-3">
        {feedback.message}
      </p>

      {/* Author / email */}
      <div className="text-[12px] text-muted flex items-center flex-wrap gap-x-1.5 gap-y-0.5 border-t border-line pt-2.5">
        <b className="text-[#5c4d44] font-semibold">{feedback.name}</b>
        <span className="opacity-30">·</span>
        {canReply ? (
          <a href={`mailto:${feedback.email}`} className="text-rose hover:underline">{feedback.email}</a>
        ) : (
          <span className="text-[11px] font-semibold px-2 py-[3px] rounded-full bg-red-50 text-red-600 border border-red-200">
            ⚠ {labels.noReplyAddress}
          </span>
        )}
      </div>

      {/* Reply history */}
      {replies.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{labels.historyTitle}</p>
          {replies.map((r) => (
            <div key={r.id} className="rounded-xl bg-emerald-50/50 border border-emerald-100 px-3.5 py-2.5">
              <p className="text-[13.5px] text-[#3a2d22] leading-relaxed whitespace-pre-wrap">{r.message}</p>
              <p className="text-[11px] text-muted mt-1.5">
                {labels.replyByLabel} {r.adminEmail || labels.adminFallback} · {r.createdAtLabel}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Reply composer */}
      {canReply ? (
        <form onSubmit={handleSubmit} className="mt-3.5">
          {success && (
            <div role="status" aria-live="polite" className="mb-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2 text-[13px] text-emerald-700">
              ✓ {labels.replySuccess}
            </div>
          )}
          {error && (
            <div role="alert" aria-live="assertive" className="mb-2 rounded-xl bg-rose/8 border border-rose/25 px-3.5 py-2 text-[13px] text-rose">
              {error}
            </div>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={5000}
            placeholder={labels.replyPlaceholder}
            aria-label={labels.replyPlaceholder}
            className="w-full rounded-xl border border-line bg-cream px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-rose/30 focus:border-rose/60 transition-colors resize-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="mt-2 w-full sm:w-auto sm:min-w-[160px] font-semibold text-[13.5px] px-5 py-2.5 rounded-full bg-rose text-white shadow-[0_6px_20px_-6px_rgba(194,24,91,0.5)] hover:bg-rose-deep transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pending ? `⏳ ${labels.replySending}` : labels.replySend}
          </button>
        </form>
      ) : (
        <p className="mt-3 text-[12.5px] text-muted italic">{labels.noReplyAddressDesc}</p>
      )}
    </div>
  )
}
