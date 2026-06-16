'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import AuthorLink from '@/components/AuthorLink'
import { avatarSrc, proxyHtml } from '@/lib/avatar'
import { type PlaceComment } from '@/lib/places'
import { submitPlaceComment, deletePlaceComment, type CommentResult } from '../actions'

const CommentRichEditor = dynamic(() => import('@/components/CommentRichEditor'), { ssr: false })

type CurrentUser = { id: string; initial: string } | null
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

function SubmitBtn() {
  const { pending } = useFormStatus()
  const t = useTranslations('place_comments')
  return (
    <button
      type="submit"
      disabled={pending}
      className="font-semibold text-[13.5px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-60"
    >
      {pending ? t('sending') : t('submit')}
    </button>
  )
}

export default function PlaceComments({
  slug,
  comments,
  currentUser,
  isAdmin,
}: {
  slug: string
  comments: PlaceComment[]
  currentUser: CurrentUser
  isAdmin?: boolean
}) {
  const t = useTranslations('place_comments')
  const locale = useLocale()
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction] = useFormState(submitPlaceComment, INIT)
  const [editorResetKey, setEditorResetKey] = useState(0)

  useEffect(() => {
    if (state?.ok) { formRef.current?.reset(); setEditorResetKey((k) => k + 1); router.refresh() }
  }, [state, router])

  const errorMsg =
    state?.error === 'empty' ? t('errorEmpty')
    : state?.error === 'too_long' ? t('errorTooLong')
    : state?.error === 'login_required' ? t('loginRequired')
    : state?.error ? t('error')
    : null

  return (
    <section className="mt-12 border-t border-line pt-8">
      <div className="flex items-center gap-3 mb-1.5">
        <h2 className="font-serif font-bold text-[22px] tracking-[-0.2px] text-ink">{t('title')}</h2>
        {comments.length > 0 && (
          <span className="text-[12.5px] font-bold px-2.5 py-0.5 rounded-full bg-rose/10 text-rose">{comments.length}</span>
        )}
      </div>
      <p className="text-[13.5px] text-muted mb-6">{t('subtitle')}</p>

      {comments.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl px-6 py-8 text-center mb-6">
          <p className="text-[14px] text-muted">{t('empty')}</p>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {comments.map((c) => {
            const isOwn = currentUser?.id === c.user_id
            const canDelete = isOwn || isAdmin
            const name = c.author_name ?? t('anonymous')
            return (
              <div key={c.id} className="group flex gap-3">
                <div className="flex-none mt-0.5">
                  {c.author_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarSrc(c.author_avatar)} alt={name} className="w-8 h-8 rounded-full object-cover ring-2 ring-white" />
                  ) : (
                    <div className="w-8 h-8 rounded-full grid place-items-center text-[12px] font-bold ring-2 ring-white bg-gradient-to-br from-rose/40 to-teal/40 text-ink">{name[0]?.toUpperCase() ?? '?'}</div>
                  )}
                </div>
                <div className="flex-1 bg-cream border border-line rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <AuthorLink userId={c.user_id} name={name} className="font-semibold text-[13.5px] text-ink" />
                      {isOwn && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose/10 text-rose">{t('you')}</span>
                      )}
                      <span className="text-[11.5px] text-muted">{relativeDate(c.created_at, locale)}</span>
                    </div>
                    {canDelete && (
                      <form action={deletePlaceComment} className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <input type="hidden" name="comment_id" value={c.id} />
                        <input type="hidden" name="place_slug" value={slug} />
                        <button
                          type="submit"
                          onClick={(e) => { if (!window.confirm(t('confirmDelete'))) e.preventDefault() }}
                          className="text-[11px] text-muted/60 hover:text-red-500 px-1.5 py-0.5 rounded"
                        >
                          {t('delete')}
                        </button>
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
        <div className="bg-paper border border-line rounded-2xl p-4 flex gap-3">
          <div className="flex-none mt-0.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose/40 to-teal/40 grid place-items-center text-[12px] font-bold text-ink">{currentUser.initial}</div>
          </div>
          <form ref={formRef} action={formAction} className="flex-1 flex flex-col gap-3">
            <input type="hidden" name="place_slug" value={slug} />
            <CommentRichEditor name="content" placeholder={t('placeholder')} resetKey={editorResetKey} />
            {errorMsg && <p className="text-[12.5px] text-red-600">{errorMsg}</p>}
            {state?.ok && <p className="text-[12.5px] text-emerald-600">{t('success')}</p>}
            <div className="flex justify-end"><SubmitBtn /></div>
          </form>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-[#fdeef5] to-cream border border-rose/15 rounded-2xl px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[14px] text-ink font-medium">{t('loginRequired')}</p>
          <Link href="/dang-nhap" className="font-semibold text-[13.5px] px-6 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all whitespace-nowrap">{t('loginButton')}</Link>
        </div>
      )}
    </section>
  )
}
