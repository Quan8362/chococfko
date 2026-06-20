'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ConceptRow } from '@/lib/placeSearch'
import { CONCEPT_TYPES, MATCHING_MODES } from '@/lib/placeSearch'
import {
  saveConcept,
  toggleConcept,
  deleteConcept,
  previewSearch,
  type ConceptFormInput,
  type PreviewResult,
} from './actions'

const LANGS = ['vi', 'en', 'ja', 'ko', 'zh'] as const
type Lang = (typeof LANGS)[number]

type RowView = ConceptRow & { _status: 'db' | 'default' | 'override' | 'db-disabled'; _aliasCount: number; _displayVi: string }

const emptyForm = (): FormState => ({
  id: null, key: '', type: 'facet', enabled: true, weight: 0, matching_mode: 'boundary', category_code: '',
  display: { vi: '', en: '', ja: '', ko: '', zh: '' },
  aliases: { vi: '', en: '', ja: '', ko: '', zh: '' },
  evidence: { vi: '', en: '', ja: '', ko: '', zh: '' },
  structured_flags: '',
})

interface FormState {
  id: string | null; key: string; type: string; enabled: boolean; weight: number; matching_mode: string; category_code: string
  display: Record<Lang, string>
  aliases: Record<Lang, string>
  evidence: Record<Lang, string>
  structured_flags: string
}

function linesToArr(s: string): string[] {
  return Array.from(new Set(s.split('\n').map((x) => x.trim()).filter(Boolean)))
}
function arrToLines(a?: string[] | null): string {
  return (a ?? []).join('\n')
}

function statusFor(row: ConceptRow, defaultFacetKeys: string[]): RowView['_status'] {
  if (row.enabled === false) return 'db-disabled'
  return defaultFacetKeys.includes(row.key) ? 'override' : 'db'
}

