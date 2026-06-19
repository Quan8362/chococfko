'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { TextStyle, Color } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import { useCallback, useRef, useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/imageCompress'
import { Callout, ImageWithCaption, IconHeading } from '@/lib/editor/extensions'
import { TEXT_COLORS, HIGHLIGHT_COLORS, CALLOUT_VARIANTS, colorMatches } from '@/lib/editor/palette'
import IconSectionMenu from '@/components/editor/IconSectionMenu'

const DRAFT_KEY = 'ccc-post-draft'

// ── Toolbar button ────────────────────────────────────────────────────────────
function Btn({
  onClick, active, disabled, title, children,
}: {
  onClick: () => void; active?: boolean; disabled?: boolean; title?: string; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); if (!disabled) onClick() }}
      disabled={disabled}
      title={title}
      className={`w-[30px] h-[28px] rounded flex items-center justify-center text-[13px] transition-colors flex-none ${
        active
          ? 'bg-rose text-white'
          : 'text-muted hover:bg-line hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed'
      }`}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <div className="w-px bg-line h-[18px] mx-1 flex-none" />
}

// ── Dropdown popover with click-outside ───────────────────────────────────────
function Dropdown({
  title, disabled, button, children,
}: {
  title: string; disabled?: boolean; button: React.ReactNode; children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  // Keep the popover inside the viewport (the editor no longer clips overflow,
  // so a menu opened from a right-edge button could otherwise spill off-screen
  // on mobile). Shift it horizontally just enough to fit.
  useEffect(() => {
    if (!open || !popRef.current) return
    const pop = popRef.current
    pop.style.transform = ''
    const rect = pop.getBoundingClientRect()
    const pad = 8
    let shift = 0
    if (rect.right > window.innerWidth - pad) shift = window.innerWidth - pad - rect.right
    if (rect.left + shift < pad) shift = pad - rect.left
    if (shift) pop.style.transform = `translateX(${shift}px)`
  }, [open])
  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); if (!disabled) setOpen((v) => !v) }}
        disabled={disabled}
        title={title}
        className={`h-[28px] px-1.5 rounded flex items-center gap-0.5 text-[13px] transition-colors ${
          open ? 'bg-rose text-white' : 'text-muted hover:bg-line hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed'
        }`}
      >
        {button}
        <svg className="w-2.5 h-2.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div ref={popRef} className="absolute z-40 top-full left-0 mt-1 bg-white border border-line rounded-lg shadow-lg p-2 min-w-[150px]">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
