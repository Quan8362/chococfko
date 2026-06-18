'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import AnonAvatar from '@/components/AnonAvatar'
import AuthorLink from '@/components/AuthorLink'
import { generateAnonId } from '@/lib/anon'
import UserAvatar from '@/components/UserAvatar'
import {
  submitJapaneseComment,
  deleteJapaneseComment,
  type JpComment,
  type JpItemType,
  type JpCommentResult,
} from './comment-actions'

type CurrentUser = { id: string; name: string } | null
type T = ReturnType<typeof useTranslations>

function relativeDate(iso: string, locale: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (secs < 60) return rtf.format(-secs, 'second')
  if (secs < 3600) return rtf.format(-Math.floor(secs / 60), 'minute')
  if (secs < 86400) return rtf.format(-Math.floor(secs / 3600), 'hour')
  if (secs < 2592000) return rtf.format(-Math.floor(secs / 86400), 'day')
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function SubmitBtn({ label, sending, compact }: { label: string; sending: string; compact?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center gap-2 font-semibold text-white bg-rose hover:bg-rose-deep transition-all disabled:opacity-60 disabled:cursor-not-allowed rounded-full shadow-[0_2px_12px_-2px_rgba(194,24,91,0.4)] ${
        compact ? 'text-[12.5px] px-4 py-1.5' : 'text-[13.5px] px-6 py-2.5'
      }`}
    >
      {pending && (
        <svg className="w-3.5 h-3.5 animate-spin flex-none" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {pending ? sending : label}
    </button>
  )
}

const INIT: JpCommentResult = null

// ── Reusable form (top-level comment OR reply) ────────────────
function CommentForm({
  itemType, itemId, pagePath, parentId, compact, placeholder, submitLabel, onSuccess, onCancel, t,
}: {
  itemType: JpItemType
  itemId: string
  pagePath: string
  parentId?: string
  compact?: boolean
  placeholder: string
  submitLabel: string
  onSuccess?: () => void
  onCancel?: () => void
  t: T
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction] = useFormState(submitJapaneseComment, INIT)
  const [isAnonymous, setIsAnonymous] = useState(false)

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset()
      router.refresh()
      onSuccess?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const errorMsg =
    state?.error === 'empty'            ? t('comment_empty')
    : state?.error === 'too_long'       ? t('comment_too_long')
    : state?.error === 'login_required' ? t('login_to_comment')
    : state?.error                      ? t('comment_error')
    : null

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2.5">
      <input type="hidden" name="item_type" value={itemType} />
      <input type="hidden" name="item_id" value={itemId} />
      <input type="hidden" name="path" value={pagePath} />
      {parentId && <input type="hidden" name="parent_id" value={parentId} />}
      <input type="hidden" name="is_anonymous" value={isAnonymous ? 'true' : 'false'} />

      <textarea
        name="content"
        required
        maxLength={1000}
        rows={compact ? 2 : 3}
        placeholder={placeholder}
        className="w-full resize-y rounded-xl border border-line bg-cream/40 px-3.5 py-2.5 text-[14px] text-ink leading-relaxed placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-rose/30 focus:border-rose/40 transition-all"
      />

      {errorMsg && <p className="text-[12.5px] text-red-600">{errorMsg}</p>}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setIsAnonymous(v => !v)}
          className="inline-flex items-center gap-2 text-[12px] font-medium text-muted hover:text-ink transition-colors"
        >
          <span className={`w-8 h-[18px] rounded-full transition-colors relative flex-none ${isAnonymous ? 'bg-rose' : 'bg-line'}`}>
            <span className={`absolute top-[3px] left-[3px] w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${isAnonymous ? 'translate-x-[14px]' : 'translate-x-0'}`} />
          </span>
          <span className={isAnonymous ? 'text-rose' : ''}>{t('anonymous_comment')}</span>
        </button>

        <div className="flex items-center gap-2 ml-auto">
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-[12.5px] font-medium text-muted hover:text-ink px-3 py-1.5 transition-colors">
              {t('comment_cancel')}
            </button>
          )}
          <SubmitBtn label={submitLabel} sending={t('sending_comment')} compact={compact} />
        </div>
      </div>
    </form>
  )
}

// ── Single comment bubble ─────────────────────────────────────
function Bubble({
  c, currentUser, isAdmin, pagePath, locale, t, onReply,
}: {
  c: JpComment
  currentUser: CurrentUser
  isAdmin: boolean
  pagePath: string
  locale: string
  t: T
  onReply?: () => void
}) {
  const isOwn = currentUser?.id === c.user_id
  const canDelete = isOwn || isAdmin
  const displayName = c.is_anonymous ? generateAnonId(c.id) : (c.author_name ?? generateAnonId(c.id))

  return (
    <div className="group flex gap-3">
      <div className="flex-none mt-0.5">
        {c.is_anonymous ? (
          <AnonAvatar size={32} className="ring-2 ring-white" />
        ) : (
          <UserAvatar src={c.author_avatar} name={displayName} size={32} className="ring-2 ring-white" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="bg-cream border border-line rounded-2xl rounded-tl-sm px-4 py-3 hover:border-rose/20 transition-colors">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <AuthorLink
                userId={c.is_anonymous ? null : c.user_id}
                name={displayName}
                className="font-semibold text-[13px] text-ink truncate"
              />
              {isOwn && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose/10 text-rose flex-none">{t('you')}</span>
              )}
              <span className="text-[11px] text-muted flex-none">{relativeDate(c.created_at, locale)}</span>
            </div>
            {canDelete && (
              <form action={deleteJapaneseComment} className="opacity-0 group-hover:opacity-100 transition-opacity flex-none">
                <input type="hidden" name="comment_id" value={c.id} />
                <input type="hidden" name="path" value={pagePath} />
                <button
                  type="submit"
                  title={t('confirm_delete_comment')}
                  onClick={(e) => { if (!window.confirm(t('confirm_delete_comment'))) e.preventDefault() }}
                  className="text-[11px] text-muted/60 hover:text-red-500 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50"
                >
                  {t('delete_comment')}
                </button>
              </form>
            )}
          </div>
          <p className="text-[14px] text-[#3a2d22] leading-[1.7] whitespace-pre-wrap break-words">{c.content}</p>
        </div>

        {onReply && (
          <button
            type="button"
            onClick={onReply}
            className="mt-1 ml-1 text-[12px] font-semibold text-muted hover:text-rose transition-colors"
          >
            ↩ {t('comment_reply')}
          </button>
        )}
      </div>
    </div>
  )
}

export default function JapaneseComments({
  itemType, itemId, comments, currentUser, isAdmin, pagePath,
}: {
  itemType: JpItemType
  itemId: string
  comments: JpComment[]
  currentUser: CurrentUser
  isAdmin: boolean
  pagePath: string
}) {
  const t = useTranslations('japanese')
  const locale = useLocale()
  const [openReplyId, setOpenReplyId] = useState<string | null>(null)

  const tops = comments.filter(c => !c.parent_id)
  const repliesByParent = new Map<string, JpComment[]>()
  for (const c of comments) {
    if (c.parent_id) {
      const arr = repliesByParent.get(c.parent_id) ?? []
      arr.push(c)
      repliesByParent.set(c.parent_id, arr)
    }
  }

  return (
    <section className="mt-10" id="comments">
      <div className="flex items-center gap-3 mb-5">
        <h2 className="font-serif font-bold text-[20px] tracking-[-0.2px] text-ink">💬 {t('comments_heading')}</h2>
        <span className={`text-[12px] font-bold px-2.5 py-0.5 rounded-full ${comments.length > 0 ? 'bg-rose/10 text-rose' : 'bg-line text-muted'}`}>
          {comments.length}
        </span>
      </div>

      {tops.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl px-6 py-9 text-center mb-5">
          <div className="w-11 h-11 rounded-2xl bg-cream border border-line grid place-items-center text-[19px] mx-auto mb-3 shadow-sm">💭</div>
          <p className="text-[13.5px] text-muted leading-relaxed">{t('no_comments')}</p>
        </div>
      ) : (
        <div className="space-y-4 mb-6">
          {tops.map(top => {
            const replies = repliesByParent.get(top.id) ?? []
            return (
              <div key={top.id}>
                <Bubble
                  c={top} currentUser={currentUser} isAdmin={isAdmin} pagePath={pagePath} locale={locale} t={t}
                  onReply={currentUser ? () => setOpenReplyId(openReplyId === top.id ? null : top.id) : undefined}
                />

                {/* Replies */}
                {(replies.length > 0 || openReplyId === top.id) && (
                  <div className="mt-3 ml-6 sm:ml-11 pl-3 border-l-2 border-line/70 space-y-3">
                    {replies.map(r => (
                      <Bubble
                        key={r.id}
                        c={r} currentUser={currentUser} isAdmin={isAdmin} pagePath={pagePath} locale={locale} t={t}
                        onReply={currentUser ? () => setOpenReplyId(openReplyId === top.id ? null : top.id) : undefined}
                      />
                    ))}

                    {openReplyId === top.id && currentUser && (
                      <div className="bg-paper border border-line rounded-2xl p-3">
                        <CommentForm
                          itemType={itemType} itemId={itemId} pagePath={pagePath} parentId={top.id}
                          compact placeholder={t('comment_reply_placeholder')} submitLabel={t('comment_reply')}
                          onSuccess={() => setOpenReplyId(null)} onCancel={() => setOpenReplyId(null)} t={t}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Main form / login prompt */}
      {currentUser ? (
        <div className="bg-paper border border-line rounded-2xl shadow-[0_1px_8px_-2px_rgba(36,26,23,0.06)] p-4">
          <span className="text-[13px] font-semibold text-ink block mb-2.5">{t('leave_comment')}</span>
          <CommentForm
            itemType={itemType} itemId={itemId} pagePath={pagePath}
            placeholder={t('comment_placeholder')} submitLabel={t('submit_comment')} t={t}
          />
        </div>
      ) : (
        <div className="bg-gradient-to-br from-[#fdeef5] to-cream border border-rose/15 rounded-2xl px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[14px] font-medium text-ink mb-0.5">{t('login_to_comment')}</p>
            <p className="text-[12px] text-muted">{t('login_comment_hint')}</p>
          </div>
          <Link href="/login" className="flex-none font-semibold text-[13.5px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_2px_10px_-2px_rgba(194,24,91,0.35)] whitespace-nowrap">
            {t('login_button')}
          </Link>
        </div>
      )}
    </section>
  )
}
