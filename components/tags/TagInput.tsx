'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { MAX_TAGS, MAX_TAG_LEN, normalizeTagName } from '@/lib/tags'
import { suggestTags, type SuggestContentType } from '@/lib/tagSuggest'
import SuggestedTags from './SuggestedTags'

type FieldKey = 'category' | 'area' | 'title' | 'description' | 'prefecture' | 'city' | 'listingType'

const DEFAULT_FIELDS: Partial<Record<FieldKey, string>> = {
  category: 'category',
  area: 'area',
  title: 'title',
  description: 'description',
}

/**
 * Tag editor: type + Enter to add, click suggestions, remove chips. Emits the
 * selected tags as JSON in a hidden input so plain `<form action={...}>` server
 * actions can read `formData.get(name)`. Works uncontrolled (server-action
 * forms) and inside fully-controlled client forms.
 */
export default function TagInput({
  name = 'tags',
  contentType,
  defaultTags = [],
  popularTags = [],
  suggestFields,
  liveContext,
}: {
  name?: string
  contentType: SuggestContentType
  defaultTags?: string[]
  popularTags?: string[]
  /** Override which sibling form fields feed the suggestion engine. */
  suggestFields?: Partial<Record<FieldKey, string>>
  /** Controlled-form callers can push live values directly instead of (or on top of) DOM reads. */
  liveContext?: Partial<Record<FieldKey, string | null | undefined>>
}) {
  const t = useTranslations('tags')
  const [tags, setTags] = useState<string[]>(() => dedupe(defaultTags))
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ctx, setCtx] = useState<Partial<Record<FieldKey, string>>>({})
  const rootRef = useRef<HTMLDivElement>(null)

  const fields = useMemo(() => ({ ...DEFAULT_FIELDS, ...suggestFields }), [suggestFields])

  // Read sibling form fields so suggestions react as the user fills the form.
  const readForm = useCallback(() => {
    const form = rootRef.current?.closest('form')
    if (!form) return
    const next: Partial<Record<FieldKey, string>> = {}
    for (const [key, fieldName] of Object.entries(fields)) {
      if (!fieldName) continue
      const el = form.elements.namedItem(fieldName) as HTMLInputElement | HTMLSelectElement | null
      if (el && 'value' in el && el.value) next[key as FieldKey] = el.value
    }
    setCtx(next)
  }, [fields])

  useEffect(() => {
    readForm()
    const form = rootRef.current?.closest('form')
    if (!form) return
    form.addEventListener('input', readForm)
    form.addEventListener('change', readForm)
    return () => {
      form.removeEventListener('input', readForm)
      form.removeEventListener('change', readForm)
    }
  }, [readForm])

  const suggestions = useMemo(() => {
    const merged = { ...ctx, ...stripUndefined(liveContext) }
    const all = suggestTags({ contentType, popular: popularTags, ...merged }, 14)
    const chosen = new Set(tags.map(normalizeTagName))
    return all.filter((s) => !chosen.has(normalizeTagName(s))).slice(0, 10)
  }, [ctx, liveContext, contentType, popularTags, tags])

  function addTag(raw: string) {
    const value = raw.trim().slice(0, MAX_TAG_LEN).trim()
    const norm = normalizeTagName(value)
    if (!norm) return
    if (raw.trim().length > MAX_TAG_LEN) {
      setError(t('tooLong', { max: MAX_TAG_LEN }))
    }
    if (tags.some((tag) => normalizeTagName(tag) === norm)) {
      setError(t('duplicate'))
      return
    }
    if (tags.length >= MAX_TAGS) {
      setError(t('maxReached', { max: MAX_TAGS }))
      return
    }
    setTags((prev) => [...prev, value])
    setDraft('')
    setError(null)
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((x) => x !== tag))
    setError(null)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (draft.trim()) addTag(draft)
    } else if (e.key === 'Backspace' && !draft && tags.length) {
      removeTag(tags[tags.length - 1])
    }
  }

  const atMax = tags.length >= MAX_TAGS

  return (
    <div ref={rootRef}>
      <label className="block text-[13px] font-semibold mb-1 text-[#5c4d44]">{t('suggested')}</label>
      <p className="text-[12px] text-muted mb-2.5">{t('helper')}</p>

      {/* Input row */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={onKeyDown}
          maxLength={MAX_TAG_LEN + 1}
          disabled={atMax}
          placeholder={atMax ? t('maxReached', { max: MAX_TAGS }) : t('placeholder')}
          className="flex-1 min-w-0 text-[14px] px-3.5 py-2.5 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose focus:ring-2 focus:ring-rose/15 transition-all placeholder:text-muted/60 text-ink disabled:bg-cream disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => draft.trim() && addTag(draft)}
          disabled={atMax || !draft.trim()}
          className="flex-none text-[13px] font-semibold px-4 py-2.5 rounded-xl border border-line text-[#5c4d44] hover:bg-line disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {t('addTag')}
        </button>
      </div>

      {error && <p className="text-[12px] text-red-600 mt-1.5">{error}</p>}

      {/* Selected chips */}
      {tags.length > 0 && (
        <div className="mt-3">
          <p className="text-[11.5px] font-medium text-muted mb-1.5">
            {t('selected')} ({tags.length}/{MAX_TAGS})
          </p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full bg-rose/10 text-rose text-[12.5px] font-medium"
              >
                <span className="truncate">{tag}</span>
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={t('remove')}
                  className="flex-none w-4 h-4 grid place-items-center rounded-full hover:bg-rose/20 transition-colors leading-none"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {!atMax && suggestions.length > 0 && (
        <div className="mt-3">
          <p className="text-[11.5px] font-medium text-muted mb-1.5">{t('popular')}</p>
          <SuggestedTags suggestions={suggestions} onAdd={addTag} />
        </div>
      )}

      <input type="hidden" name={name} value={JSON.stringify(tags)} />
    </div>
  )
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list) {
    const norm = normalizeTagName(item)
    if (!norm || seen.has(norm)) continue
    seen.add(norm)
    out.push(item.trim().slice(0, MAX_TAG_LEN).trim())
    if (out.length >= MAX_TAGS) break
  }
  return out
}

function stripUndefined(obj?: Partial<Record<FieldKey, string | null | undefined>>): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {}
  if (!obj) return out
  for (const [k, v] of Object.entries(obj)) {
    if (v) out[k as FieldKey] = v
  }
  return out
}
