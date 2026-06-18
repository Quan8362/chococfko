'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import AuthorLink from '@/components/AuthorLink'
import { proxyHtml } from '@/lib/avatar'
import UserAvatar from '@/components/UserAvatar'
import { type ListingComment } from '@/lib/marketplace'
import { submitListingComment, deleteListingComment, type CommentResult } from '../actions'

const CommentRichEditor = dynamic(() => import('@/components/CommentRichEditor'), { ssr: false })

type CurrentUser = { id: string } | null
const INIT: CommentResult = null

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
    <button type="submit" disabled={pending} className="font-semibold text-[13.5px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-60">
      {pending ? sending : label}
    </button>
  )
}

export default function MarketplaceComments({
  listingId,
  comments,
  currentUser,
}: {
  listingId: string
  comments: ListingComment[]
  currentUser: CurrentUser
}) {
  const t = useTranslations('marketplace')
  const locale = useLocale()
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction] = useFormState(submitListingComment, INIT)
  const [editorResetKey, setEditorResetKey] = useState(0)

  useEffect(() => {
    if (state?.ok) { formRef.current?.reset(); setEditorResetKey(k => k + 1); router.refresh() }
  }, [state, router])

  const errorMsg =
    state?.error === 'empty'          ? t('comment_empty')
    : state?.error === 'too_long'     ? t('comment_too_long')
    : state?.error === 'login_required' ? t('comment_login')
    : state?.error                    ? t('comment_error')
    : null

  return (
    <section className="mt-10">
      <div className="flex items-center gap-3 mb-5">
        <h2 className="font-serif font-bold text-[21px] tracking-[-0.2px] text-ink">{t('comments')}</h2>
        <span className={`text-[12.5px] font-bold px-2.5 py-0.5 rounded-full ${comments.length ? 'bg-rose/10 text-rose' : 'bg-line text-muted'}`}>{comments.length}</span>
      </div>

      {comments.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl px-6 py-8 text-center mb-5">
          <p className="text-[14px] text-muted">{t('comments_empty')}</p>
        </div>
      ) : (
        <div className="space-y-3 mb-5">
          {comments.map((c) => {
            const isOwn = currentUser?.id === c.user_id
            const name = c.author_name ?? t('member_fallback')
            return (
              <div key={c.id} className="group flex gap-3">
                <div className="flex-none mt-0.5">
                  <UserAvatar src={c.author_avatar} name={name} size={32} className="ring-2 ring-white" />
                </div>
                <div className="flex-1 bg-cream border border-line rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <AuthorLink userId={c.user_id} name={name} className="font-semibold text-[13.5px] text-ink" />
                      <span className="text-[11.5px] text-muted">{relativeDate(c.created_at, locale)}</span>
                    </div>
                    {isOwn && (
                      <form action={deleteListingComment} className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <input type="hidden" name="comment_id" value={c.id} />
                        <input type="hidden" name="listing_id" value={listingId} />
                        <button type="submit" onClick={(e) => { if (!window.confirm(t('comment_delete_confirm'))) e.preventDefault() }} className="text-[11px] text-muted/60 hover:text-red-500 px-1.5 py-0.5 rounded">{t('comment_delete')}</button>
                      </form>
                    )}
                  </div>
                  {c.content.trimStart().startsWith('<') ? (
                    <div
                      className="rich-content comment-content text-[14.5px] text-[#3a2d22] leading-[1.7]"
                      dangerouslySetInnerHTML={{ __html: proxyHtml(c.content) }}
                    />
                  ) : (
                    <p className="text-[14.5px] text-[#3a2d22] leading-[1.7] whitespace-pre-wrap break-words">{c.content}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {currentUser ? (
        <form ref={formRef} action={formAction} className="bg-paper border border-line rounded-2xl p-4 flex flex-col gap-3">
          <input type="hidden" name="listing_id" value={listingId} />
          <CommentRichEditor name="content" placeholder={t('comment_placeholder')} resetKey={editorResetKey} />
          {errorMsg && <p className="text-[12.5px] text-red-600">{errorMsg}</p>}
          <div className="flex justify-end"><SubmitBtn label={t('comment_submit')} sending={t('comment_sending')} /></div>
        </form>
      ) : (
        <div className="bg-gradient-to-br from-[#fdeef5] to-cream border border-rose/15 rounded-2xl px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[14px] text-ink font-medium">{t('comment_login')}</p>
          <Link href="/login" className="font-semibold text-[13.5px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all whitespace-nowrap">{t('login_button')}</Link>
        </div>
      )}
    </section>
  )
}