function Toolbar({
  editor, onImageUpload, onPreview, onFullscreen, fullscreen, enableImages, stuck, roundedTop,
}: {
  editor: Editor | null
  onImageUpload: () => void
  onPreview: () => void
  onFullscreen: () => void
  fullscreen: boolean
  enableImages: boolean
  stuck: boolean
  roundedTop: boolean
}) {
  const t = useTranslations('post_form')
  if (!editor) return null
  const e = editor

  // Sticky below the fixed site header (Nav is sticky top-0, h-[68px], z-100) so
  // the tools stay reachable in long articles. In fullscreen the bar is a normal
  // flex child (the content area scrolls under it). Opaque bg + blur so scrolling
  // text never shows through; shadow only once stuck for a clean, premium feel.
  const barClass = [
    'flex flex-wrap items-center gap-x-0.5 gap-y-1 px-2.5 py-2 border-b border-line bg-cream/95 backdrop-blur-md',
    fullscreen ? 'flex-none' : 'sticky top-[68px] z-30 transition-shadow',
    !fullscreen && roundedTop ? 'rounded-t-xl' : '',
    !fullscreen && stuck ? 'shadow-[0_6px_18px_-10px_rgba(36,26,23,0.35)]' : '',
  ].filter(Boolean).join(' ')

  const currentColor = e.getAttributes('textStyle').color as string | undefined
  const currentHighlight = e.getAttributes('highlight').color as string | undefined
  const inTable = e.isActive('table')
  const imageSelected = e.isActive('image')

  const addCaption = () => {
    const current = (e.getAttributes('image').caption as string) || ''
    const caption = window.prompt(t('editor_caption_prompt'), current)
    if (caption === null) return
    e.chain().focus().updateAttributes('image', { caption: caption.trim() || null }).run()
  }

  return (
    <div className={barClass}>

      {/* Text formatting */}
      <div className="flex items-center gap-0.5 flex-none">
        <Btn onClick={() => e.chain().focus().toggleBold().run()} active={e.isActive('bold')} title={t('editor_bold')}>
          <b className="font-black text-[14px]">B</b>
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleItalic().run()} active={e.isActive('italic')} title={t('editor_italic')}>
          <i className="font-serif text-[14px] italic">I</i>
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleUnderline().run()} active={e.isActive('underline')} title={t('editor_underline')}>
          <span className="underline font-semibold text-[13px]">U</span>
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleStrike().run()} active={e.isActive('strike')} title={t('editor_strike')}>
          <s className="text-[13px]">S</s>
        </Btn>
      </div>

      <Sep />

      {/* Text color */}
      <Dropdown
        title={t('editor_text_color')}
        button={
          <span className="flex flex-col items-center leading-none">
            <span className="font-bold text-[13px]" style={{ color: currentColor || 'currentColor' }}>A</span>
            <span className="block w-3.5 h-[3px] rounded-sm mt-[1px]" style={{ background: currentColor || 'var(--ink)' }} />
          </span>
        }
      >
        {(close) => (
          <div>
            <div className="grid grid-cols-4 gap-1.5">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  title={t(c.key)}
                  onMouseDown={(ev) => { ev.preventDefault(); e.chain().focus().setColor(c.hex).run(); close() }}
                  className={`w-7 h-7 rounded-md border ${colorMatches(currentColor, c) ? 'border-rose ring-2 ring-rose/30' : 'border-line'}`}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
            <button
              type="button"
              onMouseDown={(ev) => { ev.preventDefault(); e.chain().focus().unsetColor().run(); close() }}
              className="mt-2 w-full text-[12.5px] text-muted hover:text-ink py-1 rounded hover:bg-line/50"
            >
              {t('editor_color_default')}
            </button>
          </div>
        )}
      </Dropdown>

      {/* Highlight */}
      <Dropdown
        title={t('editor_highlight')}
        button={
          <span className="relative flex items-center">
            <span className="text-[13px] leading-none px-0.5 rounded-sm" style={{ background: currentHighlight || 'transparent' }}>H</span>
          </span>
        }
      >
        {(close) => (
          <div>
            <div className="grid grid-cols-3 gap-1.5">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  title={t(c.key)}
                  onMouseDown={(ev) => { ev.preventDefault(); e.chain().focus().setHighlight({ color: c.hex }).run(); close() }}
                  className={`w-8 h-7 rounded-md border ${colorMatches(currentHighlight, c) ? 'border-rose ring-2 ring-rose/30' : 'border-line'}`}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
            <button
              type="button"
              onMouseDown={(ev) => { ev.preventDefault(); e.chain().focus().unsetHighlight().run(); close() }}
              className="mt-2 w-full text-[12.5px] text-muted hover:text-ink py-1 rounded hover:bg-line/50"
            >
              {t('editor_highlight_none')}
            </button>
          </div>
        )}
      </Dropdown>

      {/* Clear formatting */}
      <Btn
        onClick={() => e.chain().focus().unsetColor().unsetHighlight().unsetAllMarks().run()}
        title={t('editor_clear_format')}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5h10M9 5l-2 14m0 0H5m2 0h3M13 5l-1 7M5 19l14-14" />
        </svg>
      </Btn>

      <Sep />

      {/* Headings */}
      <div className="flex items-center gap-0.5 flex-none">
        <Btn onClick={() => e.chain().focus().setParagraph().run()} active={e.isActive('paragraph')} title={t('editor_paragraph')}>
          <span className="text-[11px] font-semibold">¶</span>
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleHeading({ level: 2 }).run()} active={e.isActive('heading', { level: 2 })} title={t('editor_h2')}>
          <span className="text-[11.5px] font-bold">H2</span>
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleHeading({ level: 3 }).run()} active={e.isActive('heading', { level: 3 })} title={t('editor_h3')}>
          <span className="text-[11.5px] font-bold">H3</span>
        </Btn>
      </div>

      <Sep />

      {/* Lists */}
      <div className="flex items-center gap-0.5 flex-none">
        <Btn onClick={() => e.chain().focus().toggleBulletList().run()} active={e.isActive('bulletList')} title={t('editor_bullet_list')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleOrderedList().run()} active={e.isActive('orderedList')} title={t('editor_ordered_list')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleBlockquote().run()} active={e.isActive('blockquote')} title={t('editor_blockquote')}>
          <span className="text-[14px] font-serif italic font-bold leading-none">&ldquo;</span>
        </Btn>
      </div>

      <Sep />

      {/* Alignment */}
      <div className="flex items-center gap-0.5 flex-none">
        <Btn onClick={() => e.chain().focus().setTextAlign('left').run()} active={e.isActive({ textAlign: 'left' })} title={t('editor_align_left')}>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M2 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h8a1 1 0 110 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h8a1 1 0 110 2H3a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </Btn>
        <Btn onClick={() => e.chain().focus().setTextAlign('center').run()} active={e.isActive({ textAlign: 'center' })} title={t('editor_align_center')}>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M2 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm3 4a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm-3 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm3 4a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </Btn>
        <Btn onClick={() => e.chain().focus().setTextAlign('right').run()} active={e.isActive({ textAlign: 'right' })} title={t('editor_align_right')}>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M2 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm6 4a1 1 0 011-1h8a1 1 0 110 2H9a1 1 0 01-1-1zm-6 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm6 4a1 1 0 011-1h8a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </Btn>
      </div>

      <Sep />

      {/* Insert: link / image / caption / hr */}
      <div className="flex items-center gap-0.5 flex-none">
        <Btn
          onClick={() => {
            const url = window.prompt(t('editor_link_prompt'))
            if (url) e.chain().focus().setLink({ href: url, target: '_blank' }).run()
          }}
          active={e.isActive('link')}
          title={t('editor_insert_link')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </Btn>
        {enableImages && (
          <>
            <Btn onClick={onImageUpload} title={t('editor_insert_image')}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </Btn>
            <Btn onClick={addCaption} disabled={!imageSelected} active={imageSelected && !!e.getAttributes('image').caption} title={t('editor_add_caption')}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h16M4 9h16M7 13h10M9 17h6" />
              </svg>
            </Btn>
          </>
        )}
        <Btn onClick={() => e.chain().focus().setHorizontalRule().run()} title={t('editor_horizontal_rule')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
          </svg>
        </Btn>
      </div>

      <Sep />

      {/* Table */}
      <Dropdown
        title={t('editor_insert_table')}
        button={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h18M3 12h18M3 19h18M9 5v14M15 5v14" />
          </svg>
        }
      >
        {(close) => (
          <div className="flex flex-col gap-0.5 min-w-[160px] text-[12.5px]">
            <button type="button" onMouseDown={(ev) => { ev.preventDefault(); e.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run(); close() }} className="text-left px-2 py-1.5 rounded hover:bg-line/50 text-ink">{t('editor_insert_table')}</button>
            {inTable && (
              <>
                <div className="h-px bg-line my-1" />
                <button type="button" onMouseDown={(ev) => { ev.preventDefault(); e.chain().focus().addRowAfter().run() }} className="text-left px-2 py-1.5 rounded hover:bg-line/50 text-muted">{t('editor_table_add_row')}</button>
                <button type="button" onMouseDown={(ev) => { ev.preventDefault(); e.chain().focus().deleteRow().run() }} className="text-left px-2 py-1.5 rounded hover:bg-line/50 text-muted">{t('editor_table_del_row')}</button>
                <button type="button" onMouseDown={(ev) => { ev.preventDefault(); e.chain().focus().addColumnAfter().run() }} className="text-left px-2 py-1.5 rounded hover:bg-line/50 text-muted">{t('editor_table_add_col')}</button>
                <button type="button" onMouseDown={(ev) => { ev.preventDefault(); e.chain().focus().deleteColumn().run() }} className="text-left px-2 py-1.5 rounded hover:bg-line/50 text-muted">{t('editor_table_del_col')}</button>
                <button type="button" onMouseDown={(ev) => { ev.preventDefault(); e.chain().focus().deleteTable().run(); close() }} className="text-left px-2 py-1.5 rounded hover:bg-red-50 text-red-600">{t('editor_table_delete')}</button>
              </>
            )}
          </div>
        )}
      </Dropdown>

      <Sep />

      {/* Callout blocks */}
      <Dropdown
        title={t('editor_block_label')}
        button={<span className="text-[13px] leading-none">💡</span>}
      >
        {(close) => (
          <div className="flex flex-col gap-0.5 min-w-[170px] text-[12.5px]">
            {CALLOUT_VARIANTS.map((c) => (
              <button
                key={c.variant}
                type="button"
                onMouseDown={(ev) => {
                  ev.preventDefault()
                  e.chain().focus().insertContent({
                    type: 'callout',
                    attrs: { variant: c.variant, icon: c.icon, title: t(c.titleKey) },
                    content: [{ type: 'paragraph' }],
                  }).run()
                  close()
                }}
                className="text-left px-2 py-1.5 rounded hover:bg-line/50 text-ink flex items-center gap-2"
              >
                <span>{c.icon}</span>
                <span>{t(c.titleKey)}</span>
              </button>
            ))}
          </div>
        )}
      </Dropdown>

      <Sep />

      {/* Icon section headings (📍 Địa điểm, 🌙 Không khí về đêm, …) */}
      <Dropdown
        title={t('isec_button_title')}
        button={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 12h6M7 17h10" />
            <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
          </svg>
        }
      >
        {(close) => (
          <IconSectionMenu
            onPick={(icon, label) => {
              e.chain().focus().insertContent({
                type: 'iconHeading',
                attrs: { icon },
                content: [{ type: 'text', text: label }],
              }).run()
              close()
            }}
          />
        )}
      </Dropdown>

      <Sep />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5 flex-none">
        <Btn onClick={() => e.chain().focus().undo().run()} disabled={!e.can().undo()} title={t('editor_undo')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </Btn>
        <Btn onClick={() => e.chain().focus().redo().run()} disabled={!e.can().redo()} title={t('editor_redo')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
          </svg>
        </Btn>
      </div>

      <Sep />

      {/* Preview + Fullscreen */}
      <div className="flex items-center gap-0.5 flex-none ml-auto">
        <Btn onClick={onPreview} title={t('editor_preview')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </Btn>
        <Btn onClick={onFullscreen} active={fullscreen} title={fullscreen ? t('editor_exit_fullscreen') : t('editor_fullscreen')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </Btn>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  name: string
  defaultValue?: string
  placeholder?: string
  minHeight?: string
  // localStorage key for autosaved drafts. Pass null to disable drafts entirely
  // (e.g. marketplace, so it never collides with the community post draft).
  draftKey?: string | null
  // Show the inline image-upload + caption buttons. Disabled for marketplace,
  // which has its own separate product-image uploader.
  enableImages?: boolean
}

export default function RichTextEditor({
  name,
  defaultValue = '',
  placeholder,
  minHeight = '220px',
  draftKey = DRAFT_KEY,
  enableImages = true,
}: Props) {
  const t = useTranslations('post_form')
  const resolvedPlaceholder = placeholder ?? t('editor_placeholder_default')
  const [html, setHtml] = useState(defaultValue)
  const [uploading, setUploading] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [preview, setPreview] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [stuck, setStuck] = useState(false)
  const stickySentinelRef = useRef<HTMLDivElement>(null)
  // Draft found in localStorage but NOT yet loaded — user must confirm
  const [pendingDraft, setPendingDraft] = useState<string | null>(() => {
    if (typeof window === 'undefined' || defaultValue || !draftKey) return null
    const saved = localStorage.getItem(draftKey)
    return (saved && saved !== '<p></p>') ? saved : null
  })
  const fileRef = useRef<HTMLInputElement>(null)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase = createClient()

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ImageWithCaption.configure({ inline: false, allowBase64: false }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Callout,
      IconHeading,
    ],
    // Always start empty for new posts; draft is offered via banner below
    content: defaultValue || '<p></p>',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'focus:outline-none px-4 py-4 text-[15px] leading-[1.78] text-ink tiptap',
        style: `min-height: ${minHeight}`,
      },
    },
    onUpdate: ({ editor }) => {
      const newHtml = editor.getHTML()
      setHtml(newHtml)
      updateCounts(editor.state.doc.textContent)

      // Auto-save draft (debounced 2s)
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
      if (draftKey) {
        draftTimerRef.current = setTimeout(() => {
          if (!editor.isEmpty) {
            localStorage.setItem(draftKey, newHtml)
            setDraftSaved(true)
            setTimeout(() => setDraftSaved(false), 2000)
          }
        }, 2000)
      }
    },
  })

  const restoreDraft = () => {
    if (!pendingDraft || !editor) return
    editor.commands.setContent(pendingDraft)
    setHtml(pendingDraft)
    updateCounts(editor.state.doc.textContent)
    setPendingDraft(null)
  }

  const discardDraft = () => {
    if (draftKey) localStorage.removeItem(draftKey)
    setPendingDraft(null)
  }

  function updateCounts(text: string) {
    const trimmed = text.trim()
    setWordCount(trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0)
    setCharCount(text.length)
  }

  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    const compressed = await compressImage(file)
    const ext = compressed.name.split('.').pop() ?? 'jpg'
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
    const { data, error } = await supabase.storage.from('post-images').upload(path, compressed, { cacheControl: '31536000', contentType: compressed.type })
    setUploading(false)
    if (error || !data) return
    const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(data.path)
    editor?.chain().focus().setImage({ src: publicUrl }).run()
  }, [editor, supabase])

  // Keep html in sync if defaultValue changes (edit mode)
  useEffect(() => {
    if (defaultValue && editor && editor.getHTML() === '<p></p>') {
      editor.commands.setContent(defaultValue)
      setHtml(defaultValue)
      updateCounts(editor.state.doc.textContent)
    }
  }, [defaultValue, editor])

  // Lock body scroll while fullscreen
  useEffect(() => {
    if (!fullscreen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [fullscreen])

  // Toggle the toolbar shadow only once it sticks under the header. A 1px
  // sentinel sits just above the toolbar; rootMargin matches the 68px header.
  useEffect(() => {
    const el = stickySentinelRef.current
    if (!el || fullscreen) { setStuck(false); return }
    const obs = new IntersectionObserver(
      ([entry]) => setStuck(entry.intersectionRatio < 1),
      { threshold: [1], rootMargin: '-69px 0px 0px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [fullscreen])

  // Cleanup draft timer on unmount
  useEffect(() => {
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    }
  }, [])

  const isEmpty = editor?.isEmpty ?? true

  return (
    <div
      className={`border border-line bg-white transition-all ${
        fullscreen
          // z above the site header (z-100) so fullscreen truly covers it.
          ? 'fixed inset-0 z-[120] rounded-none flex flex-col overflow-hidden'
          // No overflow-hidden here: it would create a scroll container and break
          // the toolbar's position:sticky. Corners are rounded on the children.
          : 'rounded-xl focus-within:border-rose focus-within:ring-2 focus-within:ring-rose/15'
      }`}
    >
      <input type="hidden" name={name} value={html} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImageUpload(f)
          e.target.value = ''
        }}
      />

      {/* Draft restore banner — shown only when a saved draft exists */}
      {pendingDraft && (
        <div className={`flex items-center gap-3 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-[13px] ${fullscreen ? '' : 'rounded-t-xl'}`}>
          <svg className="w-4 h-4 text-amber-600 flex-none" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
          </svg>
          <span className="text-amber-800 flex-1">{t('editor_draft_found')}</span>
          <button
            type="button"
            onClick={restoreDraft}
            className="font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2 whitespace-nowrap"
          >
            {t('editor_draft_restore')}
          </button>
          <button
            type="button"
            onClick={discardDraft}
            className="text-amber-600 hover:text-amber-800 whitespace-nowrap"
          >
            {t('editor_draft_discard')}
          </button>
        </div>
      )}

      {/* Sentinel: marks the toolbar's resting top so we can detect "stuck". */}
      <div ref={stickySentinelRef} aria-hidden="true" className="h-px" />

      {/* Toolbar */}
      <Toolbar
        editor={editor}
        onImageUpload={() => fileRef.current?.click()}
        onPreview={() => setPreview((v) => !v)}
        onFullscreen={() => setFullscreen((v) => !v)}
        fullscreen={fullscreen}
        enableImages={enableImages}
        stuck={stuck}
        roundedTop={!pendingDraft}
      />

      {/* Upload indicator */}
      {uploading && (
        <div className="px-4 py-2 text-[12.5px] text-rose bg-rose/5 border-b border-line flex items-center gap-2">
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {t('editor_uploading')}
        </div>
      )}

      {/* Editor / Preview area */}
      <div className={`relative ${fullscreen ? 'flex-1 overflow-y-auto' : ''}`}>
        {preview ? (
          <div className="rich-content px-4 py-4 text-[15px] text-ink">
            {html && html !== '<p></p>'
              ? <div dangerouslySetInnerHTML={{ __html: html }} />
              : <p className="text-muted/60 italic">{t('editor_preview_empty')}</p>}
          </div>
        ) : (
          <>
            {isEmpty && (
              <div
                className="absolute top-4 left-4 right-4 text-[14.5px] text-muted/60 pointer-events-none select-none leading-[1.78] z-10"
                aria-hidden="true"
              >
                {resolvedPlaceholder}
              </div>
            )}
            <EditorContent editor={editor} />
          </>
        )}
      </div>

      {/* Footer: counts + draft indicator */}
      <div className={`flex items-center justify-between px-4 py-2 border-t border-line/60 bg-cream/40 gap-3 ${fullscreen ? '' : 'rounded-b-xl'}`}>
        <span className="text-[11.5px] text-muted/70 flex items-center gap-2 flex-wrap">
          {charCount > 0 && (
            <>
              <span>{t('editor_char_count', { count: charCount })}</span>
              <span className="text-muted/40">·</span>
              <span>{t('editor_word_count', { count: wordCount })}</span>
              {charCount < 300 && (
                <span className="text-amber-600/80 hidden sm:inline">{t('editor_min_chars_hint')}</span>
              )}
            </>
          )}
        </span>
        {draftSaved && (
          <span className="text-[11.5px] text-emerald-600 flex items-center gap-1 flex-none">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            {t('editor_draft_saved')}
          </span>
        )}
      </div>
    </div>
  )
}