export default function SearchConceptsAdmin({
  initialRows,
  tableMissing,
  loadError,
  defaultFacetKeys,
  migrationPath,
}: {
  initialRows: ConceptRow[]
  tableMissing: boolean
  loadError: boolean
  defaultFacetKeys: string[]
  migrationPath: string
}) {
  const t = useTranslations('searchConceptsAdmin')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [enabledFilter, setEnabledFilter] = useState('')
  const [sort, setSort] = useState<'key' | 'updated' | 'weight'>('key')

  const [form, setForm] = useState<FormState | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'warn' | 'err' } | null>(null)
  const [confirmDel, setConfirmDel] = useState<ConceptRow | null>(null)

  const [previewQ, setPreviewQ] = useState('')
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)

  // Merge DB rows with built-in default facets that have NO DB row (shown read-only
  // as "default" so admins know they're active via fallback, not deleted).
  const merged: RowView[] = useMemo(() => {
    const dbKeys = new Set(initialRows.map((r) => r.key))
    const rows: RowView[] = initialRows.map((r) => ({
      ...r,
      _status: statusFor(r, defaultFacetKeys),
      _aliasCount: Object.values(r.aliases ?? {}).reduce((n, a) => n + (a?.length ?? 0), 0),
      _displayVi: (r.display_names?.vi as string) || r.key,
    }))
    for (const k of defaultFacetKeys) {
      if (!dbKeys.has(k)) {
        rows.push({
          key: k, type: 'facet', enabled: true, aliases: {}, evidence: {},
          _status: 'default', _aliasCount: 0, _displayVi: k,
        } as RowView)
      }
    }
    return rows
  }, [initialRows, defaultFacetKeys])

  const filtered = useMemo(() => {
    let r = merged
    const q = search.trim().toLowerCase()
    if (q) {
      r = r.filter((x) => {
        const aliasHay = Object.values(x.aliases ?? {}).flat().join(' ').toLowerCase()
        return x.key.toLowerCase().includes(q) || x._displayVi.toLowerCase().includes(q) || aliasHay.includes(q)
      })
    }
    if (typeFilter) r = r.filter((x) => x.type === typeFilter)
    if (enabledFilter) r = r.filter((x) => (enabledFilter === 'on' ? x.enabled !== false : x.enabled === false))
    const arr = [...r]
    arr.sort((a, b) => {
      if (sort === 'weight') return (b.weight ?? 0) - (a.weight ?? 0)
      if (sort === 'updated') return String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? ''))
      return a.key.localeCompare(b.key)
    })
    return arr
  }, [merged, search, typeFilter, enabledFilter, sort])

  const refresh = () => router.refresh()
  const flash = (msg: string, kind: 'ok' | 'warn' | 'err' = 'ok') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 4000)
  }

  function openCreate() { setErrors([]); setForm(emptyForm()) }
  function openEdit(r: ConceptRow) {
    setErrors([])
    setForm({
      id: r.id ?? null, key: r.key, type: r.type, enabled: r.enabled !== false, weight: r.weight ?? 0,
      matching_mode: r.matching_mode ?? 'boundary', category_code: r.category_code ?? '',
      display: LANGS.reduce((o, l) => ({ ...o, [l]: (r.display_names?.[l] as string) ?? '' }), {} as Record<Lang, string>),
      aliases: LANGS.reduce((o, l) => ({ ...o, [l]: arrToLines(r.aliases?.[l]) }), {} as Record<Lang, string>),
      evidence: LANGS.reduce((o, l) => ({ ...o, [l]: arrToLines(r.evidence?.strong?.[l]) }), {} as Record<Lang, string>),
      structured_flags: (r.evidence?.structured_flags ?? []).join(', '),
    })
  }

  function submit() {
    if (!form) return
    const input: ConceptFormInput = {
      id: form.id, key: form.key.trim(), type: form.type, enabled: form.enabled,
      weight: Number(form.weight) || 0, matching_mode: form.matching_mode,
      category_code: form.type === 'category' ? form.category_code.trim() : null,
      display_names: LANGS.reduce((o, l) => (form.display[l].trim() ? { ...o, [l]: form.display[l].trim() } : o), {} as Record<string, string>),
      aliases: LANGS.reduce((o, l) => ({ ...o, [l]: linesToArr(form.aliases[l]) }), {} as Record<string, string[]>),
      evidence: {
        strong: LANGS.reduce((o, l) => ({ ...o, [l]: linesToArr(form.evidence[l]) }), {} as Record<string, string[]>),
        structured_flags: Array.from(new Set(form.structured_flags.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean))),
      },
    }
    startTransition(async () => {
      const res = await saveConcept(input)
      if (!res.ok) { setErrors(res.errors ?? ['db_error']); return }
      setForm(null); setErrors([])
      if (res.conflictKeys?.length) flash(t('warn_alias_conflict', { keys: res.conflictKeys.join(', ') }), 'warn')
      else flash(t('saved'))
      refresh()
    })
  }

  function toggle(r: ConceptRow) {
    if (!r.id) return
    startTransition(async () => {
      const res = await toggleConcept(r.id!, r.enabled === false)
      if (!res.ok) flash(t('err_' + (res.errors?.[0] ?? 'db_error')), 'err')
      else { flash(t('saved')); refresh() }
    })
  }

  function doDelete() {
    if (!confirmDel?.id) return
    const id = confirmDel.id
    startTransition(async () => {
      const res = await deleteConcept(id)
      setConfirmDel(null)
      if (!res.ok) flash(t('err_' + (res.errors?.[0] ?? 'db_error')), 'err')
      else { flash(t('deleted')); refresh() }
    })
  }

  function runPreview() {
    if (!previewQ.trim()) return
    setPreviewing(true)
    startTransition(async () => {
      const res = await previewSearch(previewQ.trim())
      setPreviewing(false)
      if ('error' in res) flash(t('err_' + res.error), 'err')
      else setPreview(res)
    })
  }

  const badge = (s: RowView['_status']) => {
    const map: Record<RowView['_status'], string> = {
      db: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      override: 'bg-amber-100 text-amber-700 border-amber-200',
      default: 'bg-slate-100 text-slate-600 border-slate-200',
      'db-disabled': 'bg-rose-100 text-rose-700 border-rose-200',
    }
    return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${map[s]}`}>{t('status_' + s)}</span>
  }

  return (
    <div>
      {tableMissing && (
        <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-[13.5px] text-amber-900">
          <b>{t('table_missing_title')}</b>
          <p className="mt-1">{t('table_missing_desc')}</p>
          <code className="mt-2 inline-block bg-amber-100 px-2 py-1 rounded text-[12px]">{migrationPath}</code>
          <p className="mt-2 text-[12.5px]">{t('table_missing_fallback')}</p>
        </div>
      )}
      {loadError && !tableMissing && (
        <div className="mb-5 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-[13.5px] text-rose-800">{t('load_error')}</div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search_placeholder')}
          className="flex-1 min-w-[180px] px-3.5 py-2 text-[14px] rounded-xl border border-line bg-paper text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-rose/15" />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2 text-[13.5px] rounded-xl border border-line bg-paper text-ink">
          <option value="">{t('filter_all_types')}</option>
          {CONCEPT_TYPES.map((ty) => <option key={ty} value={ty}>{t('type_' + ty)}</option>)}
        </select>
        <select value={enabledFilter} onChange={(e) => setEnabledFilter(e.target.value)} className="px-3 py-2 text-[13.5px] rounded-xl border border-line bg-paper text-ink">
          <option value="">{t('filter_all_status')}</option>
          <option value="on">{t('enabled')}</option>
          <option value="off">{t('disabled')}</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="px-3 py-2 text-[13.5px] rounded-xl border border-line bg-paper text-ink">
          <option value="key">{t('sort_key')}</option>
          <option value="updated">{t('sort_updated')}</option>
          <option value="weight">{t('sort_weight')}</option>
        </select>
        <button onClick={openCreate} className="px-4 py-2 text-[13.5px] font-semibold rounded-xl bg-rose text-white hover:bg-rose-deep transition-colors">+ {t('new_concept')}</button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl p-10 text-center text-muted text-[14px]">{t('empty')}</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-[13.5px]">
            <thead className="bg-cream text-muted text-[12px] uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-3 py-2.5">{t('col_key')}</th>
                <th className="text-left font-semibold px-3 py-2.5 hidden sm:table-cell">{t('col_type')}</th>
                <th className="text-left font-semibold px-3 py-2.5 hidden md:table-cell">{t('col_name')}</th>
                <th className="text-left font-semibold px-3 py-2.5">{t('col_status')}</th>
                <th className="text-left font-semibold px-3 py-2.5 hidden sm:table-cell">{t('col_aliases')}</th>
                <th className="text-left font-semibold px-3 py-2.5 hidden lg:table-cell">{t('col_weight')}</th>
                <th className="text-right font-semibold px-3 py-2.5">{t('col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id ?? r.key} className="border-t border-line hover:bg-rose-soft/20">
                  <td className="px-3 py-2.5 font-mono text-[12.5px] text-ink">{r.key}</td>
                  <td className="px-3 py-2.5 hidden sm:table-cell text-muted">{t('type_' + r.type)}</td>
                  <td className="px-3 py-2.5 hidden md:table-cell text-ink">{r._displayVi}</td>
                  <td className="px-3 py-2.5">{badge(r._status)}</td>
                  <td className="px-3 py-2.5 hidden sm:table-cell text-muted">{r._aliasCount}</td>
                  <td className="px-3 py-2.5 hidden lg:table-cell text-muted">{r.weight ?? 0}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 justify-end">
                      {r._status === 'default' ? (
                        <button onClick={() => openEdit({ ...(r as ConceptRow), id: null })} className="text-[12.5px] text-rose hover:underline">{t('override_btn')}</button>
                      ) : (
                        <>
                          <button onClick={() => openEdit(r)} className="text-[12.5px] text-rose hover:underline">{t('edit')}</button>
                          <button onClick={() => toggle(r)} disabled={pending} className="text-[12.5px] text-muted hover:text-ink">
                            {r.enabled === false ? t('enable') : t('disable')}
                          </button>
                          <button onClick={() => setConfirmDel(r)} className="text-[12.5px] text-rose/70 hover:text-rose">{t('delete')}</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <p className="text-[12px] text-muted mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <span>{badge('db')} {t('legend_db')}</span>
        <span>{badge('override')} {t('legend_override')}</span>
        <span>{badge('default')} {t('legend_default')}</span>
        <span>{badge('db-disabled')} {t('legend_disabled')}</span>
      </p>

      {/* ── PREVIEW ─────────────────────────────────────────── */}
      <div className="mt-8 bg-paper border border-line rounded-2xl p-5">
        <h2 className="font-serif font-bold text-[17px] text-ink mb-1">{t('preview_title')}</h2>
        <p className="text-[12.5px] text-muted mb-3">{t('preview_desc')}</p>
        <div className="flex gap-2">
          <input value={previewQ} onChange={(e) => setPreviewQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runPreview()}
            placeholder="BBQ miễn phí / camping / vui chơi đêm / kayak"
            className="flex-1 px-3.5 py-2 text-[14px] rounded-xl border border-line bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-rose/15" />
          <button onClick={runPreview} disabled={previewing} className="px-4 py-2 text-[13.5px] font-semibold rounded-xl bg-ink text-cream hover:bg-ink/90 disabled:opacity-60">{t('run_preview')}</button>
        </div>
        {preview && (
          <div className="mt-4 text-[13px]">
            <div className="flex flex-wrap gap-2 mb-3">
              {preview.fee && <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[12px] border border-emerald-200">fee: {preview.fee}</span>}
              {preview.facets.map((f) => <span key={f} className="px-2 py-0.5 rounded-full bg-rose-soft text-rose text-[12px] border border-rose/20">facet: {f}</span>)}
              {preview.tokens.map((tk) => <span key={tk} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[12px] border border-slate-200">token: {tk}</span>)}
              {!preview.fee && !preview.facets.length && !preview.tokens.length && <span className="text-muted">{t('preview_no_concept')}</span>}
            </div>
            <p className="text-muted text-[12.5px] mb-1">{t('preview_matches', { n: preview.matches.length })}</p>
            <div className="space-y-1.5 max-h-[320px] overflow-auto">
              {preview.matches.map((m) => (
                <div key={m.slug} className="flex items-start gap-2 bg-cream rounded-lg px-3 py-2">
                  <span className="font-medium text-ink">{m.name}</span>
                  <span className="text-[11.5px] text-muted">({m.category})</span>
                  <span className="ml-auto flex flex-wrap gap-1 justify-end">
                    {m.reasons.map((rs, i) => (
                      <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-paper border border-line text-muted">{rs.concept}·{rs.source}·{rs.weight}</span>
                    ))}
                  </span>
                </div>
              ))}
              {preview.matches.length === 0 && <p className="text-muted text-[13px]">{t('preview_none')}</p>}
            </div>
          </div>
        )}
      </div>

      {/* ── EDITOR MODAL ───────────────────────────────────── */}
      {form && (
        <div className="fixed inset-0 z-[200] bg-ink/40 backdrop-blur-sm grid place-items-start sm:place-items-center overflow-auto p-3 sm:p-6" onClick={() => setForm(null)}>
          <div className="bg-paper rounded-2xl border border-line shadow-card-hover w-full max-w-[720px] my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
              <h3 className="font-serif font-bold text-[18px] text-ink">{form.id ? t('edit_title') : t('create_title')}</h3>
              <button onClick={() => setForm(null)} className="text-muted hover:text-rose text-[20px] leading-none">×</button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-auto">
              {errors.length > 0 && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-[13px] text-rose-800">
                  <ul className="list-disc pl-4 space-y-0.5">{errors.map((e) => <li key={e}>{t('err_' + e)}</li>)}</ul>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[12.5px] font-semibold text-ink">{t('f_key')}</span>
                  <input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} disabled={!!form.id}
                    placeholder="kayak" className="mt-1 w-full px-3 py-2 text-[14px] font-mono rounded-lg border border-line bg-cream text-ink disabled:opacity-60" />
                  <span className="text-[11px] text-muted">{t('f_key_hint')}</span>
                </label>
                <label className="block">
                  <span className="text-[12.5px] font-semibold text-ink">{t('f_type')}</span>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="mt-1 w-full px-3 py-2 text-[14px] rounded-lg border border-line bg-cream text-ink">
                    {CONCEPT_TYPES.map((ty) => <option key={ty} value={ty}>{t('type_' + ty)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[12.5px] font-semibold text-ink">{t('f_weight')}</span>
                  <input type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 text-[14px] rounded-lg border border-line bg-cream text-ink" />
                </label>
                <label className="block">
                  <span className="text-[12.5px] font-semibold text-ink">{t('f_mode')}</span>
                  <select value={form.matching_mode} onChange={(e) => setForm({ ...form, matching_mode: e.target.value })} className="mt-1 w-full px-3 py-2 text-[14px] rounded-lg border border-line bg-cream text-ink">
                    {MATCHING_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                {form.type === 'category' && (
                  <label className="block sm:col-span-2">
                    <span className="text-[12.5px] font-semibold text-ink">{t('f_category_code')}</span>
                    <input value={form.category_code} onChange={(e) => setForm({ ...form, category_code: e.target.value })} placeholder="sea / camp / aquarium" className="mt-1 w-full px-3 py-2 text-[14px] font-mono rounded-lg border border-line bg-cream text-ink" />
                  </label>
                )}
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                  <span className="text-[13px] text-ink">{t('f_enabled')}</span>
                </label>
              </div>

              <Section title={t('f_display_names')} hint={t('f_display_hint')}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {LANGS.map((l) => (
                    <input key={l} value={form.display[l]} onChange={(e) => setForm({ ...form, display: { ...form.display, [l]: e.target.value } })}
                      placeholder={l.toUpperCase()} className="px-3 py-2 text-[13.5px] rounded-lg border border-line bg-cream text-ink" />
                  ))}
                </div>
              </Section>

              <Section title={t('f_aliases')} hint={t('f_aliases_hint')}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {LANGS.map((l) => (
                    <label key={l} className="block">
                      <span className="text-[11.5px] font-semibold text-muted">{l.toUpperCase()}</span>
                      <textarea value={form.aliases[l]} onChange={(e) => setForm({ ...form, aliases: { ...form.aliases, [l]: e.target.value } })} rows={3}
                        className="mt-0.5 w-full px-3 py-2 text-[13px] rounded-lg border border-line bg-cream text-ink font-mono" />
                    </label>
                  ))}
                </div>
              </Section>

              {form.type === 'facet' && (
                <Section title={t('f_evidence')} hint={t('f_evidence_hint')}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {LANGS.map((l) => (
                      <label key={l} className="block">
                        <span className="text-[11.5px] font-semibold text-muted">{l.toUpperCase()}</span>
                        <textarea value={form.evidence[l]} onChange={(e) => setForm({ ...form, evidence: { ...form.evidence, [l]: e.target.value } })} rows={2}
                          className="mt-0.5 w-full px-3 py-2 text-[13px] rounded-lg border border-line bg-cream text-ink font-mono" />
                      </label>
                    ))}
                  </div>
                  <label className="block mt-2">
                    <span className="text-[11.5px] font-semibold text-muted">{t('f_structured_flags')}</span>
                    <input value={form.structured_flags} onChange={(e) => setForm({ ...form, structured_flags: e.target.value })}
                      placeholder="bbq_allowed, has_bbq" className="mt-0.5 w-full px-3 py-2 text-[13px] font-mono rounded-lg border border-line bg-cream text-ink" />
                  </label>
                </Section>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-line">
              <button onClick={() => setForm(null)} className="px-4 py-2 text-[13.5px] rounded-xl border border-line text-muted hover:text-ink">{t('cancel')}</button>
              <button onClick={submit} disabled={pending} className="px-5 py-2 text-[13.5px] font-semibold rounded-xl bg-rose text-white hover:bg-rose-deep disabled:opacity-60">{t('save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM ─────────────────────────────────── */}
      {confirmDel && (
        <div className="fixed inset-0 z-[200] bg-ink/40 backdrop-blur-sm grid place-items-center p-4" onClick={() => setConfirmDel(null)}>
          <div className="bg-paper rounded-2xl border border-line shadow-card-hover w-full max-w-[420px] p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif font-bold text-[17px] text-ink">{t('delete_title')}</h3>
            <p className="text-[13.5px] text-muted mt-2">{t('delete_warn', { key: confirmDel.key })}</p>
            <p className="text-[12.5px] text-muted mt-1">{t('delete_prefer_disable')}</p>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setConfirmDel(null)} className="px-4 py-2 text-[13.5px] rounded-xl border border-line text-muted hover:text-ink">{t('cancel')}</button>
              <button onClick={doDelete} disabled={pending} className="px-4 py-2 text-[13.5px] font-semibold rounded-xl bg-rose text-white hover:bg-rose-deep disabled:opacity-60">{t('confirm_delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-[210] px-4 py-2.5 rounded-xl text-[13.5px] shadow-card-hover border ${toast.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : toast.kind === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line pt-3">
      <div className="text-[13px] font-semibold text-ink">{title}</div>
      {hint && <div className="text-[11.5px] text-muted mb-2">{hint}</div>}
      {children}
    </div>
  )
}
