'use client'

import dynamic from 'next/dynamic'
import { useFormState, useFormStatus } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { submitConfessionComment, deleteConfessionComment, type CommentResult } from '../actions'
import { type ConfessionComment } from '@/lib/confessions'
import AnonAvatar from '@/components/AnonAvatar'
import { generateAnonId } from '@/lib/anon'

const CommentRichEditor = dynamic(() => import('@/components/CommentRichEditor'), { ssr: false })

type CurrentUser = { id: string; name: string; initial: string } | null

function UserAvatar({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="w-8 h-8 rounded-full grid place-items-center text-[12px] font-bold ring-2 ring-white bg-gradient-to-br from-rose/40 to-teal/40 text-ink flex-none">
        {name[0]?.toUpperCase() ?? '?'}
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={32}
      height={32}
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
      className="w-8 h-8 rounded-full object-cover object-center ring-2 ring-white flex-none"
      onError={() => setFailed(true)}
    />
  )
}

function relativeDate(iso: string, locale: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (secs < 60) return rtf.format(-secs, 'second')
  if (secs < 3600) return rtf.format(-Math.floor(secs / 60), 'minute')
  if (secs < 86400) return rtf.format(-Math.floor(secs / 3600), 'hour')
  if (secs < 2592000) return rtf.format(-Math.floor(secs / 86400), 'day')
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function SubmitBtn({ label, sending }: { label: string; sending: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 font-semibold text-[13.5px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_2px_12px_-2px_rgba(194,24,91,0.4)]"
    >
      {pending && (
        <svg className="w-3.5 h-3.5 animate-spin flex-none" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      )}
      {pending ? sending : label}
    </button>
  )
}

const INIT: CommentResult = null

export default function ConfessionComments({
  confessionId,
  comments,
  currentUser,
  isAdmin,
}: {
  confessionId: string
  comments: ConfessionComment[]
  currentUser: CurrentUser
  isAdmin: boolean
}) {
  const t = useTranslations('confessions')
  const locale = useLocale()
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction] = useFormState(submitConfessionComment, INIT)
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [editorResetKey, setEditorResetKey] = useState(0)

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset()
      setEditorResetKey((k) => k + 1)
      router.refresh()
    }
  }, [state, router])

  const errorMsg =
    state?.error === 'empty'               ? t('commentEmpty')
    : state?.error === 'too_long'          ? t('commentTooLong')
    : state?.error === 'login_required'    ? t('loginToComment')
    : state?.error === 'content_empty'     ? t('editor.contentEmpty' as Parameters<typeof t>[0])
    : state?.error                         ? t('commentError')
    : null

  return (
    <section className="mb-6">

      {/* Section heading */}
      <div className="flex items-center gap-3 mb-5">
        <h2 className="font-serif font-bold text-[22px] tracking-[-0.2px] text-ink">
          {t('comments')}
        </h2>
        <span className={`text-[12.5px] font-bold px-2.5 py-0.5 rounded-full ${
          comments.length > 0 ? 'bg-rose/10 text-rose' : 'bg-line text-muted'
        }`}>
          {comments.length}
        </span>
      </div>

      {/* Comment list */}
      {comments.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl px-6 py-10 text-center mb-5">
          <div className="w-12 h-12 rounded-2xl bg-cream border border-line grid place-items-center text-[20px] mx-auto mb-3 shadow-sm">
            💬
          </div>
          <p className="text-[14px] text-muted leading-relaxed">{t('noComments')}</p>
        </div>
      ) : (
        <div className="space-y-3 mb-5">
          {comments.map((c) => {
            const isOwn = currentUser?.id === c.user_id
            const canDelete = isOwn || isAdmin
            const displayName = c.is_anonymous
              ? generateAnonId(c.id)
              : (c.author_name ?? generateAnonId(c.id))
            const isHtml = c.content.trimStart().startsWith('<')

            return (
              <div key={c.id} className="group flex gap-3">

                {/* Avatar */}
                <div className="flex-none mt-0.5">
                  {c.is_anonymous ? (
                    <AnonAvatar size={32} className="ring-2 ring-white" />
                  ) : c.author_avatar ? (
                    <UserAvatar src={c.author_avatar} name={displayName} />
                  ) : (
                    <div className="w-8 h-8 rounded-full grid place-items-center text-[12px] font-bold ring-2 ring-white bg-gradient-to-br from-rose/40 to-teal/40 text-ink flex-none">
                      {displayName[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                </div>

                {/* Bubble */}
                <div className="flex-1 bg-cream border border-line rounded-2xl rounded-tl-sm px-4 py-3 hover:border-rose/20 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-semibold text-[13.5px] text-ink truncate">{displayName}</span>
                      {isOwn && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose/10 text-rose flex-none">
                          {t('you')}
                        </span>
                      )}
                      <span className="text-[11.5px] text-muted flex-none">{relativeDate(c.created_at, locale)}</span>
                    </div>

                    {canDelete && (
                      <form
                        action={deleteConfessionComment}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex-none"
                      >
                        <input type="hidden" name="comment_id" value={c.id} />
                        <input type="hidden" name="confession_id" value={confessionId} />
                        <button
                          type="submit"
                          title={t('confirmDeleteComment')}
                          onClick={(e) => {
                            if (!window.confirm(t('confirmDeleteComment'))) e.preventDefault()
                          }}
                          className="text-[11px] text-muted/60 hover:text-red-500 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50"
                        >
                          {t('deleteComment')}
                        </button>
                      </form>
                    )}
                  </div>

                  {isHtml ? (
                    <div
                      className="rich-content text-[14.5px] text-[#3a2d22] leading-[1.7]"
                      dangerouslySetInnerHTML={{ __html: c.content }}
                    />
                  ) : (
                    <p className="text-[14.5px] text-[#3a2d22] leading-[1.7] whitespace-pre-wrap break-words">
                      {c.content}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── COMMENT FORM or LOGIN PROMPT ─────────────────────── */}
      {currentUser ? (
        <div className="bg-paper border border-line rounded-2xl shadow-[0_1px_8px_-2px_rgba(36,26,23,0.06)]">
          {/* Form header with anonymous toggle */}
          <div className="px-5 pt-4 pb-3 border-b border-line/60 flex items-center justify-between gap-3 flex-wrap rounded-t-2xl bg-paper">
            <span className="text-[13px] font-semibold text-ink">{t('leaveComment' as Parameters<typeof t>[0])}</span>

            <button
              type="button"
              onClick={() => setIsAnonymous(!isAnonymous)}
              className="inline-flex items-center gap-2 text-[12.5px] font-medium text-muted hover:text-ink transition-colors"
            >
              <div className={`w-9 h-5 rounded-full transition-colors relative flex-none ${
                isAnonymous ? 'bg-rose' : 'bg-line'
              }`}>
                <div className={`absolute top-[3px] left-[3px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform ${
                  isAnonymous ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </div>
              <span className={isAnonymous ? 'text-rose' : ''}>
                {t('anonymousComment')}
              </span>
            </button>
          </div>

          <form ref={formRef} action={formAction} className="p-4 flex flex-col gap-3">
            <input type="hidden" name="confession_id" value={confessionId} />
            <input type="hidden" name="is_anonymous" value={isAnonymous ? 'true' : 'false'} />

            {/* Rich comment editor */}
            <CommentRichEditor
              name="content"
              placeholder={t('commentPlaceholder')}
              resetKey={editorResetKey}
            />

            {errorMsg && (
              <p className="text-[12.5px] text-red-600 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 flex-none" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                </svg>
                {errorMsg}
              </p>
            )}
            {state?.ok && (
              <p className="text-[12.5px] text-emerald-600 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 flex-none" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                </svg>
                {t('commentSuccess')}
              </p>
            )}

            <div className="flex items-center justify-between gap-3">
              {isAnonymous && (
                <span className="text-[11.5px] text-muted/70 flex items-center gap-1">
                  🤫 <span>{t('anonymousComment')}</span>
                </span>
              )}
              <div className="ml-auto">
                <SubmitBtn label={t('submitComment')} sending={t('sendingComment')} />
              </div>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-[#fdeef5] to-cream border border-rose/15 rounded-2xl px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[14px] font-medium text-ink mb-0.5">{t('loginToComment')}</p>
            <p className="text-[12px] text-muted">{t('loginAnonHint' as Parameters<typeof t>[0])}</p>
          </div>
          <Link
            href="/dang-nhap"
            className="flex-none font-semibold text-[13.5px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_10px_-2px_rgba(194,24,91,0.35)] whitespace-nowrap"
          >
            {t('loginButton')}
          </Link>
        </div>
      )}
    </section>
  )
}
