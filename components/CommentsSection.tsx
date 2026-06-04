'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { submitComment, deleteComment, type CommentResult } from '@/app/cong-dong/actions'

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

function relativeDate(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000) // minutes
  if (diff < 1) return 'Vừa xong'
  if (diff < 60) return `${diff} phút trước`
  const hrs = Math.floor(diff / 60)
  if (hrs < 24) return `${hrs} giờ trước`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} ngày trước`
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
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
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction] = useFormState(submitComment, INIT)

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset()
      router.refresh()
    }
  }, [state, router])

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
              <div key={c.id} className="flex gap-3 group">
                {/* Avatar */}
                <div className="flex-none mt-0.5">
                  {c.author_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.author_avatar}
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
                      <span className="text-[11.5px] text-muted">{relativeDate(c.created_at)}</span>
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

                  <p className="text-[14px] text-[#3a2d22] leading-[1.65] whitespace-pre-wrap break-words">
                    {c.content}
                  </p>
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
              <textarea
                name="content"
                rows={3}
                maxLength={1000}
                placeholder={t('placeholder')}
                className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose/60 resize-none placeholder:text-muted/60 text-ink transition-colors"
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
