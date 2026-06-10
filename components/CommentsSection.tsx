'use client'

import dynamic from 'next/dynamic'
import { useFormState, useFormStatus } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { submitComment, deleteComment, type CommentResult } from '@/app/cong-dong/actions'
import { avatarSrc } from '@/lib/avatar'

const CommentRichEditor = dynamic(() => import('@/components/CommentRichEditor'), { ssr: false })

export type Comment = {
  id: string
  user_id: string
  content: string
  created_at: string
  author_name: string | null
  author_avatar: string | null
}

type Props = {
  postId: string
  comments: Comment[]
  currentUser: { id: string; name: string; initial: string } | null
  isAdmin?: boolean
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

function SubmitBtn() {
  const { pending } = useFormStatus()
  const t = useTranslations('comments')
  return (
    <button
      type="submit"
      disabled={pending}
      className="font-semibold text-[13.5px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? t('sending') : t('submit')}
    </button>
  )
}

const INIT: CommentResult = null

export default function CommentsSection({ postId, comments, currentUser, isAdmin }: Props) {
  const t = useTranslations('comments')
  const locale = useLocale()
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction] = useFormState(submitComment, INIT)
  const [editorResetKey, setEditorResetKey] = useState(0)
  const searchParams = useSearchParams()
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null)

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset()
      setEditorResetKey((k) => k + 1)
      router.refresh()
    }
  }, [state, router])

  // Opened from a comment notification → scroll to + highlight that comment
  useEffect(() => {
    const cid = searchParams.get('c')
    if (!cid) return
    const timer = setTimeout(() => {
      const el = document.getElementById(`comment-${cid}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightCommentId(cid)
        setTimeout(() => setHighlightCommentId(null), 2800)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [searchParams, comments])

  const errorMsg = state?.error === 'empty' ? t('errorEmpty')
    : state?.error === 'too_long' ? t('errorTooLong')
    : state?.error === 'login_required' ? t('loginRequired')
    : state?.error ? t('error')
    : null

  return (
    <section className="mt-10 mb-6">
      {/* Section heading */}
      <div className="flex items-center gap-3 mb-6">
        <h2 className="font-serif font-bold text-[22px] tracking-[-0.2px] text-ink">
          {t('title')}
        </h2>
        {comments.length > 0 && (
          <span className="text-[13px] font-semibold px-2.5 py-0.5 rounded-full bg-line text-muted">
            {comments.length}
          </span>
        )}
      </div>

      {/* Comment list */}
      {comments.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl px-6 py-8 text-center mb-6">
          <p className="text-[14.5px] text-muted leading-relaxed">{t('empty')}</p>
        </div>
      ) : (
        <div className="space-y-4 mb-6">
          {comments.map((c) => {
            const isOwn = currentUser?.id === c.user_id
            const canDelete = isOwn || isAdmin
            const initial = (c.author_name?.[0] ?? '?').toUpperCase()

            return (
              <div
                key={c.id}
                id={`comment-${c.id}`}
                className={`flex gap-3 group scroll-mt-24 rounded-2xl transition-shadow ${
                  highlightCommentId === c.id ? 'ring-2 ring-rose/50 ring-offset-2' : ''
                }`}
              >
                {/* Avatar */}
                <div className="flex-none mt-0.5">
                  {c.author_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarSrc(c.author_avatar)}
                      alt={c.author_name ?? ''}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose/40 to-teal/40 grid place-items-center text-[12px] font-bold text-ink">
                      {initial}
                    </div>
                  )}
                </div>

                {/* Bubble */}
                <div className="flex-1 bg-cream border border-line rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[13.5px] text-ink">
                        {c.author_name ?? t('anonymous')}
                      </span>
                      {isOwn && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose/10 text-rose">
                          {t('you')}
                        </span>
                      )}
                      <span className="text-[11.5px] text-muted">{relativeDate(c.created_at, locale)}</span>
                    </div>

                    {canDelete && (
                      <form action={deleteComment} className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <input type="hidden" name="comment_id" value={c.id} />
                        <input type="hidden" name="post_id" value={postId} />
                        <button
                          type="submit"
                          title={t('confirmDelete')}
                          onClick={(e) => {
                            if (!window.confirm(t('confirmDelete'))) e.preventDefault()
                          }}
                          className="text-[11.5px] text-muted hover:text-red-500 transition-colors px-1.5 py-0.5 rounded"
                        >
                          {t('delete')}
                        </button>
                      </form>
                    )}
                  </div>

                  {c.content.trimStart().startsWith('<') ? (
                    <div
                      className="rich-content comment-content text-[14px] text-[#3a2d22] leading-[1.65]"
                      dangerouslySetInnerHTML={{ __html: c.content }}
                    />
                  ) : (
                    <p className="text-[14px] text-[#3a2d22] leading-[1.65] whitespace-pre-wrap break-words">
                      {c.content}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Submit form or login prompt */}
      {currentUser ? (
        <div className="bg-paper border border-line rounded-2xl p-4">
          <div className="flex gap-3">
            {/* User avatar */}
            <div className="flex-none mt-0.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose/40 to-teal/40 grid place-items-center text-[12px] font-bold text-ink">
                {currentUser.initial}
              </div>
            </div>

            {/* Form */}
            <form ref={formRef} action={formAction} className="flex-1 flex flex-col gap-2">
              <input type="hidden" name="post_id" value={postId} />
              <CommentRichEditor
                name="content"
                placeholder={t('placeholder')}
                resetKey={editorResetKey}
              />
              {errorMsg && (
                <p className="text-[12.5px] text-red-600">{errorMsg}</p>
              )}
              {state?.ok && (
                <p className="text-[12.5px] text-emerald-600">{t('success')}</p>
              )}
              <div className="flex justify-end">
                <SubmitBtn />
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div className="bg-cream border border-line rounded-2xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[14px] text-muted">{t('loginRequired')}</p>
          <Link
            href="/dang-nhap"
            className="font-semibold text-[13.5px] px-5 py-2 rounded-full bg-rose text-white hover:bg-rose-deep transition-all whitespace-nowrap"
          >
            {t('loginButton')}
          </Link>
        </div>
      )}
    </section>
  )
}
