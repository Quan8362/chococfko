'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useTranslations } from 'next-intl'
import { updateTagTranslations, autofillTag } from './actions'

export interface AdminTag {
  id: string
  name: string
  slug: string
  usage_count: number
  is_system_tag: boolean | null
  display_name_vi: string | null
  display_name_en: string | null
  display_name_ja: string | null
  display_name_ko: string | null
  display_name_zh: string | null
}

// Language endonyms — shown the same in every UI language (not subject to i18n),
// matching the existing convention in admin place translations.
const LOCALES = [
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
] as const

const RENDER_CAP = 100

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="font-semibold text-[13px] px-5 py-2 rounded-full bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-60"
    >
      {label}
    </button>
  )
}

function AutofillButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      formAction={autofillTag}
      disabled={pending}
      className="font-semibold text-[13px] px-4 py-2 rounded-full border border-line text-[#5c4d44] hover:bg-line transition-all disabled:opacity-60"
    >
      {label}
    </button>
  )
}

export default function TagsAdminClient({ tags }: { tags: AdminTag[] }) {
  const t = useTranslations('admin')
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return tags
    return tags.filter((tag) =>
      [tag.name, tag.slug, tag.display_name_vi, tag.display_name_en, tag.display_name_ja, tag.display_name_ko, tag.display_name_zh]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(needle)),
    )
  }, [q, tags])

  const shown = filtered.slice(0, RENDER_CAP)

  return (
    <div className="max-w-[920px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <Link href="/admin" className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3">
        ← {t('admin_dashboard_label')}
      </Link>
      <h1 className="font-serif font-bold text-[28px] tracking-[-0.3px] text-ink mb-1.5">{t('tags_admin_title')}</h1>
      <p className="text-[14px] text-muted mb-6">{t('tags_admin_sub')}</p>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('tags_search_placeholder')}
        className="w-full text-[14px] px-4 py-2.5 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose mb-6 placeholder:text-muted/60"
      />

      {shown.length === 0 ? (
        <div className="bg-paper border border-dashed border-line rounded-2xl p-10 text-center text-[14px] text-muted">
          {t('tags_empty')}
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((tag) => (
            <form
              key={tag.id}
              action={updateTagTranslations}
              className="bg-paper border border-line rounded-2xl p-4 sm:p-5"
            >
              <input type="hidden" name="id" value={tag.id} />

              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="font-semibold text-[15px] text-ink">{tag.name}</span>
                <code className="text-[11px] bg-cream border border-line px-2 py-0.5 rounded font-mono text-muted">/{tag.slug}</code>
                {tag.is_system_tag && (
                  <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-rose/10 text-rose">{t('tags_system_badge')}</span>
                )}
                <span className="text-[11.5px] text-muted ml-auto">{t('tags_usage', { count: tag.usage_count })}</span>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {LOCALES.map((loc) => (
                  <div key={loc.code}>
                    <label className="block text-[12px] font-medium mb-1 text-[#5c4d44]">
                      {loc.flag} {loc.label}
                    </label>
                    <input
                      name={`display_name_${loc.code}`}
                      defaultValue={(tag[`display_name_${loc.code}` as keyof AdminTag] as string | null) ?? ''}
                      maxLength={60}
                      placeholder={tag.name}
                      className="w-full text-[14px] px-3 py-2 border border-line rounded-lg bg-white focus:outline-none focus:border-rose placeholder:text-muted/50"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2.5 mt-4">
                <SaveButton label={t('tags_save')} />
                <AutofillButton label={t('tags_autofill')} />
              </div>
            </form>
          ))}
          {filtered.length > RENDER_CAP && (
            <p className="text-center text-[12.5px] text-muted pt-2">
              {t('tags_more', { count: filtered.length - RENDER_CAP })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
